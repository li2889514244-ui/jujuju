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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

# Profile 根目录（跟 companion_app.py 一致）
PROFILE_ROOT = Path.home() / 'AppData' / 'Local' / 'MatrixFlow' / 'browser-profiles'
DB_PATH = PROFILE_ROOT / 'accounts.db'
BEIJING_TZ = timezone(timedelta(hours=8))
_WECHAT_NICKNAME_NOISE = {
    '\u89c6\u9891\u53f7',
    '\u89c6\u9891\u53f7\u52a9\u624b',
    '\u5fae\u4fe1',
    '\u5185\u5bb9\u7ba1\u7406',
    '\u6570\u636e\u4e2d\u5fc3',
    '\u5173\u6ce8\u8005',
    '\u6628\u65e5\u6570\u636e',
    '\u7533\u8bf7\u8ba4\u8bc1',
}
_LEGAL_ENTITY_MARKERS = (
    '\u6709\u9650\u516c\u53f8',
    '\u6709\u9650\u8d23\u4efb\u516c\u53f8',
    '\u80a1\u4efd\u6709\u9650\u516c\u53f8',
    '\u96c6\u56e2\u6709\u9650\u516c\u53f8',
    '\u6587\u5316\u6709\u9650\u516c\u53f8',
    '\u79d1\u6280\u6709\u9650\u516c\u53f8',
)


def _is_bad_wechat_nickname(value) -> bool:
    text = str(value or '').strip()
    if not text:
        return False
    if text in _WECHAT_NICKNAME_NOISE:
        return True
    return any(marker in text for marker in _LEGAL_ENTITY_MARKERS)


def _is_safe_avatar_url(value) -> bool:
    text = str(value or '').strip()
    if not text or len(text) > 2000:
        return False
    try:
        parsed = urlparse(text)
    except Exception:
        return False
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        return False
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    if host.endswith('channels.weixin.qq.com') and (
        path == '/platform' or path.startswith('/platform/')
    ):
        return False
    if host.endswith('finder.video.qq.com') and (
        path == '/platform' or path.startswith('/platform/')
    ):
        return False
    if any(marker in path for marker in ('/data-center', '/post/list', '/statistic/')):
        return False
    image_hosts = (
        'qlogo.cn',
        'qpic.cn',
        'wx.qlogo.cn',
        'wx3.qlogo.cn',
        'headimg',
        'douyinpic.com',
        'byteimg.com',
        'xhscdn.com',
        'kuaishou.com',
        'kwaicdn.com',
    )
    image_exts = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif')
    return (
        any(marker in host for marker in image_hosts)
        or any(path.endswith(ext) for ext in image_exts)
        or any(marker in text.lower() for marker in ('headimgurl', 'avatar', 'headimage'))
    )


def _beijing_today() -> str:
    return datetime.now(BEIJING_TZ).strftime('%Y-%m-%d')


