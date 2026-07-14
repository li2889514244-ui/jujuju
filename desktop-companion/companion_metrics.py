"""
companion_metrics.py — Metric extraction patterns and Playwright scraping engine.

Extracted from companion_app.py for maintainability.
All functions are pure or operate on Playwright page objects — no Flask or global state dependencies.
"""
import asyncio
import re, time, json, uuid, os
from pathlib import Path

import companion_state as state
from companion_browser import _launch_browser_opts

try:
    from douyin_api_collector import collect_douyin_data
except Exception as _douyin_import_error:
    collect_douyin_data = None
    _douyin_import_error = str(_douyin_import_error)
else:
    _douyin_import_error = ''

# Convenience aliases for immutable defaults used in this module.
_DEFAULT_QUICK_MAX_POSTS = state._DEFAULT_QUICK_MAX_POSTS


def _collector_launch_args(headless: bool = True) -> dict:
    opts = _launch_browser_opts(headless)
    launch_kw = {'args': opts.get('args', [])}

    browser_path = opts.get('executable_path') or state._BROWSER_PATH
    if browser_path:
        browser_path = str(browser_path)
        if Path(browser_path).exists():
            launch_kw['executable_path'] = browser_path
        else:
            print(f'[DC] Browser executable missing, falling back: {browser_path}')
            state._BROWSER_PATH = None

    if 'executable_path' not in launch_kw:
        browser_channel = opts.get('channel') or state._BROWSER_CHANNEL
        if browser_channel:
            launch_kw['channel'] = browser_channel

    return launch_kw

# ══════════════════════════════════════════════════════════════════
# Platform dashboard URLs
# ══════════════════════════════════════════════════════════════════

PLATFORM_DASHBOARDS = {
    'DOUYIN': {
        'url': 'https://creator.douyin.com',
        'domain': '.douyin.com',
        'data_center': 'https://creator.douyin.com/creator-micro/data/content',
        'video_list': 'https://creator.douyin.com/creator-micro/content/manage',
        'monetization': 'https://creator.douyin.com/creator-micro/revenue/monetize',
        'creator_center': 'https://creator.douyin.com/creator-micro/creation',
        'works_manage': 'https://creator.douyin.com/creator-micro/content/manage?tab=work',
        'extra_pages': [
            'https://creator.douyin.com/creator-micro/data/fans',
            'https://creator.douyin.com/creator-micro/data/content',
        ],
    },
    'KUAISHOU': {
        'url': 'https://cp.kuaishou.com',
        'domain': '.kuaishou.com',
        'data_center': 'https://cp.kuaishou.com/article/manage',
        'video_list': 'https://cp.kuaishou.com/article/publish/list',
    },
    'XIAOHONGSHU': {
        'url': 'https://creator.xiaohongshu.com',
        'domain': '.xiaohongshu.com',
        'data_center': 'https://creator.xiaohongshu.com/note-manage',
        'video_list': 'https://creator.xiaohongshu.com/note-manage/notes',
    },
    'BILIBILI': {
        'url': 'https://member.bilibili.com',
        'domain': '.bilibili.com',
        'data_center': 'https://member.bilibili.com/platform/upload/video',
        'video_list': 'https://member.bilibili.com/platform/content',
    },
    'WEIBO': {
        'url': 'https://weibo.com',
        'domain': '.weibo.com',
    },
    'WECHAT_VIDEO': {
        'url': 'https://channels.weixin.qq.com',
        'domain': '.weixin.qq.com',
        'data_center': 'https://channels.weixin.qq.com/platform/data-center',
        'video_list': 'https://channels.weixin.qq.com/platform/post/list',
        'monetization': 'https://channels.weixin.qq.com/platform/statistic/cargo/transcation',
    },
}

# ══════════════════════════════════════════════════════════════════
# Metric extraction (data collector)
# ══════════════════════════════════════════════════════════════════

