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
            avatar_url      TEXT DEFAULT '',
            bio             TEXT DEFAULT '',
            verified        INTEGER DEFAULT 0,
            follower_count  INTEGER DEFAULT 0,
            following_count INTEGER DEFAULT 0,
            video_count     INTEGER DEFAULT 0,
            like_count      INTEGER DEFAULT 0,
            play_count      INTEGER DEFAULT 0,
            comment_count   INTEGER DEFAULT 0,
            share_count     INTEGER DEFAULT 0,
            new_followers   INTEGER DEFAULT 0,       -- 昨日净增关注
            new_views       INTEGER DEFAULT 0,       -- 昨日新增播放
            new_comments    INTEGER DEFAULT 0,       -- 昨日新增评论
            new_likes       INTEGER DEFAULT 0,       -- 昨日新增点赞
            new_shares      INTEGER DEFAULT 0,       -- 昨日新增分享
            gmv             INTEGER DEFAULT 0,       -- GMV
            orders          INTEGER DEFAULT 0,       -- 订单数
            commission      INTEGER DEFAULT 0,       -- 佣金
            total_revenue   INTEGER DEFAULT 0,       -- 总收入
            live_max_online INTEGER DEFAULT 0,       -- 直播最高在线
            live_views      INTEGER DEFAULT 0,       -- 直播观看
            live_followers  INTEGER DEFAULT 0,       -- 直播涨粉
            live_revenue    INTEGER DEFAULT 0,       -- 直播收入
            product_count   INTEGER DEFAULT 0,       -- 商品数
            last_live_time  TEXT DEFAULT '',          -- 最近直播时间
            profile_dir     TEXT NOT NULL,           -- 独立 Profile 目录名
            status          TEXT DEFAULT 'active',   -- active / expired / deleted
            last_collected_at TEXT DEFAULT '',       -- 上次采集时间
            created_at      TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS accounts_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id      TEXT NOT NULL,
            date            TEXT NOT NULL,
            follower_count  INTEGER DEFAULT 0,
            video_count     INTEGER DEFAULT 0,
            like_count      INTEGER DEFAULT 0,
            play_count      INTEGER DEFAULT 0,
            comment_count   INTEGER DEFAULT 0,
            share_count     INTEGER DEFAULT 0,
            gmv             INTEGER DEFAULT 0,
            orders          INTEGER DEFAULT 0,
            FOREIGN KEY (account_id) REFERENCES accounts(id),
            UNIQUE(account_id, date)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS contents (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id      TEXT NOT NULL,
            content_id      TEXT DEFAULT '',
            title           TEXT DEFAULT '',
            cover_url       TEXT DEFAULT '',
            content_type    TEXT DEFAULT 'video',
            duration        INTEGER DEFAULT 0,
            play_count      INTEGER DEFAULT 0,
            like_count      INTEGER DEFAULT 0,
            comment_count   INTEGER DEFAULT 0,
            share_count     INTEGER DEFAULT 0,
            publish_time    TEXT DEFAULT '',
            collected_at    TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    """)
    # Migration: add new columns to existing accounts table if missing
    _migrate_columns(conn)
    conn.commit()
    conn.close()


def _migrate_columns(conn):
    """Add missing metric columns to existing accounts and contents tables"""
    # --- accounts table migrations ---
    existing_accounts = {r[1] for r in conn.execute("PRAGMA table_info('accounts')").fetchall()}
    new_account_cols = {
        'avatar_url':      "TEXT DEFAULT ''",
        'bio':             "TEXT DEFAULT ''",
        'verified':        "INTEGER DEFAULT 0",
        'follower_count':  "INTEGER DEFAULT 0",
        'video_count':     "INTEGER DEFAULT 0",
        'like_count':      "INTEGER DEFAULT 0",
        'play_count':      "INTEGER DEFAULT 0",
        'comment_count':   "INTEGER DEFAULT 0",
        'following_count': "INTEGER DEFAULT 0",
        'share_count':     "INTEGER DEFAULT 0",
        'new_followers':   "INTEGER DEFAULT 0",
        'new_views':       "INTEGER DEFAULT 0",
        'new_comments':    "INTEGER DEFAULT 0",
        'new_likes':       "INTEGER DEFAULT 0",
        'new_shares':      "INTEGER DEFAULT 0",
        'gmv':             "INTEGER DEFAULT 0",
        'orders':          "INTEGER DEFAULT 0",
        'commission':      "INTEGER DEFAULT 0",
        'total_revenue':   "INTEGER DEFAULT 0",
        'live_max_online': "INTEGER DEFAULT 0",
        'live_views':      "INTEGER DEFAULT 0",
        'live_followers':  "INTEGER DEFAULT 0",
        'live_revenue':    "INTEGER DEFAULT 0",
        'product_count':   "INTEGER DEFAULT 0",
        'last_live_time':  "TEXT DEFAULT ''",
    }
    for col_name, col_def in new_account_cols.items():
        if col_name not in existing_accounts:
            conn.execute(f"ALTER TABLE accounts ADD COLUMN {col_name} {col_def}")

    # --- contents table migrations ---
    existing_contents = {r[1] for r in conn.execute("PRAGMA table_info('contents')").fetchall()}
    new_content_cols = {
        'content_type': "TEXT DEFAULT 'video'",
        'duration':     "INTEGER DEFAULT 0",
    }
    for col_name, col_def in new_content_cols.items():
        if col_name not in existing_contents:
            conn.execute(f"ALTER TABLE contents ADD COLUMN {col_name} {col_def}")


def add_account(account_id: str, platform: str, profile_dir: str,
                platform_uid: str = '', nickname: str = '') -> bool:
    """绑定新账号，返回是否成功。
    
    如果 platform_uid 已存在 → 更新现有记录（防重复绑定）。
    否则插入新记录。
    """
    conn = _get_conn()
    try:
        # Check for existing account with same platform_uid
        if platform_uid:
            existing = conn.execute(
                "SELECT id FROM accounts WHERE platform_uid = ? AND platform = ? AND status != 'deleted'",
                (platform_uid, platform),
            ).fetchone()
            if existing:
                existing_id = existing['id']
                # Use existing ID instead of new one, keep original profile_dir
                conn.execute(
                    "UPDATE accounts SET nickname = ?, status = 'active', last_collected_at = ? WHERE id = ?",
                    (nickname, None, existing_id),
                )
                conn.commit()
                print(f'[LocalDB] Duplicate bind detected: {platform_uid}, using existing account {existing_id}')
                return True

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


def get_all_accounts(include_expired: bool = False) -> list[dict]:
    """Return local accounts. By default only active accounts are collectable."""
    conn = _get_conn()
    if include_expired:
        rows = conn.execute("SELECT * FROM accounts WHERE status != 'deleted' ORDER BY created_at").fetchall()
    else:
        rows = conn.execute("SELECT * FROM accounts WHERE status = 'active' ORDER BY created_at").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_accounts_by_platform(platform: str) -> list[dict]:
    """按平台筛选"""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM accounts WHERE platform = ? AND status != 'deleted'", (platform,)).fetchall()
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


def update_metrics(account_id: str, metrics: dict):
    """更新账号运营指标（粉丝/作品/获赞/播放等）"""
    valid_keys = {
        'followers': 'follower_count', 'follower_count': 'follower_count',
        'following': 'following_count', 'following_count': 'following_count',
        'videos': 'video_count', 'video_count': 'video_count',
        'likes': 'like_count', 'like_count': 'like_count',
        'views': 'play_count', 'play_count': 'play_count',
        'newViews': 'new_views', 'new_views': 'new_views',
        'newFollowers': 'new_followers', 'new_followers': 'new_followers',
        'comments': 'comment_count', 'comment_count': 'comment_count',
        'shares': 'share_count', 'share_count': 'share_count',
        'newComments': 'new_comments', 'new_comments': 'new_comments',
        'newLikes': 'new_likes', 'new_likes': 'new_likes',
        'newShares': 'new_shares', 'new_shares': 'new_shares',
        'gmv': 'gmv',
        'orders': 'orders',
        'commission': 'commission',
        'totalRevenue': 'total_revenue', 'total_revenue': 'total_revenue',
        'liveMaxOnline': 'live_max_online', 'live_max_online': 'live_max_online',
        'liveViews': 'live_views', 'live_views': 'live_views',
        'liveFollowers': 'live_followers', 'live_followers': 'live_followers',
        'liveRevenue': 'live_revenue', 'live_revenue': 'live_revenue',
        'productCount': 'product_count', 'product_count': 'product_count',
        'lastLiveTime': 'last_live_time', 'last_live_time': 'last_live_time',
        'nickname': 'nickname', 'avatar_url': 'avatar_url',
        'bio': 'bio', 'verified': 'verified',
    }
    updates = {}
    for k, v in metrics.items():
        db_key = valid_keys.get(k)
        if db_key and v is not None:
            updates[db_key] = v
    if not updates:
        return
    conn = _get_conn()
    sets = ', '.join(f'{k} = ?' for k in updates)
    vals = list(updates.values()) + [account_id]
    conn.execute(f"UPDATE accounts SET {sets} WHERE id = ?", vals)
    conn.commit()
    conn.close()


def save_contents(account_id: str, posts: list):
    """批量保存作品数据，同名 content_id 覆盖"""
    if not posts:
        return
    conn = _get_conn()
    for p in posts:
        content_id = p.get('id', '') or p.get('content_id', '')
        title = p.get('title', '')
        cover_url = p.get('cover_url', '') or p.get('cover', '')
        play_count = p.get('play_count', 0) or p.get('views', 0) or 0
        like_count = p.get('like_count', 0) or p.get('likes', 0) or 0
        comment_count = p.get('comment_count', 0) or p.get('comments', 0) or 0
        share_count = p.get('share_count', 0) or p.get('shares', 0) or 0
        publish_time = p.get('publish_time', '') or p.get('create_time', '') or p.get('date', '') or ''

        existing = None
        if content_id:
            existing = conn.execute(
                "SELECT id FROM contents WHERE account_id = ? AND content_id = ? LIMIT 1",
                (account_id, content_id),
            ).fetchone()
        if not existing and title:
            existing = conn.execute(
                "SELECT id FROM contents WHERE account_id = ? AND title = ? LIMIT 1",
                (account_id, title),
            ).fetchone()

        if existing:
            conn.execute(
                """UPDATE contents
                   SET content_id = ?, title = ?, cover_url = ?, play_count = ?,
                       like_count = ?, comment_count = ?, share_count = ?,
                       publish_time = ?, collected_at = datetime('now')
                   WHERE id = ?""",
                (
                    content_id,
                    title,
                    cover_url,
                    play_count,
                    like_count,
                    comment_count,
                    share_count,
                    publish_time,
                    existing['id'],
                ),
            )
        else:
            conn.execute(
                """INSERT INTO contents
                   (account_id, content_id, title, cover_url, play_count, like_count,
                    comment_count, share_count, publish_time, collected_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
                (
                    account_id,
                    content_id,
                    title,
                    cover_url,
                    play_count,
                    like_count,
                    comment_count,
                    share_count,
                    publish_time,
                ),
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


def save_history_snapshot(account_id: str):
    """保存当前账号指标到 accounts_history 每日快照。

    对 (account_id, date) 使用 INSERT OR REPLACE，每天每条账号只有一条记录。
    """
    acc = get_account(account_id)
    if not acc:
        print(f'[LocalDB] save_history_snapshot: account {account_id} not found')
        return

    conn = _get_conn()
    today = time.strftime('%Y-%m-%d')
    conn.execute(
        """INSERT OR REPLACE INTO accounts_history
           (account_id, date, follower_count, video_count, like_count,
            play_count, comment_count, share_count, gmv, orders)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (account_id, today,
         acc.get('follower_count', 0),
         acc.get('video_count', 0),
         acc.get('like_count', 0),
         acc.get('play_count', 0),
         acc.get('comment_count', 0),
         acc.get('share_count', 0),
         acc.get('gmv', 0),
         acc.get('orders', 0)),
    )
    conn.commit()
    conn.close()


def get_history(account_id: str, days: int = 30) -> list[dict]:
    """获取账号的历史快照记录，用于趋势图。

    Args:
        account_id: 账号 ID
        days: 向前查询的天数，默认 30 天

    Returns:
        按日期升序排列的快照列表，每个元素为 dict
    """
    conn = _get_conn()
    date_limit = time.strftime(
        '%Y-%m-%d',
        time.localtime(time.time() - days * 86400),
    )
    rows = conn.execute(
        """SELECT * FROM accounts_history
           WHERE account_id = ? AND date >= ?
           ORDER BY date ASC""",
        (account_id, date_limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# 初始化
init_db()
