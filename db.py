"""GardePro database — SQLite via stdlib sqlite3."""
from __future__ import annotations
import sqlite3, os, json
from datetime import datetime

_DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(__file__))
DB_PATH = os.path.join(_DATA_DIR, "gardepro.db")


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    """Create table if not exists, then migrate existing archive files."""
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS media_items (
                id            INTEGER PRIMARY KEY,
                filename      TEXT NOT NULL,
                type          TEXT NOT NULL,
                file_size     INTEGER,
                downloaded_at TEXT,
                is_new        INTEGER DEFAULT 1,
                is_favorite   INTEGER DEFAULT 0,
                is_deleted    INTEGER DEFAULT 0,
                camera_meta   TEXT
            )
        """)
        # Add is_deleted column to existing DBs that were created before this column existed
        try:
            con.execute("ALTER TABLE media_items ADD COLUMN is_deleted INTEGER DEFAULT 0")
        except Exception:
            pass  # column already exists
        # Add immich_asset_id column for Immich integration
        try:
            con.execute("ALTER TABLE media_items ADD COLUMN immich_asset_id TEXT DEFAULT NULL")
        except Exception:
            pass  # column already exists
    _migrate_existing_archive()


def _migrate_existing_archive() -> None:
    """Seed DB from existing archive files if table is empty (first-run migration)."""
    # Import here to avoid circular import at module level
    from sync import ARCHIVE_DIR

    with _conn() as con:
        count = con.execute("SELECT COUNT(*) FROM media_items").fetchone()[0]
        if count > 0:
            return
        if not os.path.isdir(ARCHIVE_DIR):
            return

        rows = []
        for name in os.listdir(ARCHIVE_DIR):
            stem, _, ext = name.rpartition(".")
            if not stem.isdigit() or ext.lower() not in ("jpg", "mp4"):
                continue
            fid   = int(stem)
            ftype = "video" if ext.lower() == "mp4" else "photo"
            fpath = os.path.join(ARCHIVE_DIR, name)
            fsize = os.path.getsize(fpath) if os.path.exists(fpath) else None
            mtime = datetime.fromtimestamp(os.path.getmtime(fpath)).isoformat()
            rows.append((fid, name, ftype, fsize, mtime, 0))  # is_new=0 for pre-existing files

        con.executemany(
            "INSERT OR IGNORE INTO media_items "
            "(id, filename, type, file_size, downloaded_at, is_new) "
            "VALUES (?,?,?,?,?,?)",
            rows,
        )
        if rows:
            import logging
            logging.getLogger("gardepro.db").info(
                "DB migration: %d vorhandene Dateien importiert", len(rows)
            )


def is_downloaded(fid: int) -> bool:
    """Return True if this camera ID is already recorded in the database."""
    with _conn() as con:
        row = con.execute("SELECT 1 FROM media_items WHERE id=?", (fid,)).fetchone()
        return row is not None


def insert_media(fid: int, filename: str, ftype: str, file_size: int | None, camera_meta: dict) -> None:
    """Insert a newly downloaded media item. No-op if id already exists."""
    with _conn() as con:
        con.execute(
            "INSERT OR IGNORE INTO media_items "
            "(id, filename, type, file_size, downloaded_at, is_new, camera_meta) "
            "VALUES (?,?,?,?,?,1,?)",
            (fid, filename, ftype, file_size, datetime.now().isoformat(), json.dumps(camera_meta)),
        )


def get_all_media() -> list[dict]:
    """Return all non-deleted media items ordered by id descending."""
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM media_items WHERE is_deleted=0 ORDER BY id DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def mark_all_seen() -> None:
    """Mark all items as no longer new."""
    with _conn() as con:
        con.execute("UPDATE media_items SET is_new=0 WHERE is_deleted=0")


def mark_item_seen(fid: int) -> None:
    """Mark a single item as no longer new."""
    with _conn() as con:
        con.execute("UPDATE media_items SET is_new=0 WHERE id=?", (fid,))


def soft_delete(fid: int) -> str | None:
    """
    Mark item as deleted. Returns filename so caller can move the file,
    or None if item not found.
    """
    with _conn() as con:
        row = con.execute("SELECT filename FROM media_items WHERE id=?", (fid,)).fetchone()
        if not row:
            return None
        con.execute("UPDATE media_items SET is_deleted=1, is_new=0 WHERE id=?", (fid,))
        return row["filename"]


def get_trash() -> list[dict]:
    """Return all soft-deleted items ordered by id descending."""
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM media_items WHERE is_deleted=1 ORDER BY id DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def restore_item(fid: int) -> str | None:
    """Un-delete an item. Returns filename so caller can move the file back."""
    with _conn() as con:
        row = con.execute("SELECT filename FROM media_items WHERE id=?", (fid,)).fetchone()
        if not row:
            return None
        con.execute("UPDATE media_items SET is_deleted=0 WHERE id=?", (fid,))
        return row["filename"]


def permanent_delete(fid: int) -> str | None:
    """Remove item from DB entirely. Returns filename so caller can delete the file."""
    with _conn() as con:
        row = con.execute("SELECT filename FROM media_items WHERE id=?", (fid,)).fetchone()
        if not row:
            return None
        con.execute("DELETE FROM media_items WHERE id=?", (fid,))
        return row["filename"]


def get_not_uploaded_to_immich() -> list[dict]:
    """Return all non-deleted items that have not yet been uploaded to Immich."""
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM media_items WHERE is_deleted=0 AND immich_asset_id IS NULL ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]


def set_immich_asset_id(fid: int, asset_id: str) -> None:
    """Record the Immich asset ID for a media item."""
    with _conn() as con:
        con.execute("UPDATE media_items SET immich_asset_id=? WHERE id=?", (asset_id, fid))


def trash_count() -> int:
    with _conn() as con:
        return con.execute("SELECT COUNT(*) FROM media_items WHERE is_deleted=1").fetchone()[0]


def toggle_favorite(fid: int) -> bool:
    """Toggle favorite flag for given id. Returns new favorite state."""
    with _conn() as con:
        con.execute(
            "UPDATE media_items SET is_favorite = 1 - is_favorite WHERE id=?", (fid,)
        )
        row = con.execute("SELECT is_favorite FROM media_items WHERE id=?", (fid,)).fetchone()
        return bool(row["is_favorite"]) if row else False
