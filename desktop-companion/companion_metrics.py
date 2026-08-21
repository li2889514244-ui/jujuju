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


def _collector_launch_args(headless: bool = True, extra_args: list = None) -> dict:
    opts = _launch_browser_opts(headless, extra_args=extra_args)
    launch_kw = {'args': opts.get('args', [])}
    if opts.get('ignore_default_args') is not None:
        launch_kw['ignore_default_args'] = opts.get('ignore_default_args')

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
        'url': 'https://creator.douyin.com/creator-micro/home',
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


def _is_likely_legal_entity_name(value: str) -> bool:
    text = _sanitize_text(value or '')
    if not text:
        return False
    legal_markers = (
        '有限公司',
        '有限责任公司',
        '股份有限公司',
        '集团有限公司',
        '文化有限公司',
        '科技有限公司',
    )
    return any(marker in text for marker in legal_markers)


def _is_safe_collected_nickname(value: str, platform: str = '') -> bool:
    text = _sanitize_text(value or '')
    if not text or len(text) < 2:
        return False
    lower = text.lower()
    noise_values = {
        '视频号',
        '视频号助手',
        '微信',
        '抖音',
        '抖音创作者中心',
        '抖音创作服务平台',
        '快手',
        '快手创作者服务平台',
        '小红书',
        '小红书创作服务平台',
        '创作者中心',
        '创作者服务平台',
        '内容管理',
        '数据中心',
        '视频管理',
        '首页',
        '数据',
        '内容',
        '粉丝',
        '关注',
        '获赞',
        '账号',
        '平台',
        '扫码登录',
        '登录',
        '申请认证',
        '关注者',
        '昨日数据',
    }
    if text in noise_values:
        return False
    english_noise = {
        'douyin',
        'douyin creator center',
        'creator center',
        'creator service platform',
        'kuaishou',
        'xiaohongshu',
        'wechat',
        'video account',
        'login',
    }
    if lower in english_noise:
        return False
    nav_names = globals().get('_NAV_NAMES', set())
    if text in nav_names:
        return False
    if platform == 'WECHAT_VIDEO' and _is_likely_legal_entity_name(text):
        return False
    return True


def _is_safe_avatar_url(value: str) -> bool:
    text = str(value or '').strip()
    if not text or len(text) > 2000:
        return False
    lower = text.lower()
    if not (lower.startswith('http://') or lower.startswith('https://')):
        return False
    if (
        'channels.weixin.qq.com/platform' in lower
        or 'finder.video.qq.com/platform' in lower
        or '/data-center' in lower
        or '/post/list' in lower
        or '/statistic/' in lower
        or 'douyin-creator-logo' in lower
        or ('douyinstatic.com' in lower and 'logo' in lower)
    ):
        return False
    image_hosts = (
        'qlogo.cn',
        'qpic.cn',
        'headimg',
        'douyinpic.com',
        'byteimg.com',
        'xhscdn.com',
        'kuaishou.com',
        'kwaicdn.com',
    )
    image_exts = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif')
    return (
        any(marker in lower for marker in image_hosts)
        or any(lower.split('?')[0].endswith(ext) for ext in image_exts)
        or 'avatar' in lower
        or 'headimage' in lower
        or 'headimgurl' in lower
    )


async def _extract_wechat_home_avatar(page) -> str:
    """Extract the visible account-card avatar on the WeChat Channels home page."""
    try:
        avatar = await page.evaluate(
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
                const imageUrl = el => {
                    const attrs = ['currentSrc', 'src', 'data-src', 'data-original', 'data-url'];
                    for (const attr of attrs) {
                        const value = el[attr] || (el.getAttribute && el.getAttribute(attr));
                        if (value && /^https?:\/\//i.test(value)) return value;
                    }
                    try {
                        const bg = getComputedStyle(el).backgroundImage || '';
                        const match = bg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/i);
                        if (match) return match[1];
                    } catch (e) {}
                    return '';
                };
                const candidates = [];
                for (const root of roots) {
                    const scopedTextNodes = Array.from(root.querySelectorAll('section, article, div'))
                        .filter(visible)
                        .filter(el => {
                            const text = el.innerText || '';
                            return text.includes('视频号ID') || (text.includes('视频') && text.includes('关注者'));
                        });
                    const scopes = scopedTextNodes.length ? scopedTextNodes.slice(0, 8) : [root];
                    for (const scope of scopes) {
                        for (const el of Array.from(scope.querySelectorAll('img, [style*="background-image"]'))) {
                            if (!visible(el)) continue;
                            const url = imageUrl(el);
                            if (!url) continue;
                            const box = el.getBoundingClientRect();
                            const size = Math.min(box.width || el.naturalWidth || 0, box.height || el.naturalHeight || 0);
                            if (size < 28) continue;
                            const squarePenalty = Math.abs((box.width || size) - (box.height || size));
                            const text = ((el.className || '') + ' ' + (el.alt || '') + ' ' + url).toLowerCase();
                            const avatarBonus = /(avatar|head|face|qlogo|finderhead|headimg)/.test(text) ? 1000 : 0;
                            const topBonus = Math.max(0, 600 - Math.max(0, box.top));
                            candidates.push({url, score: avatarBonus + topBonus + size - squarePenalty * 2});
                        }
                    }
                }
                candidates.sort((a, b) => b.score - a.score);
                return candidates[0] ? candidates[0].url : '';
            }'''
        )
        return avatar or ''
    except Exception as e:
        print(f'[DC] WECHAT_VIDEO: home avatar extraction error: {str(e)[:100]}')
        return ''


def _parse_metric_num(s: str) -> int:
    s = s.strip().replace(',', '').replace(' ', '')
    if s.endswith(('\u4e07', '\u842c')):
        return round(float(s[:-1]) * 10000)
    if s.endswith(('万', '萬')):
        return round(float(s[:-1]) * 10000)
    if s.endswith(('万', 'w', 'W')):
        return round(float(s[:-1]) * 10000)
    try:
        return int(float(s))
    except ValueError:
        return 0


def _extract_labeled_metric(lines: list[str], label: str) -> int:
    for idx, line in enumerate(lines):
        if line == label and idx + 1 < len(lines):
            val = _parse_metric_num(lines[idx + 1])
            if val > 0:
                return val
        if line.startswith(label) and len(line) > len(label):
            val = _parse_metric_num(line[len(label):])
            if val > 0:
                return val
    return 0


def _extract_douyin_utf8_home_metrics(text: str) -> dict:
    douyin_id_label = '\u6296\u97f3\u53f7'
    creator_title = '\u6296\u97f3\u521b\u4f5c\u8005\u4e2d\u5fc3'
    if not text or (douyin_id_label not in text and creator_title not in text):
        return {}

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    result = {}
    for label, key in (
        ('\u5173\u6ce8', 'following'),
        ('\u7c89\u4e1d', 'followers'),
        ('\u83b7\u8d5e', 'likes'),
    ):
        val = _extract_labeled_metric(lines, label)
        if val > 0:
            result[key] = val

    latest_label = '\u6700\u65b0\u4f5c\u54c1'
    if latest_label in lines:
        scope = lines[lines.index(latest_label):lines.index(latest_label) + 80]
        label_to_key = {
            '\u64ad\u653e\u91cf': 'newViews',
            '\u70b9\u8d5e\u91cf': 'newLikes',
            '\u8bc4\u8bba\u91cf': 'newComments',
            '\u5206\u4eab\u91cf': 'newShares',
        }
        for idx, line in enumerate(scope):
            key = label_to_key.get(line)
            if key and idx + 1 < len(scope):
                val = _parse_metric_num(scope[idx + 1])
                if val > 0:
                    result.setdefault(key, val)

    overview_label = '\u8d26\u53f7\u603b\u89c8'
    if overview_label in lines:
        scope = lines[lines.index(overview_label):lines.index(overview_label) + 120]
        play_label = '\u64ad\u653e\u91cf'
        for idx, line in enumerate(scope):
            if line == play_label and idx + 1 < len(scope):
                val = _parse_metric_num(scope[idx + 1])
                if val > 0:
                    result['views'] = val
                    break

    return result


def _scrape_douyin_creator_video_list_from_text(text: str, max_posts: int = 0) -> list:
    if not text or '\u4f5c\u54c1' not in text:
        return []

    import hashlib
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    duration_re = re.compile(r'^\d{1,2}:\d{2}(?::\d{2})?$')
    date_re = re.compile(r'\d{4}\u5e74\d{1,2}\u6708\d{1,2}\u65e5\s+\d{1,2}:\d{2}')
    metric_labels = {
        '\u64ad\u653e': 'views',
        '\u70b9\u8d5e': 'likes',
        '\u8bc4\u8bba': 'comments',
        '\u5206\u4eab': 'shares',
    }
    skip_titles = {
        '\u5185\u5bb9\u7ba1\u7406',
        '\u4f5c\u54c1\u5408\u96c6',
        '\u5df2\u53d1\u5e03',
        '\u5ba1\u6838\u4e2d',
        '\u672a\u901a\u8fc7',
    }
    videos = []
    seen = set()
    limit = max_posts if isinstance(max_posts, int) and max_posts > 0 else None

    starts = [idx for idx, line in enumerate(lines) if duration_re.match(line)]
    starts.append(len(lines))
    for pos in range(len(starts) - 1):
        start = starts[pos]
        end = starts[pos + 1]
        block = lines[start:end]
        if len(block) < 5:
            continue

        title = ''
        for candidate in block[1:6]:
            if candidate in skip_titles:
                continue
            if candidate in ('\u7f16\u8f91\u4f5c\u54c1', '\u8bbe\u7f6e\u6743\u9650', '\u5220\u9664\u4f5c\u54c1'):
                break
            if len(candidate) >= 3:
                title = candidate[:120]
                break
        if not title:
            continue

        publish_time = ''
        metrics = {'views': 0, 'likes': 0, 'comments': 0, 'shares': 0}
        for idx, line in enumerate(block):
            if not publish_time and date_re.search(line):
                publish_time = line
            key = metric_labels.get(line)
            if key and idx + 1 < len(block):
                metrics[key] = _parse_metric_num(block[idx + 1])

        if not any(metrics.values()):
            continue
        uniq = f'{title}|{publish_time}'
        if uniq in seen:
            continue
        seen.add(uniq)
        videos.append({
            'id': hashlib.md5(uniq.encode('utf-8', errors='ignore')).hexdigest()[:16],
            'contentId': hashlib.md5(uniq.encode('utf-8', errors='ignore')).hexdigest()[:16],
            'title': title,
            'date': publish_time,
            'publishedAt': publish_time,
            'views': metrics['views'],
            'likes': metrics['likes'],
            'comments': metrics['comments'],
            'shares': metrics['shares'],
        })
        if limit and len(videos) >= limit:
            break

    return videos


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


def _extract_douyin_home_period_metrics_from_text(text: str) -> dict:
    """Extract period metrics from the Douyin creator home data-center card."""
    data_center_label = '\u6570\u636e\u4e2d\u5fc3'
    account_overview_label = '\u8d26\u53f7\u603b\u89c8'
    if not text or (data_center_label not in text and account_overview_label not in text):
        return {}

    starts = [pos for pos in (text.find(data_center_label), text.find(account_overview_label)) if pos >= 0]
    scope = text[(min(starts) if starts else 0):][:3000]
    lines = [line.strip() for line in scope.splitlines() if line.strip()]
    label_map = {
        '\u64ad\u653e\u91cf': 'play',
        '\u4f5c\u54c1\u70b9\u8d5e': 'like',
        '\u4f5c\u54c1\u8bc4\u8bba': 'comment',
        '\u4f5c\u54c1\u5206\u4eab': 'share',
        '\u51c0\u589e\u7c89\u4e1d': 'new_fans',
    }
    result = {}
    for idx, line in enumerate(lines):
        key = label_map.get(line)
        if not key:
            continue
        for candidate in lines[idx + 1:idx + 5]:
            if candidate.startswith('\u8f83\u524d'):
                continue
            if candidate in label_map:
                break
            if re.search(r'[+-]?\d', candidate):
                result[key] = _parse_metric_num(candidate)
                break
    return result


async def _select_douyin_home_period(page, period_key: str) -> bool:
    """Select yesterday / 7-day / 30-day on the Douyin home data-center card."""
    aliases = {
        'day_total': ['\u6628\u65e5', '\u6628\u65e5\u6570\u636e'],
        'week_total': ['\u8fd17\u65e5', '\u8fd17\u5929'],
        'month_total': ['\u8fd130\u65e5', '\u8fd130\u5929'],
    }.get(period_key, [period_key])
    try:
        opened = await page.evaluate(
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
                const clickEl = el => {
                    el.scrollIntoView({block: 'center', inline: 'center'});
                    el.dispatchEvent(new MouseEvent('mousemove', {bubbles: true}));
                    el.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                    el.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                    el.click();
                };
                const cards = [];
                for (const root of roots) {
                    cards.push(...Array.from(root.querySelectorAll('section, article, main, div'))
                        .filter(visible)
                        .filter(el => {
                            const text = el.innerText || el.textContent || '';
                            return text.includes('数据中心') &&
                                (text.includes('账号总览') || text.includes('播放量') || text.includes('净增粉丝'));
                        }));
                }
                cards.sort((a, b) => {
                    const ab = a.getBoundingClientRect();
                    const bb = b.getBoundingClientRect();
                    return (ab.width * ab.height) - (bb.width * bb.height);
                });
                for (const card of cards.slice(0, 10)) {
                    const controls = Array.from(card.querySelectorAll('button, [role="button"], [class*="select"], [class*="dropdown"], span, div'))
                        .filter(visible)
                        .filter(el => {
                            const text = (el.innerText || el.textContent || '').trim();
                            return text === '时间' || text === '昨日' || text === '近7日' ||
                                text === '近7天' || text === '近30日' || text === '近30天' ||
                                /时间\s*(昨日|近7日|近7天|近30日|近30天)/.test(text);
                        });
                    controls.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
                    if (controls.length) {
                        clickEl(controls[0]);
                        return true;
                    }
                }
                return false;
            }'''
        )
        if not opened:
            return False
        await page.wait_for_timeout(350)
        selected = await page.evaluate(
            r'''(aliases) => {
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
                const clickEl = el => {
                    el.scrollIntoView({block: 'center', inline: 'center'});
                    el.dispatchEvent(new MouseEvent('mousemove', {bubbles: true}));
                    el.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                    el.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                    el.click();
                };
                for (const root of roots) {
                    const options = Array.from(root.querySelectorAll('li, button, [role="option"], [role="menuitem"], span, div'))
                        .filter(visible)
                        .filter(el => aliases.includes((el.innerText || el.textContent || '').trim()));
                    options.sort((a, b) => {
                        const ab = a.getBoundingClientRect();
                        const bb = b.getBoundingClientRect();
                        return (bb.width * bb.height) - (ab.width * ab.height);
                    });
                    if (options.length) {
                        clickEl(options[0]);
                        return true;
                    }
                }
                return false;
            }''',
            aliases,
        )
        if selected:
            await page.wait_for_timeout(1100)
        return bool(selected)
    except Exception as e:
        print(f'[DC] DOUYIN home period select error {period_key}: {str(e)[:120]}')
        return False


