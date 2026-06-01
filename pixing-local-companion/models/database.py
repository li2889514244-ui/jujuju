"""披星云本地伴侣 v4 — 数据模型（SQLite）

四个核心表：
- accounts           账号维度
- follower_history   粉丝历史
- contents           作品维度
- content_history    作品历史
"""

import sqlite3
from datetime import datetime, date
from pathlib import Path
from contextlib import contextmanager


class Database:
    def __init__(self, db_path: str):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _cursor(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        cur = conn.cursor()
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        with self._cursor() as c:
            c.executescript("""
                CREATE TABLE IF NOT EXISTS accounts (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform        TEXT NOT NULL,           -- douyin/kuaishou/xiaohongshu
                    platform_uid    TEXT NOT NULL,           -- 平台用户ID
                    nickname        TEXT,
                    avatar_url      TEXT,
                    bio             TEXT,
                    follower_count  INTEGER DEFAULT 0,
                    following_count INTEGER DEFAULT 0,
                    like_count      INTEGER DEFAULT 0,
                    video_count     INTEGER DEFAULT 0,
                    verified        INTEGER DEFAULT 0,      -- 0/1
                    verified_type   TEXT,                    -- 企业/个人/机构
                    last_collected  TEXT,                    -- ISO datetime
                    created_at      TEXT DEFAULT (datetime('now','localtime')),
                    updated_at      TEXT DEFAULT (datetime('now','localtime')),
                    UNIQUE(platform, platform_uid)
                );

                CREATE TABLE IF NOT EXISTS follower_history (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id      INTEGER NOT NULL,
                    date            TEXT NOT NULL,           -- YYYY-MM-DD
                    follower_count  INTEGER DEFAULT 0,
                    follower_change INTEGER DEFAULT 0,      -- 净增
                    following_count INTEGER DEFAULT 0,
                    like_count      INTEGER DEFAULT 0,
                    video_count     INTEGER DEFAULT 0,
                    collected_at    TEXT DEFAULT (datetime('now','localtime')),
                    FOREIGN KEY (account_id) REFERENCES accounts(id),
                    UNIQUE(account_id, date)
                );

                CREATE TABLE IF NOT EXISTS contents (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform        TEXT NOT NULL,
                    content_id      TEXT NOT NULL,           -- 平台作品ID
                    account_id      INTEGER NOT NULL,
                    title           TEXT,
                    cover_url       TEXT,
                    content_url     TEXT,
                    content_type    TEXT DEFAULT 'video',    -- video/image/article
                    duration        INTEGER,                -- 秒
                    published_at    TEXT,
                    play_count      INTEGER DEFAULT 0,
                    like_count      INTEGER DEFAULT 0,
                    comment_count   INTEGER DEFAULT 0,
                    share_count     INTEGER DEFAULT 0,
                    collect_count   INTEGER DEFAULT 0,
                    first_collected TEXT DEFAULT (datetime('now','localtime')),
                    last_collected  TEXT DEFAULT (datetime('now','localtime')),
                    FOREIGN KEY (account_id) REFERENCES accounts(id),
                    UNIQUE(platform, content_id)
                );

                CREATE TABLE IF NOT EXISTS content_history (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    content_id      INTEGER NOT NULL,       -- contents.id
                    date            TEXT NOT NULL,           -- YYYY-MM-DD
                    play_count      INTEGER DEFAULT 0,
                    play_increment  INTEGER DEFAULT 0,
                    like_count      INTEGER DEFAULT 0,
                    like_increment  INTEGER DEFAULT 0,
                    comment_count   INTEGER DEFAULT 0,
                    comment_increment INTEGER DEFAULT 0,
                    share_count     INTEGER DEFAULT 0,
                    share_increment INTEGER DEFAULT 0,
                    collect_count   INTEGER DEFAULT 0,
                    collect_increment INTEGER DEFAULT 0,
                    collected_at    TEXT DEFAULT (datetime('now','localtime')),
                    FOREIGN KEY (content_id) REFERENCES contents(id),
                    UNIQUE(content_id, date)
                );

                CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);
                CREATE INDEX IF NOT EXISTS idx_fh_account_date ON follower_history(account_id, date);
                CREATE INDEX IF NOT EXISTS idx_contents_account ON contents(account_id);
                CREATE INDEX IF NOT EXISTS idx_contents_platform ON contents(platform);
                CREATE INDEX IF NOT EXISTS idx_ch_content_date ON content_history(content_id, date);
            """)

    # ─── Account ────────────────────────────────

    def upsert_account(self, platform: str, platform_uid: str, data: dict) -> int:
        """插入或更新账号，返回 account_id"""
        now = datetime.now().isoformat()
        with self._cursor() as c:
            c.execute("SELECT id FROM accounts WHERE platform=? AND platform_uid=?", (platform, platform_uid))
            row = c.fetchone()
            if row:
                c.execute("""
                    UPDATE accounts SET nickname=?, avatar_url=?, bio=?,
                    follower_count=?, following_count=?, like_count=?, video_count=?,
                    verified=?, verified_type=?, last_collected=?, updated_at=?
                    WHERE id=?
                """, (
                    data.get("nickname"), data.get("avatar_url"), data.get("bio"),
                    data.get("follower_count", 0), data.get("following_count", 0),
                    data.get("like_count", 0), data.get("video_count", 0),
                    data.get("verified", 0), data.get("verified_type"),
                    now, now, row["id"]
                ))
                return row["id"]
            else:
                c.execute("""
                    INSERT INTO accounts (platform, platform_uid, nickname, avatar_url, bio,
                    follower_count, following_count, like_count, video_count,
                    verified, verified_type, last_collected)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    platform, platform_uid, data.get("nickname"), data.get("avatar_url"),
                    data.get("bio"), data.get("follower_count", 0),
                    data.get("following_count", 0), data.get("like_count", 0),
                    data.get("video_count", 0), data.get("verified", 0),
                    data.get("verified_type"), now
                ))
                return c.lastrowid

    def get_account(self, account_id: int) -> dict:
        with self._cursor() as c:
            row = c.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
            return dict(row) if row else None

    def get_accounts_by_platform(self, platform: str) -> list:
        with self._cursor() as c:
            return [dict(r) for r in c.execute(
                "SELECT * FROM accounts WHERE platform=? ORDER BY follower_count DESC", (platform,)
            ).fetchall()]

    def get_all_accounts(self) -> list:
        with self._cursor() as c:
            return [dict(r) for r in c.execute(
                "SELECT * FROM accounts ORDER BY platform, follower_count DESC"
            ).fetchall()]

    # ─── Follower History ───────────────────────

    def record_follower_snapshot(self, account_id: int):
        """拍当日粉丝快照，自动计算净增"""
        today = date.today().isoformat()
        acc = self.get_account(account_id)
        if not acc:
            return

        with self._cursor() as c:
            # 取昨日数据算净增
            yesterday = c.execute("""
                SELECT follower_count, like_count FROM follower_history
                WHERE account_id=? AND date<?
                ORDER BY date DESC LIMIT 1
            """, (account_id, today)).fetchone()

            prev_fc = yesterday["follower_count"] if yesterday else acc["follower_count"]
            follower_change = acc["follower_count"] - prev_fc

            c.execute("""
                INSERT OR REPLACE INTO follower_history
                (account_id, date, follower_count, follower_change,
                 following_count, like_count, video_count)
                VALUES (?,?,?,?,?,?,?)
            """, (
                account_id, today, acc["follower_count"], follower_change,
                acc["following_count"], acc["like_count"], acc["video_count"]
            ))

    def get_follower_history(self, account_id: int, days: int = 30) -> list:
        with self._cursor() as c:
            return [dict(r) for r in c.execute("""
                SELECT * FROM follower_history
                WHERE account_id=?
                ORDER BY date DESC LIMIT ?
            """, (account_id, days)).fetchall()]

    # ─── Content ─────────────────────────────────

    def upsert_content(self, platform: str, content_id: str, account_id: int, data: dict) -> int:
        """插入或更新作品，返回 contents.id"""
        now = datetime.now().isoformat()
        with self._cursor() as c:
            c.execute("SELECT id FROM contents WHERE platform=? AND content_id=?",
                      (platform, content_id))
            row = c.fetchone()
            if row:
                c.execute("""
                    UPDATE contents SET title=?, cover_url=?, content_url=?, content_type=?,
                    duration=?, play_count=?, like_count=?, comment_count=?, share_count=?,
                    collect_count=?, last_collected=?
                    WHERE id=?
                """, (
                    data.get("title"), data.get("cover_url"), data.get("content_url"),
                    data.get("content_type", "video"), data.get("duration"),
                    data.get("play_count", 0), data.get("like_count", 0),
                    data.get("comment_count", 0), data.get("share_count", 0),
                    data.get("collect_count", 0), now, row["id"]
                ))
                return row["id"]
            else:
                c.execute("""
                    INSERT INTO contents (platform, content_id, account_id, title, cover_url,
                    content_url, content_type, duration, published_at,
                    play_count, like_count, comment_count, share_count, collect_count)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    platform, content_id, account_id, data.get("title"),
                    data.get("cover_url"), data.get("content_url"),
                    data.get("content_type", "video"), data.get("duration"),
                    data.get("published_at"), data.get("play_count", 0),
                    data.get("like_count", 0), data.get("comment_count", 0),
                    data.get("share_count", 0), data.get("collect_count", 0)
                ))
                return c.lastrowid

    def get_contents(self, account_id: int, limit: int = 50) -> list:
        with self._cursor() as c:
            return [dict(r) for r in c.execute("""
                SELECT * FROM contents WHERE account_id=?
                ORDER BY published_at DESC LIMIT ?
            """, (account_id, limit)).fetchall()]

    # ─── Content History ────────────────────────

    def record_content_snapshot(self, content_db_id: int):
        """拍作品当日快照，自动计算增量"""
        today = date.today().isoformat()
        with self._cursor() as c:
            ct = c.execute("SELECT * FROM contents WHERE id=?", (content_db_id,)).fetchone()
            if not ct:
                return

            yesterday = c.execute("""
                SELECT play_count, like_count, comment_count, share_count, collect_count
                FROM content_history WHERE content_id=? AND date<?
                ORDER BY date DESC LIMIT 1
            """, (content_db_id, today)).fetchone()

            if yesterday:
                pi = ct["play_count"] - yesterday["play_count"]
                li = ct["like_count"] - yesterday["like_count"]
                ci = ct["comment_count"] - yesterday["comment_count"]
                si = ct["share_count"] - yesterday["share_count"]
                cli = ct["collect_count"] - yesterday["collect_count"]
            else:
                pi = li = ci = si = cli = 0

            c.execute("""
                INSERT OR REPLACE INTO content_history
                (content_id, date, play_count, play_increment, like_count, like_increment,
                 comment_count, comment_increment, share_count, share_increment,
                 collect_count, collect_increment)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                content_db_id, today,
                ct["play_count"], pi, ct["like_count"], li,
                ct["comment_count"], ci, ct["share_count"], si,
                ct["collect_count"], cli
            ))

    def get_content_history(self, content_db_id: int, days: int = 30) -> list:
        with self._cursor() as c:
            return [dict(r) for r in c.execute("""
                SELECT * FROM content_history WHERE content_id=?
                ORDER BY date DESC LIMIT ?
            """, (content_db_id, days)).fetchall()]

    # ─── Stats ───────────────────────────────────

    def get_today_stats(self) -> dict:
        """当日概览：总粉丝、总播放、各平台数据"""
        today = date.today().isoformat()
        with self._cursor() as c:
            total_followers = c.execute(
                "SELECT SUM(follower_count) FROM accounts"
            ).fetchone()[0] or 0

            total_plays = c.execute(
                "SELECT SUM(play_count) FROM contents WHERE date(first_collected)=?",
                (today,)
            ).fetchone()[0] or 0

            total_likes = c.execute(
                "SELECT SUM(like_count) FROM contents WHERE date(first_collected)=?",
                (today,)
            ).fetchone()[0] or 0

            platforms = c.execute("""
                SELECT platform, COUNT(*) as cnt, SUM(follower_count) as fc,
                       SUM(video_count) as vc
                FROM accounts GROUP BY platform
            """).fetchall()

        return {
            "total_followers": total_followers,
            "total_plays": total_plays,
            "total_likes": total_likes,
            "platforms": {p["platform"]: {
                "accounts": p["cnt"],
                "followers": p["fc"] or 0,
                "videos": p["vc"] or 0,
            } for p in platforms},
        }
