# ── Stage 1: Build React frontend ─────────────────────────────────────────
FROM node:20-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build
# vite outputs to ../dist → /dist in the container

# ── Stage 2: Python backend ──────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# System deps for Pillow and Bluetooth/WLAN (Linux)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libjpeg62-turbo libpng16-16 zlib1g bluez dbus network-manager \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY server.py sync.py db.py immich.py ./

# Frontend build from stage 1
COPY --from=frontend /dist ./dist

# Default data directory
RUN mkdir -p /data/archive /data/thumbs

# Environment defaults
ENV ARCHIVE_DIR=/data/archive
ENV DATA_DIR=/data
ENV PYTHONUNBUFFERED=1

EXPOSE 5000

CMD ["python", "server.py"]