async def _scrape_douyin_home_period_metrics(page) -> dict:
    """Collect Douyin home-card period metrics without navigating away."""
    period_metrics = {}
    for period_key in ('day_total', 'week_total', 'month_total'):
        if not await _select_douyin_home_period(page, period_key):
            print(f'[DC] DOUYIN home period {period_key}: select failed')
            continue
        parsed = _extract_douyin_home_period_metrics_from_text(await _get_page_text(page))
        if parsed:
            period_metrics[period_key] = parsed
            print(f'[DC] DOUYIN home period {period_key}: {json.dumps(parsed, ensure_ascii=False)}')
        else:
            print(f'[DC] DOUYIN home period {period_key}: parse empty')

    if not period_metrics:
        return {}
    day = period_metrics.get('day_total') or {}
    result = {
        '_periodMetrics': {
            'videoData': {
                **period_metrics,
                'source': 'douyin_home_data_center_card',
            },
        },
    }
    if 'play' in day:
        result['newViews'] = day.get('play', 0)
    if 'like' in day:
        result['newLikes'] = day.get('like', 0)
    if 'comment' in day:
        result['newComments'] = day.get('comment', 0)
    if 'share' in day:
        result['newShares'] = day.get('share', 0)
    if 'new_fans' in day:
        result['newFollowers'] = day.get('new_fans', 0)
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
                        val2 = _parse_metric_num(m.group(1))
                        if 2000 <= val2 <= 2099:
                            m = None
                            continue
                        break
            if m:
                val = _parse_metric_num(m.group(1))
                # 过滤年份（2000-2099）被误当作指标值
                if 2000 <= val <= 2099:
                    continue
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


async def _extract_wechat_metric_card_text(page, title_markers, metric_markers) -> str:
    try:
        return await page.evaluate(
            r'''({titleMarkers, metricMarkers}) => {
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
                        if (text.length < 20 || text.length > 3000) continue;
                        const hasTitle = titleMarkers.some(marker => text.includes(marker));
                        const hasMetric = metricMarkers.some(marker => text.includes(marker));
                        if (!hasTitle || !hasMetric) continue;
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
            }''',
            {'titleMarkers': title_markers, 'metricMarkers': metric_markers},
        )
    except Exception:
        return ''


async def _open_wechat_metric_period_dropdown(page, title_markers, metric_markers) -> bool:
    try:
        return bool(await page.evaluate(
            r'''({titleMarkers, metricMarkers}) => {
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
                        const hasTitle = titleMarkers.some(marker => text.includes(marker));
                        const hasMetric = metricMarkers.some(marker => text.includes(marker));
                        if (hasTitle && hasMetric) {
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
            }''',
            {'titleMarkers': title_markers, 'metricMarkers': metric_markers},
        ))
    except Exception:
        return False


def _wechat_period_label_aliases(label: str) -> list[str]:
    aliases = {
        '昨日数据': ['昨日数据', '日', '昨日'],
        '近7天': ['近7天', '周', '7天'],
        '近30天': ['近30天', '月', '30天'],
    }
    return aliases.get(label, [label])


