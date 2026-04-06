"""GardePro sync engine — incremental download + APScheduler + log buffer."""
import atexit, os, json, time, threading, logging
import db
from collections import deque
from datetime import datetime
import requests
from apscheduler.schedulers.background import BackgroundScheduler

# ── In-memory log buffer ──────────────────────────────────────────────────

_log_buffer = deque(maxlen=200)
_log_lock   = threading.Lock()

class _BufferHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        entry = {
            "ts":    datetime.now().strftime("%H:%M:%S"),
            "level": record.levelname,
            "msg":   self.format(record),
        }
        with _log_lock:
            _log_buffer.append(entry)

def get_logs() -> list:
    with _log_lock:
        return list(_log_buffer)

# Attach buffer handler to gardepro logger
_handler = _BufferHandler()
_handler.setFormatter(logging.Formatter("%(message)s"))
log = logging.getLogger("gardepro.sync")
log.setLevel(logging.DEBUG)
log.propagate = False   # prevent double-logging via parent "gardepro" logger
log.addHandler(_handler)

# ── Constants ─────────────────────────────────────────────────────────────

_BASE_DIR = os.path.dirname(__file__)
_DATA_DIR = os.environ.get("DATA_DIR", _BASE_DIR)

ARCHIVE_DIR    = os.path.abspath(os.environ.get("ARCHIVE_DIR", os.path.join(_BASE_DIR, "..", "GardePro_Full_Archive")))
PAPIERKORB_DIR = os.path.abspath(os.path.join(ARCHIVE_DIR, "..", "GardePro_Papierkorb"))
STATE_FILE    = os.path.join(_DATA_DIR, "state.json")
SETTINGS_FILE = os.path.join(_DATA_DIR, "settings.json")
USER_AGENT    = "Dalvik/2.1.0 (Linux; U; Android 13)"
SCAN_START_OFFSET = 9999   # forces camera to jump to newest item

_state_lock = threading.Lock()
_scheduler  = BackgroundScheduler(timezone='Europe/Berlin')
_scheduler.start()
atexit.register(_scheduler.shutdown)   # clean shutdown on Ctrl+C / process exit

# ── Settings ──────────────────────────────────────────────────────────────

DEFAULT_SETTINGS = {
    "camera_ip": "192.168.8.1",
    "camera_port": 8080,
    "sync_interval_minutes": 30,
    "auto_sync_enabled": True,
    "bt_mac_address": "",
    "wifi_ssid": "",
    "wifi_password": "",
    "wifi_adapter": "",
    "use_native_thumbnails": False,
    "immich_enabled": False,
    "immich_server_url": "",
    "immich_api_key": "",
    "immich_album_name": "",
}

# Mapping: env var name → (settings key, type converter)
_ENV_MAP = {
    "CAMERA_IP":             ("camera_ip",             str),
    "CAMERA_PORT":           ("camera_port",           int),
    "SYNC_INTERVAL_MINUTES": ("sync_interval_minutes", int),
    "AUTO_SYNC_ENABLED":     ("auto_sync_enabled",     lambda v: v.lower() in ("1", "true", "yes")),
    "BT_MAC_ADDRESS":        ("bt_mac_address",        str),
    "WIFI_SSID":             ("wifi_ssid",             str),
    "WIFI_PASSWORD":         ("wifi_password",         str),
    "WIFI_ADAPTER":          ("wifi_adapter",          str),
    "IMMICH_ENABLED":        ("immich_enabled",        lambda v: v.lower() in ("1", "true", "yes")),
    "IMMICH_SERVER_URL":     ("immich_server_url",     str),
    "IMMICH_API_KEY":        ("immich_api_key",        str),
    "IMMICH_ALBUM_NAME":     ("immich_album_name",     str),
}

def _env_settings() -> dict:
    """Read settings from environment variables (middle priority layer)."""
    result = {}
    for env_key, (setting_key, converter) in _ENV_MAP.items():
        val = os.environ.get(env_key)
        if val is not None:
            try:
                result[setting_key] = converter(val)
            except (ValueError, TypeError):
                pass
    return result

def load_settings() -> dict:
    # Priority: DEFAULT_SETTINGS < env vars < settings.json (UI)
    merged = {**DEFAULT_SETTINGS, **_env_settings()}
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE) as f:
            merged.update(json.load(f))
    return merged

def save_settings(settings: dict) -> None:
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)
    _reschedule(settings)

# ── State ─────────────────────────────────────────────────────────────────

