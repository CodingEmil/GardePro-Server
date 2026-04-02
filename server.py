#!/usr/bin/env python3
"""GardePro gallery server."""
import os, logging, threading, asyncio
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sync, db, immich

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

ARCHIVE_DIR    = sync.ARCHIVE_DIR
PAPIERKORB_DIR = sync.PAPIERKORB_DIR
DIST_DIR    = os.path.abspath(os.path.join(os.path.dirname(__file__), "dist"))

app = Flask(__name__, static_folder=DIST_DIR, static_url_path="")
CORS(app)

# ── Media list ────────────────────────────────────────────────────────────

@app.route("/api/media")
def api_media():
    try:
        items = db.get_all_media()
        for item in items:
            item["is_new"]      = bool(item["is_new"])
            item["is_favorite"] = bool(item["is_favorite"])
        return jsonify({"ok": True, "data": items})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/media/<int:fid>/favorite", methods=["POST"])
def api_toggle_favorite(fid):
    new_state = db.toggle_favorite(fid)
    return jsonify({"ok": True, "is_favorite": new_state})

@app.route("/api/media/<int:fid>/seen", methods=["POST"])
def api_mark_seen(fid):
    db.mark_item_seen(fid)
    return jsonify({"ok": True})

@app.route("/api/media/<int:fid>", methods=["DELETE"])
def api_delete_media(fid):
    filename = db.soft_delete(fid)
    if not filename:
        return jsonify({"ok": False, "error": "Nicht gefunden"}), 404
    return jsonify({"ok": True})

# ── Trash ─────────────────────────────────────────────────────────────────

@app.route("/api/trash")
def api_trash_list():
    items = db.get_trash()
    for item in items:
        item["is_favorite"] = bool(item["is_favorite"])
    return jsonify({"ok": True, "data": items})

@app.route("/api/trash/<int:fid>/restore", methods=["POST"])
def api_trash_restore(fid):
    filename = db.restore_item(fid)
    if not filename:
        return jsonify({"ok": False, "error": "Nicht gefunden"}), 404
    return jsonify({"ok": True})

@app.route("/api/trash/<int:fid>", methods=["DELETE"])
def api_trash_permanent_delete(fid):
    filename = db.permanent_delete(fid)
    if not filename:
        return jsonify({"ok": False, "error": "Nicht gefunden"}), 404
    path = os.path.join(ARCHIVE_DIR, filename)
    if os.path.exists(path):
        os.remove(path)
    # Also delete thumbnail if it exists
    thumb_path = os.path.join(ARCHIVE_DIR, "thumbs", f"{fid}.jpg")
    if os.path.exists(thumb_path):
        os.remove(thumb_path)
    return jsonify({"ok": True})

@app.route("/api/trash/empty", methods=["POST"])
def api_trash_empty():
    items = db.get_trash()
    for item in items:
        db.permanent_delete(item["id"])
        path = os.path.join(ARCHIVE_DIR, item["filename"])
        if os.path.exists(path):
            os.remove(path)
        # Also delete thumbnail if it exists
        thumb_path = os.path.join(ARCHIVE_DIR, "thumbs", f'{item["id"]}.jpg')
        if os.path.exists(thumb_path):
            os.remove(thumb_path)
    return jsonify({"ok": True, "deleted": len(items)})

# ── Sync ──────────────────────────────────────────────────────────────────

@app.route("/api/sync", methods=["POST"])
def api_sync_trigger():
    threading.Thread(target=sync.run_sync, daemon=True).start()
    return jsonify({"ok": True, "message": "sync started"})

@app.route("/api/sync/reset", methods=["POST"])
def api_sync_reset():
    sync._clear_stuck_sync_flag()
    return jsonify({"ok": True})

@app.route("/api/sync/status")
def api_sync_status():
    state    = sync.load_state()
    settings = sync.load_settings()
    items    = db.get_all_media()
    new_count = sum(1 for i in items if i.get("is_new"))
    return jsonify({
        "ok":              True,
        "running":         state.get("sync_running", False),
        "last_sync_at":    state.get("last_sync_at"),
        "last_synced_id":  state.get("last_synced_id", 0),
        "new_count":       new_count,
        "interval_minutes": settings.get("sync_interval_minutes", 30),
        "auto_enabled":    settings.get("auto_sync_enabled", True),
    })