async def _click_wechat_metric_period_in_card(page, labels: list[str], title_markers, metric_markers) -> bool:
    """Click a period tab/dropdown item inside the target WeChat metric card."""
    try:
        return bool(await page.evaluate(
            r'''({labels, titleMarkers, metricMarkers}) => {
                const roots = [document];
                for (const w of document.querySelectorAll('wujie-app')) {
                    if (w.shadowRoot) roots.push(w.shadowRoot);
                }
                const norm = text => String(text || '').replace(/\s+/g, '').trim();
                const wanted = labels.map(norm).filter(Boolean);
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
                const matches = text => wanted.some(label => {
                    if (label.length <= 1) return text === label;
                    return text === label || text.includes(label);
                });
                const cards = [];
                for (const root of roots) {
                    for (const el of Array.from(root.querySelectorAll('section, article, div'))) {
                        if (!visible(el)) continue;
                        const text = el.innerText || '';
                        const hasTitle = titleMarkers.some(marker => text.includes(marker));
                        const hasMetric = metricMarkers.some(marker => text.includes(marker));
                        if (hasTitle && hasMetric) cards.push(el);
                    }
                }
                cards.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
                const card = cards[0];
                if (!card) return false;
                const candidates = Array.from(card.querySelectorAll(
                    'button, [role=button], [role=tab], [role=option], div, span, li, input, [class*=select], [class*=dropdown]'
                ))
                    .filter(visible)
                    .map(node => ({node, text: norm(node.innerText || node.textContent || node.value)}))
                    .filter(item => item.text && matches(item.text));
                candidates.sort((a, b) => {
                    const exactA = wanted.includes(a.text) ? 0 : 1;
                    const exactB = wanted.includes(b.text) ? 0 : 1;
                    return exactA - exactB || a.text.length - b.text.length;
                });
                const el = candidates[0] && candidates[0].node;
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
            {'labels': labels, 'titleMarkers': title_markers, 'metricMarkers': metric_markers},
        ))
    except Exception:
        return False


async def _open_wechat_key_metric_period_dropdown(page) -> bool:
    return await _open_wechat_metric_period_dropdown(page, ['关键指标'], ['播放', '点赞', '评论', '分享'])


async def _select_wechat_metric_period(page, label: str, title_markers, metric_markers, parser) -> bool:
    labels = _wechat_period_label_aliases(label)

    async def wait_for_metrics() -> bool:
        for _ in range(12):
            await page.wait_for_timeout(300)
            card_text = await _extract_wechat_metric_card_text(page, title_markers, metric_markers)
            if parser(card_text):
                return True
        return False

    if await _click_wechat_metric_period_in_card(page, labels, title_markers, metric_markers):
        if await wait_for_metrics():
            return True

    opened = await _open_wechat_metric_period_dropdown(page, title_markers, metric_markers)
    if opened:
        await page.wait_for_timeout(250)
        if await _click_wechat_metric_period_in_card(page, labels, title_markers, metric_markers):
            if await wait_for_metrics():
                return True

    for period_label in labels:
        exact_modes = (True,) if len(period_label) <= 1 else (True, False)
        for exact in exact_modes:
            clicked = await _click_visible_text(page, period_label, exact=exact)
            if not clicked and not opened:
                opened = await _open_wechat_metric_period_dropdown(page, title_markers, metric_markers)
                await page.wait_for_timeout(250)
                clicked = await _click_visible_text(page, period_label, exact=exact)
            if not clicked:
                continue
            if await wait_for_metrics():
                return True
    return False


async def _select_wechat_video_period(page, label: str) -> bool:
    return await _select_wechat_metric_period(
        page,
        label,
        ['关键指标'],
        ['播放', '点赞', '评论', '分享'],
        _parse_wechat_key_metric_text,
    )


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


def _parse_wechat_follower_metric_text(text: str) -> dict:
    """Parse the WeChat Channels follower-data period card."""
    if not text:
        return {}

    metric = {'new_fans': 0, 'unfollows': 0, 'net_fans': 0}
    label_map = [
        ('净增关注', 'net_fans'),
        ('新增关注', 'new_fans'),
        ('取消关注', 'unfollows'),
    ]
    period_labels = {'昨日数据', '近7天', '近30天'}
    lines = [
        line.strip()
        for line in re.split(r'[\r\n]+', text)
        if line and line.strip()
    ]

    def clean_number_line(line: str) -> bool:
        if '%' in line or '统计时间' in line or '周期指标' in line:
            return False
        if line in period_labels:
            return False
        if re.search(r'\d{2}-\d{2}', line):
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
                metric[key] = _parse_metric_num(m.group(1))
                break

    values = []
    for line in lines:
        if not clean_number_line(line):
            continue
        for raw in re.findall(r'(?<![+\-])\d[\d,.]*[万wW]?', line):
            val = _parse_metric_num(raw)
            if 2000 <= val <= 2099:
                continue
            values.append(val)
    if values and not any(metric.values()):
        # The card commonly shows: 新增关注, 取消关注, with optional 净增关注.
        metric['new_fans'] = values[0]
        if len(values) >= 2:
            metric['unfollows'] = values[1]
        metric['net_fans'] = metric['new_fans'] - metric['unfollows']

    if not metric['net_fans'] and (metric['new_fans'] or metric['unfollows']):
        metric['net_fans'] = metric['new_fans'] - metric['unfollows']

    return metric if any(value != 0 for value in metric.values()) else {}


async def _open_wechat_data_center_section(page, section_label: str, markers: list, fallback_url: str = '') -> bool:
    await _click_visible_text(page, '数据中心', exact=True)
    await _wait_for_page_text(page, [section_label], timeout_ms=1800, min_count=1)
    for exact in (True, False):
        if await _click_visible_text(page, section_label, exact=exact):
            if await _wait_for_page_text(page, markers, timeout_ms=5000, min_count=1):
                return True
    if fallback_url:
        try:
            await _page_goto_retry(page, fallback_url, platform='WECHAT_VIDEO')
            return await _wait_for_page_text(page, markers, timeout_ms=6000, min_count=1)
        except Exception as e:
            print(f'[DC] WECHAT_VIDEO {section_label}: fallback goto failed: {str(e)[:120]}')
    return False


async def _scrape_wechat_follower_period_metrics(page) -> dict:
    periods = [
        ('day_total', '昨日数据'),
        ('week_total', '近7天'),
        ('month_total', '近30天'),
    ]
    period_metrics = {}

    opened = await _open_wechat_data_center_section(
        page,
        '关注者数据',
        ['周期指标', '新增关注', '取消关注', '关注者总数'],
        fallback_url='https://channels.weixin.qq.com/platform/statistic/follower',
    )
    if not opened:
        print('[DC] WECHAT_VIDEO follower-data: enter follower data page failed')
        return {}

    for key, label in periods:
        selected = await _select_wechat_metric_period(
            page,
            label,
            ['周期指标'],
            ['新增关注', '取消关注', '净增关注'],
            _parse_wechat_follower_metric_text,
        )
        if not selected:
            print(f'[DC] WECHAT_VIDEO follower-data {label}: period select failed')
            continue
        card_text = await _extract_wechat_metric_card_text(
            page,
            ['周期指标'],
            ['新增关注', '取消关注', '净增关注'],
        )
        parsed = _parse_wechat_follower_metric_text(card_text)
        if parsed:
            period_metrics[key] = parsed
            print(f'[DC] WECHAT_VIDEO follower-data {label}: {parsed}')
        else:
            print(f'[DC] WECHAT_VIDEO follower-data {label}: no metrics parsed')

    if not period_metrics:
        return {}

    day = period_metrics.get('day_total') or {}
    result = {
        '_periodMetrics': {
            'followerData': {
                **period_metrics,
                'source': 'channels_data_center_follower_data',
                'collectedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
            }
        }
    }
    if day:
        result['newFollowers'] = day.get('net_fans') if day.get('net_fans') is not None else day.get('new_fans', 0)
        result['unfollows'] = day.get('unfollows', 0)
    return result


async def _scrape_wechat_video_period_metrics(page) -> dict:
    """Collect video-data key metrics for yesterday, 7 days, and 30 days.
    Uses API interception (new_post_total_data) as primary source,
    falls back to card text parsing."""
    import json as _json
    collector_logs = []

    def _log(message: str):
        line = f'[DC] WECHAT_VIDEO {message}'
        print(line)
        collector_logs.append(line)

    # ── API 拦截：捕获 new_post_total_data 响应 ──
    captured_api = []  # list of {array_len, dataByTabtype, dataByFanstype}

    async def _on_total_data_response(response):
        if 'new_post_total_data' not in response.url:
            return
        try:
            text = await response.text()
            if not text.startswith('{'):
                return
            data = _json.loads(text)
            if data.get('errCode') != 0:
                return
            inner = data.get('data', {})
            by_tab = inner.get('dataByTabtype', [])
            by_fans = inner.get('dataByFanstype', [])
            if not by_tab and not by_fans:
                return
            # Determine array length from first tab's browse array
            sample = None
            for tab in by_tab:
                arr = tab.get('data', {}).get('browse', [])
                if arr:
                    sample = arr
                    break
            if not sample and by_fans:
                for fan_group in by_fans:
                    for tab in fan_group.get('dataByTabtype', []):
                        arr = tab.get('data', {}).get('browse', [])
                        if arr:
                            sample = arr
                            break
                    if sample:
                        break
            arr_len = len(sample) if sample else 0
            captured_api.append({
                'arr_len': arr_len,
                'dataByTabtype': by_tab,
                'dataByFanstype': by_fans,
            })
            _log(f'new_post_total_data captured (arr_len={arr_len}, tabs={len(by_tab)}, fan_groups={len(by_fans)})')
        except Exception as e:
            _log(f'API intercept error: {e}')

    page.on('response', _on_total_data_response)

    periods = [
        ('day_total', '昨日数据'),
        ('week_total', '近7天'),
        ('month_total', '近30天'),
    ]
    period_metrics = {}

    opened_video_page = await _open_wechat_data_center_section(
        page,
        '视频数据',
        ['关键指标', '播放', '近7天', '近30天'],
        fallback_url='https://channels.weixin.qq.com/platform/statistic/post',
    )
    if not opened_video_page:
        _log('video-data: enter video data page failed')
        page.remove_listener('response', _on_total_data_response)
        return {'_collectorLogs': collector_logs}
    await _click_visible_text(page, '全部视频', exact=True)
    await _wait_for_page_text(page, ['关键指标', '播放'], timeout_ms=1200, min_count=1)

    # 等待 API 响应被捕获
    for key, label in periods:
        before_count = len(captured_api)
        selected = await _select_wechat_video_period(page, label)
        if selected:
            _log(f'video-data {label}: selected for API capture')
            await page.wait_for_timeout(2500)
            after_count = len(captured_api)
            _log(
                f'video-data {label}: API capture delta={after_count - before_count}, '
                f'captured_lengths={[cap.get("arr_len") for cap in captured_api]}'
            )
        else:
            _log(f'video-data {label}: period select failed during API capture')

    # ── 优先使用 API 数据 ──
    def _extract_from_api():
        """从拦截的 API 响应中提取日/周/月增量数据"""
        result = {}
        for cap in captured_api:
            arr_len = cap['arr_len']
            # 找到 "全部" tab (tabType=999) 优先从 dataByFanstype
            all_tab = None
            for fan_group in cap.get('dataByFanstype', []):
                for tab in fan_group.get('dataByTabtype', []):
                    if tab.get('tabType') == 999 or tab.get('tabTypeName') == '全部':
                        all_tab = tab.get('data', {})
                        break
                if all_tab:
                    break
            # 如果没有 dataByFanstype，则手动求和 dataByTabtype
            if not all_tab:
                all_tab = {}
                by_tab = cap.get('dataByTabtype', [])
                for tab in by_tab:
                    tab_data = tab.get('data', {})
                    for metric_key in ('browse', 'like', 'comment', 'forward', 'fav', 'follow'):
                        arr = tab_data.get(metric_key, [])
                        if arr:
                            if metric_key not in all_tab:
                                all_tab[metric_key] = [0] * len(arr)
                            for i, v in enumerate(arr):
                                try:
                                    all_tab[metric_key][i] += int(v)
                                except (ValueError, TypeError):
                                    pass
            if not all_tab:
                continue
            # 根据数组长度判断时间范围
            browse_arr = all_tab.get('browse', [])
            if not browse_arr:
                continue
            if arr_len <= 2:
                # 昨日数据 (2-day array, last element = yesterday)
                idx = -1
                result['day_total'] = {
                    'play': int(browse_arr[idx]),
                    'like': int(all_tab.get('like', ['0','0'])[idx]),
                    'comment': int(all_tab.get('comment', ['0','0'])[idx]),
                    'share': int(all_tab.get('forward', ['0','0'])[idx]),
                    'new_fans': int(all_tab.get('follow', ['0','0'])[idx]),
                }
            elif arr_len <= 7:
                # 近7天 (7-day array, sum all elements)
                result['week_total'] = {
                    'play': sum(int(v) for v in browse_arr),
                    'like': sum(int(v) for v in all_tab.get('like', ['0']*7)),
                    'comment': sum(int(v) for v in all_tab.get('comment', ['0']*7)),
                    'share': sum(int(v) for v in all_tab.get('forward', ['0']*7)),
                    'new_fans': sum(int(v) for v in all_tab.get('follow', ['0']*7)),
                }
            elif arr_len <= 30:
                # 近30天 (30-day array, sum all elements)
                result['month_total'] = {
                    'play': sum(int(v) for v in browse_arr),
                    'like': sum(int(v) for v in all_tab.get('like', ['0']*30)),
                    'comment': sum(int(v) for v in all_tab.get('comment', ['0']*30)),
                    'share': sum(int(v) for v in all_tab.get('forward', ['0']*30)),
                    'new_fans': sum(int(v) for v in all_tab.get('follow', ['0']*30)),
                }
        return result

    api_metrics = _extract_from_api()
    if api_metrics:
        _log(f'API-derived period metrics: {_json.dumps(api_metrics, ensure_ascii=False)}')
        if 'month_total' not in api_metrics:
            _log(
                'API-derived period metrics missing month_total '
                f"(captured_lengths={[cap.get('arr_len') for cap in captured_api]})"
            )
        period_metrics = api_metrics

    # ── 降级：如果 API 没有捕获到数据，使用卡片文本解析 ──
    if not period_metrics:
        _log('API interception failed, falling back to card text parsing')
        for key, label in periods:
            selected = await _select_wechat_video_period(page, label)
            if not selected:
                _log(f'video-data {label}: period select failed')
                continue
            card_text = await _extract_wechat_key_metric_card_text(page)
            print(f'[DC DEBUG] WECHAT {label} raw card_text ({len(card_text)} chars): {card_text[:600]}')
            parsed = _parse_wechat_key_metric_text(card_text)
            if parsed:
                period_metrics[key] = parsed
                _log(f'video-data {label}: {parsed}')
            else:
                _log(f'video-data {label}: no metrics parsed')

    # ── 补充：如果 API 只有 day_total，尝试卡片解析补充 week/month ──
    if api_metrics and len(period_metrics) < len(periods):
        for key, label in periods:
            if key in period_metrics:
                continue
            selected = await _select_wechat_video_period(page, label)
            if not selected:
                _log(f'video-data {label} (card fallback): period select failed')
                continue
            card_text = await _extract_wechat_key_metric_card_text(page)
            parsed = _parse_wechat_key_metric_text(card_text)
            if parsed:
                period_metrics[key] = parsed
                _log(f'video-data {label} (card fallback): {parsed}')
            else:
                _log(f'video-data {label} (card fallback): no metrics parsed')

    # 移除监听器
    page.remove_listener('response', _on_total_data_response)

    metric_keys = ('play', 'like', 'comment', 'share', 'new_fans')
    same_metrics = lambda a, b: bool(a and b) and all(
        (a.get(k, 0) or 0) == (b.get(k, 0) or 0) for k in metric_keys
    )
    if (
        same_metrics(period_metrics.get('day_total'), period_metrics.get('week_total')) and
        same_metrics(period_metrics.get('week_total'), period_metrics.get('month_total'))
    ):
        _log('video-data: week/month duplicated day metrics; keeping day only')
        period_metrics.pop('week_total', None)
        period_metrics.pop('month_total', None)

    if not period_metrics:
        _log('video-data: no period metrics parsed before upload')
        return {'_collectorLogs': collector_logs}

    _log(
        'video-data final period keys before upload: '
        f"{sorted(period_metrics.keys())}; has_month={'month_total' in period_metrics}"
    )

    day = period_metrics.get('day_total') or {}
    result = {
        '_collectorLogs': collector_logs[-80:],
        '_periodMetrics': {
            'videoData': {
                **period_metrics,
                'source': 'new_post_total_data_api' if api_metrics else 'channels_data_center_video_data',
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


async def _scrape_dashboard(page, platform: str = '') -> dict:
    import traceback
    text = await _get_page_text(page)
    debug_text = text[:300].encode('ascii', errors='backslashreplace').decode('ascii')
    print(f'[DEBUG _scrape_dashboard] text len={len(text)}, first 300: {debug_text}', flush=True)
    # Strip "关于腾讯" footer
    idx = text.find('关于腾讯')
    if idx > 0:
        text = text[:idx]
    metrics = {}
    metrics.update(_extract_douyin_overview_metrics(text))
    if platform == 'DOUYIN':
        metrics.update({k: v for k, v in _extract_douyin_utf8_home_metrics(text).items() if v})
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
                let clean = title.split('|')[0].split('-')[0].split('–')[0].split('—')[0].trim();
                const platformUINames = [
                    'creator center', 'creator service platform', 'data platform',
                    'douyin', 'kuaishou', 'xiaohongshu', 'wechat', 'video account',
                ];
                const cleanLower = clean.toLowerCase();
                if (clean.length >= 2 && clean.length <= 30 && !/^\\d+$/.test(clean) && !platformUINames.includes(cleanLower)) {
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
        if _is_safe_collected_nickname(nick, platform=platform):
            metrics['_nickname'] = nick
        avatar = info.get('avatar')
        if avatar and _is_safe_avatar_url(avatar):
            metrics['_avatar'] = avatar
        elif avatar:
            print(f'[DC] WECHAT_VIDEO: ignored suspicious avatar from DOM: {str(avatar)[:80]}')
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
        # 视频号累计总量（views/likes/comments/shares）由 post_list API
        # 返回的每个视频累计数据求和得到，在 _scrape_account_pages 中计算。
        # 这里只清除可能从 dashboard 文本误提取的累计值，
        # 真正的累计值稍后由 video_stats 求和覆盖。
        for key in ('views', 'likes', 'comments', 'shares'):
            result.pop(key, None)
        try:
            follower_result = await _scrape_wechat_follower_period_metrics(page)
            if follower_result.get('_periodMetrics'):
                result.setdefault('_periodMetrics', {}).update(follower_result.get('_periodMetrics', {}))
                for k, v in follower_result.items():
                    if k == '_periodMetrics':
                        continue
                    if v is not None:
                        result[k] = v
        except Exception as e:
            print(f'[DC] WECHAT_VIDEO follower-data period metrics error: {e}')
        try:
            period_result = await _scrape_wechat_video_period_metrics(page)
            if period_result.get('_periodMetrics'):
                result.setdefault('_periodMetrics', {}).update(period_result.get('_periodMetrics', {}))
                for k, v in period_result.items():
                    if k == '_periodMetrics':
                        continue
                    if v is not None:
                        result[k] = v
        except Exception as e:
            print(f'[DC] WECHAT_VIDEO video-data period metrics error: {e}')

    result['_history'] = history
    return result


async def _scrape_video_list(page, platform: str, max_posts: int = 0) -> list:
    """Scrape video list metrics and stop on natural pagination signals."""
    import hashlib
    limit = max_posts if isinstance(max_posts, int) and max_posts > 0 else None

    if platform == 'WECHAT_VIDEO':
        try:
            api_videos = await _scrape_wechat_video_list_api(page, max_posts=max_posts)
        except Exception as api_err:
            api_videos = []
            # Write to file log since console=False in .exe swallows print
            try:
                from pathlib import Path as _P
                import os as _os
                _log = _P(_os.environ.get('LOCALAPPDATA', '')) / 'MatrixFlow' / 'browser-profiles' / 'dc_debug.log'
                with open(_log, 'a', encoding='utf-8') as _f:
                    _f.write(f'[VIDEO_LIST] post_list API exception: {str(api_err)[:200]}\n')
            except Exception:
                pass
        if api_videos:
            print(f'[DC] WECHAT_VIDEO: post_list API collected {len(api_videos)} posts')
            return api_videos
        print('[DC] WECHAT_VIDEO: post_list API returned no posts, falling back to DOM parsing')
        try:
            from pathlib import Path as _P
            import os as _os
            _log = _P(_os.environ.get('LOCALAPPDATA', '')) / 'MatrixFlow' / 'browser-profiles' / 'dc_debug.log'
            with open(_log, 'a', encoding='utf-8') as _f:
                _f.write(f'[VIDEO_LIST] post_list API returned 0 posts, falling back to DOM\n')
        except Exception:
            pass
    
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
            if platform == 'DOUYIN':
                douyin_videos = _scrape_douyin_creator_video_list_from_text(text, max_posts=max_posts)
                if douyin_videos:
                    print(f'[DC] DOUYIN: creator work list parsed {len(douyin_videos)} posts')
                    return douyin_videos
            # Parse videos in Python (avoids JS errors in WeChat Video wujie-app shadow DOM)
            raw_lines = [l.strip() for l in text.split('\n') if l.strip()]
            videos = []
            for i, line in enumerate(raw_lines):
                if re.search(r'\d{4}[-./年]\d{1,2}[-./月]\d{1,2}', line) and i > 0 and len(raw_lines[i-1]) > 5:
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
    def _dbg(msg):
        try:
            from pathlib import Path as _P
            import os as _os
            _log = _P(_os.environ.get('LOCALAPPDATA', '')) / 'MatrixFlow' / 'browser-profiles' / 'dc_debug.log'
            with open(_log, 'a', encoding='utf-8') as _f:
                _f.write(f'[POST_LIST] {msg}\n')
        except Exception:
            pass

    max_attempts = 1
    for _attempt in range(max_attempts):
        try:
            ready = await _ensure_wechat_video_list_page(page)
            if not ready:
                print('[DC] WECHAT_VIDEO: could not open video management page before post_list API')
            _dbg(f'attempt={_attempt+1} page.url={page.url[:80]} ready={ready}')

            result = await asyncio.wait_for(
                page.evaluate(
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

                    // Check for API-level error (errCode != 0)
                    // WeChat returns HTTP 200 with errCode=300334 when anti-bot detection triggers
                    if (payload.json.errCode && payload.json.errCode !== 0) {
                        if (currentPage === 1) {
                            // First page failed - return error info so Python can retry
                            return {_apiError: true, errCode: payload.json.errCode,
                                    errMsg: payload.json.errMsg || 'unknown'};
                        }
                        break;
                    }

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
                    // Small delay between pages to avoid rate limiting
                    await new Promise(r => setTimeout(r, 300));
                }

                return limit ? results.slice(0, limit) : results;
            }''',
                    {'maxPosts': max_posts},
                ),
                timeout=300,  # 5 minutes for large video lists (1000+ videos = 50+ pages)
            )

            # Check if result is an API error response
            if isinstance(result, dict) and result.get('_apiError'):
                errCode = result.get('errCode')
                errMsg = result.get('errMsg', '')
                _dbg(f'attempt={_attempt+1}: API error errCode={errCode} errMsg={errMsg}')
                print(f'[DC] WECHAT_VIDEO: post_list API errCode={errCode} ({errMsg}), stopping without retry')
                _dbg(f'stopped after first API error errCode={errCode}')
                return []

            # Success - result should be a list
            _dbg(f'attempt={_attempt+1}: evaluate returned: type={type(result).__name__} len={len(result) if result else 0}')
            return result if isinstance(result, list) else []
        except Exception as e:
            print(f'[DC] WECHAT_VIDEO post_list API error (attempt {_attempt+1}/{max_attempts}): {str(e)[:120]}')
            _dbg(f'EXCEPTION attempt={_attempt+1}: {str(e)[:200]}')
            return []

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