DEFAULT_STATE = {
    "last_synced_id": 0,
    "new_since_id":   0,
    "last_sync_at":   None,
    "sync_running":   False,
}

def load_state() -> dict:
    with _state_lock:
        return _read_state()

def _read_state() -> dict:
    """Read state file. Call only while _state_lock is held."""
    if not os.path.exists(STATE_FILE):
        return dict(DEFAULT_STATE)
    with open(STATE_FILE) as f:
        return {**DEFAULT_STATE, **json.load(f)}

def _init_state_from_archive() -> None:
    """
    First-run bootstrap: if state.json is missing but archive already has files
    (e.g. user ran the original sync script), seed last_synced_id and new_since_id
    from the highest numeric filename so we skip re-scanning known items and avoid
    showing every existing file as NEU.
    """
    with _state_lock:
        if os.path.exists(STATE_FILE):
            return
        if not os.path.isdir(ARCHIVE_DIR):
            return
        max_id = 0
        for name in os.listdir(ARCHIVE_DIR):
            stem = os.path.splitext(name)[0]
            if stem.isdigit():
                max_id = max(max_id, int(stem))
        if max_id > 0:
            state = {**DEFAULT_STATE, "last_synced_id": max_id, "new_since_id": max_id}
            _write_state(state)
            log.info("Bootstrap: %d vorhandene Dateien erkannt, last_synced_id=%d", max_id, max_id)

def _write_state(state: dict) -> None:
    """Write state file. Call only while _state_lock is held."""
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

def mark_seen() -> None:
    with _state_lock:
        state = _read_state()
        state["new_since_id"] = state["last_synced_id"]
        _write_state(state)
    db.mark_all_seen()

def reset_sync_state() -> None:
    """Reset the sync progress so the next sync scans all camera files from scratch."""
    with _state_lock:
        state = _read_state()
        state["last_synced_id"] = 0
        state["new_since_id"] = 0
        _write_state(state)
        log.info("Sync-Status (last_synced_id) manuell auf 0 zurückgesetzt.")

# ── Camera HTTP session ────────────────────────────────────────────────────

def _make_session(ip: str, port: int) -> requests.Session:
    s = requests.Session()
    s.trust_env = False
    s.headers.update({"User-Agent": USER_AGENT, "Connection": "keep-alive"})
    return s

def _wake(session: requests.Session, ip: str, port: int) -> None:
    """Keep-alive: camera drops WiFi after ~10 s without this."""
    try:
        session.get(f"http://{ip}:{port}/cmd/standby/reset", timeout=2)
    except Exception:
        pass

def _get_list(session, ip: str, port: int, offset: int) -> list | None:
    """
    Fetch one page of camera list.
    Returns list on success (may be empty = genuine end of content),
    None if all retries failed (camera unreachable).
    """
    url = f"http://{ip}:{port}/list/detail/backward/{offset}/40"
    for attempt in range(3):
        _wake(session, ip, port)
        try:
            resp = session.get(url, timeout=5)
            if resp.status_code != 200:
                return []
            return resp.json().get("data", [])
        except ValueError as e:
            # Firmware glitch: corrupt JSON ("Unexpected character")
            log.warning("Korruptes JSON bei Offset %d (Versuch %d): %s", offset, attempt + 1, e)
            time.sleep(0.3)
        except Exception as e:
            log.warning("Listen-Fehler bei Offset %d: %s", offset, e)
            time.sleep(0.5)
    return None  # all retries exhausted = camera unreachable

# ── Incremental scan ──────────────────────────────────────────────────────

def _scan_new_items(session, ip: str, port: int, last_id: int) -> dict:
    """
    Return {id: item} for all camera items with id > last_id.
    Start at SCAN_START_OFFSET (9999) — forces camera to newest item.
    Stair-step: next offset = min(batch_ids) - 1.
    Stop when entire batch has id <= last_id (nothing new).
    Aborts immediately if camera is unreachable (None from _get_list).
    """
    discovered = {}
    offset     = SCAN_START_OFFSET
    log.info("Scan startet ab Offset %d (letzte bekannte ID: %d)", offset, last_id)

    while offset > 0:
        items = _get_list(session, ip, port, offset)
        if items is None:
            log.error("Kamera nicht erreichbar — Scan abgebrochen")
            raise ConnectionError("Kamera nicht erreichbar")
        if not items:
            # Genuine empty page (past end of camera content) — skip ahead
            offset -= 40
            continue

        new_items = [i for i in items if i.get("id", 0) > last_id]
        if not new_items:
            log.info("Alle Items in diesem Batch bereits bekannt — Scan beendet")
            break

        for i in new_items:
            discovered[i["id"]] = i

        offset = min(i["id"] for i in items) - 1   # stair-step

    log.info("%d neue Items gefunden", len(discovered))
    return discovered

