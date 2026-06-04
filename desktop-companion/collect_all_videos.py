#!/usr/bin/env python3
"""
使用 browser-use 连接 companion Chrome (CDP port 9222)
遍历视频号发布列表的所有分页，采集全部视频数据
验证: 能采集多少条视频
"""
import subprocess
import json
import time
import sys
import re

CDP_URL = "http://127.0.0.1:9222"
LIST_URL = "https://channels.weixin.qq.com/platform/post/list"

def run(cmd, timeout=15):
    """运行 browser-use 命令"""
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout, encoding='utf-8')
    if r.returncode != 0:
        print(f"[ERR] {r.stderr[:200]}")
    return r.stdout.strip()

def eval_js(js_code):
    """在 browser-use 会话中执行 JavaScript"""
    escaped = js_code.replace('"', '\\"')
    out = run(f'browser-use eval "{escaped}"', timeout=10)
    if out.startswith("result: "):
        return out.replace("result: ", "", 1)
    return out

def extract_videos_from_shadow():
    """从 wujie-app shadow DOM 提取视频列表"""
    js = """
    (() => {
        const w = document.querySelector('wujie-app');
        if (!w) return JSON.stringify({error:'no_wujie'});
        const body = w.shadowRoot.querySelector('body');
        if (!body) return JSON.stringify({error:'no_body'});
        const text = body.innerText;
        const lines = text.split('\\n').filter(l => l.trim());
        const videos = [];
        for (let i = 0; i < lines.length; i++) {
            if (/\\d{4}\u5e74\\d{2}\u6708\\d{2}\u65e5/.test(lines[i]) && i > 0) {
                const title = lines[i-1];
                if (title.length < 5 || title.includes('\u4e0b\u4e00\u9875')) continue;
                // \u63d0\u53d6\u65e5\u671f\u540e\u7684\u7edf\u8ba1\u6570\u636e
                const stats = [];
                // \u4ece\u65e5\u671f\u540e\u7684\u884c\u63d0\u53d6\u6570\u5b57
                let j = i + 1;
                while (j < lines.length && j < i + 10) {
                    const s = lines[j];
                    if (['\u5206\u4eab','\u5f39\u5e55\u7ba1\u7406','\u8bc4\u8bba\u7ba1\u7406','\u4fee\u6539\u63cf\u8ff0\u548c\u5c01\u9762',
                         '\u53ef\u89c1\u6743\u9650','\u5220\u9664','\u7f6e\u9876','\u53d6\u6d88\u7f6e\u9876','\u63a8\u5e7f','\u66f4\u591a',
                         '\u5df2\u58f0\u660e\u539f\u521b'].includes(s)) break;
                    if (/\u5e74\u6708\u65e5/.test(s)) break;
                    if (/^[\d.]+[万千]?$/.test(s) || /^\d+$/.test(s)) {
                        stats.push(s);
                    } else if (s === '\u5df2\u58f0\u660e\u539f\u521b') {
                        stats.push('\u539f\u521b');
                    }
                    j++;
                }
                videos.push({title: title, date: lines[i], stats: stats});
                i = j - 1;
            }
        }
        const totalMatch = text.match(/\u89c6\u9891\\s*\\((\\d+)\\)/);
        const currentMatch = text.match(/(\d+)\\s*\u4e0b\u4e00\u9875/);
        return JSON.stringify({
            total: totalMatch ? totalMatch[1] : '0',
            pagePattern: currentMatch ? currentMatch[0] : '',
            count: videos.length,
            videos: videos
        });
    })()
    """
    return eval_js(js)

def click_next_in_shadow():
    """在 wujie-app shadow DOM 内点击"下一页" """
    js = """
    (() => {
        const w = document.querySelector('wujie-app');
        if (!w) return 'no_wujie';
        const body = w.shadowRoot.querySelector('body');
        const all = body.querySelectorAll('a, button, li, span, div, p');
        const next = Array.from(all).find(el => el.textContent.trim() === '\u4e0b\u4e00\u9875');
        if (next) { next.click(); return 'clicked'; }
        return 'not_found';
    })()
    """
    return eval_js(js)

def has_next_in_shadow():
    """检查是否还有下一页"""
    js = """
    (() => {
        const w = document.querySelector('wujie-app');
        if (!w) return 'false';
        const body = w.shadowRoot.querySelector('body');
        const all = body.querySelectorAll('a, button, li, span, div, p');
        const next = Array.from(all).find(el => el.textContent.trim() === '\u4e0b\u4e00\u9875');
        return next ? 'true' : 'false';
    })()
    """
    return eval_js(js) == 'true'

def main():
    print("=" * 60)
    print("视频采集验证脚本 (browser-use + CDP)")
    print("=" * 60)
    
    # 确保已连接
    print("[1/5] 确保已连接 companion Chrome...")
    # 先导航到列表页（会自动使用已有连接）
    run(f'browser-use open "{LIST_URL}"', timeout=20)
    time.sleep(4)
    
    all_videos = []
    page = 1
    
    while True:
        print(f"\n[2/5] 采集第 {page} 页...")
        
        result = extract_videos_from_shadow()
        if not result:
            print(f"[WARN] 第 {page} 页无数据")
            break
        
        try:
            data = json.loads(result)
        except json.JSONDecodeError:
            print(f"[ERR] JSON 解析失败: {result[:200]}...")
            break
        
        if 'error' in data:
            print(f"[ERR] {data['error']}")
            break
        
        videos = data.get('videos', [])
        total = data.get('total', '0')
        count = data.get('count', 0)
        
        print(f"  第 {page} 页: {count} 条 | 总共: {total} 条")
        
        if not videos:
            print("[INFO] 没有更多视频数据")
            break
        
        all_videos.extend(videos)
        
        # 检查是否有下一页
        if not has_next_in_shadow():
            print("[INFO] 没有下一页了")
            break
        
        # 点击下一页
        print(f"  点击下一页...")
        click_result = click_next_in_shadow()
        time.sleep(3)
        page += 1
    
    # 保存结果
    print(f"\n[3/5] 采集完成！共 {len(all_videos)} 条视频")
    
    result_file = "C:\\Users\\EDY\\jujuju\\desktop-companion\\video_collection_result.json"
    with open(result_file, 'w', encoding='utf-8') as f:
        json.dump({
            "collect_time": time.strftime('%Y-%m-%d %H:%M:%S'),
            "total_collected": len(all_videos),
            "total_on_platform": total if 'total' in dir() else "?",
            "pages": page,
            "videos": all_videos
        }, f, ensure_ascii=False, indent=2)
    
    print(f"[4/5] 结果已保存: {result_file}")
    
    # 输出摘要
    print("\n" + "=" * 60)
    print("采集结果摘要:")
    print(f"  平台总视频数: {total}")
    print(f"  实际采集数: {len(all_videos)}")
    print(f"  采集率: {len(all_videos)/int(total)*100 if total else 0:.1f}%")
    if all_videos:
        print(f"  示例 1: {all_videos[0]['title'][:60]} | {all_videos[0]['date']}")
        if len(all_videos) > 1:
            print(f"  示例 2: {all_videos[-1]['title'][:60]} | {all_videos[-1]['date']}")
    print(f"  结果文件: {result_file}")
    print("=" * 60)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
