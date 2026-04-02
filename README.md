# 🦌 GardePro Gallery

Eine selbst gehostete Web-Galerie für **GardePro Wildkameras**. Die App verbindet sich automatisch per Bluetooth und WLAN mit der Kamera, lädt neue Fotos und Videos herunter und zeigt sie in einer modernen Browser-Oberfläche an.

## ✨ Features

- **Automatischer Sync** — Verbindet sich per BLE-Wakeup → WLAN → HTTP mit der Kamera und lädt neue Medien herunter
- **Web-Galerie** — React-Frontend mit Thumbnail-Grid, Lightbox, Favoriten und Papierkorb
- **Kamera-Steuerung** — Einstellungen der Kamera (Foto/Video-Modus, Qualität) direkt aus dem Browser ändern
- **Immich-Integration** — Automatischer Upload neuer Medien an einen [Immich](https://immich.app/)-Server
- **Geplanter Sync** — Konfigurierbarer Intervall-Sync über APScheduler
- **Docker-fähig** — Einfaches Deployment mit Docker Compose

## 🚀 Schnellstart

### Docker Compose (empfohlen)

```bash
git clone https://github.com/CodingEmil/GardePro.git
cd GardePro/gardepro-gallery
docker compose up -d
```

Die Galerie ist unter **http://localhost:5000** erreichbar.

Medien und Datenbank werden im Ordner `./data/` gespeichert.

> **Hinweis zu Bluetooth & WLAN (OS-abhängig):**
> Docker isoliert den Hardware-Zugriff.
> - **Unter Linux (z. B. Raspberry Pi, Debian)**: Docker kann mit entsprechenden Rechten auf lokales WLAN und Bluetooth zugreifen. In der `docker-compose.yml` ist am Ende ein entsprechender Block vorbereitet, den du für Linux einfach einkommentieren (die `#` am Zeilenanfang entfernen) musst.
> - **Unter Windows / macOS**: Docker Desktop läuft in einer virtuellen Maschine (WSL2/Hyper-V). Der direkte Zugriff auf die PC-interne WLAN- und Bluetooth-Hardware aus dem Container heraus ist daher **nicht** möglich. Wenn du das Projekt auf Windows betreibst und die automatische Kamera-Verbindung nutzen willst, musst du die **native Ausführung** (siehe unten) verwenden.

### Nativ (Windows)

Voraussetzungen: **Python 3.10+** und **Node.js 18+**

```powershell
# Repository klonen
git clone https://github.com/CodingEmil/GardePro.git
cd GardePro\gardepro-gallery

# Alles starten (Server + Frontend)
.\start.ps1
```

Das Startskript:
1. Installiert Python-Abhängigkeiten (`requirements.txt`)
2. Startet den Flask-Server auf Port 5000
3. Installiert npm-Pakete und startet den Vite-Dev-Server auf Port 5173

Für den **Produktions-Modus** (ohne Vite-Dev-Server):
```powershell
cd frontend
npm install
npm run build
cd ..
python server.py
```

## ⚙️ Konfiguration

Alle Einstellungen können über die **Web-Oberfläche** (Zahnrad-Icon) geändert werden:

| Einstellung | Beschreibung |
|---|---|
| Kamera-IP | IP-Adresse der Kamera im WLAN (Standard: `192.168.8.1`) |
| Kamera-Port | HTTP-Port der Kamera (Standard: `8080`) |
| Sync-Intervall | Automatischer Sync alle X Minuten |
| BT MAC-Adresse | Bluetooth MAC der Kamera für Wake-up |
| WLAN SSID/Passwort | Zugangsdaten des Kamera-WLANs |
| Immich | Server-URL, API-Key und Album-Name für Immich-Upload |

Die Konfiguration wird in `settings.json` gespeichert (siehe `settings.example.json` als Vorlage).

### Umgebungsvariablen (Docker)

| Variable | Standard | Beschreibung |
|---|---|---|
| `ARCHIVE_DIR` | `/data/archive` | Verzeichnis für heruntergeladene Medien |
| `DATA_DIR` | `/data` | Verzeichnis für Datenbank und State-Dateien |
| `TZ` | `Europe/Berlin` | Zeitzone |

## 🏗️ Architektur

```
┌─────────────────────────────────────────────┐
│               Browser (React)               │
│  Galerie · Lightbox · Kamera · Einstellungen│
└────────────────────┬────────────────────────┘
                     │ HTTP API
┌────────────────────┴────────────────────────┐
│             Flask Server (Python)            │
│  /api/media · /api/sync · /api/camera · ... │
├──────────────────────────────────────────────┤
│  sync.py      │ db.py (SQLite) │ immich.py  │
│  BLE + WLAN   │ Medien-DB      │ Upload API │
└───────┬───────┴────────────────┴────────────┘
        │ HTTP / BLE
┌───────┴───────┐
│  GardePro Cam │
└───────────────┘
```

## 📁 Projektstruktur

```
gardepro-gallery/
├── server.py              # Flask REST-API
├── sync.py                # Kamera-Sync-Engine (BLE, WLAN, Download)
├── db.py                  # SQLite-Datenbank
├── immich.py              # Immich-API-Integration
├── requirements.txt       # Python-Abhängigkeiten
├── start.ps1              # Windows-Startskript
├── Dockerfile             # Multi-Stage Docker Build
├── docker-compose.yml     # Docker Compose Konfiguration
├── frontend/              # React + Vite + TypeScript
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/    # UI-Komponenten
│   │   ├── hooks/         # React Hooks
│   │   └── utils/         # Hilfsfunktionen
│   └── package.json
└── settings.example.json  # Beispiel-Konfiguration
```

## 📜 Lizenz

MIT