def _get_conn() -> sqlite3.Connection:
    _ensure_db()
    PROFILE_ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """建表（幂等）"""
    PROFILE_ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS collection_runs (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            trigger_type      TEXT DEFAULT 'manual',
            mode              TEXT DEFAULT 'quick',
            max_posts         INTEGER DEFAULT 20,
            status            TEXT DEFAULT 'running',
            started_at        TEXT DEFAULT (datetime('now')),
            finished_at       TEXT DEFAULT '',
            accounts_total    INTEGER DEFAULT 0,
            accounts_reported INTEGER DEFAULT 0,
            videos_reported   INTEGER DEFAULT 0,
            error             TEXT DEFAULT ''
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS account_sessions (
            account_id       TEXT PRIMARY KEY,
            platform         TEXT NOT NULL,
            profile_dir      TEXT NOT NULL,
            auth_json        TEXT DEFAULT '{}',
            session_state    TEXT DEFAULT 'saved',
            last_verified_at TEXT DEFAULT '',
            auth_updated_at  TEXT DEFAULT (datetime('now')),
            created_at       TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS current_sessions (
            platform         TEXT PRIMARY KEY,
            account_id       TEXT DEFAULT '',
            source           TEXT DEFAULT '',
            updated_at       TEXT DEFAULT (datetime('now')),
            verified_at      TEXT DEFAULT ''
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

    conn.execute(
        "DELETE FROM current_sessions WHERE account_id IS NULL OR TRIM(account_id) = ''"
    )
    _purge_deleted_accounts(conn)
    _purge_orphan_account_data(conn)


def add_account(account_id: str, platform: str, profile_dir: str,
                platform_uid: str = '', nickname: str = '') -> str | None:
    """绑定新账号，返回是否成功。
    
    如果 platform_uid 已存在 → 更新现有记录（防重复绑定）。
    否则插入新记录。

    Returns:
        The account id that was inserted or updated. This may differ from
        account_id when the platform_uid already exists locally.
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
                if (
                    existing_id != account_id
                    and str(existing_id).startswith('local_')
                    and account_id
                    and not str(account_id).startswith('local_')
                ):
                    target = conn.execute(
                        "SELECT id FROM accounts WHERE id = ?",
                        (account_id,),
                    ).fetchone()
                    if not target:
                        conn.execute(
                            "UPDATE accounts_history SET account_id = ? WHERE account_id = ?",
                            (account_id, existing_id),
                        )
                        conn.execute(
                            "UPDATE contents SET account_id = ? WHERE account_id = ?",
                            (account_id, existing_id),
                        )
                        conn.execute(
                            "UPDATE accounts SET id = ?, nickname = ?, profile_dir = ?, status = 'active' WHERE id = ?",
                            (account_id, nickname, profile_dir, existing_id),
                        )
                        conn.commit()
                        print(f'[LocalDB] Promoted local account {existing_id} -> {account_id} for uid {platform_uid}')
                        return account_id
                # Use the existing account ID, but refresh profile_dir so a
                # re-scan replaces the stale login state used by collection.
                conn.execute(
                    "UPDATE accounts SET nickname = ?, profile_dir = ?, status = 'active' WHERE id = ?",
                    (nickname, profile_dir, existing_id),
                )
                conn.commit()
                print(f'[LocalDB] Duplicate bind detected: {platform_uid}, using existing account {existing_id}')
                return existing_id

        # If an older build left a deleted row behind for this id, remove it
        # before binding again so the new account starts with clean local data.
        if account_id:
            _purge_account(conn, account_id)

        conn.execute(
            "INSERT INTO accounts (id, platform, platform_uid, nickname, profile_dir, status) "
            "VALUES (?, ?, ?, ?, ?, 'active')",
            (account_id, platform, platform_uid, nickname, profile_dir),
        )
        conn.commit()
        return account_id
    except Exception as e:
        print(f'[LocalDB] add_account error: {e}')
        return None
    finally:
        conn.close()


def get_account(account_id: str) -> dict | None:
    """按 ID 查账号"""
    conn = _get_conn()
    row = conn.execute("SELECT * FROM accounts WHERE id = ? AND status != 'deleted'", (account_id,)).fetchone()
    data = dict(row) if row else None
    if data:
        _fill_content_count_fallback(conn, data)
    conn.close()
    return data


def get_all_accounts(include_expired: bool = False) -> list[dict]:
    """Return local accounts. By default only active accounts are collectable."""
    conn = _get_conn()
    if include_expired:
        rows = conn.execute("SELECT * FROM accounts WHERE status != 'deleted' ORDER BY created_at").fetchall()
    else:
        rows = conn.execute("SELECT * FROM accounts WHERE status = 'active' ORDER BY created_at").fetchall()
    accounts = [dict(r) for r in rows]
    for acc in accounts:
        _fill_content_count_fallback(conn, acc)
    conn.close()
    return accounts


def get_accounts_by_platform(platform: str) -> list[dict]:
    """按平台筛选"""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM accounts WHERE platform = ? AND status != 'deleted'", (platform,)).fetchall()
    accounts = [dict(r) for r in rows]
    for acc in accounts:
        _fill_content_count_fallback(conn, acc)
    conn.close()
    return accounts


def _fill_content_count_fallback(conn, account: dict) -> None:
    """Show saved post count when profile metrics do not expose a total."""
    try:
        if int(account.get('video_count') or 0) > 0:
            return
        row = conn.execute(
            "SELECT COUNT(1) AS cnt FROM contents WHERE account_id = ?",
            (account.get('id') or '',),
        ).fetchone()
        cnt = int(row['cnt'] or 0) if row else 0
        if cnt > 0:
            account['video_count'] = cnt
    except Exception:
        return


def is_first_collection(account_id: str) -> bool:
    """判断是否为首次采集（last_collected_at 为空即为首次）"""
    conn = _get_conn()
    row = conn.execute(
        "SELECT last_collected_at FROM accounts WHERE id = ?", (account_id,)
    ).fetchone()
    conn.close()
    if not row:
        return True
    val = row[0]
    return not val or val.strip() == ''


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
        'videos': 'video_count', 'video_count': 'video_count', 'posts_count': 'video_count',
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
        'avatar': 'avatar_url', '_avatar': 'avatar_url',
        'bio': 'bio', 'verified': 'verified',
    }
    conn = _get_conn()
    try:
        today = _beijing_today()
        prev = conn.execute(
            """SELECT * FROM accounts_history
               WHERE account_id = ? AND date < ?
               ORDER BY date DESC
               LIMIT 1""",
            (account_id, today),
        ).fetchone()
        if prev:
            diff_pairs = [
                ('newFollowers', 'followers', 'follower_count'),
                ('newViews', 'views', 'play_count'),
                ('newLikes', 'likes', 'like_count'),
                ('newComments', 'comments', 'comment_count'),
                ('newShares', 'shares', 'share_count'),
            ]
            for new_key, total_key, prev_col in diff_pairs:
                if metrics.get(new_key) is not None:
                    continue
                current = metrics.get(total_key)
                if isinstance(current, (int, float)):
                    prev_val = int(prev[prev_col] or 0)
                    delta = int(current) - prev_val
                    # 指标源跳变保护：如果当前值是前值的 3 倍以上且增量超过 10000，
                    # 很可能是采集方法变了（如从视频列表求和改为 profile API 总值），
                    # 而不是真实的日增长。跳过这次 delta 计算，避免产生数百万的假增量。
                    # 明天的 delta 会基于今天的正确基线计算。
                    if prev_val > 0 and delta > 10000 and int(current) > prev_val * 3:
                        print(f'[LocalDB] metric source jump detected: {total_key} '
                              f'{prev_val} -> {int(current)} (skip delta for {new_key})')
                        metrics.pop(new_key, None)
                    elif prev_val == 0 and int(current) > 0:
                        # 基线为 0 + 非零当前值 = 可能是首次采集或基线缺失
                        # 不计算 delta，避免把全量当成日增量（如 new_followers = 总粉丝数）
                        metrics.pop(new_key, None)
                    else:
                        metrics[new_key] = max(0, delta)
    except Exception as e:
        print(f'[LocalDB] increment compute warning {account_id}: {e}')

    updates = {}
    for k, v in metrics.items():
        db_key = valid_keys.get(k)
        if db_key and v is not None:
            if db_key == 'nickname' and _is_bad_wechat_nickname(v):
                print(f'[LocalDB] ignored suspicious nickname metric for {account_id}: {v}')
                continue
            if db_key == 'avatar_url' and not _is_safe_avatar_url(v):
                print(f'[LocalDB] ignored suspicious avatar metric for {account_id}: {v}')
                continue
            updates[db_key] = v
    if not updates:
        conn.close()
        return
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
        content_id = (
            p.get('id', '')
            or p.get('content_id', '')
            or p.get('contentId', '')
            or p.get('contentID', '')
            or p.get('aweme_id', '')
            or p.get('awemeId', '')
        )
        title = p.get('title', '')
        cover_url = p.get('cover_url', '') or p.get('coverUrl', '') or p.get('cover', '')
        play_count = p.get('play_count', 0) or p.get('views', 0) or 0
        like_count = p.get('like_count', 0) or p.get('likes', 0) or 0
        comment_count = p.get('comment_count', 0) or p.get('comments', 0) or 0
        share_count = p.get('share_count', 0) or p.get('shares', 0) or 0
        publish_time = p.get('publish_time', '') or p.get('create_time', '') or p.get('date', '') or p.get('publishedAt', '') or ''

        existing = None
        if content_id:
            existing = conn.execute(
                "SELECT id FROM contents WHERE account_id = ? AND content_id = ? LIMIT 1",
                (account_id, content_id),
            ).fetchone()
        if not existing and title and publish_time:
            existing = conn.execute(
                "SELECT id FROM contents WHERE account_id = ? AND title = ? AND publish_time = ? LIMIT 1",
                (account_id, title, publish_time),
            ).fetchone()
        if not existing and title and not publish_time:
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


def save_account_session(
    account_id: str,
    platform: str,
    profile_dir: str,
    auth: dict | None = None,
    session_state: str = 'saved',
):
    """Persist per-account browser session/auth metadata."""
    if not account_id or not platform or not profile_dir:
        return
    auth_json = json.dumps(auth or {}, ensure_ascii=False)
    conn = _get_conn()
    conn.execute(
        """INSERT INTO account_sessions
           (account_id, platform, profile_dir, auth_json, session_state,
            last_verified_at, auth_updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(account_id) DO UPDATE SET
             platform = excluded.platform,
             profile_dir = excluded.profile_dir,
             auth_json = excluded.auth_json,
             session_state = excluded.session_state,
             last_verified_at = excluded.last_verified_at,
             auth_updated_at = excluded.auth_updated_at""",
        (account_id, platform, profile_dir, auth_json, session_state),
    )
    conn.commit()
    conn.close()


def mark_current_online_account(platform: str, account_id: str, source: str = 'scan') -> int:
    """Record the single account that is truly online for a platform."""
    if not platform or not account_id:
        return 0
    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO current_sessions
               (platform, account_id, source, updated_at, verified_at)
               VALUES (?, ?, ?, datetime('now'), datetime('now'))
               ON CONFLICT(platform) DO UPDATE SET
                 account_id = excluded.account_id,
                 source = excluded.source,
                 updated_at = excluded.updated_at,
                 verified_at = excluded.verified_at""",
            (platform, account_id, source),
        )
        cur = conn.execute(
            """UPDATE account_sessions
               SET session_state = 'evicted'
               WHERE platform = ?
                 AND account_id != ?
                 AND session_state != 'evicted'""",
            (platform, account_id),
        )
        conn.execute(
            """UPDATE account_sessions
               SET session_state = 'online', last_verified_at = datetime('now')
               WHERE account_id = ?""",
            (account_id,),
        )
        conn.commit()
        return int(cur.rowcount or 0)
    finally:
        conn.close()


def _purge_account(conn: sqlite3.Connection, account_id: str) -> int:
    """Permanently remove one account and all local data tied to it."""
    if not account_id:
        return 0
    tables = (
        'accounts_history',
        'contents',
        'account_sessions',
        'current_sessions',
    )
    deleted = 0
    for table in tables:
        cur = conn.execute(f"DELETE FROM {table} WHERE account_id = ?", (account_id,))
        deleted += int(cur.rowcount or 0)
    cur = conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    deleted += int(cur.rowcount or 0)
    return deleted


def _purge_deleted_accounts(conn: sqlite3.Connection) -> int:
    """Permanently clean account rows that older builds only soft-deleted."""
    rows = conn.execute("SELECT id FROM accounts WHERE status = 'deleted'").fetchall()
    total = 0
    for row in rows:
        total += _purge_account(conn, str(row['id'] or ''))
    if total:
        print(f'[LocalDB] Purged deleted account data rows: {total}')
    return total


def _purge_orphan_account_data(conn: sqlite3.Connection) -> int:
    """Remove rows whose account_id no longer exists in accounts."""
    total = 0
    for table in ('accounts_history', 'contents', 'account_sessions', 'current_sessions'):
        cur = conn.execute(
            f"""DELETE FROM {table}
                WHERE account_id IS NULL
                   OR TRIM(account_id) = ''
                   OR account_id NOT IN (SELECT id FROM accounts)"""
        )
        total += int(cur.rowcount or 0)
    if total:
        print(f'[LocalDB] Purged orphan account data rows: {total}')
    return total


def mark_account_session_state(account_id: str, session_state: str):
    """Update a saved browser session state without changing account metadata."""
    if not account_id:
        return
    conn = _get_conn()
    conn.execute(
        """UPDATE account_sessions
           SET session_state = ?, last_verified_at = datetime('now')
           WHERE account_id = ?""",
        (session_state, account_id),
    )
    conn.commit()
    conn.close()


def get_current_online_account(platform: str) -> str:
    """Return the account id currently known to be online for a platform."""
    if not platform:
        return ''
    conn = _get_conn()
    row = conn.execute(
        """SELECT cs.account_id
           FROM current_sessions cs
           JOIN accounts a ON a.id = cs.account_id
          WHERE cs.platform = ? AND cs.account_id != '' AND a.status != 'deleted'""",
        (platform,),
    ).fetchone()
    conn.close()
    return str(row['account_id'] or '') if row else ''


def clear_current_online_account(platform: str, account_id: str = ''):
    """Clear a platform online pointer, optionally only if it matches account_id."""
    if not platform:
        return
    conn = _get_conn()
    if account_id:
        conn.execute(
            """UPDATE current_sessions
               SET account_id = '', source = 'cleared', updated_at = datetime('now')
               WHERE platform = ? AND account_id = ?""",
            (platform, account_id),
        )
    else:
        conn.execute(
            """UPDATE current_sessions
               SET account_id = '', source = 'cleared', updated_at = datetime('now')
               WHERE platform = ?""",
            (platform,),
        )
    conn.commit()
    conn.close()


def get_account_session(account_id: str) -> dict | None:
    """Return saved session/auth metadata for an account."""
    if not account_id:
        return None
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM account_sessions WHERE account_id = ?",
        (account_id,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    data = dict(row)
    try:
        data['auth'] = json.loads(data.get('auth_json') or '{}')
    except Exception:
        data['auth'] = {}
    data.pop('auth_json', None)
    return data


def get_current_sessions() -> dict:
    """Return current online pointers by platform."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT cs.*
           FROM current_sessions cs
           JOIN accounts a ON a.id = cs.account_id
          WHERE cs.account_id != '' AND a.status != 'deleted'"""
    ).fetchall()
    conn.close()
    return {str(r['platform']): dict(r) for r in rows}


def start_collection_run(mode: str = 'quick', max_posts: int = 20, trigger_type: str = 'manual') -> int:
    """Create a local collection run record and return its id."""
    conn = _get_conn()
    cur = conn.execute(
        """INSERT INTO collection_runs (trigger_type, mode, max_posts, status)
           VALUES (?, ?, ?, 'running')""",
        (trigger_type, mode, max_posts),
    )
    conn.commit()
    run_id = int(cur.lastrowid)
    conn.close()
    return run_id


def finish_collection_run(
    run_id: int,
    status: str,
    accounts_total: int = 0,
    accounts_reported: int = 0,
    videos_reported: int = 0,
    error: str = '',
):
    """Mark a collection run as success/error and store summary counts."""
    if not run_id:
        return
    conn = _get_conn()
    conn.execute(
        """UPDATE collection_runs
           SET status = ?, finished_at = datetime('now'), accounts_total = ?,
               accounts_reported = ?, videos_reported = ?, error = ?
           WHERE id = ?""",
        (status, accounts_total, accounts_reported, videos_reported, error[:1000], run_id),
    )
    conn.commit()
    conn.close()


def cleanup_running_collection_runs(reason: str = 'Companion restarted before collection finished') -> int:
    """Mark stale running collection runs as errors after a process restart."""
    conn = _get_conn()
    cur = conn.execute(
        """UPDATE collection_runs
           SET status = 'error', finished_at = datetime('now'), error = ?
           WHERE status = 'running'""",
        (reason[:1000],),
    )
    changed = int(cur.rowcount or 0)
    conn.commit()
    conn.close()
    return changed


def get_recent_collection_runs(limit: int = 5) -> list[dict]:
    """Return recent collection run summaries, newest first."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT * FROM collection_runs
           ORDER BY COALESCE(NULLIF(finished_at, ''), started_at) DESC, id DESC
           LIMIT ?""",
        (max(1, min(int(limit or 5), 50)),),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_nickname(account_id: str, nickname: str):
    text = str(nickname or '').strip()
    if _is_bad_wechat_nickname(text):
        print(f'[LocalDB] ignored suspicious nickname for {account_id}: {text}')
        return
    legal_markers = (
        '有限公司',
        '有限责任公司',
        '股份有限公司',
        '集团有限公司',
        '文化有限公司',
        '科技有限公司',
    )
    if any(marker in text for marker in legal_markers):
        print(f'[LocalDB] ignored suspicious nickname for {account_id}: {text}')
        return
    conn = _get_conn()
    conn.execute("UPDATE accounts SET nickname = ? WHERE id = ?", (text, account_id))
    conn.commit()
    conn.close()


def remove_account(account_id: str) -> bool:
    """Permanently delete an account and all local data tied to it."""
    if not account_id:
        return False
    conn = _get_conn()
    try:
        removed = _purge_account(conn, account_id)
        _purge_orphan_account_data(conn)
        conn.commit()
        print(f'[LocalDB] Permanently deleted account {account_id}, rows={removed}')
        return removed > 0
    finally:
        conn.close()


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
    today = _beijing_today()
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


_db_initialized = False
_db_init_lock = None  # set on first use

import threading as _threading

def _ensure_db():
    global _db_initialized, _db_init_lock
    if _db_initialized:
        return
    if _db_init_lock is None:
        _db_init_lock = _threading.RLock()  # Reentrant lock to avoid init_db->get_conn->ensure_db deadlock
    with _db_init_lock:
        if _db_initialized:
            return
        try:
            init_db()
            _db_initialized = True
        except Exception as e:
            print(f"[LocalDB] DB init failed: {e}")
