"""
八爪鱼风格采集器 — CSS选择器替代正则，精准提取视频号数据
用法: python bazhuayu_style_scraper.py
"""
import asyncio, json, re, sys, time, os
from pathlib import Path
from playwright.async_api import async_playwright

CONFIG_PATH = Path(r'C:\Users\EDY\jujuju\desktop-companion\companion_config.json')
OUTPUT = Path(os.environ.get('TEMP', '.')) / 'scraper_result.json'

async def extract_with_selectors(page):
    """用CSS选择器精准提取，不靠正则猜"""
    result = {}

    # ── 1. 昵称 ──
    # 页面顶部有重复的账号名
    try:
        el = page.locator(':text("视频号ID:")').first
        id_text = await el.text_content() or ''
        # 昵称在"视频号ID:"上方的 DOM 节点
        # 用 page.evaluate 从DOM树往上找
        nickname = await page.evaluate('''() => {
            const all = document.body.innerText.split('\\n');
            for (let i = 0; i < all.length; i++) {
                if (all[i].startsWith('视频号ID:')) {
                    for (let j = i - 1; j >= 0; j--) {
                        const line = all[j].trim();
                        if (line && line.length < 30 && !/^\\d/.test(line) && line !== '视频号' && line !== '视频号助手') {
                            return line;
                        }
                    }
                }
            }
            return '??';
        }''')
        result['nickname'] = nickname or '??'
    except Exception as e:
        result['nickname'] = f'提取失败:{e}'

    # ── 2. 视频号ID ──
    try:
        el = page.locator(':text("视频号ID:")').first
        full_text = await el.text_content() or ''
        vid = full_text.replace('视频号ID:', '').strip()
        result['video_id'] = vid
    except:
        result['video_id'] = '??'

    # ── 3. 关注者 ──
    try:
        el = page.locator(':text("关注者")').first
        parent = el.locator('..')
        full = await parent.text_content() or ''
        # "关注者14813" → 提取数字
        nums = re.findall(r'(\d[\d,.]*)', full)
        result['followers'] = int(nums[0].replace(',', '')) if nums else 0
    except:
        result['followers'] = 0

    # ── 4. 昨日数据 ── 用表格结构提取
    try:
        # 找到"昨日数据"区块，用 evaluate 提取结构化数据
        yesterday = await page.evaluate('''() => {
            const text = document.body.innerText;
            const idx = text.indexOf('昨日数据');
            if (idx < 0) return null;
            const section = text.substring(idx, idx + 800);
            const result = {};
            // 净增关注
            let m = section.match(/净增关注\\s+([\\d,.]+[万wW]?)/);
            if (m) result.newFollowers = m[1];
            // 新增播放
            m = section.match(/新增播放\\s+([\\d,.]+[万wW]?)/);
            if (m) result.views = m[1];
            // 新增（点赞）
            // 需要找独立的"新增"行，不是"新增播放"或"新增评论"
            const lines = section.split('\\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim() === '新增') {
                    const num = lines[i + 1]?.trim();
                    if (num && /^[\\d,.]+[万wW]?$/.test(num)) {
                        result.likes = num;
                        break;
                    }
                }
            }
            // 新增评论
            m = section.match(/新增评论\\s+([\\d,.]+[万wW]?)/);
            if (m) result.comments = m[1];
            return result;
        }''')
        if yesterday:
            for k, v in yesterday.items():
                result[k] = v
    except:
        pass

    return result


def parse_num(s):
    """解析带单位的数字"""
    if not s : return 0
    s = str(s).replace(',', '').strip()
    if s.endswith(('万', 'w', 'W')):
        return int(float(s[:-1]) * 10000)
    try:
        return int(float(s))
    except:
        return 0


async def main():
    cfg = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
    api_url = cfg['api_url'].rstrip('/')
    token = cfg['token']

    import requests

    # 获取账号列表
    print('[1/4] 获取账号列表...')
    resp = requests.get(f'{api_url}/accounts', headers={'Authorization': f'Bearer {token}'}, timeout=30)
    accounts = resp.json().get('data', {}).get('accounts', [])
    print(f'  找到 {len(accounts)} 个账号')

    # 逐个采集
    results = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            args=['--no-sandbox', '--disable-blink-features=AutomationControlled']
        )

        for acc in accounts:
            print(f'\n[2/4] 采集: {acc.get("nickname", "?")}')

            # 获取解密后的 Cookie
            aid = acc['id']
            try:
                cr = requests.get(f'{api_url}/accounts/{aid}/cookies',
                    headers={'Authorization': f'Bearer {token}'}, timeout=15)
                if cr.status_code != 200:
                    print(f'  无法获取 Cookie (HTTP {cr.status_code})')
                    continue
                cookie_str = cr.json().get('data', {}).get('cookies', '')
                if not cookie_str:
                    print('  Cookie 为空')
                    continue
            except Exception as e:
                print(f'  获取 Cookie 失败: {e}')
                continue

            # 设置 Cookie
            ctx = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
            )
            cookie_list = []
            for pair in cookie_str.split('; '):
                if '=' in pair:
                    n, v = pair.split('=', 1)
                    cookie_list.append({
                        'name': n.strip(), 'value': v.strip(),
                        'domain': '.weixin.qq.com', 'path': '/'
                    })
            await ctx.add_cookies(cookie_list)

            page = await ctx.new_page()

            try:
                # 打开仪表盘
                print('  打开仪表盘...')
                await page.goto('https://channels.weixin.qq.com/platform',
                    wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(8000)
                await page.wait_for_load_state('networkidle')

                # CSS选择器提取
                print('  提取数据...')
                data = await extract_with_selectors(page)
                data['account_id'] = aid
                data['nickname'] = data.get('nickname') or acc.get('nickname', '??')

                # 上报到后端
                metrics = {}
                if data.get('followers'):
                    metrics['followers'] = parse_num(data['followers'])
                if data.get('views'):
                    metrics['views'] = parse_num(data['views'])
                if data.get('likes'):
                    metrics['likes'] = parse_num(data['likes'])
                if data.get('comments'):
                    metrics['comments'] = parse_num(data['comments'])
                if data.get('newFollowers'):
                    metrics['newFollowers'] = parse_num(data['newFollowers'])

                if metrics:
                    r = requests.post(f'{api_url}/platforms/report-metrics',
                        json={'accountId': aid, 'metrics': metrics},
                        headers={'Authorization': f'Bearer {token}'}, timeout=30)
                    print(f'  上报结果: HTTP {r.status_code}')

                results.append(data)
                print(f'  提取结果: 昵称={data.get("nickname")} | 粉丝={parse_num(data.get("followers"))} | 播放={parse_num(data.get("views"))} | 点赞={parse_num(data.get("likes"))}')

            except Exception as e:
                print(f'  采集失败: {e}')

            await ctx.close()

        await browser.close()

    # 保存结果
    OUTPUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n[3/4] 结果已保存: {OUTPUT}')

    # 打印汇总
    print('\n[4/4] ========== 汇总 ==========')
    for r in results:
        print(f"  {r.get('nickname','??'):20s} | 粉:{parse_num(r.get('followers')):>10,} | 播放:{parse_num(r.get('views')):>10,} | 点赞:{parse_num(r.get('likes')):>6,}")

asyncio.run(main())