# ── Download ──────────────────────────────────────────────────────────────

def _download_item(session, ip: str, port: int, item: dict) -> bool:
    fid  = item["id"]
    # type 1 = JPG (verified), type 2 = MP4 (unverified — may be /VIDEO or /MOV)
    ext  = "jpg" if item.get("type") == 1 else "mp4"
    path = os.path.join(ARCHIVE_DIR, f"{fid}.{ext}")
    temp_path = path + ".temp"

    if db.is_downloaded(fid) and os.path.exists(path):
        return True

    url = f"http://{ip}:{port}/file/{fid}/{ext.upper()}"
    for attempt in range(3):
        try:
            r = session.get(url, timeout=45, stream=True)
            if r.status_code == 200:
                with open(temp_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=128 * 1024):
                        if chunk:
                            f.write(chunk)
                os.replace(temp_path, path)
                fsize = os.path.getsize(path)
                db.insert_media(fid, f"{fid}.{ext}", "video" if ext == "mp4" else "photo", fsize, item)
                # Native thumbnail download (best-effort)
                if load_settings().get("use_native_thumbnails"):
                    thumb_dir = os.path.join(ARCHIVE_DIR, "thumbs")
                    thumb_path = os.path.join(thumb_dir, f"{fid}.jpg")
                    if not os.path.exists(thumb_path):
                        download_native_thumbnail(session, ip, port, fid, thumb_path)
                log.info("✓ %s.%s heruntergeladen", fid, ext)
                return True
            log.warning("HTTP %d für %s.%s", r.status_code, fid, ext)
        except Exception as e:
            if attempt < 2:
                log.warning("Retry %d für %s: %s", attempt + 1, fid, e)
                time.sleep(1)
            else:
                log.error("TIMEOUT %s.%s nach 3 Versuchen", fid, ext)
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
    return False

# ── Main sync job ─────────────────────────────────────────────────────────


import subprocess
import platform
import asyncio

BT_WAKE_UUID = "6e400004-b5a3-f393-e0a9-e50e24dcca9e"
BT_WAKE_PAYLOAD = b"AT+WAKEPULSE=10\r\n"

async def _bt_wake_async(mac: str) -> None:
    from bleak import BleakClient, BleakScanner
    import asyncio
    
    log.info("Suche Bluetooth-Gerät %s (Scan für 10s)...", mac)
    device = await BleakScanner.find_device_by_address(mac, timeout=10.0)
    
    if device is None:
        log.warning("Gerät nicht im Scan gefunden. Versuche direkte Verbindung (Fallback)...")
        device = mac  # Fallback auf reinen String für BleakClient
    else:
        log.info("Gerät im Suchlauf gefunden: %s", device.name or "Unbekannt")

    # Versuche die Verbindung maximal 3 Mal aufzubauen
    for attempt in range(1, 4):
        try:
            log.info("Verbindungsversuch %d/3 via Bluetooth...", attempt)
            async with BleakClient(device, timeout=20.0) as client:
                log.info("Verbunden! Sende Aufwachsignal...")
                for i in range(3):
                    await client.write_gatt_char(BT_WAKE_UUID, BT_WAKE_PAYLOAD)
                    await asyncio.sleep(0.5)
                await asyncio.sleep(2)
            log.info("Aufwachsignal erfolgreich gesendet.")
            return
        except Exception as e:
            log.warning("Fehler bei Verbindungsversuch %d: %s", attempt, e)
            if attempt == 3:
                raise
            await asyncio.sleep(2)

def bt_wake(mac: str) -> None:
    asyncio.run(_bt_wake_async(mac))

def ping_camera(ip: str) -> bool:
    param = "-n" if platform.system().lower() == "windows" else "-c"
    cmd = ["ping", param, "1", "-w" if param == "-n" else "-W", "1000", ip]
    return subprocess.call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0

def is_camera_reachable(ip: str, port: int) -> bool:
    import requests
    try:
        # Check an actual camera API endpoint instead of just a raw TCP port.
        # This prevents false positives if the user's home router uses 192.168.8.1:8080
        url = f"http://{ip}:{port}/list/detail/backward/0/1"
        res = requests.get(url, timeout=2.0)
        # Even if it returns 400 or something, the fact it responds HTTP confirms it's a web server.
        # Ideally, it returns 200 OK from the camera firmware.
        if "data" in res.text or res.status_code == 200:
            return True
        return False
    except Exception:
        return False