async def _is_captcha_page(page) -> bool:
    """Detect Douyin/Bytedance security verification (captcha) pages.

    When Douyin's anti-bot system triggers, it redirects to a captcha page
    with slider/puzzle verification. This function checks URL, title, and
    page text/DOM for common captcha markers.
    """
    try:
        cur_url = (page.url or '').lower()
        try:
            visible_text = await _get_page_text(page)
            if any(marker in visible_text for marker in (
                '\u5b89\u5168\u9a8c\u8bc1',
                '\u4eba\u673a\u9a8c\u8bc1',
                '\u8bf7\u5b8c\u6210\u9a8c\u8bc1',
                '\u9a8c\u8bc1\u7801',
                '\u6ed1\u52a8\u6ed1\u5757',
                '\u5411\u53f3\u6ed1\u52a8',
            )):
                return True
            if (
                '\u6296\u97f3\u53f7' in visible_text
                and (
                    '\u7c89\u4e1d' in visible_text
                    or '\u83b7\u8d5e' in visible_text
                    or '\u6570\u636e\u4e2d\u5fc3' in visible_text
                    or '\u6700\u65b0\u4f5c\u54c1' in visible_text
                )
            ):
                return False
            if (
                '\u4f5c\u54c1' in visible_text
                and ('\u64ad\u653e' in visible_text or '\u70b9\u8d5e' in visible_text)
                and ('\u7f16\u8f91\u4f5c\u54c1' in visible_text or '\u5df2\u53d1\u5e03' in visible_text)
            ):
                return False
            if (
                'creator.douyin.com/creator-micro/' in cur_url
                and '\u5185\u5bb9\u7ba1\u7406' in visible_text
                and '\u6570\u636e\u4e2d\u5fc3' in visible_text
                and '\u4f5c\u54c1\u53d1\u5e03' in visible_text
            ):
                return False
        except Exception:
            pass
        # URL-based detection
        captcha_url_patterns = (
            '/verify', '/captcha', '/security/check',
            '/safe/verify', '/risk/verify', '/sec_verify',
        )
        if any(p in cur_url for p in captcha_url_patterns):
            return True

        # Title-based detection
        try:
            title = (await page.title()).lower()
        except Exception:
            title = ''
        if any(kw in title for kw in ('验证', '安全验证', '人机验证', 'captcha')):
            return True

        # DOM/text-based detection
        result = await page.evaluate('''() => {
            const text = (document.body && document.body.innerText || '').toLowerCase();
            const captchaTexts = [
                '安全验证', '人机验证', '请完成验证', '滑动滑块',
                '向右滑动', '滑块验证', '拖动滑块', '请拖动',
                'verify'.toLowerCase(), 'captcha',
            ];
            if (captchaTexts.some(t => text.includes(t.toLowerCase()))) return true;
            // DOM element detection
            const captchaSelectors = [
                '[class*="captcha"]', '[class*="verify"]', '[class*="slider"]',
                '[class*="puzzle"]', '[id*="captcha"]', '[id*="verify"]',
                'div[class*="sec_verify"]', 'div[class*="security_verify"]',
            ];
            for (const sel of captchaSelectors) {
                if (document.querySelector(sel)) return true;
            }
            return false;
        }''')
        return bool(result)
    except Exception:
        return False