_METRIC_PATTERNS = {
    'followers': [
        # 抖音/douyin specific: profile section "粉丝\n159" or "粉丝�?59"
        re.compile(r'(?:^|\n)粉丝\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        re.compile(r'粉丝�?\s*[�?]\s*([\d,.]+[万wW]?)'),
        # 视频�? 关注�?764
        re.compile(r'关注者\s*(\d[\d,.]*)'),
    ],
    'following': [
        # Use MULTILINE to anchor to line start, avoid matching nav/sidebar "关注"
        re.compile(r'(?:^|\n)关注\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
    ],
    'likes': [
        # 获赞 might be on its own line: "获赞\n132" or "获赞�?32"
        re.compile(r'(?:^|\n)获赞\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        re.compile(r'点赞\s*[�?]\s*([\d,.]+[万wW]?)'),
        re.compile(r"新增\s*([\d,.]+[万wW]?)"),
        re.compile(r'总获赞\s*[�?]?\s*([\d,.]+[万wW]?)'),
    ],
    'views': [
        # 可参考播放量 / 播放�?�?must be at line start to avoid matching recommendations
        re.compile(r'(?:^|\n)(?:.*?播放量)\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        re.compile(r'(?:^|\n)播放量\s*(?:\n\s*)?([\d,.]+[万wW]?)', re.MULTILINE),
        # 视频�? 新增播放\n4
        re.compile(r'新增播放\s*([\d,.]+[万wW]?)'),
    ],
    'comments': [
        re.compile(r'评论\s*[�?]\s*([\d,.]+[万wW]?)'),
    ],
    'shares': [
        re.compile(r'分享\s*[�?]\s*([\d,.]+[万wW]?)'),
    ],
}

# Store-specific metric patterns (抖店/微信小店/小红书商�?
_STORE_METRIC_PATTERNS = {
    'buyerCount': [
        re.compile(r'成交人数\s*[�?]?\s*([\d,.]+[万wW]?)'),
        re.compile(r'支付人数\s*[�?]?\s*([\d,.]+[万wW]?)'),
        re.compile(r'下单人数\s*[�?]?\s*([\d,.]+[万wW]?)'),
        re.compile(r'买家数\s*[�?]?\s*([\d,.]+[万wW]?)'),
    ],
    'productCount': [
        re.compile(r'在售商品\s*[�?]?\s*([\d,.]+)'),
        re.compile(r'商品数\s*[�?]?\s*([\d,.]+)'),
        re.compile(r'在线商品\s*[�?]?\s*([\d,.]+)'),
    ],
    'avgOrderValue': [
        re.compile(r'客单价\s*[�?]?\s*¥?\s*([\d,.]+)'),
        re.compile(r'笔单价\s*[�?]?\s*¥?\s*([\d,.]+)'),
    ],
    'storeScore': [
        # 抖店体验�?(usually 0-100 or 0-5)
        re.compile(r'店铺体验分\s*[�?]?\s*([\d.]+)'),
        re.compile(r'体验分\s*[�?]?\s*([\d.]+)'),
        re.compile(r'商家体验分\s*[�?]?\s*([\d.]+)'),
        # 微信小店评分
        re.compile(r'店铺评分\s*[�?]?\s*([\d.]+)'),
        re.compile(r'综合评分\s*[�?]?\s*([\d.]+)'),
        # 小红书店铺分
        re.compile(r'店铺分\s*[�?]?\s*([\d.]+)'),
        re.compile(r'商家分\s*[�?]?\s*([\d.]+)'),
    ],
    'storeDiagnosis': [
        # Store diagnosis text �?grab the section after "店铺诊断" label
        re.compile(r'店铺诊断[�?]\s*(.{10,200}?)(?:\n|$)'),
        re.compile(r'诊断结果[�?]\s*(.{10,200}?)(?:\n|$)'),
        re.compile(r'经营诊断[�?]\s*(.{10,200}?)(?:\n|$)'),
    ],
}


def _sanitize_text(s: str) -> str:
    """Remove garbled characters from scraped text (double-encoding cleanup)"""
    if not s:
        return ''
    try:
        # Try to fix common double-encoding: latin-1 bytes interpreted as UTF-8
        fixed = s.encode('latin-1', errors='replace').decode('utf-8', errors='replace')
        if fixed.count('\ufffd') < s.count('\ufffd'):
            return fixed
    except Exception as _e:
        print(f'[WARN] {type(_e).__name__}: {_e}')
    # Replace any remaining replacement chars with empty
    return s.replace('\ufffd', '').strip()


def _parse_metric_num(s: str) -> int:
    s = s.strip().replace(',', '').replace(' ', '')
    if s.endswith(('万', 'w', 'W')):
        return round(float(s[:-1]) * 10000)
    try:
        return int(float(s))
    except ValueError:
        return 0


def _extract_douyin_overview_metrics(text: str) -> dict:
    """Extract creator-center overview metrics."""
    if not text or '数据总览' not in text:
        return {}

    start = text.find('数据总览')
    scope = text[start:start + 2500]
    if '昨日' not in scope[:800]:
        return {}

    num = r'([+-]?\d[\d,.]*[万wW]?)'
    label_map = {
        '\u64ad\u653e\u91cf': 'newViews',
        '作品点赞': 'newLikes',
        '作品分享': 'newShares',
        '作品评论': 'newComments',
        '\u51c0\u589e\u7c89\u4e1d': 'newFollowers',
    }

    result = {}
    for label, key in label_map.items():
        match = re.search(rf'{label}\s*{num}', scope)
        if match:
            result[key] = _parse_metric_num(match.group(1))
    return result


async def _get_page_text(page) -> str:
    """Extract full page text, including wujie-app shadow DOM when present."""
    try:
        text = await page.evaluate('''() => {
            const parts = [];
            for (const body of document.querySelectorAll('body')) {
                if (body && body.innerText) parts.push(body.innerText);
            }
            for (const w of document.querySelectorAll('wujie-app')) {
                if (!w.shadowRoot) continue;
                for (const body of w.shadowRoot.querySelectorAll('body')) {
                    if (body && body.innerText) parts.push(body.innerText);
                }
            }
            return parts.join('\\n');
        }''')
        return text
    except Exception:
        try:
            return await page.evaluate('''() =>
                Array.from(document.querySelectorAll('body'))
                    .map(body => body.innerText || '')
                    .join('\\n')
            ''')
        except Exception:
            return ''


async def _wait_for_page_text(page, markers, timeout_ms: int = 4000, min_count: int = 1, poll_ms: int = 250) -> bool:
    """Wait until page text includes enough markers, including wujie shadow DOM text."""
    if isinstance(markers, str):
        markers = [markers]
    markers = [m for m in (markers or []) if m]
    if not markers:
        await page.wait_for_timeout(min(timeout_ms, 500))
        return True

    deadline = time.monotonic() + max(timeout_ms, 0) / 1000
    while True:
        try:
            text = await _get_page_text(page)
            hits = sum(1 for marker in markers if marker in text)
            if hits >= min_count:
                return True
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')
        if time.monotonic() >= deadline:
            return False
        await page.wait_for_timeout(max(50, poll_ms))


async def _wujie_click_text(page, text_match: str) -> bool:
    """Click an element inside wujie-app shadow DOM by exact text match.
    Returns True if click succeeded, False otherwise."""
    try:
        result = await page.evaluate('''(target) => {
            const w = document.querySelector('wujie-app');
            if (!w || !w.shadowRoot) return false;
            const body = w.shadowRoot.querySelector('body');
            if (!body) return false;
            const el = Array.from(body.querySelectorAll('a,button,li,span,div,p'))
                .find(e => e.textContent.trim() === target);
            if (el) { el.click(); return true; }
            return false;
        }''', text_match)
        return result
    except Exception:
        return False


async def _click_visible_text(page, text_match: str, exact: bool = True) -> bool:
    """Click visible text in the main document or a wujie shadow root."""
    try:
        return bool(await page.evaluate(
            r'''({target, exact}) => {
                const roots = [document];
                for (const w of document.querySelectorAll('wujie-app')) {
                    if (w.shadowRoot) roots.push(w.shadowRoot);
                }
                const norm = text => String(text || '').replace(/\s+/g, '').trim();
                const visible = el => {
                    try {
                        const style = getComputedStyle(el);
                        const box = el.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' &&
                            box.width > 0 && box.height > 0;
                    } catch (e) {
                        return false;
                    }
                };
                const targetText = norm(target);
                const selector = [
                    'button', 'a', 'li', 'span', 'div', 'p',
                    '[role=button]', '[role=menuitem]', '[role=option]', '[class*=option]',
                    '[class*=menu]', '[class*=tab]', '[class*=select]'
                ].join(',');
                const candidates = [];
                for (const root of roots) {
                    for (const el of Array.from(root.querySelectorAll(selector))) {
                        if (!visible(el)) continue;
                        const text = norm(el.innerText || el.textContent);
                        if (!text) continue;
                        const hit = exact
                            ? text === targetText
                            : (text === targetText || text.includes(targetText));
                        if (hit) candidates.push(el);
                    }
                }
                candidates.sort((a, b) => {
                    const textA = norm(a.innerText || a.textContent);
                    const textB = norm(b.innerText || b.textContent);
                    const score = el => {
                        const text = norm(el.innerText || el.textContent);
                        const box = el.getBoundingClientRect();
                        return (text === targetText ? 1000 : 0) -
                            Math.min(text.length, 500) -
                            Math.round((box.width * box.height) / 10000);
                    };
                    return score(b) - score(a);
                });
                const el = candidates[0];
                if (!el) return false;
                try { el.scrollIntoView({block: 'center', inline: 'center'}); } catch (e) {}
                const box = el.getBoundingClientRect();
                const x = box.left + Math.max(1, Math.min(box.width / 2, box.width - 1));
                const y = box.top + Math.max(1, Math.min(box.height / 2, box.height - 1));
                for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                    el.dispatchEvent(new MouseEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        clientX: x,
                        clientY: y,
                    }));
                }
                return true;
            }''',
            {'target': text_match, 'exact': exact},
        ))
    except Exception:
        return False


def _parse_wechat_key_metric_text(text: str) -> dict:
    """Parse the WeChat Channels video-data key metrics card."""
    if not text:
        return {}

    metric = {'play': 0, 'like': 0, 'comment': 0, 'share': 0, 'new_fans': 0}
    label_map = [
        ('播放量', 'play'), ('播放', 'play'),
        ('作品点赞', 'like'), ('点赞', 'like'), ('心', 'like'),
        ('评论', 'comment'),
        ('分享', 'share'),
        ('净增关注', 'new_fans'), ('新增关注', 'new_fans'), ('关注', 'new_fans'),
    ]
    period_labels = {'昨日数据', '近7天', '近30天'}
    lines = [
        line.strip()
        for line in re.split(r'[\r\n]+', text)
        if line and line.strip()
    ]

    def clean_number_line(line: str) -> bool:
        if '%' in line or '统计时间' in line or '关键指标' in line:
            return False
        if line in period_labels:
            return False
        if re.search(r'\d{2}-\d{2}', line):
            return False
        # 排除年份行（如"2026年"或"2026-07"）
        if re.search(r'\b20\d{2}\s*年?\b', line) and not re.search(r'[+-]?\d{5,}', line):
            return False
        return bool(re.search(r'\d', line))

    for idx, line in enumerate(lines):
        compact = re.sub(r'\s+', '', line)
        for label, key in label_map:
            if label not in compact:
                continue
            suffix = compact.split(label, 1)[1]
            m = re.search(r'([+-]?\d[\d,.]*[万wW]?)', suffix)
            if not m:
                for nxt in lines[idx + 1:idx + 5]:
                    if not clean_number_line(nxt):
                        continue
                    m = re.search(r'([+-]?\d[\d,.]*[万wW]?)', nxt)
                    if m:
                        break
            if m:
                val = _parse_metric_num(m.group(1))
                if val >= 0:
                    metric[key] = val
                break

    values = []
    for line in lines:
        if not clean_number_line(line):
            continue
        for raw in re.findall(r'(?<![+\-])\d[\d,.]*[万wW]?', line):
            val = _parse_metric_num(raw)
            # 排除年份（2000-2099）被误当作指标值
            if 2000 <= val <= 2099:
                continue
            if val > 0:
                values.append(val)

    fallback = {}
    # WeChat's card commonly shows: play, favorite, like, comment, share, follow.
    if len(values) >= 6:
        fallback = {
            'play': values[0],
            'like': values[2],
            'comment': values[3],
            'share': values[4],
            'new_fans': values[5],
        }
    elif len(values) >= 5:
        fallback = {
            'play': values[0],
            'like': values[1],
            'comment': values[2],
            'share': values[3],
            'new_fans': values[4],
        }

    for key, value in fallback.items():
        if not metric.get(key):
            metric[key] = value

    return metric if any(metric.values()) else {}


async def _extract_wechat_key_metric_card_text(page) -> str:
    try:
        return await page.evaluate(
            r'''() => {
                const roots = [document];
                for (const w of document.querySelectorAll('wujie-app')) {
                    if (w.shadowRoot) roots.push(w.shadowRoot);
                }
                const visible = el => {
                    try {
                        const style = getComputedStyle(el);
                        const box = el.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' &&
                            box.width > 0 && box.height > 0;
                    } catch (e) {
                        return false;
                    }
                };
                const candidates = [];
                for (const root of roots) {
                    for (const el of Array.from(root.querySelectorAll('section, article, div'))) {
                        if (!visible(el)) continue;
                        const text = (el.innerText || '').trim();
                        const hasMetric = text.includes('播放') &&
                            (text.includes('点赞') || text.includes('评论') || text.includes('分享'));
                        const hasPeriod = text.includes('昨日数据') || text.includes('近7天') || text.includes('近30天');
                        if (!(text.includes('关键指标') || hasPeriod) || !hasMetric) continue;
                        if (text.length < 20 || text.length > 3000) continue;
                        candidates.push(el);
                    }
                }
                candidates.sort((a, b) => {
                    const ta = (a.innerText || '').trim();
                    const tb = (b.innerText || '').trim();
                    const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
                    const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
                    return (ta.length + areaA / 1000) - (tb.length + areaB / 1000);
                });
                return candidates[0] ? candidates[0].innerText : '';
            }'''
        )
    except Exception:
        return ''


async def _open_wechat_key_metric_period_dropdown(page) -> bool:
    try:
        return bool(await page.evaluate(
            r'''() => {
                const roots = [document];
                for (const w of document.querySelectorAll('wujie-app')) {
                    if (w.shadowRoot) roots.push(w.shadowRoot);
                }
                const labels = ['昨日数据', '近7天', '近30天'];
                const norm = text => String(text || '').replace(/\s+/g, '').trim();
                const visible = el => {
                    try {
                        const style = getComputedStyle(el);
                        const box = el.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' &&
                            box.width > 0 && box.height > 0;
                    } catch (e) {
                        return false;
                    }
                };
                const cards = [];
                for (const root of roots) {
                    for (const el of Array.from(root.querySelectorAll('section, article, div'))) {
                        if (!visible(el)) continue;
                        const text = el.innerText || '';
                        if (text.includes('播放') &&
                            (text.includes('关键指标') || labels.some(label => text.includes(label)))) {
                            cards.push(el);
                        }
                    }
                }
                cards.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
                const card = cards[0];
                if (!card) return false;
                const candidates = Array.from(card.querySelectorAll('button, div, span, input, [role=combobox], [class*=select], [class*=dropdown]'))
                    .filter(visible)
                    .filter(el => {
                        const text = norm(el.innerText || el.textContent || el.value);
                        return labels.includes(text) || labels.some(label => text.includes(label));
                    });
                candidates.sort((a, b) => norm(a.innerText || a.textContent || a.value).length -
                    norm(b.innerText || b.textContent || b.value).length);
                let el = candidates[0];
                if (!el) {
                    const cardBox = card.getBoundingClientRect();
                    const clickable = Array.from(card.querySelectorAll('button, [role=button], [role=combobox], [class*=select], [class*=dropdown], svg'))
                        .filter(visible)
                        .map(node => {
                            const box = node.getBoundingClientRect();
                            return {node, box, score: box.left + box.top - Math.abs(cardBox.right - box.right)};
                        })
                        .sort((a, b) => b.score - a.score);
                    el = clickable[0] && clickable[0].node;
                }
                if (!el) return false;
                try { el.scrollIntoView({block: 'center', inline: 'center'}); } catch (e) {}
                const box = el.getBoundingClientRect();
                const x = box.left + Math.max(1, Math.min(box.width / 2, box.width - 1));
                const y = box.top + Math.max(1, Math.min(box.height / 2, box.height - 1));
                for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                    el.dispatchEvent(new MouseEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        clientX: x,
                        clientY: y,
                    }));
                }
                return true;
            }'''
        ))
    except Exception:
        return False


async def _select_wechat_video_period(page, label: str) -> bool:
    try:
        card_text = await _extract_wechat_key_metric_card_text(page)
        if label in card_text and _parse_wechat_key_metric_text(card_text):
            return True
    except Exception:
        pass
    opened = await _open_wechat_key_metric_period_dropdown(page)
    if opened:
        await page.wait_for_timeout(250)
    for exact in (True, False):
        clicked = await _click_visible_text(page, label, exact=exact)
        if not clicked and not opened:
            opened = await _open_wechat_key_metric_period_dropdown(page)
            await page.wait_for_timeout(250)
            clicked = await _click_visible_text(page, label, exact=exact)
        for _ in range(12):
            await page.wait_for_timeout(300)
            card_text = await _extract_wechat_key_metric_card_text(page)
            if label in card_text and _parse_wechat_key_metric_text(card_text):
                return True
    return False


async def _fetch_wechat_auth_data_from_page(page) -> dict:
    """Recover auth_data when the response listener missed the page's first request."""
    try:
        data = await page.evaluate(
            r'''async () => {
                const entries = performance.getEntriesByType('resource')
                    .map(entry => entry.name || '')
                    .filter(url => url.includes('auth_data'));
                const urls = [...new Set(entries)].reverse();
                for (const url of urls) {
                    try {
                        const response = await fetch(url, {credentials: 'include'});
                        const text = await response.text();
                        if (!text || !text.trim().startsWith('{')) continue;
                        const json = JSON.parse(text);
                        if (json && json.errCode === 0 && json.data) return json.data;
                    } catch (e) {}
                }
                return null;
            }'''
        )
        return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f'[DC] WECHAT_VIDEO: auth_data recovery fetch failed: {str(e)[:100]}')
        return {}


async def _scrape_wechat_video_period_metrics(page) -> dict:
    """Collect video-data key metrics for yesterday, 7 days, and 30 days."""
    periods = [
        ('day_total', '昨日数据'),
        ('week_total', '近7天'),
        ('month_total', '近30天'),
    ]
    period_metrics = {}

    await _click_visible_text(page, '数据中心', exact=True)
    await _wait_for_page_text(page, ['视频数据', '关键指标', '播放'], timeout_ms=2000, min_count=1)
    await _click_visible_text(page, '视频数据', exact=True)
    await _wait_for_page_text(page, ['关键指标', '播放', '近7天', '近30天'], timeout_ms=3500, min_count=2)
    await _click_visible_text(page, '全部视频', exact=True)
    await _wait_for_page_text(page, ['关键指标', '播放'], timeout_ms=1200, min_count=1)

    for key, label in periods:
        selected = await _select_wechat_video_period(page, label)
        if not selected:
            print(f'[DC] WECHAT_VIDEO video-data {label}: period select failed')
            continue
        card_text = await _extract_wechat_key_metric_card_text(page)
        parsed = _parse_wechat_key_metric_text(card_text)
        if parsed:
            period_metrics[key] = parsed
            print(f'[DC] WECHAT_VIDEO video-data {label}: {parsed}')
        else:
            print(f'[DC] WECHAT_VIDEO video-data {label}: no metrics parsed')

    metric_keys = ('play', 'like', 'comment', 'share', 'new_fans')
    same_metrics = lambda a, b: bool(a and b) and all(
        (a.get(k, 0) or 0) == (b.get(k, 0) or 0) for k in metric_keys
    )
    if (
        same_metrics(period_metrics.get('day_total'), period_metrics.get('week_total')) and
        same_metrics(period_metrics.get('week_total'), period_metrics.get('month_total'))
    ):
        print('[DC] WECHAT_VIDEO video-data: week/month duplicated day metrics; keeping day only')
        period_metrics.pop('week_total', None)
        period_metrics.pop('month_total', None)

    if not period_metrics:
        return {}

    day = period_metrics.get('day_total') or {}
    result = {
        '_periodMetrics': {
            'videoData': {
                **period_metrics,
                'source': 'channels_data_center_video_data',
                'trustedDailyIncrements': bool(day),
                'collectedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
            }
        }
    }

    if day:
        result.update({
            'newViews': day.get('play', 0),
            'newLikes': day.get('like', 0),
            'newComments': day.get('comment', 0),
            'newShares': day.get('share', 0),
            'newFollowers': day.get('new_fans', 0),
        })

    return result


async def _scrape_dashboard(page) -> dict:
    import traceback
    text = await _get_page_text(page)
    print(f'[DEBUG _scrape_dashboard] text len={len(text)}, first 300: {text[:300]}', flush=True)
    # Strip "关于腾讯" footer
    idx = text.find('关于腾讯')
    if idx > 0:
        text = text[:idx]
    metrics = {}
    metrics.update(_extract_douyin_overview_metrics(text))
    print(f'[DEBUG _scrape_dashboard] after douyin extract: {metrics}', flush=True)

    profile_section = text[:8000] if len(text) > 8000 else text
    
    # Core metrics from profile section
    for key in ['followers', 'following', 'likes', 'comments', 'shares']:
        for pat in _METRIC_PATTERNS.get(key, []):
            m = pat.search(profile_section)
            if m:
                metrics[key] = _parse_metric_num(m.group(1))
                break

    # Video count - broader match
    m_v = re.search(r'视频\s*(\d{2,})', profile_section[:2000])
    if m_v:
        metrics['videos'] = int(m_v.group(1))

    # Views (累计播放量) — 只从"数据总览"区域提取，绝不从"昨日数据"区域取
    # "昨日数据"区域的播放量是日增量，不是累计值
    views_val = None
    yd_pos = text.find('昨日数据')
    overview_end = yd_pos if yd_pos > 0 else len(text)
    overview_text = text[:min(overview_end, 4000)]
    for pat in _METRIC_PATTERNS.get('views', []):
        m = pat.search(overview_text)
        if m:
            val = _parse_metric_num(m.group(1))
            # 不再限制100M上限——大号累计播放量可以超过1亿
            # 真正的保护是只从"数据总览"区域提取（overview_text已限制在"昨日数据"之前）
            if val > 0:
                views_val = val
                break
    if not views_val:
        try:
            dc_link = await page.query_selector('text=数据中心')
            if not dc_link:
                dc_link = await page.query_selector('[class*="data-center"]')
            if dc_link:
                await dc_link.click()
                await page.wait_for_timeout(3000)
                text2 = await page.evaluate('() => document.body.innerText')
                yd_pos2 = text2.find('昨日数据')
                ov2_end = yd_pos2 if yd_pos2 > 0 else len(text2)
                ov2_text = text2[:min(ov2_end, 4000)]
                for pat in _METRIC_PATTERNS.get('views', []):
                    m = pat.search(ov2_text)
                    if m:
                        val = _parse_metric_num(m.group(1))
                        if val > 0:
                            views_val = val
                            break
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')
    if views_val:
        metrics['views'] = views_val
    print(f'[DEBUG _scrape_dashboard] after views extract: {metrics}', flush=True)

    # ┢�┢� 昨日数据 (Yesterday's metrics) ┢�┢�
    yd_start = text.find('昨日数据')
    if yd_start > 0:
        yd = text[yd_start:yd_start+800]
        # 凢�增关�? exact match
        m = re.search(r'凢�增关注\s*([\d,.]+[万wW]?)', yd)
        if m: metrics['newFollowers'] = _parse_metric_num(m.group(1))
        # 新增播放: only from 昨日 section
        m = re.search(r'新增播放\s*([\d,.]+[万wW]?)', yd)
        if m: metrics['newViews'] = _parse_metric_num(m.group(1))
        # 新增评论
        m = re.search(r'新增评论\s*([\d,.]+[万wW]?)', yd)
        if m: metrics['newComments'] = _parse_metric_num(m.group(1))
        # 新增分享
        m = re.search(r'新增分享\s*([\d,.]+[万wW]?)', yd)
        if m: metrics['newShares'] = _parse_metric_num(m.group(1))
        # 新增 (standalone, after 新增评论 and 新增分享 check �?treat as likes)
        m = re.search(r'新增\s*([\d,.]+[万wW]?)\s*(?:\n|$)', yd)
        if m: metrics['newLikes'] = _parse_metric_num(m.group(1))

    # ┢�┢� Nickname & Avatar ┢�┢�
    try:
        info = await page.evaluate('''() => {
            const result = { nickname: null, avatar: null };
            // Penetrate wujie-app shadow DOM for 视频�?
            const w = document.querySelector('wujie-app');
            const root = (w && w.shadowRoot) ? w.shadowRoot : document;
            const body = root.querySelector('body') || document.body;
            const text = body.innerText;
            const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            // Strategy 1: Find real display name (line before 抖音�?快手�?小红书号 label)
            for (let i = 0; i < Math.min(lines.length, 50); i++) {
                const line = lines[i];
                if (line.match(/^(抖音号|快手号|小红书号|账号ID)/)) {
                    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                        const candidate = lines[j];
                        if (candidate.length >= 2 && candidate.length <= 30 &&
                            !/^\\d{5,}$/.test(candidate) &&
                            !/^(抖音|快手|小红书|创作者|首页|数据|内容|粉丝|关注|获赞)/.test(candidate)) {
                            result.nickname = candidate; break;
                        }
                    }
                    if (result.nickname) break;
                }
            }

            // Strategy 2: Try page title
            if (!result.nickname) {
                const title = document.title || '';
                const clean = title.replace(/[\\-|–��].*$/, '').replace(/创作者中心|创作服务平台|数据平台|抖音|快手|小红书|视频号助手|腾讯视频�?g, '').trim();
                const platformUINames = ['视频号助�?, '视频�?, '微信', '抖音创作服务平台', '快手创作者中�?];
                if (clean.length >= 2 && clean.length <= 30 && !/^\\d+$/.test(clean) && !platformUINames.includes(clean)) {
                    result.nickname = clean;
                }
            }

            // Strategy 3: DOM selectors (penetrate shadow DOM)
            if (!result.nickname) {
                const selectors = [
                    '[class*="account-name"]', '[class*="nickname"]', '[class*="profile-name"]',
                    '[class*="user-name"]', 'h1', '[class*="creator-name"]',
                ];
                for (const sel of selectors) {
                    const el = root.querySelector(sel);
                    if (el) {
                        const txt = el.innerText.trim();
                        if (txt.length >= 2 && txt.length <= 30 && !/^\\d{5,}$/.test(txt)) {
                            result.nickname = txt; break;
                        }
                    }
                }
            }

            // Strategy 4: Fallback
            if (!result.nickname) {
                for (let i = 0; i < Math.min(lines.length, 15); i++) {
                    const candidate = lines[i];
                    if (candidate.length >= 2 && candidate.length <= 20 &&
                        !/^\\d{5,}$/.test(candidate) &&
                        !/^(抖音|快手|小红书|创作者|首页|数据|内容|粉丝|关注|获赞|账号|平台)/.test(candidate) &&
                        !/[\u4e00-\u9fa5]{6,}/.test(candidate)) {
                        result.nickname = candidate; break;
                    }
                }
            }

            // Try avatar
            const imgs = root.querySelectorAll('img');
            for (const el of imgs) {
                const src = el.src || '';
                if (src.includes('douyin') || src.includes('byteimg') || src.includes('pstatp') ||
                    src.includes('kuaishou') || src.includes('xhscdn') || src.includes('xiaohongshu') ||
                    src.includes('wx.qlogo.cn') || src.includes('wx3.qlogo.cn') || src.includes('finderhead')) {
                    if (el.width > 30 || el.height > 30) { result.avatar = src; break; }
                }
            }
            return result;
        }''')
        nick = _sanitize_text(info.get('nickname') or '')
        if nick and nick not in _NAV_NAMES and len(nick) >= 2:
            metrics['_nickname'] = nick
        if info.get('avatar'):
            metrics['_avatar'] = info['avatar']
    except Exception as _e:
        print(f'[WARN] {type(_e).__name__}: {_e}')

    return metrics


async def _scrape_data_center(page, platform: str) -> dict:
    """Extract analytics from data center page, including historical multi-day data"""
    from datetime import datetime, timedelta

    result = {}
    history = []

    # --- Step 1: Full page text for metric extraction ---
    text = await _get_page_text(page)
    result.update(_extract_douyin_overview_metrics(text))

    # Try to find yesterday's data section first (most reliable)
    yd_match = re.search(r'昨日数据([\s\S]*?)(?:�?天|�?0天|$)', text[:8000])
    search_text = yd_match.group(1) if yd_match else text[:6000]

    for pat in _METRIC_PATTERNS.get('views', []):
        m = pat.search(search_text)
        if m:
            val = _parse_metric_num(m.group(1))
            if 0 < val < 100_000_000:
                # "昨日数据" section 的播放量是日增量，不是累计值。
                # 只存为 newViews，不存为 views（累计值），
                # 避免 API 采集失败时把日增量当成累计播放量。
                if 'newViews' not in result:
                    result['newViews'] = val
                break

    for pat in _METRIC_PATTERNS.get('followers', []):
        m = pat.search(search_text)
        if m:
            result['followers'] = _parse_metric_num(m.group(1))
            break

    # --- Step 2: Try to extract historical data table (7-day / 30-day tables) ---
    try:
        table_data = await page.evaluate('''() => {
            const result = [];
            // Penetrate wujie-app shadow DOM for 视频�?
            const w = document.querySelector('wujie-app');
            const root = (w && w.shadowRoot) ? w.shadowRoot : document;
            const allTables = root.querySelectorAll('table');
            for (const table of allTables) {
                const headers = [];
                table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td').forEach(th => {
                    headers.push((th.innerText || '').trim());
                });
                if (!headers.some(h => h.includes('日期') || h.includes('时间') || /\\d{4}[-/]\\d{2}/.test(h))) {
                    continue;
                }
                const tbody = table.querySelector('tbody') || table;
                tbody.querySelectorAll('tr').forEach(row => {
                    const cells = row.querySelectorAll('td, th');
                    const rowData = [];
                    cells.forEach(cell => rowData.push((cell.innerText || '').trim()));
                    if (rowData.length >= 2) result.push(rowData);
                });
                if (result.length > 0) break;
            }
            // Fallback: find date-prefixed lines in the full text
            if (result.length === 0) {
                const body = (w && w.shadowRoot)
                    ? w.shadowRoot.querySelector('body')
                    : document.body;
                const fullText = body ? body.innerText : document.body.innerText;
                const lines = fullText.split('\\n');
                const datePattern = /^(\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2})/;
                const numPattern = /[\\d,.]+[万wW]?/g;
                for (let i = 0; i < lines.length; i++) {
                    const m = lines[i].match(datePattern);
                    if (m) {
                        const row = [m[1]];
                        // Collect numbers from this and next lines
                        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
                            const nums = lines[j].match(numPattern);
                            if (nums) row.push(...nums);
                        }
                        if (row.length >= 3) result.push(row);
                    }
                }
            }
            return result.slice(0, 35); // max 35 days
        }''')

        if table_data:
            today = datetime.now().date()
            for row in table_data:
                if len(row) < 2:
                    continue
                # Try to parse date from first column
                date_str = row[0].strip()
                parsed_date = None
                for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%Y.%m.%d', '%m-%d', '%m/%d', '%m.%d']:
                    try:
                        if len(fmt) <= 5:  # short format, add current year
                            parsed_date = datetime.strptime(f'{datetime.now().year}-{date_str}', f'%Y-{fmt}').date()
                        else:
                            parsed_date = datetime.strptime(date_str, fmt).date()
                        break
                    except ValueError:
                        continue

                if not parsed_date:
                    # Check for "昨天", "前天", "今日" etc.
                    if '昨天' in date_str:
                        parsed_date = today - timedelta(days=1)
                    elif '前天' in date_str:
                        parsed_date = today - timedelta(days=2)
                    elif '今日' in date_str or '今天' in date_str:
                        parsed_date = today
                    else:
                        continue

                # Extract metric values from remaining columns
                metrics_for_date = {}
                # Column mapping varies by platform �?try heuristics
                remaining = row[1:]
                # Flatten: split each cell by whitespace and extract numbers
                nums = []
                for cell in remaining:
                    for part in cell.split():
                        val = _parse_metric_num(part)
                        if val > 0:
                            nums.append(val)

                # Heuristic: first number = views, second = likes, third = comments
                if len(nums) >= 1:
                    metrics_for_date['views'] = nums[0]
                if len(nums) >= 2:
                    metrics_for_date['likes'] = nums[1]
                if len(nums) >= 3:
                    metrics_for_date['comments'] = nums[2]
                if len(nums) >= 4:
                    metrics_for_date['shares'] = nums[3]

                if metrics_for_date:
                    history.append({
                        'date': parsed_date.isoformat(),
                        **metrics_for_date,
                    })

        # Deduplicate by date
        seen = set()
        deduped = []
        for h in history:
            if h['date'] not in seen:
                seen.add(h['date'])
                deduped.append(h)
        history = deduped

    except Exception as e:
        print(f'[DC] historical data extraction error: {e}')

    # --- Step 3: Simple table scan (label-value pairs) ---
    try:
        table_rows = await page.evaluate('''() => {
            const rows = [];
            document.querySelectorAll('table tr, [class*="row"], [class*="item"]').forEach(el => {
                const cells = el.querySelectorAll('td, th, [class*="cell"]');
                if (cells.length >= 2) {
                    const label = (cells[0].innerText || '').trim();
                    const value = (cells[1].innerText || '').trim();
                    rows.push([label, value]);
                }
            });
            return rows;
        }''')
        for label, value in table_rows:
            for key, patterns in _METRIC_PATTERNS.items():
                for pat in patterns:
                    if pat.search(label):
                        if key not in result:
                            result[key] = _parse_metric_num(value)
                        break
    except Exception as _e:
        print(f'[WARN] {type(_e).__name__}: {_e}')

    # Try clicking data center tabs for more data
    tab_selectors = {
        '视频数据': '[class*=tab]:has-text("视频数据"), span:has-text("视频数据"), a:has-text("视频数据")',
        '粉丝数据': '[class*=tab]:has-text("粉丝数据"), span:has-text("粉丝数据"), a:has-text("粉丝数据")',
        '直播数据': '[class*=tab]:has-text("直播数据"), span:has-text("直播数据"), a:has-text("直播数据")',
    }
    for tab_name, selector in tab_selectors.items():
        try:
            clicked_tab = await _click_visible_text(page, tab_name, exact=True)
            if not clicked_tab:
                clicked_tab = await _click_visible_text(page, tab_name, exact=False)
            if clicked_tab:
                await page.wait_for_timeout(3000)
                tab_text = await page.evaluate('() => document.body.innerText')

                # Extract metrics from tab
                for key in ['followers', 'likes', 'views', 'comments', 'shares']:
                    if key not in result or result.get(key, 0) == 0:
                        for pat in _METRIC_PATTERNS.get(key, []):
                            m = pat.search(tab_text[:6000])
                            if m:
                                val = _parse_metric_num(m.group(1))
                                if val > 0:
                                    result[key] = val
                                    break

                # Live metrics
                for label, key in [('观看人数', 'liveViews'), ('最高在线', 'liveMaxOnline'),
                                   ('新增粉丝', 'liveFollowers'), ('直播收入', 'liveRevenue')]:
                    m = re.search(rf'{label}\s*([\d,.]+[万wW]?)', tab_text[:3000])
                    if m:
                        result[key] = _parse_metric_num(m.group(1))
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')

    if platform == 'WECHAT_VIDEO':
        try:
            period_result = await _scrape_wechat_video_period_metrics(page)
            # 视频号平台不提供可靠的累计总量（views/likes/comments/shares），
            # 只有日/周/月增量。一律清除累计值，避免把日增量误存为累计值。
            for key in ('views', 'likes', 'comments', 'shares'):
                result.pop(key, None)
            if period_result.get('_periodMetrics'):
                result.update(period_result)
        except Exception as e:
            print(f'[DC] WECHAT_VIDEO video-data period metrics error: {e}')

    result['_history'] = history
    return result


async def _scrape_video_list(page, platform: str, max_posts: int = 0) -> list:
    """Scrape video list metrics and stop on natural pagination signals."""
    import hashlib
    limit = max_posts if isinstance(max_posts, int) and max_posts > 0 else None

    if platform == 'WECHAT_VIDEO':
        api_videos = await _scrape_wechat_video_list_api(page, max_posts=max_posts)
        if api_videos:
            print(f'[DC] WECHAT_VIDEO: post_list API collected {len(api_videos)} posts')
            return api_videos
        print('[DC] WECHAT_VIDEO: post_list API returned no posts, falling back to DOM parsing')
    
    await _wait_for_page_text(page, ['视频管理', '视频 (', '合集', '搜索视频'], timeout_ms=2500, min_count=1)
    
    all_videos = []
    seen_titles = set()
    
    page_num = 1
    while True:
        # Extract page text (uses _get_page_text with wujie-app shadow DOM fallback)
        text = await _get_page_text(page)
        if not text or len(text) < 200:
            videos = []
        else:
            # Parse videos in Python (avoids JS errors in WeChat Video wujie-app shadow DOM)
            raw_lines = [l.strip() for l in text.split('\n') if l.strip()]
            videos = []
            for i, line in enumerate(raw_lines):
                if re.search(r'\d{4}?\d{2}?\d{2}??', line) and i > 0 and len(raw_lines[i-1]) > 5:
                    title = raw_lines[i-1].strip()[:80]
                    if '???' in title or '???' in title:
                        continue
                    date = line.strip()
                    numbers = []
                    for j in range(i + 1, min(i + 5, len(raw_lines))):
                        nums = re.findall(r'[\d,.]+[万W]?', raw_lines[j])
                        numbers.extend(nums)
                    if numbers:
                        videos.append({'title': title, 'date': date, 'numbers': numbers[:5]})
        
        skip = ['??','??','??','??','??','????','??','??',
                '运营','变现','服务','通知','帮助','咨询','规范','协议',
                '????','????','??','???ID','Tencent','?',
                '草�6�0','主页','活动','直播','图文','音乐','音频','关于腾讯',
                '?????','????','??','??','??','??','??',
                '??','????','??','??','????','????']
        
        page_videos = 0
        for v in videos:
            t = (v.get('title') or '').strip()
            if not t or len(t) < 3 or any(w in t for w in skip):
                continue
            norm = t.lower().replace(' ', '')
            if norm in seen_titles:
                continue
            seen_titles.add(norm)
            
            nums = sorted([_parse_metric_num(n) for n in v.get('numbers', [])
                          if _parse_metric_num(n) > 0], reverse=True)
            if len(nums) < 1:
                continue
            
            all_videos.append({
                'id': hashlib.md5(t.encode()).hexdigest()[:12],
                'title': t,
                'date': v.get('date', ''),
                'views': nums[0] if len(nums) > 0 else 0,
                'likes': nums[1] if len(nums) > 1 else 0,
                'comments': nums[2] if len(nums) > 2 else 0,
                'shares': nums[3] if len(nums) > 3 else 0,
            })
            page_videos += 1
        
        if page_videos == 0 and page_num > 1:
            # No more pages
            break
        
        # Click next page inside wujie-app shadow DOM
        state._collector_progress['video_page'] = page_num
        state._collector_progress['video_count'] = len(all_videos)
        if limit and len(all_videos) >= limit:
            break
        clicked = await _wujie_click_text(page, '???')
        page_num += 1
        if not clicked:
            break
    
    return all_videos[:limit] if limit else all_videos


async def _ensure_wechat_video_list_page(page) -> bool:
    """Open Content Management > Video so the Channels post_list API is available."""
    async def _looks_ready() -> bool:
        try:
            text = await _get_page_text(page)
            return (
                ('/platform/post/list' in page.url and '\u89c6\u9891\u7ba1\u7406' in text) or
                ('\u89c6\u9891\u7ba1\u7406' in text and '\u89c6\u9891 (' in text and '\u5408\u96c6' in text)
            )
        except Exception:
            return False

    async def _click_label(label: str) -> bool:
        try:
            return bool(await page.evaluate(
                r'''(target) => {
                    const roots = [document];
                    const wujie = document.querySelector('wujie-app');
                    if (wujie && wujie.shadowRoot) roots.push(wujie.shadowRoot);

                    const norm = text => String(text || '').replace(/\s+/g, '').trim();
                    const visible = el => {
                        try {
                            const style = getComputedStyle(el);
                            const box = el.getBoundingClientRect();
                            return style.display !== 'none' && style.visibility !== 'hidden' &&
                                box.width > 0 && box.height > 0;
                        } catch (e) {
                            return false;
                        }
                    };

                    const selector = [
                        'button', 'a', 'li', 'span', 'div', 'p',
                        '[role=button]', '[role=menuitem]', '[class*=menu]', '[class*=nav]'
                    ].join(',');
                    const targetText = norm(target);
                    const candidates = [];
                    for (const root of roots) {
                        for (const el of Array.from(root.querySelectorAll(selector))) {
                            const text = norm(el.textContent);
                            if (!text) continue;
                            if (text === targetText || text.startsWith(targetText) || text.includes(targetText)) {
                                candidates.push(el);
                            }
                        }
                    }
                    candidates.sort((a, b) => {
                        const at = norm(a.textContent);
                        const bt = norm(b.textContent);
                        const score = el => (visible(el) ? 100 : 0) +
                            (norm(el.textContent) === targetText ? 30 : 0) +
                            (norm(el.textContent).startsWith(targetText) ? 10 : 0) -
                            Math.min(norm(el.textContent).length, 200) / 1000;
                        return score(b) - score(a);
                    });
                    const el = candidates[0];
                    if (!el) return false;
                    try { el.scrollIntoView({block: 'center', inline: 'center'}); } catch (e) {}
                    el.click();
                    return true;
                }''',
                label,
            ))
        except Exception:
            return False

    if await _looks_ready():
        return True

    await _click_label('\u5185\u5bb9\u7ba1\u7406')
    await _wait_for_page_text(page, ['视频', '图文', '音乐'], timeout_ms=1600, min_count=1)
    await _click_label('\u89c6\u9891')
    await _wait_for_page_text(page, ['视频管理', '视频 (', '合集', '搜索视频'], timeout_ms=3500, min_count=1)
    if await _looks_ready():
        return True

    try:
        await page.goto('https://channels.weixin.qq.com/platform', wait_until='domcontentloaded', timeout=30000)
        await _wait_for_page_text(page, ['内容管理', '数据中心', '首页'], timeout_ms=2500, min_count=1)
        await _click_label('\u5185\u5bb9\u7ba1\u7406')
        await _wait_for_page_text(page, ['视频', '图文', '音乐'], timeout_ms=1600, min_count=1)
        await _click_label('\u89c6\u9891')
        await _wait_for_page_text(page, ['视频管理', '视频 (', '合集', '搜索视频'], timeout_ms=3500, min_count=1)
    except Exception as _e:
        print(f'[WARN] {type(_e).__name__}: {_e}')
    return await _looks_ready()


async def _scrape_wechat_video_list_api(page, max_posts: int = 0) -> list:
    """Collect WeChat Channels posts through the paged API."""
    try:
        ready = await _ensure_wechat_video_list_page(page)
        if not ready:
            print('[DC] WECHAT_VIDEO: could not open video management page before post_list API')

        return await page.evaluate(
            r'''async ({maxPosts}) => {
                const pageSize = 20;
                const limit = Number.isFinite(Number(maxPosts)) && Number(maxPosts) > 0
                    ? Number(maxPosts)
                    : 0;
                const maxPages = 1000;
                const pageUrl = 'https://channels.weixin.qq.com/micro/content/post/list';
                const results = [];
                const seen = new Set();

                function makeId() {
                    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
                    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
                }

                function makeEndpoint() {
                    const aid = makeId();
                    const rid = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 12)}`;
                    return `/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list?_aid=${aid}&_rid=${rid}&_pageUrl=${encodeURIComponent(pageUrl)}`;
                }

                function num(value) {
                    if (value === null || value === undefined) return 0;
                    if (typeof value === 'number') return Math.round(value);
                    let s = String(value).trim().replace(/,/g, '');
                    if (!s) return 0;
                    let mult = 1;
                    if (s.includes('\u4ebf')) mult = 100000000;
                    else if (s.includes('\u4e07') || /w/i.test(s)) mult = 10000;
                    else if (s.includes('\u5343') || /k/i.test(s)) mult = 1000;
                    const m = s.match(/[\d.]+/);
                    return m ? Math.round(parseFloat(m[0]) * mult) : 0;
                }

                function first(...values) {
                    for (const value of values) {
                        if (value !== null && value !== undefined && value !== '') return value;
                    }
                    return '';
                }

                function walk(obj, visitor, depth = 0) {
                    if (!obj || depth > 6) return undefined;
                    const hit = visitor(obj);
                    if (hit !== undefined && hit !== null && hit !== '') return hit;
                    if (Array.isArray(obj)) {
                        for (const item of obj) {
                            const nested = walk(item, visitor, depth + 1);
                            if (nested !== undefined && nested !== null && nested !== '') return nested;
                        }
                    } else if (typeof obj === 'object') {
                        for (const value of Object.values(obj)) {
                            const nested = walk(value, visitor, depth + 1);
                            if (nested !== undefined && nested !== null && nested !== '') return nested;
                        }
                    }
                    return undefined;
                }

                function getAny(obj, keys) {
                    const keySet = new Set(keys.map(k => k.toLowerCase()));
                    return walk(obj, current => {
                        if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
                        for (const [key, value] of Object.entries(current)) {
                            if (keySet.has(key.toLowerCase()) && value !== null && value !== undefined && value !== '') {
                                return value;
                            }
                        }
                        return undefined;
                    });
                }

                function findPostArray(obj) {
                    const direct = obj && obj.data && Array.isArray(obj.data.list) ? obj.data.list : null;
                    if (direct) return direct;
                    let best = [];
                    walk(obj, current => {
                        if (!Array.isArray(current) || current.length === 0) return undefined;
                        const score = current.slice(0, 5).filter(item => {
                            if (!item || typeof item !== 'object') return false;
                            return item.desc || item.objectId || item.exportId ||
                                getAny(item, ['title', 'description', 'postId', 'feedId', 'id']);
                        }).length;
                        if (score > 0 && current.length > best.length) best = current;
                        return undefined;
                    });
                    return best;
                }

                function formatTime(value) {
                    const n = num(value);
                    if (!n) return String(value || '');
                    const ms = n > 100000000000 ? n : n * 1000;
                    const d = new Date(ms);
                    if (Number.isNaN(d.getTime())) return String(value || '');
                    const pad = x => String(x).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                }

                function normalize(item) {
                    const desc = item && typeof item.desc === 'object' && !Array.isArray(item.desc) ? item.desc : {};
                    const mediaList = Array.isArray(desc.media) ? desc.media : [];
                    const media = mediaList.find(m => m && typeof m === 'object') || {};
                    const title = String(first(
                        desc.description,
                        item.description,
                        item.title,
                        item.objectDesc,
                        item.object_desc,
                        getAny(item, ['contentDesc', 'content_desc', 'wording'])
                    ) || '').replace(/\s+/g, ' ').trim();
                    const rawId = first(
                        item.objectId,
                        item.object_id,
                        item.exportId,
                        item.export_id,
                        item.feedId,
                        item.feed_id,
                        item.postId,
                        item.post_id,
                        item.id
                    );
                    const publishRaw = first(
                        item.effectiveTime,
                        item.effective_time,
                        item.publishTime,
                        item.publish_time,
                        item.createTime,
                        item.create_time,
                        item.createtime,
                        item.postTime,
                        item.post_time
                    );
                    const publishTime = formatTime(publishRaw);
                    const cover = String(first(
                        media.coverUrl,
                        media.cover_url,
                        media.thumbUrl,
                        media.thumb_url,
                        media.fullCoverUrl,
                        item.coverUrl,
                        item.cover_url,
                        item.thumbUrl,
                        item.thumb_url
                    ) || '');
                    const duration = num(first(media.videoPlayLen, media.duration, item.videoPlayLen, item.duration));
                    return {
                        id: String(rawId || title || JSON.stringify(item).slice(0, 80)),
                        content_id: String(rawId || ''),
                        title,
                        cover_url: cover,
                        cover,
                        content_type: 'video',
                        publish_time: publishTime,
                        publishedAt: publishTime,
                        date: publishTime,
                        duration,
                        videoDuration: duration,
                        views: num(first(item.readCount, item.read_count, item.playCount, item.play_count, item.viewCount, item.view_count)),
                        likes: num(first(item.likeCount, item.like_count, item.praiseCount, item.praise_count)),
                        comments: num(first(item.commentCount, item.comment_count)),
                        shares: num(first(item.forwardCount, item.forward_count, item.shareCount, item.share_count)),
                        saves: num(first(item.favCount, item.fav_count)),
                    };
                }

                async function fetchPage(currentPage) {
                    const resp = await fetch(makeEndpoint(), {
                        method: 'POST',
                        credentials: 'include',
                        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
                        body: JSON.stringify({
                            pageSize,
                            currentPage,
                            userpageType: 11,
                            stickyOrder: true,
                            timestamp: String(Date.now()),
                            _log_finder_uin: '',
                            _log_finder_id: '',
                            rawKeyBuff: '',
                            pluginSessionId: null,
                            scene: 7,
                            reqScene: 7,
                        }),
                    });
                    const text = await resp.text();
                    try {
                        return {status: resp.status, json: JSON.parse(text), text};
                    } catch (e) {
                        return {status: resp.status, json: null, text};
                    }
                }

                for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
                    const payload = await fetchPage(currentPage);
                    if (payload.status >= 400 || !payload.json) break;
                    const rows = findPostArray(payload.json);
                    if (!rows.length) break;
                    let added = 0;
                    for (const row of rows) {
                        const post = normalize(row);
                        if (!post.title || post.title.length < 2) continue;
                        const key = post.id || post.title;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        results.push(post);
                        added += 1;
                        if (limit && results.length >= limit) break;
                    }
                    if (added === 0) break;
                    if (limit && results.length >= limit) break;
                    if (rows.length < pageSize) break;
                }

                return limit ? results.slice(0, limit) : results;
            }''',
            {'maxPosts': max_posts},
        )
    except Exception as e:
        print(f'[DC] WECHAT_VIDEO post_list API error: {str(e)[:120]}')
        return []


async def _scrape_monetization(page) -> dict:
    """Extract revenue/monetization metrics from creator monetization page
    Supports 抖音变现中心, 快手变现, etc."""
    result = {}
    text = await page.evaluate('() => document.body.innerText')

    patterns = {
        'revenue': [
            re.compile(r'累计收入\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'总收益\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'预估收入\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'本月收入\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
        ],
        'gmv': [
            re.compile(r'GMV\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'成交金额\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'锢�售额\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
        ],
        'orders': [
            re.compile(r'订单数\s*[�?]?\s*([\d,.]+[万wW]?)'),
            re.compile(r'成交单数\s*[�?]?\s*([\d,.]+[万wW]?)'),
        ],
        'commission': [
            re.compile(r'佣金\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            re.compile(r'带货佣金\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
        ],
    }

    # Search first 6000 chars for monetization data
    search_text = text[:6000]
    for key, pats in patterns.items():
        for pat in pats:
            m = pat.search(search_text)
            if m:
                result[key] = _parse_metric_num(m.group(1))
                break

    # Also try table-based extraction
    try:
        table_data = await page.evaluate('''() => {
            const rows = [];
            document.querySelectorAll('table tr, [class*="row"], [class*="item"], [class*="card"]').forEach(el => {
                const cells = el.querySelectorAll('td, th, [class*="cell"], [class*="label"], [class*="value"]');
                if (cells.length >= 2) {
                    rows.push([(cells[0].innerText||'').trim(), (cells[1].innerText||'').trim()]);
                }
            });
            return rows;
        }''')
        rev_patterns = ['收入','收益','GMV','成交','订单','佣金','锢�售额','带货','变现']
        for label, value in table_data:
            if any(w in label for w in rev_patterns):
                for key, pats in patterns.items():
                    for pat in pats:
                        if pat.search(label) and key not in result:
                            result[key] = _parse_metric_num(value)
                            break
    except Exception as _e:
        print(f'[WARN] {type(_e).__name__}: {_e}')

    return result


async def _scrape_store_dashboard(page, platform: str) -> dict:
    """Scrape detailed store metrics from store backend pages."""
    result = {'revenue': 0, 'gmv': 0, 'orders': 0, 'commission': 0,
              'buyerCount': 0, 'productCount': 0, 'avgOrderValue': 0,
              'storeScore': None, 'storeDiagnosis': None, '_storeName': None}

    try:
        text = await _get_page_text(page)
        search_text = text[:10000]

        # 1. Basic monetization (reuse existing patterns)
        mon_patterns = {
            'revenue': [
                re.compile(r'累计收入\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'总收益\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'成交金额\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            ],
            'gmv': [
                re.compile(r'GMV\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'锢�售额\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'交易额\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            ],
            'orders': [
                re.compile(r'订单数\s*[�?]?\s*([\d,.]+[万wW]?)'),
                re.compile(r'成交单数\s*[�?]?\s*([\d,.]+[万wW]?)'),
                re.compile(r'支付订单\s*[�?]?\s*([\d,.]+[万wW]?)'),
            ],
            'commission': [
                re.compile(r'佣金\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
                re.compile(r'预计佣金\s*[�?]?\s*¥?\s*([\d,.]+[万wW]?)'),
            ],
        }
        for key, pats in mon_patterns.items():
            for pat in pats:
                m = pat.search(search_text)
                if m:
                    result[key] = _parse_metric_num(m.group(1))
                    break

        # 2. Store-specific metrics
        for key, pats in _STORE_METRIC_PATTERNS.items():
            for pat in pats:
                m = pat.search(search_text)
                if m:
                    val = m.group(1).strip()
                    if key in ('storeScore',):
                        try:
                            result[key] = float(val)
                        except ValueError:
                            result[key] = None
                    elif key == 'storeDiagnosis':
                        result[key] = _sanitize_text(val)
                    else:
                        result[key] = _parse_metric_num(val)
                    break

        # 3. Store name
        store_name_patterns = [
            re.compile(r'店铺名称\s*[�?]\s*(\S.{2,30})'),
            re.compile(r'小店名称\s*[�?]\s*(\S.{2,30})'),
        ]
        for pat in store_name_patterns:
            m = pat.search(search_text)
            if m:
                result['_storeName'] = _sanitize_text(m.group(1).strip())
                break

        # 4. Table-based extraction for store pages
        try:
            table_data = await page.evaluate('''() => {
                const rows = [];
                document.querySelectorAll('table tr, [class*="row"], [class*="item"], [class*="card"], [class*="metric"]').forEach(el => {
                    const cells = el.querySelectorAll('td, th, [class*="cell"], [class*="label"], [class*="value"], [class*="name"]');
                    if (cells.length >= 2) {
                        rows.push([(cells[0].innerText||'').trim(), (cells[1].innerText||'').trim()]);
                    }
                });
                return rows;
            }''')
            store_patterns = ['店铺', '收入', 'GMV', '成交', '订单', '佣金', '买家', '商品', '客单价', '体验分', '评分', '诊断', '销售额', '支付人数', '在售']
            for label, value in table_data:
                if any(w in label for w in store_patterns):
                    for key, pats in {**mon_patterns, **_STORE_METRIC_PATTERNS}.items():
                        for pat in pats:
                            if pat.search(label) and (key not in result or result.get(key) in (None, 0)):
                                if key in ('storeScore',):
                                    try:
                                        result[key] = float(value)
                                    except ValueError:
                                        pass
                                elif key == 'storeDiagnosis':
                                    result[key] = _sanitize_text(value)
                                else:
                                    result[key] = _parse_metric_num(value)
                                break
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')

    except Exception as e:
        print(f'[STORE] scrape error {platform}: {e}')

    return result



async def _page_goto_retry(page, url, max_retries=2, platform=''):
    """Navigate to URL with retry."""
    for attempt in range(max_retries):
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await page.wait_for_timeout(700 if attempt == 0 else 1200)
            # Verify page has loaded content
            text_len = await page.evaluate('''() => {
                const w = document.querySelector("wujie-app");
                if (w && w.shadowRoot) {
                    const body = w.shadowRoot.querySelector("body");
                    if (body) return body.innerText.length;
                }
                return document.body ? document.body.innerText.length : 0;
            }''')
            # For WECHAT_VIDEO: wujie-app micro-frontend renders lazily; let downstream handle it
            if platform == 'WECHAT_VIDEO':
                await _wait_for_page_text(page, ['首页', '内容管理', '数据中心', '视频数据', '视频管理'], timeout_ms=2500, min_count=1)
                print(f"[DC] _page_goto_retry WECHAT_VIDEO: text_len={text_len}, proceeding anyway")
                return True
            if text_len > 50:
                return True
            print(f"[DC] Page content too short ({text_len} chars) at {url[:60]}, wujie_app present, attempt {attempt+1}/{max_retries}")
            # For other SPA platforms using shadow DOM, may need more render time
            if attempt == 0:
                await page.wait_for_timeout(2000)
            else:
                await page.wait_for_timeout(1200)
        except Exception as e:
            print(f"[DC] Page goto error (attempt {attempt+1}): {str(e)[:100]}")
    return False
async def _scrape_account_pages(context, platform: str, account_label: str = '', max_posts: int = 0, sleep_sec: float = 1.5) -> dict:
    """Scan pages in a single authenticated session."""
    entry = PLATFORM_DASHBOARDS.get(platform)
    if not entry:
        return {'metrics': {}, 'video_stats': []}

    url = entry['url']
    data_center_url = entry.get('data_center')
    video_list_url = entry.get('video_list')
    monetization_url = entry.get('monetization')

    try:
        page = await context.new_page()
    except Exception as e:
        print(f'[DC] Context closed, skipping {platform}: {e}')
        return {'metrics': {}, 'video_stats': []}

    metrics = {}
    video_stats = []
    quick_mode = isinstance(max_posts, int) and max_posts > 0

    # ┢�┢� WECHAT_VIDEO: 响应拦截 auth_data API（头�?昵称/粉丝数） ┢�┢�
    # DOM �?img.avatar �?src 为空，必须从 API 响应获取�?
    # 在导航前注册监听，页面加载时 API 带有�?cookie，拦截自然生效��?
    # 支持多账号：每个 profile 各自有独�?session�?
    captured_auth = {}
    if platform == 'WECHAT_VIDEO':
        async def _on_auth_response(response):
            if 'auth' not in captured_auth and 'auth_data' in response.url and response.status == 200:
                try:
                    ct = response.headers.get('content-type', '')
                    if 'json' in ct or 'text' in ct:
                        text = await response.text()
                        if text.startswith('{'):
                            import json as _json
                            data = _json.loads(text)
                            if data.get('errCode') == 0:
                                captured_auth['auth'] = data.get('data', {})
                                print(f'[DC] WECHAT_VIDEO: auth_data captured, headImgUrl={data.get("data",{}).get("finderUser",{}).get("headImgUrl","?")[:50]}')
                            else:
                                print(f'[DC] WECHAT_VIDEO: auth_data errCode={data.get("errCode")}, msg={data.get("errMsg","?")}')
                except Exception as _e:
                    print(f'[WARN] {type(_e).__name__}: {_e}')
        page.on('response', _on_auth_response)

    try:
        # 1. Dashboard (with retry)
        ok = await _page_goto_retry(page, url, platform=platform)
        if not ok:
            print(f'[DC] {platform}: Dashboard page failed to load, skipping')
            return {'metrics': {}, 'video_stats': [], 'expired': True}
        if platform == 'WECHAT_VIDEO':
            await _wait_for_page_text(page, ['内容管理', '数据中心', '视频号ID', '首页'], timeout_ms=5000, min_count=1)
        else:
            try:
                await page.wait_for_selector('[class*=content], [class*=main], [role=main], main', timeout=6000)
            except Exception:
                await page.wait_for_timeout(2000)

        # Check if we landed on a login page (cookie expired / invalid)
        current_url = page.url.lower()
        page_title = (await page.title()).lower() if hasattr(page, 'title') else ''
        # URL path-based detection �?avoid broad words like 'scan'/'verify'/'authorize'
        # that appear in normal dashboard URLs
        login_url_patterns = ['/login', '/passport', '/signin', '/sign-in',
                              '/qrcode', '/qr_code', '/sso/', '/oauth/login']
        if any(pat in current_url for pat in login_url_patterns):
            print(f'[DC] {platform}: redirected to login page (url={current_url[:80]}), skipping')
            return {'metrics': {}, 'video_stats': [], 'expired': True}

        # Also check page title �?but only for DOUYIN where title-based detection is reliable
        # WECHAT_VIDEO dashboard title may contain "登录" even when authenticated
        if platform != 'WECHAT_VIDEO':
            login_titles = ['登录', 'sign in', 'log in']
            if any(kw in page_title for kw in login_titles):
                print(f'[DC] {platform}: login page detected by title "{page_title[:60]}", skipping')
                return {'metrics': {}, 'video_stats': [], 'expired': True}

        try:
            # DOM login check: skip DOUYIN (detected by URL above; creator pages contain QR elements like mobile app download = false positives)
            if platform in ('DOUYIN', 'WECHAT_VIDEO'):
                login_dom = False
            else:
                login_dom = await page.evaluate('''() => {
                    const text = (document.body && document.body.innerText || '').toLowerCase();
                    const mediaUrls = Array.from(document.querySelectorAll('iframe,img'))
                        .map(el => (el.src || '').toLowerCase()).join('\\n');
                    // QR code image is the strongest login signal
                    const hasQrCode = document.querySelector('img[class*="qr"], img[src*="qr"], img[src*="qrcode"], img[alt*="qr"]')
                        || mediaUrls.includes('qrcode') || mediaUrls.includes('qr_code');
                    // Only login-specific text markers (not generic WeChat terms)
                    const textMarkers = [
                        '\\u626b\\u7801\\u767b\\u5f55',
                        '\\u4e8c\\u7ef4\\u7801\\u767b\\u5f55',
                        '\\u8bf7\\u626b\\u7801\\u767b\\u5f55'
                    ];
                    const hasLoginText = textMarkers.some(marker => text.includes(marker));
                    // Login form elements
                    const hasLoginForm = document.querySelector('input[type="password"], button[class*="login"], div[class*="login-form"], div[class*="qrcode-container"]');
                    return hasQrCode || hasLoginText || !!hasLoginForm ||
                        /login|passport|qrcode|qr_code/.test(mediaUrls);
                }''')
            if login_dom:
                import time as _t
                _ts = _t.strftime('%H%M%S')
                _ssh = f'C:/Users/EDY/jujuju/desktop-companion/_debug_login_{platform}_{_ts}.png'
                try:
                    await page.screenshot(path=_ssh, full_page=False)
                    _ptxt = await page.evaluate('() => document.body.innerText.substring(0, 2000)')
                    print(f'[DC] {platform}: login UI detected! screenshot={_ssh}', flush=True)
                    print(f'[DC] Page URL: {page.url}', flush=True)
                    print(f'[DC] Page text (2000): {_ptxt}', flush=True)
                except Exception as _e:
                    print(f'[DC] Debug screenshot error: {_e}', flush=True)
                print(f'[DC] {platform}: login UI detected, marking cookie expired')
                return {'metrics': {}, 'video_stats': [], 'expired': True}
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')

        metrics = await _scrape_dashboard(page)

        # WECHAT_VIDEO: 从拦截的 auth_data API 补充头像/昵称/粉丝�?
        # DOM 提取 img.avatar �?src 总是空，API 拦截是可靠来�?
        if platform == 'WECHAT_VIDEO':
            # Poll for auth_data response (API may fire during or after page load)
            for _poll in range(20):
                if captured_auth.get('auth'):
                    break
                await asyncio.sleep(0.5)
            if not captured_auth.get('auth'):
                recovered_auth = await _fetch_wechat_auth_data_from_page(page)
                if recovered_auth:
                    captured_auth['auth'] = recovered_auth
                    fu = recovered_auth.get('finderUser', {})
                    print(f'[DC] WECHAT_VIDEO: auth_data recovered via fetch, headImgUrl={fu.get("headImgUrl","?")[:50]}')
            if captured_auth.get('auth'):
                fu = captured_auth['auth'].get('finderUser', {})
                if fu.get('headImgUrl') and not metrics.get('_avatar'):
                    metrics['_avatar'] = fu['headImgUrl']
                    print(f'[DC] WECHAT_VIDEO: avatar(API): {fu["headImgUrl"][:60]}...')
                if fu.get('nickname') and not metrics.get('_nickname'):
                    metrics['_nickname'] = fu['nickname']
                if fu.get('fansCount') and not metrics.get('followers'):
                    metrics['followers'] = fu['fansCount']
            else:
                print(f'[DC] WECHAT_VIDEO: auth_data not captured after 10s, trying DOM fallback...')
                # Fallback: aggressively search shadow DOM for avatar images
                try:
                    dom_avatar = await page.evaluate('''() => {
                        const w = document.querySelector("wujie-app");
                        const root = (w && w.shadowRoot) ? w.shadowRoot : document;
                        // Try all images, prioritize those with avatar-like class names
                        const allImgs = root.querySelectorAll("img");
                        for (const img of allImgs) {
                            const src = img.src || "";
                            const cls = (img.className || "").toLowerCase();
                            const alt = (img.alt || "").toLowerCase();
                            const w = img.width || img.naturalWidth || 0;
                            const h = img.height || img.naturalHeight || 0;
                            // WeChat avatar patterns
                            if (src.includes("wx.qlogo.cn") || src.includes("finderhead") ||
                                src.includes("wx3.qlogo.cn") || src.includes("headimgurl") ||
                                cls.includes("avatar") || cls.includes("head") ||
                                cls.includes("profile") || alt.includes("\u5934\u50cf")) {
                                return src;
                            }
                        }
                        // Fallback: find any reasonably-sized image near top of page
                        for (const img of allImgs) {
                            const src = img.src || "";
                            const w = img.width || img.naturalWidth || 0;
                            const h = img.height || img.naturalHeight || 0;
                            if (src.length > 50 && w > 30 && h > 30 && (w === h || Math.abs(w-h) < 5)) {
                                return src;
                            }
                        }
                        return "";
                    }''')
                    if dom_avatar and not metrics.get('_avatar'):
                        metrics['_avatar'] = dom_avatar
                        print(f'[DC] WECHAT_VIDEO: avatar(DOM fallback): {dom_avatar[:60]}...')
                    elif not dom_avatar:
                        print(f'[DC] WECHAT_VIDEO: DOM fallback also failed - no avatar image found')
                except Exception as e:
                    print(f'[DC] WECHAT_VIDEO: DOM fallback error: {str(e)[:100]}')

        # 2. Data center
        if data_center_url:
            state._collector_progress['phase'] = '数据中心'
            try:
                await _page_goto_retry(page, data_center_url, platform=platform)
                if platform == 'WECHAT_VIDEO':
                    await _wait_for_page_text(page, ['关键指标', '视频数据', '播放', '数据趋势'], timeout_ms=6000, min_count=1)
                else:
                    try:
                        await page.wait_for_selector('[class*=content], [class*=main], [role=main], main', timeout=6000)
                    except Exception:
                        await page.wait_for_timeout(2000)
                dc = await _scrape_data_center(page, platform)
                for k, v in dc.items():
                    prefer_video_period = platform == 'WECHAT_VIDEO' and k in {
                        '_periodMetrics',
                        'newViews', 'newLikes', 'newComments', 'newShares', 'newFollowers',
                        'views', 'likes', 'comments', 'shares',
                    }
                    if v is not None and (prefer_video_period or k not in metrics or metrics.get(k, 0) == 0):
                        metrics[k] = v
            except Exception as e:
                print(f'[DC] data-center error {platform}: {e}')

        # 3. Video list
        if video_list_url:
            state._collector_progress['phase'] = '视频采集'
            try:
                await _page_goto_retry(page, video_list_url, platform=platform)
                if platform == 'WECHAT_VIDEO':
                    await _wait_for_page_text(page, ['视频管理', '视频 (', '合集', '搜索视频'], timeout_ms=5000, min_count=1)
                else:
                    await page.wait_for_timeout(1200)
                video_stats = await _scrape_video_list(page, platform, max_posts=max_posts)
            except Exception as e:
                import traceback
                print(f'[DC] video-list error {platform}: {e}')
                traceback.print_exc()

        # 4. Monetization / Revenue
        if monetization_url and not quick_mode:
            try:
                await page.goto(monetization_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(2500)
                rev = await _scrape_monetization(page)
                for k, v in rev.items():
                    if v is not None and (isinstance(v, bool) or v > 0 or isinstance(v, str)):
                        metrics[k] = v
            except Exception as e:
                print(f'[DC] monetization error {platform}: {e}')

        # 5. Extra pages (粉丝画像, 内容数据, etc.)
        for extra_url in ([] if quick_mode else entry.get('extra_pages', [])):
            try:
                await page.goto(extra_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(2000)
                extra_text = await page.evaluate('() => document.body.innerText')
                # Try to extract any numeric metrics from extra pages
                for key, pats in _METRIC_PATTERNS.items():
                    if key not in metrics or metrics.get(key, 0) == 0:
                        for pat in pats:
                            m = pat.search(extra_text[:6000])
                            if m:
                                val = _parse_metric_num(m.group(1))
                                if val > 0:
                                    metrics[key] = val
                                    break
            except Exception as e:
                print(f'[DC] extra-page error {extra_url}: {e}')

        # 6. Douyin API collection (richer data via internal APIs, no signature needed in browser context)
        if platform.upper() == 'DOUYIN':
            try:
                print(f'[DouyinAPI] Starting API-based collection...')
                if not collect_douyin_data:
                    raise RuntimeError(f'API collector unavailable: {_douyin_import_error}')
                await page.goto('https://www.douyin.com', wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(900 if quick_mode else 2000)

                api_result = await collect_douyin_data(
                    page, max_posts=max_posts, sleep_sec=sleep_sec, fetch_comments=False,
                    account_label=account_label  # 身份验证：多账号场景确认没串�?
                )
                if api_result.success:
                    # Log identity for audit
                    if api_result.detected_nickname:
                        ident_msg = f'[DouyinAPI] Detected: [{api_result.detected_nickname}]'
                        if account_label:
                            match_status = 'MATCH' if api_result.detected_nickname == account_label else 'MISMATCH'
                            ident_msg += f' (expected: [{account_label}], {match_status})'
                        print(ident_msg)
                    # Merge API data into metrics (API data is richer, prefer it over screen-scraped)
                    for k, v in api_result.metrics.items():
                        if v is not None and v != 0:
                            metrics[k] = v
                    # Replace video_stats if API returned more data
                    old_count = len(video_stats)
                    if api_result.video_stats and len(api_result.video_stats) > old_count:
                        video_stats = api_result.video_stats
                        print(f'[DouyinAPI] Replaced video_stats: {len(video_stats)} posts from API (was {old_count} from DOM)')
                    # Store extra data (hot search etc.)
                    if api_result.extra:
                        metrics['_api_extra'] = api_result.extra
                    print(f'[DouyinAPI] API collection SUCCESS: {len(api_result.video_stats)} posts, metrics={list(api_result.metrics.keys())}')
                else:
                    print(f'[DouyinAPI] API collection FAILED: {api_result.error}, keeping screen-scraped data')
            except Exception as e:
                print(f'[DouyinAPI] API collection exception: {e}, falling back to screen-scraped data')

    finally:
        try: await page.close()
        except Exception: pass

    # --- Sanity check: 日增量不应超过累计值的 30% ---
    # 数据中心有时会把累计值当成日增量返回（如"数据总览"选错了时间范围），
    # 导致 newLikes/newViews 出现数百万的假增量。
    # 如果日增量 > 累计值的 30%，很可能是数据源混淆，重置为 0。
    _sanity_pairs = [
        ('newViews', 'views'),
        ('newLikes', 'likes'),
        ('newComments', 'comments'),
        ('newShares', 'shares'),
    ]
    video_period = {}
    if isinstance(metrics.get('_periodMetrics'), dict):
        video_period = metrics.get('_periodMetrics', {}).get('videoData') or {}
    has_trusted_wechat_daily = (
        platform == 'WECHAT_VIDEO'
        and isinstance(video_period, dict)
        and video_period.get('source') == 'channels_data_center_video_data'
        and bool(video_period.get('day_total'))
        and bool(video_period.get('trustedDailyIncrements'))
    )
    for new_key, total_key in _sanity_pairs:
        new_val = metrics.get(new_key)
        total_val = metrics.get(total_key)
        if has_trusted_wechat_daily:
            continue
        if (isinstance(new_val, (int, float)) and isinstance(total_val, (int, float))
                and total_val > 0 and new_val > total_val * 0.3):
            print(f'[DC] Sanity check: {new_key}={new_val} > {total_key}*0.3={total_val*0.3:.0f}, dropping suspicious increment')
            metrics.pop(new_key, None)

    return {'metrics': metrics, 'video_stats': video_stats}


async def _safe_close_ctx(ctx):
    """Close a browser context and ignore already-closed errors."""
    if ctx is None:
        return
    try:
        await ctx.close()
    except Exception as _e:
        print(f'[WARN] {type(_e).__name__}: {_e}')


async def _scrape_one_account(
    pw,
    account_id: str,
    platform: str,
    profile_dir: Path,
    nickname: str = '',
    max_posts: int = _DEFAULT_QUICK_MAX_POSTS,
) -> dict:
    """Scrape one account with its saved storage state."""
    entry = PLATFORM_DASHBOARDS.get(platform)
    if not entry:
        return {'accountId': account_id, 'metrics': {}, 'videoStats': []}

    state_json = profile_dir / 'state.json'
    if not state_json.exists():
        print(f'[DC] No state.json for {nickname or account_id[:12]}, skipping')
        return {'accountId': account_id, 'metrics': {}, 'videoStats': []}

    context = None
    browser = None
    try:
        # Use persistent context per account (separate Chrome instance for cookie isolation)
        launch_kw = {
            'user_data_dir': str(profile_dir), 'headless': True,
            'viewport': {'width': 1280, 'height': 800}, 'locale': 'zh-CN',
            **_collector_launch_args(True),
        }
        context = await pw.chromium.launch_persistent_context(**launch_kw)
        # 注入反检测脚本
        try:
            from stealth_patches import apply_stealth_to_context
            await apply_stealth_to_context(context)
        except ImportError:
            pass

        # Load cookies and localStorage from state.json (runs for both CDP and fallback paths)
        try:
            import json as _json
            state = _json.loads(state_json.read_text('utf-8'))
            if state.get('cookies'): await context.add_cookies(state['cookies'])
            # Restore localStorage from state.json origins (critical for WECHAT_VIDEO auth)
            # Without finder_login_token etc. in localStorage, WeChat Video shows login page
            for origin_entry in state.get('origins', []):
                origin_url = origin_entry.get('origin', '')
                ls_items = origin_entry.get('localStorage', [])
                if not origin_url or not ls_items:
                    continue
                try:
                    inject_page = await context.new_page()
                    await inject_page.goto(origin_url, wait_until='domcontentloaded', timeout=15000)
                    await inject_page.wait_for_timeout(1000)
                    # Build JS to inject all localStorage items (use JSON for safe escaping)
                    items_json = _json.dumps(
                        {item.get('name', ''): item.get('value', '') for item in ls_items},
                        ensure_ascii=False,
                    )
                    js_code = f'() => {{ const items = JSON.parse({json.dumps(items_json, ensure_ascii=False)}); for (const [k,v] of Object.entries(items)) {{ try {{ localStorage.setItem(k, v); }} catch(e) {{}} }} }}'
                    await inject_page.evaluate(js_code)
                    await inject_page.wait_for_timeout(500)
                    await inject_page.close()
                    print(f'[DC] Restored {len(ls_items)} localStorage items for {origin_url}')
                except Exception as ls_err:
                    print(f'[DC] localStorage restore warning for {origin_url}: {str(ls_err)[:100]}')
        except Exception: pass

        label = nickname or account_id[:12]
        print(f'[DC] Scraping {label} ({platform})...')
        post_limit = max_posts if isinstance(max_posts, int) and max_posts > 0 else 0
        douyin_sleep = 0.35 if post_limit else 1.5
        try:
            from local_db import is_first_collection
            if is_first_collection(account_id) and not post_limit:
                douyin_sleep = 2.0
                print(f'[DC] First collection for {label}, full pagination sleep=2.0s')
        except Exception as e:
            print(f'[DC] Error checking first collection for {label}: {e}')
        result = await _scrape_account_pages(context, platform, account_label=label, max_posts=post_limit, sleep_sec=douyin_sleep)
        # 提取刷新后的 Cookie，供上层上传到服务器
        fresh_cookies = []
        try:
            fresh_cookies = await context.cookies()
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')
        # After successful scrape, keep account active and mark collection time.
        # Condition: any meaningful data returned (metrics with any key, OR video_stats)
        # Do NOT require both �?metrics alone (e.g. follower_count) is enough to mark active
        metrics_ok = bool(result.get('metrics'))  # any non-empty metrics dict
        videos_ok = bool(result.get('video_stats'))
        if metrics_ok or videos_ok:
            try:
                from local_db import update_collection_time, update_status
                update_status(account_id, 'active')
                update_collection_time(account_id)
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
        elif result.get('expired'):
            try:
                from local_db import update_status
                update_status(account_id, 'expired')
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
            print(f'[DC] Cookie expired for {label}, needs re-scan')
        else:
            print(f'[DC] No data scraped for {label}; keeping current account status')
        return {'accountId': account_id, 'metrics': result['metrics'], 'videoStats': result['video_stats'], 'freshCookies': fresh_cookies}
    except Exception as e:
        print(f'[DC] scrape error {platform}/{account_id}: {str(e)[:120]}')
        return {'accountId': account_id, 'metrics': {}, 'videoStats': []}
    finally:
        if context:
            try:
                # 不要关闭伴侣 Chrome �?context（会导致整个浏览器崩掉）
                if not (browser and browser.contexts and context == browser.contexts[0]):
                    await context.close()
            except Exception: pass


async def _scrape_all(accounts: list, max_posts: int = _DEFAULT_QUICK_MAX_POSTS, collection_mode: str = 'quick') -> list:
    """Scrape multiple accounts with isolated browser profiles."""
    from playwright.async_api import async_playwright
    from local_db import get_profile_path

    results = []
    state._collector_progress['total'] = len(accounts)
    state._collector_progress['current'] = 0
    state._collector_progress['mode'] = collection_mode
    state._collector_progress['max_posts'] = max_posts

    async with async_playwright() as pw:
        for acc in accounts:
            state._collector_progress['current'] += 1
            state._collector_progress['nickname'] = acc.get('nickname', '')[:20]
            state._collector_progress['phase'] = '仪表盘'
            state._collector_progress['video_page'] = 0
            state._collector_progress['video_count'] = 0
            aid = (acc.get('id') or '').strip()
            platform = (acc.get('platform') or '').strip().upper()
            if not aid or not platform:
                continue
            if platform not in PLATFORM_DASHBOARDS:
                continue
            profile_dir = get_profile_path(aid)
            if not profile_dir:
                print(f'[DC] No local profile for {aid}, skipping')
                continue

            result = await _scrape_one_account(
                pw, aid, platform, profile_dir,
                nickname=acc.get('nickname', ''),
                max_posts=max_posts,
            )
            results.append(result)

    return results