def connect_wlan(ssid: str, pwd: str = "", adapter: str = "") -> bool:
    if not ssid: return False
    log.info(f"Verbinde mit WLAN '{ssid}'...")
    if platform.system().lower() == "windows":
        if pwd:
            import tempfile
            config = f"""<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{ssid}</name>
    <SSIDConfig>
        <SSID>
            <name>{ssid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>{pwd}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>"""
            profile_path = os.path.join(tempfile.gettempdir(), f"{ssid}.xml")
            with open(profile_path, "w", encoding="utf-8") as f:
                f.write(config)
            cmd_add = ["netsh", "wlan", "add", "profile", f"filename={profile_path}"]
            if adapter:
                cmd_add.append(f"interface={adapter}")
            subprocess.call(cmd_add, stdout=subprocess.DEVNULL)
            try:
                os.remove(profile_path)
            except Exception:
                pass
        cmd_connect = ["netsh", "wlan", "connect", f"name={ssid}"]
        if adapter:
            cmd_connect.append(f"interface={adapter}")
        subprocess.call(cmd_connect, stdout=subprocess.DEVNULL)
        return True
    elif platform.system().lower() == "linux":
        cmd_connect = ["nmcli", "dev", "wifi", "connect", ssid]
        if pwd:
            cmd_connect.extend(["password", pwd])
        if adapter:
            cmd_connect.extend(["ifname", adapter])
            
        for attempt in range(1, 4):
            try:
                # Trigger a scan first
                subprocess.run(["nmcli", "dev", "wifi", "rescan"], capture_output=True, timeout=10)
            except Exception:
                pass
                
            try:
                res = subprocess.run(cmd_connect, capture_output=True, text=True, timeout=20)
                if res.returncode == 0:
                    log.info(f"[OK] nmcli erfolgreich verbunden.")
                    return True
                else:
                    if "No network with SSID" in res.stderr and attempt < 3:
                        log.warning(f"[WRN] WLAN '{ssid}' (noch) nicht gefunden. Warte auf Kamera AP (Versuch {attempt}/3)...")
                        time.sleep(5)
                    else:
                        log.warning(f"[WRN] nmcli Warnung/Fehler: {res.stderr.strip()[:100]}... {res.stdout.strip()[:100]}")
                        if attempt == 3 or "No network with SSID" not in res.stderr:
                            break
            except Exception as e:
                log.error(f"[ERR] Exception bei WLAN via nmcli: {e}")
                break
        return False
    return False

def auto_connect(ip: str, port: int, mac: str, ssid: str, pwd: str = "", adapter: str = "") -> bool:
    log.info("=== Schritt 1: Prüfe Kamera-Verbindung (%s:%s) ===", ip, port)
    if is_camera_reachable(ip, port):
        log.info("[OK] Kamera-Netzwerk ist bereits aktiv und antwortet.")
        return True

    log.info("[WAIT] Kamera (noch) nicht erreichbar. Gehe zu Bluetooth-Weckruf...")
    log.info("=== Schritt 2: Bluetooth Aufwachsignal ===")
    if mac:
        try:
            bt_wake(mac)
            log.info("[OK] Bluetooth Aufwachsignal erfolgreich gesendet.")
        except Exception as e:
            log.error("[ERR] Bluetooth Wake fehlgeschlagen: %s", e)
            if "No such file or directory" in str(e) or "ENOENT" in str(e) or getattr(e, "errno", None) == 2:
                log.error("TIPP: Wenn dieses Skript in Docker läuft, fehlt der Zugriff auf Bluetooth (D-Bus).")
                log.error("-> Bitte in 'docker-compose.yml' den Linux-Hardware-Bereich einkommentieren:")
                log.error("   Speziell: network_mode: 'host', privileged: true und das Volume für /var/run/dbus")
            log.error("=> Abbruch: Ohne erfolgreichen Bluetooth-Weckruf wird kein WLAN-Aufbau versucht.")
            return False
    else:
        log.warning("[WARN] Keine Bluetooth MAC-Adresse hinterlegt.")

    log.info("Warte 5s auf den Start des Kamera-WLANs...")
    time.sleep(5)

    log.info("=== Schritt 3: Suche nach Kamera-WLAN ===")
    if not ssid and platform.system().lower() == "windows":
        log.info("Keine WLAN SSID hinterlegt. Suche automatisch nach 'GardePro' WLAN...")
        for _ in range(4):
            try:
                output = subprocess.check_output(["netsh", "wlan", "show", "networks"], errors="ignore")
                for line in output.splitlines():
                    if "SSID" in line and "GardePro" in line:
                        parts = line.split(":")
                        if len(parts) >= 2:
                            ssid = parts[1].strip()
                            log.info("[OK] Kamera-WLAN '%s' gefunden!", ssid)
                            break
            except Exception:
                pass
            if ssid:
                break
            time.sleep(3)

    log.info("=== Schritt 4: Verbinde mit WLAN ===")
    if ssid:
        success = connect_wlan(ssid, pwd, adapter)
        if success:
            log.info("[OK] WLAN Verbindungsbefehl für '%s' erfolgreich.", ssid)
        else:
            log.warning("[WRN] WLAN-Befehl fehlerhaft oder Kamera-AP (%s) nicht sichtbar.", ssid)
    else:
        log.warning("[ERR] Kein GardePro WLAN gefunden und keine SSID in Einstellungen hinterlegt.")

    log.info("=== Schritt 5: Warte auf Netzwerk-Antwort (Timeout 40s) ===")
    for i in range(40):
        if is_camera_reachable(ip, port):
            log.info("[OK] Kamera ist jetzt sicher erreichbar!")
            return True
        if i % 10 == 0 and i > 0:
            log.info("... warte weiter (%d/40 Sekunden)", i)
        time.sleep(1)

    log.error("[ERR] Timeout: Kamera antwortet nicht nach Einwahl.")
    return False

