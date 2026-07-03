import sqlite3, json, http.client
from collections import defaultdict

# ========== 本地 SQLite ==========
print("=" * 60)
print("📁 本地 SQLite (accounts.db)")
print("=" * 60)

conn = sqlite3.connect('C:/Users/EDY/AppData/Local/MatrixFlow/browser-profiles/accounts.db')
cur = conn.cursor()

# 先看表结构
print("\n--- accounts 表结构 ---")
cur.execute("PRAGMA table_info(accounts)")
for r in cur.fetchall():
    print(f"  {r[1]}: {r[2]}")

print("\n--- accounts 数据 ---")
cur.execute("SELECT * FROM accounts")
cols = [d[1] for d in cur.description]
print(f"  列: {cols}")
for r in cur.fetchall():
    print(f"  {dict(zip(cols, r))}")

# 看有哪些表
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print(f"\n--- 所有表: {tables} ---")

# 逐个表查结构
for t in tables:
    try:
        cur.execute(f"SELECT count(*) FROM \"{t}\"")
        cnt = cur.fetchone()[0]
        cur.execute(f"PRAGMA table_info(\"{t}\")")
        cols = [r[1] for r in cur.fetchall()]
        print(f"\n  {t}: {cnt} rows, 列: {cols}")
        # 看5条样例
        if cnt > 0:
            cur.execute(f"SELECT * FROM \"{t}\" LIMIT 3")
            for r in cur.fetchall():
                print(f"    {dict(zip(cols, r))}")
    except Exception as e:
        print(f"  {t}: ERROR - {e}")

# 看 contents 的日期分布
print("\n--- Contents 日期分布 ---")
try:
    cur.execute("SELECT date(collected_at) as d, count(*) as cnt FROM contents GROUP BY d ORDER BY d DESC LIMIT 30")
    for r in cur.fetchall():
        print(f"  {r[0]}: {r[1]} 条")
except Exception as e:
    print(f"  ERROR: {e}")

conn.close()

# ========== 远端 PostgreSQL ==========
print("\n" + "=" * 60)
print("🌐 远端 PostgreSQL (8.134.218.39)")
print("=" * 60)

login_body = json.dumps({"email": "2889514244@qq.com", "password": "DY5p7eknNe0pdFiW"})
conn = http.client.HTTPConnection('8.134.218.39', 3000, timeout=10)
conn.request('POST', '/api/v1/auth/login', body=login_body, headers={'Content-Type': 'application/json'})
resp = conn.getresponse()
data = json.loads(resp.read().decode())
token = data.get('data', {}).get('accessToken', '')
conn.close()

headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

def api_get(path):
    conn = http.client.HTTPConnection('8.134.218.39', 3000, timeout=10)
    conn.request('GET', path, headers=headers)
    resp = conn.getresponse()
    data = json.loads(resp.read().decode())
    conn.close()
    return data

# Overview
print("\n--- Overview ---")
ov = api_get('/api/v1/analytics/overview')
d = ov.get('data', {})
eng = d.get('engagement', {})
print(f"  accounts: {d.get('accounts',{})}")
print(f"  engagement: {eng}")

# Account detail list
print("\n--- Account Detail List ---")
ad = api_get('/api/v1/analytics/account-detail-list')
if ad.get('data'):
    for acc in ad['data']:
        info = acc.get('info', {})
        day = info.get('day_total', {})
        week = info.get('week_total', {})
        month = info.get('month_total', {})
        print(f"\n  {acc.get('nickname','?')} ({acc.get('platform','?')}):")
        print(f"    基础: followers={acc.get('followers')} likes={acc.get('likes')}")
        print(f"    今日: play={day.get('play')} newViews={day.get('newViews')} newFans={day.get('newFans')} newLikes={day.get('newLikes')} newComments={day.get('newComments')} newShares={day.get('newShares')}")
        print(f"    本周: play={week.get('play')} newViews={week.get('newViews')} newFans={week.get('newFans')} newLikes={week.get('newLikes')}")
        print(f"    本月: play={month.get('play')} newViews={month.get('newViews')} newFans={month.get('newFans')} newLikes={month.get('newLikes')}")
else:
    print(f"  empty: {ad}")

# Daily stats by date
print("\n--- DailyStats 按日期汇总 ---")
ds = api_get('/api/v1/analytics/daily-stats?days=30')
if ds.get('data'):
    by_date = defaultdict(lambda: {'accounts': set(), 'play': 0, 'views': 0, 'fans': 0, 'likes': 0, 'comments': 0, 'shares': 0})
    for item in ds['data']:
        d = item.get('date','')[:10]
        by_date[d]['accounts'].add(item.get('accountId'))
        by_date[d]['play'] += item.get('play', 0) or 0
        by_date[d]['views'] += item.get('newViews', 0) or 0
        by_date[d]['fans'] += item.get('newFans', 0) or 0
        by_date[d]['likes'] += item.get('newLikes', 0) or 0
        by_date[d]['comments'] += item.get('newComments', 0) or 0
        by_date[d]['shares'] += item.get('newShares', 0) or 0
    for d in sorted(by_date.keys(), reverse=True):
        v = by_date[d]
        print(f"  {d} | {len(v['accounts'])}账号 | play={v['play']} views={v['views']} fans={v['fans']} likes={v['likes']} comments={v['comments']} shares={v['shares']}")
else:
    print(f"  no data: {ds}")

# Post stats summary
print("\n--- Post Stats 汇总 ---")
ps = api_get('/api/v1/analytics/post-stats?limit=3')
if ps.get('data'):
    print(f"  共 {ps.get('total', 0)} 条帖子统计")
    for p in ps['data'][:3]:
        post = p.get('post', {}) or {}
        print(f"  [{post.get('platform','?')}] {str(post.get('title','?'))[:40]} | views={p.get('views')} likes={p.get('likes')} comments={p.get('comments')}")
else:
    print(f"  no data: {ps}")
