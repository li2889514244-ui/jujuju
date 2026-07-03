import http.client, json
from collections import defaultdict

# Login
body = json.dumps({"email": "2889514244@qq.com", "password": "DY5p7eknNe0pdFiW"})
conn = http.client.HTTPConnection("8.134.218.39", 3000, timeout=10)
conn.request("POST", "/api/v1/auth/login", body=body, headers={"Content-Type": "application/json"})
resp = conn.getresponse()
data = json.loads(resp.read().decode())
token = data.get("data", {}).get("accessToken", "")
conn.close()

headers = {"Authorization": f"Bearer {token}"}

def api_get(path):
    conn = http.client.HTTPConnection("8.134.218.39", 3000, timeout=10)
    conn.request("GET", path, headers=headers)
    resp = conn.getresponse()
    data = json.loads(resp.read().decode())
    conn.close()
    return data

def safe_print(label, value, max_len=100):
    s = str(value)
    if len(s) > max_len:
        s = s[:max_len] + "..."
    print(f"  {label}: {s}")

# Overview
print("=" * 60)
print("远端 PostgreSQL 数据全景")
print("=" * 60)
ov = api_get("/api/v1/analytics/overview")
d = ov.get("data", {})
acc_data = d.get("accounts", {})
eng = d.get("engagement", {})
print(f"\n账号: {acc_data.get('total')}个 | active={acc_data.get('active')} | followers={acc_data.get('totalFollowers')}")
print(f"平台: {acc_data.get('byPlatform')}")
print(f"总量: views={eng.get('totalViews')} likes={eng.get('totalLikes')} comments={eng.get('totalComments')} shares={eng.get('totalShares')} saves={eng.get('totalSaves')}")

# Accounts
print("\n--- 账号列表 ---")
accs = api_get("/api/v1/accounts")
ad = accs.get("data", {})
items = ad.get("accounts", [])
for a in items:
    print(f"  {a.get('nickname','?'):20s} ({a.get('platform','?'):13s}) followers={a.get('followers'):>8} likes={a.get('likes'):>8} status={a.get('status')}")

# Account Detail List
print("\n--- 账号明细（含增量） ---")
det = api_get("/api/v1/analytics/account-detail-list")
for acc in (det.get("data") or []):
    info = acc.get("info", {})
    d = info.get("day_total", {})
    w = info.get("week_total", {})
    m = info.get("month_total", {})
    name = acc.get("nickname", "?")
    plat = acc.get("platform", "?")
    print(f"\n  {name} ({plat}):")
    print(f"    总量: followers={acc.get('followers')} likes={acc.get('likes')}")
    print(f"    今日: play={d.get('play')} newViews={d.get('newViews')} newFans={d.get('newFans')} newLikes={d.get('newLikes')} newComments={d.get('newComments')} newShares={d.get('newShares')}")
    print(f"    本周: play={w.get('play')} newViews={w.get('newViews')} newFans={w.get('newFans')} newLikes={w.get('newLikes')}")
    print(f"    本月: play={m.get('play')} newViews={m.get('newViews')} newFans={m.get('newFans')} newLikes={m.get('newLikes')}")

# Platform Comparison
print("\n--- 平台对比 ---")
pc = api_get("/api/v1/analytics/platform-comparison")
pc_data = pc.get("data")
if isinstance(pc_data, list):
    for item in pc_data:
        print(f"  {item}")
elif isinstance(pc_data, dict):
    print(f"  keys: {list(pc_data.keys())}")
else:
    safe_print("raw", pc_data)

# Views Ranking
print("\n--- 播放量排名 ---")
vr = api_get("/api/v1/analytics/views-ranking")
vr_data = vr.get("data")
items = vr_data if isinstance(vr_data, list) else vr_data.get("rankings", []) if isinstance(vr_data, dict) else []
for item in items[:5]:
    if isinstance(item, dict):
        print(f"  {item.get('nickname','?'):20s} ({item.get('platform','?'):12s}) views={item.get('views')} followers={item.get('followers')}")
    else:
        print(f"  {item}")

# Engagement Ranking
print("\n--- 互动率排名 ---")
er = api_get("/api/v1/analytics/engagement-ranking")
er_data = er.get("data")
items2 = er_data if isinstance(er_data, list) else er_data.get("rankings", []) if isinstance(er_data, dict) else []
for item in items2[:5]:
    if isinstance(item, dict):
        print(f"  {item.get('nickname','?'):20s} ({item.get('platform','?'):12s}) engagement={item.get('engagementRate')} growth={item.get('followerGrowth')}")

# Tags
print("\n--- 标签 ---")
tags = api_get("/api/v1/analytics/tags")
t_data = tags.get("data")
if isinstance(t_data, list):
    for t in t_data[:10]:
        print(f"  {t}")
elif isinstance(t_data, dict):
    safe_print("keys", list(t_data.keys()))

# Comparator
print("\n--- 对比分析 ---")
cmp = api_get("/api/v1/analytics/comparison")
cmp_data = cmp.get("data")
if isinstance(cmp_data, list):
    for item in cmp_data[:3]:
        safe_print("item", item)
elif isinstance(cmp_data, dict):
    safe_print("keys", list(cmp_data.keys()))
else:
    safe_print("raw", cmp_data)

print("\n" + "=" * 60)
print("本地 SQLite 账号详情")
print("=" * 60)

import sqlite3
conn = sqlite3.connect('C:/Users/EDY/AppData/Local/MatrixFlow/browser-profiles/accounts.db')
cur = conn.cursor()

# 最近采集时间
print("\n--- 上次采集 ---")
cur.execute("SELECT nickname, platform, status, last_collected_at, play_count, video_count, follower_count, new_views, new_followers, new_likes, new_comments, new_shares FROM accounts")
for r in cur.fetchall():
    print(f"  {r[0]:20s} ({r[2]:13s}): status={r[2]}, last={r[3]}")
    print(f"    总量: fans={r[6]} play={r[4]} vids={r[5]}")
    print(f"    增量: views={r[7]} fans={r[8]} likes={r[9]} comments={r[10]} shares={r[11]}")

# 内容采集统计
print("\n--- 内容采集按日期 ---")
cur.execute("""
    SELECT date(collected_at) as d, account_id, count(*) as cnt,
           sum(play_count) as total_play, sum(like_count) as total_like,
           sum(comment_count) as total_comment
    FROM contents
    GROUP BY d, account_id
    ORDER BY d DESC
    LIMIT 20
""")
for r in cur.fetchall():
    print(f"  {r[0]} | acc={r[1][:10]}... | {r[2]:>4}条 | play={r[3]:>10} like={r[4]:>6} comment={r[5]:>6}")

conn.close()
