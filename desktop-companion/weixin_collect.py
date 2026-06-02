#!/usr/bin/env python3
"""
视频号数据中心采集脚本
通过 browser-use CDP 连接已登录的 Chrome，采关注者数据 + 视频数据
用法：python weixin_collect.py
"""

import subprocess, json, time, re, os

OUT_DIR = "C:/Users/EDY/Pictures"

def b(cmd):
    r = subprocess.run(f"browser-use {cmd}", shell=True, capture_output=True, text=True, timeout=20)
    out = r.stdout.strip()
    if out.startswith("result: "):
        out = out[8:]
    return out

def click_sidebar(name):
    # JS 用字符串拼接，避开 Python f-string 的花括号问题
    js = "(function(){var w=document.querySelector('wujie-app');var r=(w&&w.shadowRoot)?w.shadowRoot:document;var as=r.querySelectorAll('a');for(var i=0;i<as.length;i++){if(as[i].textContent.trim()==='" + name + "'){as[i].click();return 'clicked:" + name + "';}}return 'not found';})()"
    return b(f"eval \"{js}\"")

def click_tab(name):
    js = "(function(){var w=document.querySelector('wujie-app');var r=(w&&w.shadowRoot)?w.shadowRoot:document;var as=r.querySelectorAll('a');for(var i=0;i<as.length;i++){if(as[i].textContent.trim()==='" + name + "'){as[i].click();return 'clicked tab:" + name + "';}}return 'tab not found:" + name + "';})()"
    return b(f"eval \"{js}\"")

def get_state():
    r = subprocess.run("browser-use state 2>&1", shell=True, capture_output=True, text=True, timeout=20)
    return r.stdout

def parse_follower_growth(txt):
    d = {}
    m = re.search(r'关注者总数[^\d]*([\d,]+)', txt)
    if m: d['total_followers'] = m.group(1).replace(',','')
    m = re.search(r'净增关注[^\d]*([\d,]+)', txt)
    if m: d['net_growth'] = m.group(1).replace(',','')
    m = re.search(r'新增关注[^\d]*([\d,]+)', txt)
    if m: d['new_followers'] = m.group(1).replace(',','')
    m = re.search(r'取消关注[^\d]*([\d,]+)', txt)
    if m: d['unfollows'] = m.group(1).replace(',','')
    return d

def parse_follower_profile(txt):
    d = {'provinces': [], 'cities': []}
    m = re.search(r'中国（包括港澳台地区）[^\d]*([\d,]+)', txt)
    if m: d['china_total'] = m.group(1).replace(',','')
    m = re.search(r'海外\s*([\d,]+)\s*人', txt)
    if m: d['overseas'] = m.group(1).replace(',','')
    provs = re.findall(r'(广东省|山东省|江苏省|河北省|浙江省|河南省|辽宁省|福建省|湖北省|湖南省|四川省|山西省|安徽省|陕西省|内蒙古自治区|黑龙江省|广西壮族自治区|江西省|吉林省|新疆维吾尔自治区|云南省|海南省|甘肃省|贵州省|宁夏回族自治区|青海省|台湾省|西藏自治区)[^\d]*([\d,]+)[^\d]*([\d.]+)%', txt)
    d['provinces'] = [{'name':p[0],'count':p[1],'pct':p[2]+'%'} for p in provs[:10]]
    cities = re.findall(r'(深圳市|广州市|佛山市|东莞市|惠州市|北京市|上海市|天津市|重庆市|杭州市|南京市|苏州市|武汉市|长沙市|成都市|西安市|青岛市|郑州市|济南市)[^\d]*([\d,]+)[^\d]*([\d.]+)%', txt)
    d['cities'] = [{'name':c[0],'count':c[1],'pct':c[2]+'%'} for c in cities[:10]]
    return d

def parse_video_metrics(txt):
    d = {}
    for key in ['播放','评论','分享','关注']:
        m = re.search(rf'{key}\s*([\d,]+)', txt)
        if m: d[key] = m.group(1).replace(',','')
    return d

# ── 主流程 ─────────────────────────────────────────────
print("开始采集视频号数据中心...")

# 1. 进入关注者数据
print("\n[1/5] 进入关注者数据...")
r = click_sidebar('关注者数据')
print("  ", r)
time.sleep(2)

# 2. 关注者增长 tab
print("\n[2/5] 采集关注者增长...")
click_tab('关注者增长')
time.sleep(2)
txt = get_state()
fg = parse_follower_growth(txt)
print("  增长数据:", json.dumps(fg, ensure_ascii=False))

# 3. 关注者画像 tab
print("\n[3/5] 采集关注者画像...")
click_tab('关注者画像')
time.sleep(2)
txt = get_state()
fp = parse_follower_profile(txt)
print("  画像省份数:", len(fp['provinces']))
print("  画像城市数:", len(fp['cities']))

# 4. 进入视频数据
print("\n[4/5] 进入视频数据...")
click_sidebar('视频数据')
time.sleep(2)
click_tab('全部视频')
time.sleep(2)
txt = get_state()
vm = parse_video_metrics(txt)
print("  视频指标:", json.dumps(vm, ensure_ascii=False))

# 5. 保存结果
print("\n[5/5] 保存结果...")
result = {
    'account': '听卢慧说',
    'account_id': 'sphi9lmniWArf5T',
    'collect_time': time.strftime('%Y-%m-%d %H:%M:%S'),
    'follower_growth': fg,
    'follower_profile': fp,
    'video_metrics': vm,
}
out = os.path.join(OUT_DIR, 'weixin_data.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print(f"✅ 保存至: {out}")
print(json.dumps(result, ensure_ascii=False, indent=2))