# ── Camera info / settings endpoints ─────────────────────────────────────

def _camera_get(ip: str, port: int, path: str) -> dict:
    """GET a camera endpoint and return parsed JSON."""
    s = _make_session(ip, port)
    _wake(s, ip, port)
    r = s.get(f"http://{ip}:{port}{path}", timeout=5)
    r.raise_for_status()
    return r.json()


def get_device_info(ip: str, port: int) -> dict:
    return _camera_get(ip, port, "/cmd/info/1")


def get_sensors(ip: str, port: int) -> dict:
    return _camera_get(ip, port, "/cmd/info/2")


def get_clock(ip: str, port: int) -> dict:
    return _camera_get(ip, port, "/cmd/info/4")


def get_ir_status(ip: str, port: int) -> dict:
    return _camera_get(ip, port, "/media/getIrStatus")


def set_camera_setting(ip: str, port: int, data: dict) -> dict:
    """POST camera settings. data e.g. {"photo_or_video": 1, "photo_quality": 25}"""
    s = _make_session(ip, port)
    _wake(s, ip, port)
    r = s.post(
        f"http://{ip}:{port}/cmd/setSetting",
        json={"data": data},
        timeout=5,
    )
    r.raise_for_status()
    return r.json()


def download_native_thumbnail(session, ip: str, port: int, fid: int, dest_path: str) -> bool:
    """Download camera-native thumbnail. Returns True on success."""
    try:
        _wake(session, ip, port)
        r = session.get(f"http://{ip}:{port}/thumb/{fid}/JPG", timeout=10)
        if r.status_code == 200 and len(r.content) > 0:
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, "wb") as f:
                f.write(r.content)
            return True
    except Exception as e:
        log.warning("Native Thumbnail fehlgeschlagen fuer %d: %s", fid, e)
    return False


