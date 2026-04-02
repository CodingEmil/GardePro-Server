"""Immich API integration for GardePro Gallery."""
from __future__ import annotations
import os, logging
import requests as _requests
import db

log = logging.getLogger("gardepro.immich")

# Attach to the shared buffer handler so Immich logs appear in the UI
_parent = logging.getLogger("gardepro.sync")
for _h in _parent.handlers:
    log.addHandler(_h)
log.setLevel(logging.DEBUG)
log.propagate = False


def _headers(api_key: str) -> dict:
    return {"x-api-key": api_key, "Accept": "application/json"}


def test_connection(server_url: str, api_key: str) -> dict:
    """Ping Immich server. Returns {"ok": True} or {"ok": False, "error": "..."}."""
    url = server_url.rstrip("/") + "/api/server/ping"
    try:
        r = _requests.get(url, headers=_headers(api_key), timeout=10)
        if r.status_code == 200 and r.json().get("res") == "pong":
            return {"ok": True}
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def list_albums(server_url: str, api_key: str) -> list[dict]:
    """Return list of albums from Immich."""
    url = server_url.rstrip("/") + "/api/albums"
    r = _requests.get(url, headers=_headers(api_key), timeout=10)
    r.raise_for_status()
    return [{"id": a["id"], "albumName": a["albumName"]} for a in r.json()]


_album_cache: dict[str, str] = {}


def resolve_album(server_url: str, api_key: str, album_name: str) -> str:
    """Find or create an album by name. Returns album UUID."""
    cache_key = f"{server_url}|{album_name}"
    if cache_key in _album_cache:
        return _album_cache[cache_key]

    base = server_url.rstrip("/")
    albums = list_albums(server_url, api_key)
    for a in albums:
        if a["albumName"] == album_name:
            _album_cache[cache_key] = a["id"]
            return a["id"]

    # Create album
    r = _requests.post(
        base + "/api/albums",
        headers={**_headers(api_key), "Content-Type": "application/json"},
        json={"albumName": album_name},
        timeout=10,
    )
    r.raise_for_status()
    album_id = r.json()["id"]
    log.info("Immich-Album '%s' erstellt (ID: %s)", album_name, album_id[:8])
    _album_cache[cache_key] = album_id
    return album_id


def upload_asset(server_url: str, api_key: str, file_path: str, fid: int) -> str:
    """Upload a single file to Immich. Returns asset UUID."""
    url = server_url.rstrip("/") + "/api/assets"
    mtime = os.path.getmtime(file_path)
    from datetime import datetime
    ts = datetime.fromtimestamp(mtime).isoformat()

    with open(file_path, "rb") as f:
        r = _requests.post(
            url,
            headers=_headers(api_key),
            data={
                "deviceAssetId": str(fid),
                "deviceId": "gardepro-gallery",
                "fileCreatedAt": ts,
                "fileModifiedAt": ts,
            },
            files={"assetData": (os.path.basename(file_path), f)},
            timeout=120,
        )
    r.raise_for_status()
    data = r.json()
    return data["id"]


def add_assets_to_album(server_url: str, api_key: str, album_id: str, asset_ids: list[str]) -> None:
    """Add assets to an album."""
    if not asset_ids:
        return
    url = server_url.rstrip("/") + f"/api/albums/{album_id}/assets"
    r = _requests.put(
        url,
        headers={**_headers(api_key), "Content-Type": "application/json"},
        json={"ids": asset_ids},
        timeout=30,
    )
    r.raise_for_status()


