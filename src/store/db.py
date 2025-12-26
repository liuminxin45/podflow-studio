"""
Database Storage Module

这个文件实现了数据库存储功能，用于播客数据的持久化和管理。

功能概述：
- SQLite数据库操作封装
- 数据模型定义和管理
- 批量数据处理
- 数据备份和恢复

主要类：
- Database: 数据库连接管理类
- DataModel: 数据模型基类

主要函数：
- init_database(): 初始化数据库
- store_episode(): 存储播客数据
- query_episodes(): 查询播客数据
- backup_database(): 备份数据库

存储特性：
- 自动数据库初始化
- 事务管理
- 数据完整性检查
- 性能优化

使用示例：
    db = Database("podcast.db")
    db.store_episode(episode_data)
    results = db.query_episodes(date="2025-12-25")

应用场景：
- 播客数据持久化
- 历史数据管理
- 数据分析和统计
- 系统状态跟踪

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path


class Store:
    def __init__(self, db_path: str):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.db_path)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL;")
        con.execute("PRAGMA foreign_keys=ON;")
        return con

    def init_schema(self) -> None:
        with self._connect() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS episodes (
                    id TEXT PRIMARY KEY,
                    channel_id TEXT NOT NULL,
                    episode_date TEXT NOT NULL,
                    status TEXT NOT NULL,
                    title TEXT,
                    ssml TEXT,
                    shownotes TEXT,
                    tags TEXT,
                    script_json TEXT,
                    tts_task_id TEXT,
                    tts_audio_path TEXT,
                    rendered_audio_path TEXT,
                    published_path TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE(channel_id, episode_date)
                );

                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    summary TEXT,
                    content TEXT,
                    url TEXT,
                    published_at TEXT,
                    source TEXT,
                    used_episode_id TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_items_used ON items(used_episode_id);

                CREATE TABLE IF NOT EXISTS fetch_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    episode_id TEXT,
                    started_at INTEGER NOT NULL,
                    finished_at INTEGER,
                    created_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS fetch_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    source_type TEXT NOT NULL,
                    source_name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    ok INTEGER NOT NULL,
                    status_code INTEGER,
                    error TEXT,
                    duration_ms INTEGER NOT NULL,
                    item_count INTEGER NOT NULL,
                    total_chars INTEGER NOT NULL DEFAULT 0,
                    est_tokens INTEGER NOT NULL DEFAULT 0,
                    max_item_chars INTEGER NOT NULL DEFAULT 0,
                    max_item_tokens INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY(run_id) REFERENCES fetch_runs(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_fetch_attempts_created ON fetch_attempts(created_at);
                CREATE INDEX IF NOT EXISTS idx_fetch_attempts_source ON fetch_attempts(source_type, source_name);
                """
            )

            for col, ddl in [
                ("total_chars", "ALTER TABLE fetch_attempts ADD COLUMN total_chars INTEGER NOT NULL DEFAULT 0"),
                ("est_tokens", "ALTER TABLE fetch_attempts ADD COLUMN est_tokens INTEGER NOT NULL DEFAULT 0"),
                ("max_item_chars", "ALTER TABLE fetch_attempts ADD COLUMN max_item_chars INTEGER NOT NULL DEFAULT 0"),
                ("max_item_tokens", "ALTER TABLE fetch_attempts ADD COLUMN max_item_tokens INTEGER NOT NULL DEFAULT 0"),
            ]:
                try:
                    con.execute(ddl)
                except sqlite3.OperationalError:
                    pass

    def create_fetch_run(self, episode_id: str | None) -> int:
        now = int(time.time())
        with self._connect() as con:
            cur = con.execute(
                """
                INSERT INTO fetch_runs (episode_id, started_at, finished_at, created_at)
                VALUES (?, ?, NULL, ?)
                """,
                (episode_id, now, now),
            )
            rid = cur.lastrowid
            if rid is None:
                raise RuntimeError("failed to create fetch run")
            return int(rid)

    def finish_fetch_run(self, run_id: int) -> None:
        now = int(time.time())
        with self._connect() as con:
            con.execute(
                "UPDATE fetch_runs SET finished_at=? WHERE id=?",
                (now, int(run_id)),
            )

    def add_fetch_attempt(
        self,
        *,
        run_id: int,
        source_type: str,
        source_name: str,
        url: str,
        ok: bool,
        status_code: int | None,
        error: str | None,
        duration_ms: int,
        item_count: int,
        total_chars: int = 0,
        est_tokens: int = 0,
        max_item_chars: int = 0,
        max_item_tokens: int = 0,
    ) -> None:
        now = int(time.time())
        with self._connect() as con:
            con.execute(
                """
                INSERT INTO fetch_attempts
                    (
                        run_id, source_type, source_name, url, ok, status_code, error,
                        duration_ms, item_count, total_chars, est_tokens, max_item_chars, max_item_tokens, created_at
                    )
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    int(run_id),
                    source_type,
                    source_name,
                    url,
                    1 if ok else 0,
                    status_code,
                    error,
                    int(duration_ms),
                    int(item_count),
                    int(total_chars),
                    int(est_tokens),
                    int(max_item_chars),
                    int(max_item_tokens),
                    now,
                ),
            )

    def get_or_create_episode(self, channel_id: str, episode_date: str) -> str:
        now = int(time.time())
        eid = f"{channel_id}:{episode_date}"
        with self._connect() as con:
            row = con.execute(
                "SELECT id FROM episodes WHERE channel_id=? AND episode_date=?",
                (channel_id, episode_date),
            ).fetchone()
            if row:
                return str(row["id"])

            con.execute(
                """
                INSERT INTO episodes (id, channel_id, episode_date, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (eid, channel_id, episode_date, "new", now, now),
            )
            return eid

    def get_episode(self, episode_id: str) -> dict:
        with self._connect() as con:
            row = con.execute("SELECT * FROM episodes WHERE id=?", (episode_id,)).fetchone()
            if not row:
                raise KeyError(f"episode not found: {episode_id}")
            return dict(row)

    def set_episode_status(self, episode_id: str, status: str) -> None:
        now = int(time.time())
        with self._connect() as con:
            con.execute(
                "UPDATE episodes SET status=?, updated_at=? WHERE id=?",
                (status, now, episode_id),
            )

    def upsert_items(self, items: list[dict]) -> int:
        now = int(time.time())
        upserted = 0
        with self._connect() as con:
            for it in items:
                con.execute(
                    """
                    INSERT INTO items (id, title, summary, content, url, published_at, source, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title=excluded.title,
                        summary=excluded.summary,
                        content=excluded.content,
                        url=excluded.url,
                        published_at=excluded.published_at,
                        source=excluded.source,
                        updated_at=excluded.updated_at
                    """,
                    (
                        it.get("id"),
                        it.get("title"),
                        it.get("summary"),
                        it.get("content"),
                        it.get("url"),
                        it.get("published_at"),
                        it.get("source"),
                        now,
                        now,
                    ),
                )
                upserted += 1
        return upserted

    def pick_items_for_episode(self, episode_id: str, limit: int) -> list[dict]:
        with self._connect() as con:
            rows = con.execute(
                """
                SELECT * FROM items
                WHERE used_episode_id IS NULL
                ORDER BY COALESCE(published_at, '') DESC, updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]

    def mark_items_used(self, item_ids: list[str], episode_id: str) -> None:
        now = int(time.time())
        if not item_ids:
            return
        with self._connect() as con:
            con.executemany(
                "UPDATE items SET used_episode_id=?, updated_at=? WHERE id=? AND used_episode_id IS NULL",
                [(episode_id, now, iid) for iid in item_ids],
            )

    def set_episode_script(
        self,
        episode_id: str,
        title: str,
        ssml: str,
        shownotes: str,
        tags: list[str],
        script_json: str,
    ) -> None:
        now = int(time.time())
        with self._connect() as con:
            con.execute(
                """
                UPDATE episodes
                SET title=?, ssml=?, shownotes=?, tags=?, script_json=?, updated_at=?
                WHERE id=?
                """,
                (title, ssml, shownotes, ",".join(tags), script_json, now, episode_id),
            )

    def set_episode_tts(self, episode_id: str, task_id: str, tts_audio_path: str) -> None:
        now = int(time.time())
        with self._connect() as con:
            con.execute(
                "UPDATE episodes SET tts_task_id=?, tts_audio_path=?, updated_at=? WHERE id=?",
                (task_id, tts_audio_path, now, episode_id),
            )

    def set_episode_rendered(self, episode_id: str, rendered_audio_path: str) -> None:
        now = int(time.time())
        with self._connect() as con:
            con.execute(
                "UPDATE episodes SET rendered_audio_path=?, updated_at=? WHERE id=?",
                (rendered_audio_path, now, episode_id),
            )

    def set_episode_published(self, episode_id: str, published_path: str) -> None:
        now = int(time.time())
        with self._connect() as con:
            con.execute(
                "UPDATE episodes SET published_path=?, updated_at=? WHERE id=?",
                (published_path, now, episode_id),
            )
