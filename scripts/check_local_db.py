import sqlite3
import os

db_path = os.path.join(os.environ['LOCALAPPDATA'], 'MatrixFlow', 'browser-profiles', 'accounts.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# List tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print('Tables:', tables)

for t in tables:
    cur.execute(f"SELECT COUNT(*) FROM [{t}]")
    print(f'  {t}: {cur.fetchone()[0]} rows')
    cur.execute(f"PRAGMA table_info([{t}])")
    cols = cur.fetchall()
    print(f'    Columns: {[(c[1], c[2]) for c in cols]}')

# Check if contents table has date field
if 'contents' in tables:
    cur.execute("SELECT * FROM contents LIMIT 2")
    rows = cur.fetchall()
    cur.execute("PRAGMA table_info(contents)")
    col_names = [c[1] for c in cur.fetchall()]
    for row in rows:
        print(f'  Sample content: {dict(zip(col_names, row))}')

conn.close()