def run_sync() -> dict:
    """Run one incremental sync cycle. Thread-safe, idempotent."""
    with _state_lock:
        state = _read_state()
        if state.get("sync_running"):
            log.warning("Sync bereits aktiv — übersprungen")
            return {"skipped": True, "reason": "already running"}
        state["sync_running"] = True
        _write_state(state)

    settings  = load_settings()
    ip, port  = settings.get("camera_ip", "192.168.8.1"), int(settings.get("camera_port", 8080))
    mac       = settings.get("bt_mac_address", "")
    ssid      = settings.get("wifi_ssid", "")
    pwd       = settings.get("wifi_password", "")
    adapter   = settings.get("wifi_adapter", "")
    last_id   = state.get("last_synced_id", 0)
    
    log.info("=========================================")
    log.info("      NEUER SYNC PROZESS GESTARTET       ")
    log.info("=========================================")
    
    if not auto_connect(ip, port, mac, ssid, pwd, adapter):
        log.error(f"Kamera (IP {ip}) nicht erreichbar. Sync abgebrochen.")
        with _state_lock:
            state = _read_state()
            state["sync_running"] = False
            _write_state(state)
        return {"skipped": True, "reason": "not reachable after auto_connect"}

    session   = _make_session(ip, port)
    new_count = 0
    errors    = []

    log.info("=== Schritt 6: Lade Kamera-Daten herunter ===")
    os.makedirs(ARCHIVE_DIR, exist_ok=True)

    try:
        discovered = _scan_new_items(session, ip, port, last_id)

        # Globaler Keep-Alive während des Downloads
        stop_keepalive = threading.Event()
        def _global_keepalive():
            while not stop_keepalive.wait(8):
                _wake(session, ip, port)

        if discovered:
            ka_thread = threading.Thread(target=_global_keepalive, daemon=True)
            ka_thread.start()

        try:
            from concurrent.futures import ThreadPoolExecutor, as_completed
            # 5 Worker simulieren die App (schnell, aber stabil für die Kamera-Hardware)
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = {
                    executor.submit(_download_item, session, ip, port, item): fid
                    for fid, item in sorted(discovered.items(), reverse=True)
                }
                
                for future in as_completed(futures):
                    fid = futures[future]
                    try:
                        success = future.result()
                        if success:
                            new_count += 1
                        else:
                            errors.append(fid)
                    except Exception as e:
                        log.error("Unerwarteter Fehler bei %s: %s", fid, e)
                        errors.append(fid)
        finally:
            if discovered:
                stop_keepalive.set()

        with _state_lock:
            state = _read_state()
            if discovered:
                state["last_synced_id"] = max(discovered.keys())
            state["last_sync_at"]  = datetime.now().isoformat()
            state["sync_running"]  = False
            _write_state(state)

        log.info("=== Sync fertig: %d neu, %d Fehler ===", new_count, len(errors))


    except Exception as e:
        log.error("Sync fehlgeschlagen: %s", e)
        errors.append(str(e))
        with _state_lock:
            state = _read_state()
            state["sync_running"] = False
            _write_state(state)

    return {"new_count": new_count, "errors": errors}

# ── Scheduler ─────────────────────────────────────────────────────────────

def run_immich_upload() -> None:
    """Independent scheduler job for Immich upload to avoid blocking camera Wi-Fi."""
    with _state_lock:
        state = _read_state()
        if state.get("sync_running"):
            log.info("Immich-Upload uebersprungen — Kamera-Sync laeuft gerade aktiv.")
            return

    settings = load_settings()
    if settings.get("immich_enabled") and settings.get("immich_server_url") and settings.get("immich_api_key"):
        try:
            import immich
            log.info("Starte unabhaengigen Immich-Upload...")
            result = immich.upload_new_media(settings)
            # Only print log if there was actually something to upload or errors occurred
            if result.get("uploaded", 0) > 0 or result.get("errors", 0) > 0:
                log.info("Immich: %d hochgeladen, %d Fehler", result.get("uploaded", 0), result.get("errors", 0))
        except Exception as ie:
            log.error("Immich-Upload fehlgeschlagen: %s", ie)

def _reschedule(settings: dict) -> None:
    interval = settings.get("sync_interval_minutes", 30)
    enabled  = settings.get("auto_sync_enabled", True)
    immich_enabled = settings.get("immich_enabled", False)

    if _scheduler.get_job("sync"):
        _scheduler.remove_job("sync")
    if _scheduler.get_job("immich_sync"):
        _scheduler.remove_job("immich_sync")

    if enabled and interval > 0:
        _scheduler.add_job(run_sync, "interval", minutes=interval, id="sync")
        log.info("Scheduler: Kamera-Sync alle %d Minuten", interval)
    else:
        log.info("Scheduler: Kamera-Sync deaktiviert (nur manuell)")

    if immich_enabled:
        _scheduler.add_job(run_immich_upload, "interval", minutes=15, id="immich_sync")
        log.info("Scheduler: Immich-Upload alle 15 Minuten")

def _clear_stuck_sync_flag() -> None:
    """Reset sync_running on startup — any in-progress sync from a previous process is dead."""
    with _state_lock:
        state = _read_state()
        if state.get("sync_running"):
            state["sync_running"] = False
            _write_state(state)
            log.warning("Sync-Flag zurückgesetzt (Server-Neustart während laufendem Sync)")

def init_scheduler() -> None:
    _clear_stuck_sync_flag()     # reset stale sync_running flag from previous process
    _init_state_from_archive()   # seed from existing files on first run
    db.init_db()                 # create/migrate SQLite DB
    _reschedule(load_settings())
