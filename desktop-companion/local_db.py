"""
local_db.py — 本地 SQLite 数据库，1账号1Profile1Cookie

核心改造：
- 账号绑定信息存本地，不再上传 cookie 到后端
- 每个账号独占一个浏览器 Profile 目录，cookie 自然持久化
- 后端只记录"已绑定"状态，不存 cookie
"""
import sqlite3
import time
import json
from pathlib import Path

# Profile 根目录（跟 companion_app.py 一致）
PROFILE_ROOT = Path.home() / 'AppData' / 'Local' / 'MatrixFlow' / 'browser-profiles'
DB_PATH = PROFILE_ROOT / 'accounts.db'


def _get_conn() -> sqlite3.Connection:
    PROFILE_ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """建表（幂等）"""
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id              TEXT PRIMARY KEY,        -- 后端 accountId
            platform        TEXT NOT NULL,           -- DOUYIN/XIAOHONGSHU/KUAISHOU/WECHAT_VIDEO
            platform_uid    TEXT DEFAULT '',         -- 平台用户ID（如视频号ID）
            nickname        TEXT DEFAULT '',
            profile_dir     TEXT NOT NULL,           -- 独立 Profile 目录名
            status          TEXT DEFAULT 'active',   -- active / expired / deleted
            last_collected_at TEXT DEFAULT '',       -- 上次采集时间
            created_at      TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()


def add_account(account_id: str, platform: str, profile_dir: str,
                platform_uid: str = '', nickname: str = '') -> bool:
    """绑定新账号，返回是否成功"""
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO accounts (id, platform, platform_uid, nickname, profile_dir, status) "
            "VALUES (?, ?, ?, ?, ?, 'active')",
            (account_id, platform, platform_uid, nickname, profile_dir),
        )
        conn.commit()
        return True
    except Exception as e:
        print(f'[LocalDB] add_account error: {e}')
        return False
    finally:
        conn.close()


def get_account(account_id: str) -> dict | None:
    """按 ID 查账号"""
    conn = _get_conn()
    row = conn.execute("SELECT * FROM accounts WHERE id = ? AND status != 'deleted'", (account_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_accounts() -> list[dict]:
    """获取所有活跃账号"""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM accounts WHERE status = 'active' ORDER BY created_at").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_accounts_by_platform(platform: str) -> list[dict]:
    """按平台筛选"""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM accounts WHERE platform = ? AND status = 'active'", (platform,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_collection_time(account_id: str):
    """更新最后采集时间"""
    conn = _get_conn()
    conn.execute(
        "UPDATE accounts SET last_collected_at = datetime('now') WHERE id = ?",
        (account_id,),
    )
    conn.commit()
    conn.close()


def update_status(account_id: str, status: str):
    """更新账号状态（active/expired/deleted）"""
    conn = _get_conn()
    conn.execute("UPDATE accounts SET status = ? WHERE id = ?", (status, account_id))
    conn.commit()
    conn.close()


def update_nickname(account_id: str, nickname: str):
    conn = _get_conn()
    conn.execute("UPDATE accounts SET nickname = ? WHERE id = ?", (nickname, account_id))
    conn.commit()
    conn.close()


def remove_account(account_id: str):
    """软删除"""
    update_status(account_id, 'deleted')


def get_profile_path(account_id: str) -> Path | None:
    """获取账号的 Profile 目录绝对路径"""
    acc = get_account(account_id)
    if not acc:
        return None
    return PROFILE_ROOT / acc['profile_dir']


def get_or_create_profile_dir(account_id: str, platform: str) -> Path:
    """获取 Profile 目录，不存在则创建"""
    acc = get_account(account_id)
    if acc:
        p = PROFILE_ROOT / acc['profile_dir']
        p.mkdir(parents=True, exist_ok=True)
        return p
    # 新建：用 account_id 做目录名
    profile_name = f"{platform.lower()}_{account_id[:8]}"
    p = PROFILE_ROOT / profile_name
    p.mkdir(parents=True, exist_ok=True)
    return p


# 初始化
init_db()