async def _page_goto_retry(page, url, max_retries=3, platform=''):
    """Navigate to URL with retry."""
    for attempt in range(max_retries):
        try:
            nav_timeout = 45000 if platform == 'DOUYIN' else 30000
            await page.goto(url, wait_until='domcontentloaded', timeout=nav_timeout)
            await page.wait_for_timeout(900 if attempt == 0 else 1600)
            if platform == 'DOUYIN' and 'creator-micro/content/manage' in (url or ''):
                for _ in range(10):
                    text = await _get_page_text(page)
                    if (
                        '\u4f5c\u54c1' in text
                        and ('\u64ad\u653e' in text or '\u70b9\u8d5e' in text)
                        and ('\u7f16\u8f91\u4f5c\u54c1' in text or '\u5df2\u53d1\u5e03' in text)
                    ):
                        break
                    await page.wait_for_timeout(1000)
            # Check for captcha/verification page — stop immediately
            if await _is_captcha_page(page):
                print(f'[DC] {platform}: captcha/verification page detected at {url[:60]}, stopping retries')
                return False
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
                if await _is_wechat_login_page(page):
                    print('[DC] _page_goto_retry WECHAT_VIDEO: login page visible, stop waiting')
                    return True
                await _wait_for_page_text(page, ['首页', '内容管理', '数据中心', '视频数据', '视频管理'], timeout_ms=2500, min_count=1)
                print(f"[DC] _page_goto_retry WECHAT_VIDEO: text_len={text_len}, proceeding anyway")
                return True
            if text_len > 50:
                return True
            print(f"[DC] Page content too short ({text_len} chars) at {url[:60]}, wujie_app present, attempt {attempt+1}/{max_retries}")
            # For other SPA platforms using shadow DOM, may need more render time
            if attempt == 0:
                await page.wait_for_timeout(3500 if platform == 'DOUYIN' else 2000)
            else:
                await page.wait_for_timeout(2200 if platform == 'DOUYIN' else 1200)
        except Exception as e:
            err_str = str(e)[:100]
            print(f"[DC] Page goto error (attempt {attempt+1}/{max_retries}): {err_str}")
            # Network errors (ERR_INTERNET_DISCONNECTED etc.) need longer wait before retry
            if 'ERR_INTERNET_DISCONNECTED' in err_str or 'ERR_NETWORK_CHANGED' in err_str or 'ERR_CONNECTION_REFUSED' in err_str:
                wait_ms = 3000 * (attempt + 1)
                print(f"[DC] Network error, waiting {wait_ms}ms before retry...")
                await page.wait_for_timeout(wait_ms)
    return False


async def _is_wechat_login_page(page) -> bool:
    """Return True only for the WeChat Channels login screen."""
    try:
        current_url = (page.url or '').lower()
        if 'login.html' in current_url or '/login' in current_url:
            return True

        text = await page.evaluate('''() => {
            const parts = [];
            if (document.body && document.body.innerText) parts.push(document.body.innerText);
            for (const el of Array.from(document.querySelectorAll('wujie-app'))) {
                try {
                    const body = el.shadowRoot && el.shadowRoot.querySelector('body');
                    if (body && body.innerText) parts.push(body.innerText);
                } catch (e) {}
            }
            return parts.join('\\n').slice(0, 4000);
        }''')
        text = str(text or '')
        dashboard_markers = ('视频号ID', '内容管理', '数据中心', '视频管理', '发表动态')
        if any(marker in text for marker in dashboard_markers):
            return False

        login_pairs = (
            ('扫码', '登录'),
            ('微信扫码', '视频号'),
            ('一站式服务', '扫码'),
            ('登录', '视频号助手'),
        )
        return any(a in text and b in text for a, b in login_pairs)
    except Exception:
        return False


async def _wechat_login_quick_probe(context, label: str, timeout_ms: int = 9000) -> bool:
    """Fast fail for expired WECHAT_VIDEO profiles before the full scraper runs."""
    page = None
    try:
        page = await context.new_page()
        try:
            await page.goto(
                'https://channels.weixin.qq.com/platform',
                wait_until='domcontentloaded',
                timeout=timeout_ms,
            )
        except Exception as nav_err:
            print(f'[DC] WECHAT_VIDEO quick login probe navigation warning for {label}: {str(nav_err)[:100]}')
            return False

        deadline = time.time() + 3.0
        while True:
            if await _is_wechat_login_page(page):
                print(f'[DC] WECHAT_VIDEO quick login probe: login page detected for {label}, skipping account')
                return True
            try:
                text = await page.evaluate('''() => {
                    const body = document.body ? document.body.innerText : '';
                    return body.slice(0, 2000);
                }''')
                if any(marker in str(text or '') for marker in ('视频号ID', '内容管理', '数据中心', '首页')):
                    return False
            except Exception:
                pass
            if time.time() >= deadline:
                return False
            await page.wait_for_timeout(250)
    except Exception as probe_err:
        print(f'[DC] WECHAT_VIDEO quick login probe warning for {label}: {str(probe_err)[:100]}')
        return False
    finally:
        if page:
            try:
                await page.close()
            except Exception:
                pass


