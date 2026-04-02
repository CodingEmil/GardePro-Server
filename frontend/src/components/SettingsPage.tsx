import { useState, useEffect, useRef } from 'react';
import type { Settings } from '../types';

const INTERVALS = [
  { label: 'Manuell', value: 0 },
  { label: '5 Minuten', value: 5 },
  { label: '15 Minuten', value: 15 },
  { label: '30 Minuten', value: 30 },
  { label: '1 Stunde', value: 60 },
  { label: '2 Stunden', value: 120 },
];

const BT_STEPS = [
  { at: 0,    text: 'Verbinde per Bluetooth…' },
  { at: 2000, text: 'Sende Aufweck-Befehl (1/3)…' },
  { at: 2600, text: 'Sende Aufweck-Befehl (2/3)…' },
  { at: 3200, text: 'Sende Aufweck-Befehl (3/3)…' },
  { at: 3800, text: 'Warte auf WLAN-Start…' },
];

export function SettingsPage() {
  const [form, setForm]         = useState<Settings | null>(null);
  const [adapters, setAdapters] = useState<string[]>([]);
  const [saved, setSaved]       = useState(false);
  const [btStatus, setBtStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [btStep, setBtStep]     = useState('');
  const [btError, setBtError]   = useState('');
  const timersRef               = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [immichStatus, setImmichStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [immichError, setImmichError]   = useState('');

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(j => setForm(j.data));
    fetch('/api/wifi/adapters').then(r => r.json()).then(j => setAdapters(j.data || []));
  }, []);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const handleBtWake = async () => {
    clearTimers();
    setBtStatus('loading');
    setBtError('');
    setBtStep(BT_STEPS[0].text);
    for (const step of BT_STEPS.slice(1)) {
      const t = setTimeout(() => setBtStep(step.text), step.at);
      timersRef.current.push(t);
    }
    if (form) {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bt_mac_address: form.bt_mac_address }),
      });
    }
    try {
      const res  = await fetch('/api/bt/wake', { method: 'POST' });
      const json = await res.json();
      clearTimers();
      if (json.ok) {
        setBtStep('');
        setBtStatus('ok');
        setTimeout(() => setBtStatus('idle'), 4000);
      } else {
        setBtStep('');
        setBtError(json.error ?? 'Unbekannter Fehler');
        setBtStatus('error');
      }
    } catch {
      clearTimers();
      setBtStep('');
      setBtError('Verbindung zum Server fehlgeschlagen');
      setBtStatus('error');
    }
  };

  const handleSave = async () => {
    if (!form) return;
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!form) return <div className="flex justify-center py-20 text-muted">Lade…</div>;

  return (
    <div className="px-4 pb-8 max-w-md mx-auto">
      <h2 className="text-text font-semibold py-4">Einstellungen</h2>

      <label className="block text-sm text-muted mb-1">Kamera IP</label>
      <input
        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-text text-sm mb-4 focus:outline-none focus:border-accent"
        value={form.camera_ip}
        onChange={e => setForm({ ...form, camera_ip: e.target.value })}
      />

      <label className="block text-sm text-muted mb-1">Kamera Port</label>
      <input
        type="number"
        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-text text-sm mb-4 focus:outline-none focus:border-accent"
        value={form.camera_port}
        onChange={e => setForm({ ...form, camera_port: Number(e.target.value) })}
      />

      <label className="block text-sm text-muted mb-1">WLAN SSID (Kamera Netzwerk)</label>
      <input
        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-text text-sm mb-4 focus:outline-none focus:border-accent"
        value={form.wifi_ssid || ''}
        onChange={e => setForm({ ...form, wifi_ssid: e.target.value })}
        placeholder="z.B. GardePro_12345"
      />

      <label className="block text-sm text-muted mb-1">WLAN Passwort</label>
      <input
        type="password"
        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-text text-sm mb-4 focus:outline-none focus:border-accent"
        value={form.wifi_password || ''}
        onChange={e => setForm({ ...form, wifi_password: e.target.value })}
        placeholder="Passwort (optional)"
      />

      <label className="block text-sm text-muted mb-1">WLAN Adapter</label>
      <select
        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-text text-sm mb-4 focus:outline-none focus:border-accent"
        value={form.wifi_adapter || ''}
        onChange={e => setForm({ ...form, wifi_adapter: e.target.value })}
      >
        <option value="">Standard (automatisch)</option>
        {adapters.map((a: string) => <option key={a} value={a}>{a}</option>)}
        {form.wifi_adapter && !adapters.includes(form.wifi_adapter) && (
           <option value={form.wifi_adapter}>{form.wifi_adapter} (gespeichert)</option>
        )}
      </select>

      <label className="block text-sm text-muted mb-1">Bluetooth MAC-Adresse</label>
      <div className="flex gap-2 mb-2">
        <input
          className="flex-1 bg-bg border border-border rounded px-3 py-1.5 text-text text-sm focus:outline-none focus:border-accent font-mono"
          value={form.bt_mac_address}
          onChange={e => setForm({ ...form, bt_mac_address: e.target.value })}
          placeholder="AA:BB:CC:DD:EE:FF"
        />
        <button
          onClick={handleBtWake}
          disabled={btStatus === 'loading' || !form.bt_mac_address}
          className="px-3 py-1.5 rounded text-sm font-medium border transition-colors disabled:opacity-40
            border-accent text-accent hover:bg-accent hover:text-bg disabled:hover:bg-transparent disabled:hover:text-accent"
          title="WLAN der Kamera per Bluetooth einschalten"
        >
          {btStatus === 'ok' ? '✓ WLAN an' : '📡 WLAN an'}
        </button>
      </div>

      <div className="mb-4 min-h-[1.5rem]">
        {btStatus === 'loading' && (
          <p className="text-accent text-xs flex items-center gap-1.5 animate-pulse">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
            {btStep}
          </p>
        )}
        {btStatus === 'ok' && <p className="text-green-400 text-xs">WLAN der Kamera wurde erfolgreich aktiviert.</p>}
        {btStatus === 'error' && <p className="text-red-400 text-xs">{btError}</p>}
      </div>

      <label className="block text-sm text-muted mb-1">Sync-Intervall</label>
      <select
        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-text text-sm mb-6 focus:outline-none focus:border-accent"
        value={form.sync_interval_minutes}
        onChange={e => setForm({
          ...form,
          sync_interval_minutes: Number(e.target.value),
          auto_sync_enabled: Number(e.target.value) > 0,
        })}
      >
        {INTERVALS.map(i => (
          <option key={i.value} value={i.value}>{i.label}</option>
        ))}
      </select>

      {/* ── Thumbnails ─────────────────────────────────────── */}
      <div className="border-t border-border mt-6 pt-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-text font-semibold text-sm">Kamera-Thumbnails</h3>
            <p className="text-xs text-muted mt-1">Thumbnails direkt von der Kamera laden statt lokal generieren. Verbessert Vorschau bei Videos.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={form.use_native_thumbnails || false}
              onChange={e => setForm({ ...form, use_native_thumbnails: e.target.checked })}
            />
            <div className="w-9 h-5 bg-border rounded-full peer-checked:bg-accent transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
      </div>

      {/* ── Immich Integration ─────────────────────────────── */}
      <div className="border-t border-border mt-2 pt-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-text font-semibold text-sm">Immich Integration</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={form.immich_enabled || false}
              onChange={e => setForm({ ...form, immich_enabled: e.target.checked })}
            />
            <div className="w-9 h-5 bg-border rounded-full peer-checked:bg-accent transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>

        <div className={form.immich_enabled ? '' : 'opacity-40 pointer-events-none'}>
          <label className="block text-sm text-muted mb-1">Server URL</label>
          <input
            className="w-full bg-bg border border-border rounded px-3 py-1.5 text-text text-sm mb-4 focus:outline-none focus:border-accent"
            value={form.immich_server_url || ''}
            onChange={e => setForm({ ...form, immich_server_url: e.target.value })}
            placeholder="https://immich.example.com"
          />

          <label className="block text-sm text-muted mb-1">API-Schluessel</label>
          <p className="text-xs text-muted mb-2">Erstelle den Key unter Immich &rarr; Kontoeinstellungen &rarr; API-Schluessel. Der Key hat automatisch alle Rechte deines Benutzerkontos.</p>
          <input
            type="password"
            className="w-full bg-bg border border-border rounded px-3 py-1.5 text-text text-sm mb-4 focus:outline-none focus:border-accent font-mono"
            value={form.immich_api_key || ''}
            onChange={e => setForm({ ...form, immich_api_key: e.target.value })}
            placeholder="API-Key aus Immich Einstellungen"
          />

          <label className="block text-sm text-muted mb-1">Album-Name</label>
          <input
            className="w-full bg-bg border border-border rounded px-3 py-1.5 text-text text-sm mb-4 focus:outline-none focus:border-accent"
            value={form.immich_album_name || ''}
            onChange={e => setForm({ ...form, immich_album_name: e.target.value })}
            placeholder="GardePro Wildkamera"
          />

          <button
            onClick={async () => {
              setImmichStatus('loading');
              setImmichError('');
              try {
                const res = await fetch('/api/immich/test', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ server_url: form.immich_server_url, api_key: form.immich_api_key }),
                });
                const json = await res.json();
                if (json.ok) {
                  setImmichStatus('ok');
                  setTimeout(() => setImmichStatus('idle'), 4000);
                } else {
                  setImmichError(json.error || 'Unbekannter Fehler');
                  setImmichStatus('error');
                }
              } catch {
                setImmichError('Verbindung zum Server fehlgeschlagen');
                setImmichStatus('error');
              }
            }}
            disabled={immichStatus === 'loading' || !form.immich_server_url || !form.immich_api_key}
            className="px-4 py-1.5 rounded text-sm font-medium border transition-colors disabled:opacity-40
              border-accent text-accent hover:bg-accent hover:text-bg disabled:hover:bg-transparent disabled:hover:text-accent"
          >
            {immichStatus === 'loading' ? 'Teste...' : immichStatus === 'ok' ? '✓ Verbunden' : 'Verbindung testen'}
          </button>

          <div className="mt-2 min-h-[1.5rem]">
            {immichStatus === 'ok' && <p className="text-green-400 text-xs">Immich-Server erfolgreich erreicht.</p>}
            {immichStatus === 'error' && <p className="text-red-400 text-xs">{immichError}</p>}
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full bg-accent text-bg rounded py-2 text-sm font-medium hover:bg-accent/90 transition-colors"
      >
        {saved ? '✓ Gespeichert' : 'Speichern'}
      </button>
    </div>
  );
}
