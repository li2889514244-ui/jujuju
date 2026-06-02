#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
视频号数据中心 — 一键采集（纯 URL + state 解析，无嵌 JS）
用法：python collect_all.py
"""
import subprocess, json, time, re, os, sys

OUT = "C:/Users/EDY/Pictures"

def b(cmd):
    r = subprocess.run(f"browser-use {cmd}", shell=True,
                      capture_output=True, text=True, timeout=20)
    out = r.stdout.strip()
    return out[8:] if out.startswith("result: ") else out

def get_state_file(path):
    with open(path,'w',encoding='utf-8') as f:
        subprocess.run("browser-use state 2>&1", shell=True, stdout=f,
                       stderr=subprocess.DEVNULL, timeout=20)
    with open(path, encoding='utf-8') as f:
        return f.read()

def parse_growth(txt):
    d = {}
    for key, pat in [('total',r'关注者总数[^\d]*([\d,]+)'),
                      ('net',r'净增关注[^\d]*([\d,]+)'),
                      ('new',r'新增关注[^\d]*([\d,]+)'),
                      ('unfollow',r'取消关注[^\d]*([\d,]+)')]:
        m = re.search(pat, txt)
        if m: d[key] = m.group(1).replace(',','')
    return d

def parse_profile(txt):
    flat = re.sub(r'\[\d+\]<[^>]+>\s*', ' ', txt)
    flat = re.sub(r'\s+', ' ', flat)
    d = {'provinces':[],'cities':[]}
    m = re.search(r'中国（包括港澳台地区）\s*([\d,]+)', flat)
    if m: d['china_total'] = m.group(1).replace(',','')
    m = re.search(r'海外\s*([\d,]+)', flat)
    if m: d['overseas'] = m.group(1).replace(',','')
    provs = re.findall(
        r'(广东省|山东省|江苏省|河北省|浙江省|河南省|辽宁省|福建省|湖北省|湖南省|四川省|山西省|安徽省|陕西省|内蒙古自治区|黑龙江省|广西壮族自治区|江西省|吉林省|新疆维吾尔自治区|云南省|海南省|甘肃省|贵州省|宁夏回族自治区|青海省|台湾省|西藏自治区)\s+([\d,]+)\s+([\d.]+)%',
        flat)
    d['provinces'] = [{'name':p[0],'count':p[1].replace(',',''),'pct':p[2]+'%'}
                         for p in provs]
    cities = re.findall(
        r'(深圳市|广州市|佛山市|东莞市|惠州市|北京市|上海市|天津市|重庆市|杭州市|南京市|苏州市|武汉市|长沙市|成都市|西安市|青岛市|郑州市|济南市)\s+([\d,]+)\s+([\d.]+)%',
        flat)
    d['cities'] = [{'name':c[0],'count':c[1].replace(',',''),'pct':c[2]+'%'}
                       for c in cities]
    return d

def parse_video(txt):
    flat = re.sub(r'\[\d+\]<[^>]+>\s*', ' ', txt)
    flat = re.sub(r'\s+', ' ', flat)
    d = {}
    for k in ['播放','评论','分享','关注']:
        m = re.search(rf'{k}\s+([\d,]+)', flat)
        if m: d[k] = m.group(1).replace(',','')
    return d

# ── 主流程 ─────────────────────────────────────────
print("=== 视频号数据中心采集 ===\n")

# 1. 关注者增长
print("[1/4] 关注者增长...")
b("eval \"location.href='https://channels.weixin.qq.com/platform/statistic/follower';'ok'\"")
time.sleep(3)
txt = get_state_file(os.path.join(OUT,'_tg.txt'))
growth = parse_growth(txt)
print("  ", json.dumps(growth, ensure_ascii=False))

# 2. 关注者画像（点 tab）
print("[2/4] 关注者画像...")
# 用 JS 点 tab，但不嵌中文——用 URL hash 或直接 eval 点
# 简单做法：直接在当前页 get state（画像 tab 可能已激活）
txt2 = get_state_file(os.path.join(OUT,'_tp.txt'))
profile = parse_profile(txt2)
print(f"  省份:{len(profile['provinces'])}, 城市:{len(profile['cities'])}")

# 3. 视频数据
print("[3/4] 视频数据...")
b("eval \"location.href='https://channels.weixin.qq.com/platform/statistic/post';'ok'\"")
time.sleep(3)
txt3 = get_state_file(os.path.join(OUT,'_tv.txt'))
video = parse_video(txt3)
print("  ", json.dumps(video, ensure_ascii=False))

# 4. 保存
print("[4/4] 保存...")
result = {
    'account': '听卢慧说',
    'account_id': 'sphi9lmniWArf5T',
    'collect_time': time.strftime('%Y-%m-%d %H:%M:%S'),
    'follower_growth': growth,
    'follower_profile': profile,
    'video_metrics': video,
}
out = os.path.join(OUT,'weixin_data.json')
with open(out,'w',encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print(f"✅ 保存至: {out}")
print(json.dumps(result, ensure_ascii=False, indent=2))

# 清临时文件
for f in ['_tg.txt','_tp.txt','_tv.txt']:
    p = os.path.join(OUT,f)
    if os.path.exists(p): os.remove(p)
