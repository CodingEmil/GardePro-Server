import { useState, useEffect, useRef, useCallback } from 'react';
import type { CameraStatus } from '../types';

const KEEPALIVE_TIMEOUT = 120; // seconds — must match backend

const MODE_LABELS: Record<number, string> = { 0: 'Nur Foto', 1: 'Nur Video', 2: 'Foto + Video' };
const QUALITY_LABELS: Record<number, string> = { 25: 'Standard', 27: 'Hoch' };

const DAYNIGHT_LABELS: Record<string, string> = {
  auto_mode: 'Auto',
  day_mode: 'Tag',
  night_mode: 'Nacht',
};

const IR_STATUS_LABELS: Record<string, string> = {
  normal: 'An',
  off: 'Aus',
};

export function CameraPage() {
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  // Connect
  const [connecting, setConnecting] = useState(false);
  const [connectStep, setConnectStep] = useState('');

  // Keep-alive / AFK timer
  const [connected, setConnected] = useState(false);
  const [remaining, setRemaining] = useState(KEEPALIVE_TIMEOUT);
  const lastActivityRef = useRef(Date.now());

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setRemaining(KEEPALIVE_TIMEOUT);
    if (connected) {
      fetch('/api/camera/keepalive', { method: 'POST' }).catch(() => {});
    }
  }, [connected]);

  // Countdown timer
  useEffect(() => {
    if (!connected) return;
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const left = Math.max(0, KEEPALIVE_TIMEOUT - elapsed);
      setRemaining(left);
      if (left === 0) {
        setConnected(false);
        setStatus(null);
        setError('Verbindung getrennt (keine Aktivitaet)');
        fetch('/api/camera/disconnect', { method: 'POST' }).catch(() => {});
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [connected]);

  // Listen for user interaction on the page
  useEffect(() => {
    if (!connected) return;
    const handler = () => touchActivity();
    const events = ['click', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, handler));
    return () => events.forEach(e => window.removeEventListener(e, handler));
  }, [connected, touchActivity]);

  const handleDisconnect = () => {
    fetch('/api/camera/disconnect', { method: 'POST' }).catch(() => {});
    setConnected(false);
    setStatus(null);
    setError('');
  };

  // Settings form
  const [mode, setMode] = useState(0);
  const [quality, setQuality] = useState(25);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    setWarnings([]);
    try {
      const res = await fetch('/api/camera/status');
      const json = await res.json();
      if (json.ok) {
        setStatus(json.data);
        setWarnings(json.warnings || []);
        setConnected(true);
        touchActivity();
      } else {
        setError(json.error || 'Unbekannter Fehler');
        setStatus(null);
      }
    } catch {
      setError('Verbindung zum Server fehlgeschlagen');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectStep('Bluetooth Aufwachsignal...');
    setError('');
    const stepTimer = setTimeout(() => setConnectStep('Verbinde mit WLAN...'), 8000);
    const stepTimer2 = setTimeout(() => setConnectStep('Warte auf Kamera...'), 15000);
    try {
      const res = await fetch('/api/camera/connect', { method: 'POST' });
      const json = await res.json();
      clearTimeout(stepTimer);
      clearTimeout(stepTimer2);
      if (json.ok) {
        setConnectStep('');
        setConnected(true);
        touchActivity();
        await loadStatus();
      } else {
        setError(json.error || 'Verbindung fehlgeschlagen');
        setConnectStep('');
      }
    } catch {
      clearTimeout(stepTimer);
      clearTimeout(stepTimer2);
      setError('Server nicht erreichbar');
      setConnectStep('');
    } finally {
      setConnecting(false);
    }
  };

  const batteryPct = status?.voltage ?? null;
  const batteryColor = (pct: number) =>
    pct > 50 ? 'text-green-400' : pct > 20 ? 'text-yellow-400' : 'text-red-400';

  const handleApply = async () => {
    setApplying(true);
    setApplyResult(null);
    try {
      const res = await fetch('/api/camera/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_or_video: mode, photo_quality: quality }),
      });
      const json = await res.json();
      if (json.ok) {
        setApplyResult({ ok: true, msg: 'Einstellungen angewendet' });
        setTimeout(() => setApplyResult(null), 3000);
      } else {
        setApplyResult({ ok: false, msg: json.error || 'Fehler' });
      }
    } catch {
      setApplyResult({ ok: false, msg: 'Verbindung fehlgeschlagen' });
    } finally {
      setApplying(false);
    }
  };

  // Parse firmware + MCU from combined "ver" field like "V9.2.120 MCU V2.78"
  const parsedVer = status?.ver?.match(/^(V[\d.]+)\s+MCU\s+(V[\d.]+)$/);
  const firmware = parsedVer ? parsedVer[1] : status?.ver || '-';
  const mcu = parsedVer ? parsedVer[2] : '-';

  return (
    <div className="px-4 pb-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between py-4">
        <h2 className="text-text font-semibold">Kamera</h2>
        <div className="flex items-center gap-3">
          {connected && (
            <>
              <span className={`text-xs tabular-nums ${remaining <= 30 ? 'text-yellow-400' : 'text-muted'}`}>
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
              </span>
              <button
                onClick={handleDisconnect}
                className="text-muted hover:text-red-400 transition-colors text-xs"
              >
                Trennen
              </button>
            </>
          )}
          <button
            onClick={() => { touchActivity(); loadStatus(); }}
            disabled={loading}
            className="text-muted hover:text-accent transition-colors text-sm disabled:opacity-40"
          >
            {loading ? 'Lade...' : 'Aktualisieren'}
          </button>
        </div>
      </div>

      {error && !connecting && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-6 text-center">
          <p className="text-muted text-sm mb-3">Kamera nicht verbunden</p>
          <p className="text-red-400 text-xs mb-4">{error}</p>
          <button
            onClick={handleConnect}
            className="bg-accent text-bg rounded px-6 py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Verbinden
          </button>
        </div>
      )}

      {connecting && (
        <div className="bg-surface border border-border rounded-lg p-6 mb-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-accent animate-ping" />
            <p className="text-accent text-sm animate-pulse">{connectStep}</p>
            <p className="text-muted text-xs">Dies kann bis zu 60 Sekunden dauern</p>
          </div>
        </div>
      )}

      {loading && !status && !error && !connecting && (
        <div className="flex justify-center py-12 text-muted text-sm animate-pulse">
          Lade Kamera-Status...
        </div>
      )}

      {status && (
        <>
          {/* Device Info */}
          <div className="bg-surface border border-border rounded-lg p-4 mb-4">
            <h3 className="text-text font-medium text-sm mb-3">Geraet</h3>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
              <div>
                <span className="text-muted block">Produkt</span>
                <span className="text-text">{status.product || status.model || '-'}</span>
              </div>
              <div>
                <span className="text-muted block">Marke</span>
                <span className="text-text">{status.brand || '-'}</span>
              </div>
              <div>
                <span className="text-muted block">Firmware</span>
                <span className="text-text">{firmware}</span>
              </div>
              <div>
                <span className="text-muted block">MCU</span>
                <span className="text-text">{mcu}</span>
              </div>
            </div>
          </div>

          {/* Sensors */}
          <div className="bg-surface border border-border rounded-lg p-4 mb-4">
            <h3 className="text-text font-medium text-sm mb-3">Sensoren</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className={`text-2xl font-bold ${batteryPct != null ? batteryColor(batteryPct) : 'text-muted'}`}>
                  {batteryPct != null ? `${batteryPct}%` : '-'}
                </div>
                <span className="text-muted text-xs">Batterie</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-text">
                  {status.temperature != null ? `${status.temperature}\u00b0C` : '-'}
                </div>
                <span className="text-muted text-xs">Temperatur</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-text">
                  {status.vol_value != null ? `${status.vol_value}` : '-'}
                </div>
                <span className="text-muted text-xs">Spannung (mV)</span>
              </div>
            </div>
            {(status.ext_power != null || status.solar_voltage != null) && (
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border text-xs text-center">
                <div>
                  <span className="text-muted block">Externe Stromversorgung</span>
                  <span className="text-text">{status.ext_power ? 'Ja' : 'Nein'}</span>
                </div>
                <div>
                  <span className="text-muted block">Solar</span>
                  <span className="text-text">{status.solar_voltage != null && status.solar_voltage >= 0 ? `${status.solar_voltage} mV` : 'Nicht angeschlossen'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Clock */}
          <div className="bg-surface border border-border rounded-lg p-4 mb-4">
            <h3 className="text-text font-medium text-sm mb-3">Uhr</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted block">Uhrzeit</span>
                <span className="text-text">{status.clock || '-'}</span>
              </div>
              <div>
                <span className="text-muted block">Zeitzone</span>
                <span className="text-text">{status.tz ?? '-'}</span>
              </div>
            </div>
          </div>

          {/* Night Vision */}
          <div className="bg-surface border border-border rounded-lg p-4 mb-6">
            <h3 className="text-text font-medium text-sm mb-3">Nachtsicht</h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-muted block">IR Status</span>
                <span className="text-text">{status.irStatus ? (IR_STATUS_LABELS[status.irStatus] || status.irStatus) : '-'}</span>
              </div>
              <div>
                <span className="text-muted block">IR Leistung</span>
                <span className="text-text">{status.irPower ?? '-'}</span>
              </div>
              <div>
                <span className="text-muted block">Modus</span>
                <span className="text-text">{status.DayNightMode ? (DAYNIGHT_LABELS[status.DayNightMode] || status.DayNightMode) : '-'}</span>
              </div>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="text-yellow-400 text-xs mb-4">
              {warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}

          {/* Camera Settings */}
          <div className="border-t border-border pt-4">
            <h3 className="text-text font-semibold text-sm mb-4">Kamera-Einstellungen</h3>

            <label className="block text-sm text-muted mb-2">Aufnahme-Modus</label>
            <div className="flex gap-1 mb-4">
              {([0, 1, 2] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setMode(v)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors border ${
                    mode === v
                      ? 'bg-accent text-bg border-accent'
                      : 'border-border text-muted hover:border-accent hover:text-accent'
                  }`}
                >
                  {MODE_LABELS[v]}
                </button>
              ))}
            </div>

            <label className="block text-sm text-muted mb-2">Foto-Qualitaet</label>
            <div className="flex gap-1 mb-6">
              {([25, 27] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setQuality(v)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors border ${
                    quality === v
                      ? 'bg-accent text-bg border-accent'
                      : 'border-border text-muted hover:border-accent hover:text-accent'
                  }`}
                >
                  {QUALITY_LABELS[v]}
                </button>
              ))}
            </div>

            <button
              onClick={handleApply}
              disabled={applying}
              className="w-full bg-accent text-bg rounded py-2 text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-40"
            >
              {applying ? 'Wird angewendet...' : 'Anwenden'}
            </button>

            {applyResult && (
              <p className={`text-xs mt-2 ${applyResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {applyResult.msg}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