async def _persist_context_state_with_cdp(context, state_path: Path, label: str, log_prefix: str = '[DC]') -> None:
    """Persist Playwright storage_state and refresh CDP-visible session cookies."""
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        await context.storage_state(path=str(state_path))
    except Exception as e:
        print(f'{log_prefix} state save warning for {label}: {str(e)[:120]}')
        return

    try:
        cdp_page = context.pages[0] if context.pages else await context.new_page()
        cdp_session = await context.new_cdp_session(cdp_page)
        cdp_result = await cdp_session.send('Network.getAllCookies')
        await cdp_session.detach()
        extra_cookies = []
        for c in cdp_result.get('cookies', []) or []:
            extra_cookies.append({
                'name': c.get('name', ''),
                'value': c.get('value', ''),
                'domain': c.get('domain', ''),
                'path': c.get('path', '/'),
                'expires': c.get('expires', -1),
                'httpOnly': c.get('httpOnly', False),
                'secure': c.get('secure', False),
                'sameSite': c.get('sameSite', 'Lax'),
            })

        state_data = json.loads(state_path.read_text('utf-8'))
        merged_by_key = {
            (c.get('name'), c.get('domain'), c.get('path')): c
            for c in state_data.get('cookies', [])
        }
        for c in extra_cookies:
            merged_by_key[(c.get('name'), c.get('domain'), c.get('path'))] = c
        state_data['cookies'] = list(merged_by_key.values())
        state_path.write_text(json.dumps(state_data, ensure_ascii=False), encoding='utf-8')
        print(
            f'{log_prefix} state refreshed for {label}: '
            f'cookies={len(state_data.get("cookies", []))} cdp={len(extra_cookies)}'
        )
    except Exception as e:
        print(f'{log_prefix} CDP cookie refresh warning for {label}: {str(e)[:120]}')