def upload_new_media(settings: dict) -> dict:
    """Upload all un-uploaded media to Immich. Returns summary dict."""
    server_url = settings.get("immich_server_url", "").strip()
    api_key = settings.get("immich_api_key", "").strip()
    album_name = settings.get("immich_album_name", "").strip()

    if not server_url or not api_key:
        return {"uploaded": 0, "errors": 0, "skipped": 0, "reason": "not configured"}

    items = db.get_not_uploaded_to_immich()
    if not items:
        return {"uploaded": 0, "errors": 0, "skipped": 0}

    log.info("Immich: %d Dateien zum Hochladen", len(items))

    from sync import ARCHIVE_DIR
    uploaded = 0
    errors = 0
    skipped = 0
    asset_ids: list[str] = []

    session = _requests.Session()
    session.headers.update(_headers(api_key))

    for item in items:
        file_path = os.path.join(ARCHIVE_DIR, item["filename"])
        if not os.path.exists(file_path):
            log.warning("Immich: Datei nicht gefunden: %s", item["filename"])
            skipped += 1
            continue
        try:
            asset_id = upload_asset(server_url, api_key, file_path, item["id"])
            db.set_immich_asset_id(item["id"], asset_id)
            asset_ids.append(asset_id)
            uploaded += 1
            log.info("Immich: %s hochgeladen", item["filename"])
        except Exception as e:
            errors += 1
            log.error("Immich: Fehler bei %s: %s", item["filename"], e)

    # Add to album
    if album_name and asset_ids:
        try:
            album_id = resolve_album(server_url, api_key, album_name)
            add_assets_to_album(server_url, api_key, album_id, asset_ids)
            log.info("Immich: %d Dateien zum Album '%s' hinzugefuegt", len(asset_ids), album_name)
        except Exception as e:
            log.error("Immich: Album-Zuordnung fehlgeschlagen: %s", e)

    log.info("Immich fertig: %d hochgeladen, %d Fehler, %d uebersprungen", uploaded, errors, skipped)
    return {"uploaded": uploaded, "errors": errors, "skipped": skipped}


def check_asset_exists(server_url: str, api_key: str, asset_id: str) -> bool:
    """Check if an asset still exists on Immich by fetching its metadata."""
    url = server_url.rstrip("/") + f"/api/assets/{asset_id}"
    try:
        r = _requests.get(url, headers=_headers(api_key), timeout=10)
        if r.status_code == 200:
            return True
        elif r.status_code == 404 or (r.status_code == 400 and "Not found" in r.text):
            return False
        r.raise_for_status()
    except Exception as e:
        log.warning("Fehler beim Pruefen von Asset %s: %s", asset_id, e)
        # If network error, we assume it MIGHT exist to prevent deleting local tracking IDs erroneously.
        return True
    return False


def validate_immich_sync(settings: dict) -> dict:
    """Validate that all locally marked assets still exist on Immich. Resets them if not."""
    server_url = settings.get("immich_server_url", "").strip()
    api_key = settings.get("immich_api_key", "").strip()

    if not server_url or not api_key:
        return {"validated": 0, "reset": 0, "errors": 0, "reason": "not configured"}

    items = db.get_uploaded_to_immich()
    if not items:
        return {"validated": 0, "reset": 0, "errors": 0}

    log.info("Immich-Validierung: Pruefe %d hochgeladene Dateien...", len(items))

    reset_count = 0
    errors = 0

    session = _requests.Session()
    session.headers.update(_headers(api_key))

    for item in items:
        asset_id = item["immich_asset_id"]
        try:
            url = server_url.rstrip("/") + f"/api/assets/{asset_id}"
            r = session.get(url, timeout=10)
            if r.status_code == 404 or (r.status_code == 400 and "Not found" in r.text):
                # Asset is gone from Immich!
                db.clear_immich_asset_id(item["id"])
                reset_count += 1
                log.info("Immich-Validierung: Asset %s (Datei %s) nicht vorhanden. Status zurueckgesetzt.", asset_id, item["filename"])
            elif r.status_code != 200:
                log.warning("Immich-Validierung: Unerwarteter Status %d fuer Asset %s (%s)", r.status_code, asset_id, r.text[:100])
                errors += 1
        except Exception as e:
            errors += 1
            log.warning("Immich-Validierung: Fehler bei Asset %s: %s", asset_id, e)

    log.info("Immich-Validierung fertig: %d geprueft, %d zurueckgesetzt, %d Fehler", len(items), reset_count, errors)
    return {"validated": len(items), "reset": reset_count, "errors": errors}