@app.route("/api/seen", methods=["POST"])
def api_seen():
    sync.mark_seen()
    return jsonify({"ok": True})

@app.route("/api/logs")
def api_logs():
    return jsonify({"ok": True, "data": sync.get_logs()})

# ── Bluetooth wake ────────────────────────────────────────────────────────

try:
    import bleak  # noqa: F401
    _HAS_BLEAK = True
except ImportError:
    _HAS_BLEAK = False

@app.route("/api/bt/wake", methods=["POST"])
def api_bt_wake():
    if not _HAS_BLEAK:
        return jsonify({"ok": False, "error": "Bluetooth nicht verfügbar (bleak nicht installiert)"}), 501
    mac = sync.load_settings().get("bt_mac_address", "")
    if not mac:
        return jsonify({"ok": False, "error": "Keine MAC-Adresse konfiguriert"}), 400
    try:
        sync.bt_wake(mac)
        return jsonify({"ok": True})
    except Exception as e:
        logging.getLogger("gardepro.bt").error("BT wake fehlgeschlagen: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500



# ── Settings ──────────────────────────────────────────────────────────────

@app.route("/api/wifi/adapters", methods=["GET"])
def api_wifi_adapters():
    import subprocess, platform
    if platform.system().lower() != "windows":
        return jsonify({"ok": True, "data": []})
    try:
        out = subprocess.check_output(["netsh", "wlan", "show", "interfaces"], encoding="cp850", errors="ignore")
        adapters = []
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("Name"):
                parts = line.split(":", 1)
                if len(parts) == 2:
                    adapters.append(parts[1].strip())
        return jsonify({"ok": True, "data": adapters})
    except Exception:
        return jsonify({"ok": True, "data": []})

@app.route("/api/settings", methods=["GET"])
def api_settings_get():
    return jsonify({"ok": True, "data": sync.load_settings()})

@app.route("/api/settings/reset-sync", methods=["POST"])
def api_settings_reset_sync():
    """Reset last_synced_id to 0 to force a full re-scan."""
    sync.reset_sync_state()
    return jsonify({"ok": True})

@app.route("/api/settings", methods=["POST"])
def api_settings_post():
    body = request.get_json(silent=True) or {}
    settings = sync.load_settings()
    allowed = {"camera_ip", "camera_port", "sync_interval_minutes", "auto_sync_enabled", "bt_mac_address", "wifi_ssid", "wifi_password", "wifi_adapter", "use_native_thumbnails", "immich_enabled", "immich_server_url", "immich_api_key", "immich_album_name"}
    for k, v in body.items():
        if k in allowed:
            settings[k] = v
    sync.save_settings(settings)
    return jsonify({"ok": True, "data": settings})

# ── Camera keep-alive ─────────────────────────────────────────────────────

import time as _time

_keepalive_lock = threading.Lock()
_keepalive_stop = threading.Event()
_keepalive_thread: threading.Thread | None = None
_keepalive_last_activity: float = 0
_KEEPALIVE_TIMEOUT = 120  # seconds of inactivity before stopping

def _keepalive_loop():
    """Send keep-alive every 8s until timeout or stop event."""
    settings = sync.load_settings()
    ip = settings.get("camera_ip", "192.168.8.1")
    port = int(settings.get("camera_port", 8080))
    s = sync._make_session(ip, port)
    log = logging.getLogger("gardepro.keepalive")
    log.info("Keep-Alive gestartet (Timeout: %ds)", _KEEPALIVE_TIMEOUT)
    while not _keepalive_stop.wait(8):
        elapsed = _time.time() - _keepalive_last_activity
        if elapsed > _KEEPALIVE_TIMEOUT:
            log.info("Keep-Alive gestoppt (keine Aktivitaet seit %ds)", int(elapsed))
            break
        sync._wake(s, ip, port)
    _keepalive_stop.clear()

def _start_keepalive():
    global _keepalive_thread, _keepalive_last_activity
    _keepalive_last_activity = _time.time()
    with _keepalive_lock:
        if _keepalive_thread and _keepalive_thread.is_alive():
            return  # already running
        _keepalive_stop.clear()
        _keepalive_thread = threading.Thread(target=_keepalive_loop, daemon=True)
        _keepalive_thread.start()

def _touch_keepalive():
    global _keepalive_last_activity
    _keepalive_last_activity = _time.time()

def _stop_keepalive():
    _keepalive_stop.set()

@app.route("/api/camera/keepalive", methods=["POST"])
def api_camera_keepalive():
    _touch_keepalive()
    return jsonify({"ok": True})

@app.route("/api/camera/disconnect", methods=["POST"])
def api_camera_disconnect():
    _stop_keepalive()
    return jsonify({"ok": True})

# ── Camera info / settings ────────────────────────────────────────────────

@app.route("/api/camera/connect", methods=["POST"])
def api_camera_connect():
    settings = sync.load_settings()
    ip = settings.get("camera_ip", "192.168.8.1")
    port = int(settings.get("camera_port", 8080))
    mac = settings.get("bt_mac_address", "")
    ssid = settings.get("wifi_ssid", "")
    pwd = settings.get("wifi_password", "")
    adapter = settings.get("wifi_adapter", "")
    ok = sync.auto_connect(ip, port, mac, ssid, pwd, adapter)
    if ok:
        _start_keepalive()
        return jsonify({"ok": True})
    return jsonify({"ok": False, "error": "Verbindung fehlgeschlagen"}), 503

@app.route("/api/camera/raw")
def api_camera_raw():
    """Debug: return raw JSON from all camera info endpoints."""
    settings = sync.load_settings()
    ip = settings.get("camera_ip", "192.168.8.1")
    port = int(settings.get("camera_port", 8080))
    if not sync.is_camera_reachable(ip, port):
        return jsonify({"ok": False, "error": "Kamera nicht erreichbar"}), 503
    raw = {}
    for name, fn in [("info1", sync.get_device_info), ("info2", sync.get_sensors),
                      ("info4", sync.get_clock), ("ir", sync.get_ir_status)]:
        try:
            raw[name] = fn(ip, port)
        except Exception as e:
            raw[name] = {"error": str(e)}
    return jsonify({"ok": True, "data": raw})

@app.route("/api/camera/status")
def api_camera_status():
    settings = sync.load_settings()
    ip = settings.get("camera_ip", "192.168.8.1")
    port = int(settings.get("camera_port", 8080))
    if not sync.is_camera_reachable(ip, port):
        return jsonify({"ok": False, "error": "Kamera nicht erreichbar"}), 503
    _start_keepalive()
    data = {}
    warnings = []
    for name, fn in [("info", sync.get_device_info), ("sensors", sync.get_sensors),
                      ("clock", sync.get_clock), ("ir", sync.get_ir_status)]:
        try:
            result = fn(ip, port)
            if isinstance(result, dict):
                data.update(result.get("data", result))
        except Exception as e:
            warnings.append(f"{name}: {e}")
    resp = {"ok": True, "data": data}
    if warnings:
        resp["warnings"] = warnings
    return jsonify(resp)

@app.route("/api/camera/settings", methods=["POST"])
def api_camera_settings():
    settings = sync.load_settings()
    ip = settings.get("camera_ip", "192.168.8.1")
    port = int(settings.get("camera_port", 8080))
    if not sync.is_camera_reachable(ip, port):
        return jsonify({"ok": False, "error": "Kamera nicht erreichbar"}), 503
    body = request.get_json(silent=True) or {}
    validated = {}
    if "photo_or_video" in body:
        v = int(body["photo_or_video"])
        if v not in (0, 1, 2):
            return jsonify({"ok": False, "error": "photo_or_video muss 0, 1 oder 2 sein"}), 400
        validated["photo_or_video"] = v
    if "photo_quality" in body:
        v = int(body["photo_quality"])
        if v not in (25, 27):
            return jsonify({"ok": False, "error": "photo_quality muss 25 oder 27 sein"}), 400
        validated["photo_quality"] = v
    if not validated:
        return jsonify({"ok": False, "error": "Keine gueltigen Einstellungen"}), 400
    try:
        result = sync.set_camera_setting(ip, port, validated)
        return jsonify({"ok": True, "data": result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# ── Immich ────────────────────────────────────────────────────────────────

@app.route("/api/immich/test", methods=["POST"])
def api_immich_test():
    body = request.get_json(silent=True) or {}
    server_url = body.get("server_url", "").strip()
    api_key = body.get("api_key", "").strip()
    if not server_url or not api_key:
        return jsonify({"ok": False, "error": "URL und API-Key erforderlich"}), 400
    result = immich.test_connection(server_url, api_key)
    return jsonify(result)

@app.route("/api/immich/albums", methods=["POST"])
def api_immich_albums():
    body = request.get_json(silent=True) or {}
    server_url = body.get("server_url", "").strip()
    api_key = body.get("api_key", "").strip()
    if not server_url or not api_key:
        return jsonify({"ok": False, "error": "URL und API-Key erforderlich"}), 400
    try:
        albums = immich.list_albums(server_url, api_key)
        return jsonify({"ok": True, "data": albums})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/immich/status")
def api_immich_status():
    settings = sync.load_settings()
    if not settings.get("immich_enabled") or not settings.get("immich_server_url"):
        return jsonify({"ok": False, "error": "Immich nicht konfiguriert"}), 400
    with db._conn() as con:
        total = con.execute("SELECT COUNT(*) FROM media_items WHERE is_deleted=0").fetchone()[0]
        uploaded = con.execute("SELECT COUNT(*) FROM media_items WHERE is_deleted=0 AND immich_asset_id IS NOT NULL").fetchone()[0]
    return jsonify({"ok": True, "data": {"total": total, "uploaded": uploaded, "pending": total - uploaded}})

@app.route("/api/immich/upload", methods=["POST"])
def api_immich_upload():
    settings = sync.load_settings()
    if not settings.get("immich_server_url") or not settings.get("immich_api_key"):
        return jsonify({"ok": False, "error": "Immich nicht konfiguriert"}), 400
    threading.Thread(target=immich.upload_new_media, args=(settings,), daemon=True).start()
    return jsonify({"ok": True, "message": "Upload gestartet"})

@app.route("/api/immich/validate", methods=["POST"])
def api_immich_validate():
    settings = sync.load_settings()
    if not settings.get("immich_server_url") or not settings.get("immich_api_key"):
        return jsonify({"ok": False, "error": "Immich nicht konfiguriert"}), 400
    threading.Thread(target=immich.validate_immich_sync, args=(settings,), daemon=True).start()
    return jsonify({"ok": True, "message": "Validierung gestartet"})

# ── Media files ───────────────────────────────────────────────────────────

THUMB_DIR = os.path.join(ARCHIVE_DIR, "thumbs")
THUMB_SIZE = (500, 500)

@app.route("/thumbnail/<int:fid>")
def serve_thumbnail(fid):
    thumb_name = f"{fid}.jpg"
    thumb_path = os.path.join(THUMB_DIR, thumb_name)
    if not os.path.exists(thumb_path):
        src = os.path.join(ARCHIVE_DIR, f"{fid}.jpg")
        if not os.path.exists(src):
            return "", 404
        try:
            from PIL import Image
            os.makedirs(THUMB_DIR, exist_ok=True)
            with Image.open(src) as img:
                img.thumbnail(THUMB_SIZE)
                img.save(thumb_path, "JPEG", quality=75, optimize=True)
        except Exception as e:
            logging.getLogger("gardepro.thumb").warning("Thumbnail-Fehler %d: %s", fid, e)
            return send_from_directory(ARCHIVE_DIR, f"{fid}.jpg")
    return send_from_directory(THUMB_DIR, thumb_name)

@app.route("/media/<path:filename>")
def serve_media(filename):
    return send_from_directory(ARCHIVE_DIR, filename)

# ── React app (catch-all — must be LAST route) ────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    return send_from_directory(DIST_DIR, "index.html")

if __name__ == "__main__":
    print(f"Archive : {ARCHIVE_DIR}")
    print(f"Frontend: {DIST_DIR}")
    print("Open    : http://localhost:5000")
    sync.init_scheduler()
    app.run(host="0.0.0.0", port=5000, debug=False)