async def _scrape_account_pages(context, platform: str, account_label: str = '', max_posts: int = 0, sleep_sec: float = 1.5, account_id: str = '') -> dict:
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
    douyin_api_attempted = False
    douyin_nav_count = 0
    douyin_nav_limit = 3

    async def _collect_douyin_api_once() -> bool:
        nonlocal metrics, video_stats, douyin_api_attempted, douyin_nav_count
        if platform.upper() != 'DOUYIN' or douyin_api_attempted:
            return bool(video_stats)
        douyin_api_attempted = True
        try:
            print(f'[DouyinAPI] Starting API-based collection (light mode, nav_limit={douyin_nav_limit})...')
            if not collect_douyin_data:
                raise RuntimeError(f'API collector unavailable: {_douyin_import_error}')
            if douyin_nav_count >= douyin_nav_limit:
                print('[DouyinAPI] Navigation budget exhausted before API collection, skipping')
                return False
            douyin_nav_count += 1
            await page.goto('https://www.douyin.com', wait_until='domcontentloaded', timeout=45000)
            await page.wait_for_timeout(1200 if quick_mode else 1800)
            if await _is_captcha_page(page):
                print('[DouyinAPI] Captcha detected on www.douyin.com, keeping browser quiet', flush=True)
                return False
            api_result = await collect_douyin_data(
                page, max_posts=max_posts, sleep_sec=sleep_sec, fetch_comments=False,
                account_label=account_label
            )
            if not api_result.success:
                print(f'[DouyinAPI] API collection FAILED: {api_result.error}')
                return False
            if api_result.detected_nickname:
                ident_msg = f'[DouyinAPI] Detected: [{api_result.detected_nickname}]'
                if account_label:
                    match_status = 'MATCH' if api_result.detected_nickname == account_label else 'MISMATCH'
                    ident_msg += f' (expected: [{account_label}], {match_status})'
                print(ident_msg)
            for k, v in api_result.metrics.items():
                if v is not None and v != 0:
                    metrics[k] = v
            if api_result.video_stats:
                old_count = len(video_stats)
                video_stats = api_result.video_stats
                print(f'[DouyinAPI] Replaced video_stats: {len(video_stats)} posts from API (was {old_count} from DOM)')
            if api_result.extra:
                metrics['_api_extra'] = api_result.extra
            print(f'[DouyinAPI] API collection SUCCESS: {len(api_result.video_stats)} posts, metrics={list(api_result.metrics.keys())}')
            return True
        except Exception as e:
            print(f'[DouyinAPI] API collection exception: {e}')
            return False

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
        if platform == 'DOUYIN':
            douyin_nav_count += 1
        if not ok:
            print(f'[DC] {platform}: Dashboard page failed to load, skipping')
            return {'metrics': {}, 'video_stats': [], 'expired': platform != 'WECHAT_VIDEO'}
        if platform == 'WECHAT_VIDEO':
            if await _is_wechat_login_page(page):
                print(f'[DC] WECHAT_VIDEO: login page detected immediately after dashboard goto, skipping')
                return {'metrics': {}, 'video_stats': [], 'loginPageSkip': True}
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
            return {'metrics': {}, 'video_stats': [], 'expired': platform != 'WECHAT_VIDEO', 'loginPageSkip': platform == 'WECHAT_VIDEO'}

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
                print(f'[DC] {platform}: login UI detected, skipping account')
                return {'metrics': {}, 'video_stats': [], 'expired': platform != 'WECHAT_VIDEO', 'loginPageSkip': platform == 'WECHAT_VIDEO'}
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')

        # Captcha/security verification page detection.
        # When Douyin detects bot automation, it shows a slider/puzzle captcha.
        # Without this check, the code would parse the captcha page as if it
        # were the dashboard, find no data, and the scheduler would keep
        # retrying — appearing as "keeps refreshing" to the user.
        if await _is_captcha_page(page):
            print(f'[DC] {platform}: captcha/verification page detected, stopping collection for this account', flush=True)
            return {'metrics': {}, 'video_stats': [], 'captcha': True, 'expired': False}

        metrics = await _scrape_dashboard(page, platform=platform)

        # WECHAT_VIDEO: 从拦截的 auth_data API 补充头像/昵称/粉丝�?
        # DOM 提取 img.avatar �?src 总是空，API 拦截是可靠来�?
        if platform == 'WECHAT_VIDEO':
            if not metrics.get('_avatar'):
                home_avatar = await _extract_wechat_home_avatar(page)
                if home_avatar and _is_safe_avatar_url(home_avatar):
                    metrics['_avatar'] = home_avatar
                    print(f'[DC] WECHAT_VIDEO: avatar(home card): {home_avatar[:60]}...')
                elif home_avatar:
                    print(f'[DC] WECHAT_VIDEO: ignored suspicious avatar from home card: {home_avatar[:80]}')
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
                    if _is_safe_avatar_url(fu.get('headImgUrl')):
                        metrics['_avatar'] = fu['headImgUrl']
                        print(f'[DC] WECHAT_VIDEO: avatar(API): {fu["headImgUrl"][:60]}...')
                    else:
                        print(f'[DC] WECHAT_VIDEO: ignored suspicious avatar from auth_data: {str(fu.get("headImgUrl"))[:80]}')
                api_nickname = _sanitize_text(fu.get('nickname') or '')
                if api_nickname and not _is_safe_collected_nickname(api_nickname, platform=platform):
                    print(f'[DC] WECHAT_VIDEO: ignored suspicious nickname from auth_data: {api_nickname}')
                elif api_nickname and not metrics.get('_nickname'):
                    metrics['_nickname'] = api_nickname
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
                    if dom_avatar and not metrics.get('_avatar') and _is_safe_avatar_url(dom_avatar):
                        metrics['_avatar'] = dom_avatar
                        print(f'[DC] WECHAT_VIDEO: avatar(DOM fallback): {dom_avatar[:60]}...')
                    elif dom_avatar:
                        print(f'[DC] WECHAT_VIDEO: ignored suspicious avatar from DOM fallback: {dom_avatar[:80]}')
                    elif not dom_avatar:
                        print(f'[DC] WECHAT_VIDEO: DOM fallback also failed - no avatar image found')
                except Exception as e:
                    print(f'[DC] WECHAT_VIDEO: DOM fallback error: {str(e)[:100]}')

        if platform == 'DOUYIN':
            state._collector_progress['phase'] = '抖音首页周期'
            try:
                period_result = await _scrape_douyin_home_period_metrics(page)
                if period_result.get('_periodMetrics'):
                    metrics.setdefault('_periodMetrics', {}).update(period_result.get('_periodMetrics', {}))
                for k in ('newViews', 'newLikes', 'newComments', 'newShares', 'newFollowers'):
                    if k in period_result:
                        metrics[k] = period_result[k]
            except Exception as e:
                print(f'[DC] DOUYIN home period metrics error: {str(e)[:160]}')
            state._collector_progress['phase'] = 'Douyin API'
            await _collect_douyin_api_once()

        # 2. Data center
        if data_center_url and platform != 'DOUYIN':
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
                # DEBUG: dump page text for analysis
                if platform == 'WECHAT_VIDEO':
                    try:
                        import tempfile as _tf
                        debug_text = await _get_page_text(page)
                        debug_path = Path(_tf.gettempdir()) / 'dc_wechat_datacenter.txt'
                        debug_path.write_text(debug_text[:20000], encoding='utf-8')
                        print(f'[DC DEBUG] WECHAT datacenter text dumped: {len(debug_text)} chars -> {debug_path}')
                        # Also dump the period metrics result
                        pm = dc.get('_periodMetrics', {}).get('videoData', {})
                        print(f'[DC DEBUG] WECHAT periodMetrics: {json.dumps(pm, ensure_ascii=False)[:500]}')
                        print(f'[DC DEBUG] WECHAT dc result keys: {list(dc.keys())}')
                        print(f'[DC DEBUG] WECHAT dc newViews={dc.get("newViews")} newLikes={dc.get("newLikes")} newComments={dc.get("newComments")} newShares={dc.get("newShares")} newFollowers={dc.get("newFollowers")}')
                    except Exception as _de:
                        print(f'[DC DEBUG] dump error: {_de}')
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
        if video_list_url and platform != 'DOUYIN':
            state._collector_progress['phase'] = '视频采集'
            try:
                await _page_goto_retry(page, video_list_url, platform=platform)
                if platform == 'DOUYIN':
                    await _wait_for_page_text(
                        page,
                        ['\u4f5c\u54c1', '\u64ad\u653e', '\u70b9\u8d5e', '\u7f16\u8f91\u4f5c\u54c1'],
                        timeout_ms=7000,
                        min_count=2,
                    )
                if platform == 'WECHAT_VIDEO':
                    await _wait_for_page_text(page, ['视频管理', '视频 (', '合集', '搜索视频'], timeout_ms=5000, min_count=1)
                else:
                    await page.wait_for_timeout(1200)
                video_stats = await _scrape_video_list(page, platform, max_posts=max_posts)
                if platform == 'DOUYIN' and not video_stats:
                    text = await _get_page_text(page)
                    debug_text = text[:300].encode('ascii', errors='backslashreplace').decode('ascii')
                    print(f'[DC] DOUYIN: creator work list empty, text_len={len(text)}, url={page.url}, text={debug_text}')
                    for label in ('\u5185\u5bb9\u7ba1\u7406', '\u4f5c\u54c1'):
                        try:
                            if await _click_visible_text(page, label, exact=False):
                                await page.wait_for_timeout(1800)
                                video_stats = await _scrape_video_list(page, platform, max_posts=max_posts)
                                if video_stats:
                                    break
                        except Exception as click_err:
                            print(f'[DC] DOUYIN: work list recovery click error {label}: {click_err}')
                # DEBUG: dump video list results
                if platform == 'WECHAT_VIDEO':
                    print(f'[DC DEBUG] WECHAT video_list: {len(video_stats)} videos')
                    for i, v in enumerate(video_stats[:3]):
                        print(f'[DC DEBUG]   video[{i}]: title={v.get("title","")[:30]} views={v.get("views",0)} likes={v.get("likes",0)} comments={v.get("comments",0)} shares={v.get("shares",0)}')
                    if video_stats:
                        tv = sum(v.get('views',0) for v in video_stats)
                        tl = sum(v.get('likes',0) for v in video_stats)
                        tc = sum(v.get('comments',0) for v in video_stats)
                        ts = sum(v.get('shares',0) for v in video_stats)
                        print(f'[DC DEBUG] WECHAT video sum: views={tv} likes={tl} comments={tc} shares={ts}')
                        # 将累计总量写入 metrics（post_list API 返回的是每个视频的累计值，求和即为账号累计总量）
                        metrics['views'] = tv
                        metrics['likes'] = tl
                        metrics['comments'] = tc
                        metrics['shares'] = ts
                        print(f'[DC] WECHAT_VIDEO: cumulative totals from post_list API: views={tv} likes={tl} comments={tc} shares={ts}')
                    else:
                        # post_list API failed and DOM fallback also returned 0 videos.
                        # Preserve existing cumulative values from local DB so we don't lose old data.
                        print(f'[DC] WECHAT_VIDEO: post_list API failed, preserving old cumulative values from local DB')
                        try:
                            from local_db import get_account
                            old_acc = get_account(account_id) if account_id else None
                            if old_acc:
                                old_map = {
                                    'views': old_acc.get('play_count', 0),
                                    'likes': old_acc.get('like_count', 0),
                                    'comments': old_acc.get('comment_count', 0),
                                    'shares': old_acc.get('share_count', 0),
                                }
                                for k, v in old_map.items():
                                    if v and v > 0:
                                        metrics[k] = v
                                print(f'[DC] WECHAT_VIDEO: preserved old cumulative: views={old_map["views"]} likes={old_map["likes"]} comments={old_map["comments"]} shares={old_map["shares"]}')
                        except Exception as pres_e:
                            print(f'[DC] WECHAT_VIDEO: failed to preserve old metrics: {pres_e}')
                        # Dump page text to see why no videos
                        vl_text = await _get_page_text(page)
                        print(f'[DC DEBUG] WECHAT video_list page text ({len(vl_text)} chars): {vl_text[:800]}')
            except Exception as e:
                import traceback
                print(f'[DC] video-list error {platform}: {e}')
                traceback.print_exc()

        # 4. Monetization / Revenue
        if monetization_url and not quick_mode and platform != 'DOUYIN':
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
        for extra_url in ([] if quick_mode or platform == 'DOUYIN' else entry.get('extra_pages', [])):
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

        # 6. Douyin creator work-list fallback. API is the primary path; only
        # use one extra creator-page navigation if the API returned no works.
        if platform.upper() == 'DOUYIN' and not video_stats and video_list_url and douyin_nav_count < douyin_nav_limit:
            try:
                print('[DC] DOUYIN: API yielded no works, using one creator work-list fallback')
                douyin_nav_count += 1
                await _page_goto_retry(page, video_list_url, platform=platform)
                await _wait_for_page_text(
                    page,
                    ['\u4f5c\u54c1', '\u64ad\u653e', '\u70b9\u8d5e', '\u7f16\u8f91\u4f5c\u54c1'],
                    timeout_ms=7000,
                    min_count=2,
                )
                await page.wait_for_timeout(1200)
                video_stats = await _scrape_video_list(page, platform, max_posts=max_posts)
            except Exception as e:
                print(f'[DC] DOUYIN: creator work-list fallback error: {e}')

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
        if platform == 'WECHAT_VIDEO':
            try:
                import json as _json
                saved_state = _json.loads(state_json.read_text('utf-8'))
                saved_cookies = saved_state.get('cookies') or []
                cookie_names = {
                    item.get('name')
                    for item in saved_cookies
                    if 'weixin' in str(item.get('domain') or '')
                }
                if not {'sessionid', 'wxuin'}.issubset(cookie_names):
                    print(
                        f'[DC] WECHAT_VIDEO: incomplete saved session for {nickname or account_id[:12]} '
                        f'(cookies={len(saved_cookies)}, names={sorted(cookie_names)}), trying persistent profile'
                    )
            except Exception as sess_err:
                print(f'[DC] WECHAT_VIDEO: session precheck failed for {nickname or account_id[:12]}: {str(sess_err)[:100]}')

        # Load per-account fingerprint
        fp = None
        try:
            from fingerprint import load_fingerprint
            fp = load_fingerprint(profile_dir, account_id)
            print(f'[DC] Fingerprint for {nickname or account_id[:12]}: WebGL={fp.get("webgl_vendor","?")[:20]} Chrome/{fp.get("chrome_version","?")} HW={fp.get("hardware_concurrency","?")}cores')
        except Exception as e:
            print(f'[DC] Fingerprint load failed: {e}')

        # Use persistent context per account (separate Chrome instance for cookie isolation)
        # ALL platforms: headless=False + 窗口离屏隐藏，绕过反自动化检测
        # headless 模式有太多检测点（渲染差异、HeadlessChrome UA、CDP 痕迹），
        # 抖音和微信视频号都会检测 headless 并触发验证码。
        is_wechat_video = platform == 'WECHAT_VIDEO'
        is_douyin = platform == 'DOUYIN'
        headless_mode = False  # 所有平台都用 headless=False
        extra_launch_args = None
        if not headless_mode:
            from companion_browser import HIDDEN_WINDOW_ARGS
            extra_launch_args = list(HIDDEN_WINDOW_ARGS)
            print(f'[DC] {platform}: using headless=False with hidden window (anti-detection)')
        # Build launch kwargs — unified for all platforms
        launch_kw = {
            'user_data_dir': str(profile_dir),
            'headless': headless_mode,
            'viewport': {'width': 1280, 'height': 800},
            'locale': 'zh-CN',
            **_collector_launch_args(headless_mode, extra_args=extra_launch_args),
        }
        # DOUYIN: Don't override UA — the fingerprint UA (Chrome/126-133)
        # doesn't match the actual Playwright Chromium version, and Douyin
        # detects this mismatch as a bot signal.
        # WECHAT_VIDEO: override is safe (WeChat doesn't check UA version match)
        if fp and fp.get('user_agent') and not is_douyin:
            launch_kw['user_agent'] = fp['user_agent']
        context = await pw.chromium.launch_persistent_context(**launch_kw)
        print(f'[DC] {platform}: using persistent profile {profile_dir}')
        # 隐藏 headless=False 的浏览器窗口（仅隐藏屏幕外的窗口）
        if not headless_mode:
            try:
                from companion_browser import _hide_offscreen_windows
                _hide_offscreen_windows()
            except Exception:
                pass
        # 注入反检测脚本（每账号独立指纹）
        try:
            from stealth_patches import apply_stealth_to_context
            await apply_stealth_to_context(context, fingerprint=fp)
        except ImportError:
            pass

        if is_wechat_video:
            label = nickname or account_id[:12]
            if await _wechat_login_quick_probe(context, label):
                try:
                    from local_db import clear_current_online_account, mark_account_session_state
                    mark_account_session_state(account_id, 'expired')
                    clear_current_online_account('WECHAT_VIDEO', account_id)
                except Exception as _e:
                    print(f'[WARN] {type(_e).__name__}: {_e}')
                return {'accountId': account_id, 'metrics': {}, 'videoStats': [], 'expired': True, 'loginPageSkip': True}

        # Load cookies via CDP (handles session cookies properly) + localStorage from state.json
        try:
            if is_wechat_video:
                print('[DC] WECHAT_VIDEO: persistent profile loaded by browser; skip manual state replay')
                raise RuntimeError('skip state replay for WECHAT_VIDEO')
            import json as _json
            state = _json.loads(state_json.read_text('utf-8'))
            saved_cookies = state.get('cookies') or []
            if saved_cookies:
                # Use CDP to set cookies — add_cookies() drops session cookies (expires=-1)
                cdp_ok = False
                try:
                    cdp_page = context.pages[0] if context.pages else await context.new_page()
                    cdp_session = await context.new_cdp_session(cdp_page)
                    set_count = 0
                    for c in saved_cookies:
                        try:
                            params = {
                                'name': c.get('name', ''),
                                'value': c.get('value', ''),
                                'domain': c.get('domain', ''),
                                'path': c.get('path', '/'),
                                'httpOnly': c.get('httpOnly', False),
                                'secure': c.get('secure', False),
                            }
                            exp = c.get('expires', -1)
                            if exp and exp > 0:
                                params['expires'] = exp
                            ss = c.get('sameSite', 'Lax')
                            if ss in ('Strict', 'Lax', 'None'):
                                params['sameSite'] = ss
                            await cdp_session.send('Network.setCookie', params)
                            set_count += 1
                        except Exception:
                            pass
                    await cdp_session.detach()
                    cdp_ok = set_count > 0
                    print(f'[DC] CDP set {set_count}/{len(saved_cookies)} cookies for {nickname or account_id[:12]}')
                except Exception as cdp_err:
                    print(f'[DC] CDP cookie injection failed: {cdp_err}')
                # Fallback: add_cookies for any that CDP missed
                if not cdp_ok:
                    try:
                        await context.add_cookies(saved_cookies)
                        print(f'[DC] add_cookies fallback: {len(saved_cookies)} cookies')
                    except Exception as ac_err:
                        print(f'[DC] add_cookies fallback failed: {ac_err}')
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
        douyin_sleep = 2.2 if post_limit else 3.2
        try:
            from local_db import is_first_collection
            if is_first_collection(account_id) and not post_limit:
                douyin_sleep = 4.0
                print(f'[DC] First collection for {label}, full pagination sleep=4.0s')
        except Exception as e:
            print(f'[DC] Error checking first collection for {label}: {e}')
        result = await _scrape_account_pages(context, platform, account_label=label, max_posts=post_limit, sleep_sec=douyin_sleep, account_id=account_id)
        # 提取刷新后的 Cookie，供上层上传到服务器
        fresh_cookies = []
        try:
            fresh_cookies = await context.cookies()
        except Exception as _e:
            print(f'[WARN] {type(_e).__name__}: {_e}')
        if is_wechat_video and not result.get('loginPageSkip'):
            await _persist_context_state_with_cdp(context, state_json, label)
        # After successful scrape, keep account active and mark collection time.
        # Condition: any meaningful data returned (metrics with any key, OR video_stats)
        # Do NOT require both �?metrics alone (e.g. follower_count) is enough to mark active
        metrics_ok = bool(result.get('metrics'))  # any non-empty metrics dict
        videos_ok = bool(result.get('video_stats'))
        if metrics_ok or videos_ok:
            try:
                from local_db import mark_current_online_account, mark_account_session_state, update_collection_time, update_status
                update_status(account_id, 'active')
                if is_wechat_video:
                    mark_account_session_state(account_id, 'online')
                    mark_current_online_account('WECHAT_VIDEO', account_id, source='collection')
                update_collection_time(account_id)
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
        elif result.get('captcha'):
            # Captcha detected — open visible browser window for manual solving
            print(f'[DC] Captcha/verification page encountered for {label}; opening browser for manual solving', flush=True)
            state._collector_progress['phase'] = f'验证码拦截 - 请在浏览器窗口中完成验证: {label}'
            state._collector_progress['captcha'] = True
            state._collector_progress['captcha_names'] = [label]
            # Show the hidden browser window so the user can interact
            try:
                if os.name == 'nt':
                    import ctypes
                    user32 = ctypes.windll.user32
                    SW_SHOW = 5
                    # Enumerate top-level windows and show hidden browser windows
                    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
                    def _show_callback(hwnd, _lparam):
                        if user32.IsWindowVisible(hwnd) == 0:  # Window is hidden
                            # Check if it's a Chrome window by class name
                            class_name = ctypes.create_unicode_buffer(256)
                            user32.GetClassNameW(hwnd, class_name, 256)
                            if 'Chrome' in class_name.value:
                                user32.ShowWindow(hwnd, SW_SHOW)
                                user32.SetForegroundWindow(hwnd)
                        return True
                    user32.EnumWindows(EnumWindowsProc(_show_callback), 0)
                    print('[DC] Browser window shown for manual captcha solving', flush=True)
            except Exception as show_err:
                print(f'[DC] Show window warning: {show_err}', flush=True)
            # Create a new page and navigate to the dashboard to trigger captcha
            captcha_page = None
            try:
                captcha_page = await context.new_page()
                dashboard_url = PLATFORM_DASHBOARDS.get(platform, {}).get('url', 'https://creator.douyin.com')
                await captcha_page.goto(dashboard_url, wait_until='domcontentloaded', timeout=30000)
                await captcha_page.wait_for_timeout(3000)
                # Poll for captcha resolution — up to 5 minutes (100 x 3s)
                captcha_solved = False
                for _wait_i in range(100):
                    await captcha_page.wait_for_timeout(3000)
                    if not await _is_captcha_page(captcha_page):
                        captcha_solved = True
                        print(f'[DC] Captcha solved for {label} after {_wait_i * 3}s', flush=True)
                        break
                    if _wait_i % 10 == 0:
                        print(f'[DC] Waiting for manual captcha solving... ({_wait_i * 3}s elapsed)', flush=True)
                if captcha_page:
                    try: await captcha_page.close()
                    except Exception: pass
                if captcha_solved:
                    # Re-hide the browser window and retry collection
                    try:
                        from companion_browser import _hide_offscreen_windows
                        _hide_offscreen_windows()
                    except Exception:
                        pass
                    print(f'[DC] Retrying collection for {label} after captcha solved', flush=True)
                    state._collector_progress['phase'] = f'重新采集: {label}'
                    state._collector_progress.pop('captcha', None)
                    # Re-run collection with the same context
                    result = await _scrape_account_pages(
                        context, platform, account_label=label,
                        max_posts=post_limit, sleep_sec=douyin_sleep,
                        account_id=account_id,
                    )
                    # Update fresh cookies after retry
                    try:
                        fresh_cookies = await context.cookies()
                    except Exception:
                        pass
                    # Re-evaluate result
                    metrics_ok = bool(result.get('metrics'))
                    videos_ok = bool(result.get('video_stats'))
                    if metrics_ok or videos_ok:
                        try:
                            from local_db import update_collection_time, update_status
                            update_status(account_id, 'active')
                            update_collection_time(account_id)
                        except Exception as _e:
                            print(f'[WARN] {type(_e).__name__}: {_e}')
                    elif result.get('captcha'):
                        print(f'[DC] Captcha still present for {label} after retry; skipping', flush=True)
                    elif result.get('expired') or result.get('loginPageSkip'):
                        print(f'[DC] Cookie expired for {label} after captcha retry, needs re-scan')
                    else:
                        print(f'[DC] No data scraped for {label} after captcha retry; keeping current status')
                else:
                    print(f'[DC] Captcha timeout (5 min) for {label}; skipping', flush=True)
                    # Re-hide the browser window
                    try:
                        from companion_browser import _hide_offscreen_windows
                        _hide_offscreen_windows()
                    except Exception:
                        pass
            except Exception as captcha_err:
                print(f'[DC] Captcha handling error for {label}: {captcha_err}', flush=True)
                if captcha_page:
                    try: await captcha_page.close()
                    except Exception: pass
                # Re-hide on error
                try:
                    from companion_browser import _hide_offscreen_windows
                    _hide_offscreen_windows()
                except Exception:
                    pass
        elif result.get('expired') or result.get('loginPageSkip'):
            try:
                if is_wechat_video:
                    from local_db import clear_current_online_account, mark_account_session_state
                    mark_account_session_state(account_id, 'expired')
                    clear_current_online_account('WECHAT_VIDEO', account_id)
                else:
                    from local_db import update_status
                    update_status(account_id, 'expired')
            except Exception as _e:
                print(f'[WARN] {type(_e).__name__}: {_e}')
            print(f'[DC] Cookie expired for {label}, needs re-scan')
        else:
            print(f'[DC] No data scraped for {label}; keeping current account status')
        return {
            'accountId': account_id,
            'metrics': result['metrics'],
            'videoStats': result['video_stats'],
            'freshCookies': fresh_cookies,
            'expired': bool(result.get('expired')),
            'captcha': bool(result.get('captcha')),
        }
    except Exception as e:
        print(f'[DC] scrape error {platform}/{account_id}: {str(e)[:120]}')
        return {'accountId': account_id, 'metrics': {}, 'videoStats': []}
    finally:
        if context:
            try:
                await asyncio.wait_for(context.close(), timeout=8)
            except asyncio.TimeoutError:
                print(f'[DC] Context close timed out for {platform}/{account_id}; continuing')
                try:
                    from browser_manager import cleanup_browser_processes_for_profile
                    cleanup_browser_processes_for_profile(profile_dir)
                except Exception as cleanup_err:
                    print(f'[DC] Browser cleanup warning for {platform}/{account_id}: {str(cleanup_err)[:120]}')
            except Exception:
                try:
                    from browser_manager import cleanup_browser_processes_for_profile
                    cleanup_browser_processes_for_profile(profile_dir)
                except Exception:
                    pass
        if browser:
            try:
                await asyncio.wait_for(browser.close(), timeout=8)
            except asyncio.TimeoutError:
                print(f'[DC] Browser close timed out for {platform}/{account_id}; continuing')
            except Exception:
                pass


