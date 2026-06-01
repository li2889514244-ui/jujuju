"""直接测试数据采集"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

# 设置和 companion_app 相同的环境
from local_db import get_all_accounts
accounts = get_all_accounts()
print(f"DB accounts: {len(accounts)}")
for a in accounts:
    print(f"  {a['nickname']} ({a['platform']}) profile={a.get('profile_dir', '?')} state={a.get('last_collected_at', '?')}")

if not accounts:
    print("No accounts!")
    sys.exit(1)

# 直接跑采集
from companion_app import _scrape_all
import asyncio

print("\nStarting scrape...")
results = asyncio.run(_scrape_all(accounts))
print(f"\nResults: {len(results)} accounts")
for r in results:
    m = r.get('metrics', {})
    v = r.get('videoStats', [])
    has_data = any(isinstance(x, (int, float)) and x > 0 for x in m.values())
    print(f"  {r['accountId'][:20]}: metrics={len(m)} keys, has_data={has_data}, videos={len(v)}")
    if m:
        for k, val in m.items():
            if isinstance(val, (int, float)) and val > 0:
                print(f"    {k}: {val}")