async def _scrape_all(accounts: list, max_posts: int = _DEFAULT_QUICK_MAX_POSTS, collection_mode: str = 'quick') -> list:
    """Scrape multiple accounts with isolated browser profiles."""
    from playwright.async_api import async_playwright
    from local_db import get_profile_path

    per_account_timeout = 20 * 60 if collection_mode == 'full' else 8 * 60
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

            try:
                result = await asyncio.wait_for(
                    _scrape_one_account(
                        pw, aid, platform, profile_dir,
                        nickname=acc.get('nickname', ''),
                        max_posts=max_posts,
                    ),
                    timeout=per_account_timeout,
                )
            except asyncio.TimeoutError:
                label = acc.get('nickname', '') or aid[:12]
                state._collector_progress['phase'] = '账号超时，继续下一个'
                print(
                    f'[DC] Account timeout after {per_account_timeout}s: '
                    f'{label} ({platform}); continuing next account',
                    flush=True,
                )
                result = {
                    'accountId': aid,
                    'metrics': {},
                    'videoStats': [],
                    'error': 'account collection timeout',
                }
            results.append(result)

            # If captcha was detected for this account, stop processing
            # further accounts on the same platform — they will all hit
            # the same captcha wall. The scheduler will retry next cycle.
            if result.get('captcha'):
                print(f'[DC] Captcha detected for {platform}, skipping remaining accounts on this platform', flush=True)
                state._collector_progress['phase'] = f'验证码拦截({acc.get("nickname","")[:15]})'
                # Mark remaining accounts of same platform as captcha-skipped
                remaining_same = [
                    a for a in accounts[accounts.index(acc)+1:]
                    if (a.get('platform') or '').upper() == platform
                ]
                for ra in remaining_same:
                    results.append({
                        'accountId': ra['id'],
                        'metrics': {},
                        'videoStats': [],
                        'captcha': True,
                    })
                    state._collector_progress['current'] += 1
                # Continue to next platform (if any)
                continue

            # WECHAT_VIDEO uses headless=False which consumes more resources.
            # Add a short delay between accounts to avoid network contention
            # (ERR_INTERNET_DISCONNECTED) when multiple browser instances run back-to-back.
            if platform == 'WECHAT_VIDEO':
                await asyncio.sleep(2)

    return results


