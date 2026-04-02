import { useState, useEffect, useCallback } from 'react';

interface ImmichStats {
  total: number;
  uploaded: number;
  pending: number;
}

interface LogEntry {
  ts: string;
  level: string;
  msg: string;
}

export function ImmichPage() {
  const [stats, setStats]       = useState<ImmichStats | null>(null);
  const [logs, setLogs]         = useState<LogEntry[]>([]);
  const [pushing, setPushing]   = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [validating, setValidating] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/immich/status');
      const json = await res.json();
      if (json.ok) {
        setStats(json.data);
        setConfigured(true);
      } else {
        setConfigured(false);
      }
    } catch {
      setConfigured(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/logs');
      const json = await res.json();
      if (json.ok) {
        const immichLogs = (json.data as LogEntry[]).filter(l => l.msg.toLowerCase().includes('immich'));
        setLogs(immichLogs);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadStats();
    loadLogs();
    const interval = setInterval(() => { loadStats(); loadLogs(); }, 3000);
    return () => clearInterval(interval);
  }, [loadStats, loadLogs]);

  const handlePush = async () => {
    setPushing(true);
    setPushResult(null);
    try {
      const res = await fetch('/api/immich/upload', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setPushResult('Upload gestartet - siehe Logs unten');
      } else {
        setPushResult(json.error || 'Fehler beim Starten');
      }
    } catch {
      setPushResult('Verbindung zum Server fehlgeschlagen');
    } finally {
      setPushing(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setPushResult(null);
    try {
      const res = await fetch('/api/immich/validate', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setPushResult('Abgleich gestartet - siehe Logs unten');
      } else {
        setPushResult(json.error || 'Fehler beim Starten');
      }
    } catch {
      setPushResult('Verbindung zum Server fehlgeschlagen');
    } finally {
      setValidating(false);
    }
  };

  if (!configured) {
    return (
      <div className="px-4 pb-8 max-w-md mx-auto">
        <h2 className="text-text font-semibold py-4">Immich</h2>
        <p className="text-muted text-sm">
          Immich ist nicht konfiguriert. Gehe zu <span className="text-accent">Einstellungen</span> und aktiviere die Immich Integration.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 max-w-lg mx-auto">
      <h2 className="text-text font-semibold py-4">Immich</h2>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-surface border border-border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-text">{stats.total}</div>
            <div className="text-xs text-muted mt-1">Gesamt</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-400">{stats.uploaded}</div>
            <div className="text-xs text-muted mt-1">Hochgeladen</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-accent">{stats.pending}</div>
            <div className="text-xs text-muted mt-1">Ausstehend</div>
          </div>
        </div>
      )}

      {/* Push button */}
      <button
        onClick={handlePush}
        disabled={pushing || (stats?.pending === 0)}
        className="w-full bg-accent text-bg rounded py-2 text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 mb-2"
      >
        {pushing ? 'Wird gestartet...' : stats?.pending === 0 ? 'Alles hochgeladen' : `${stats?.pending ?? 0} Dateien jetzt hochladen`}
      </button>
      
      <button
        onClick={handleValidate}
        disabled={validating || (stats?.uploaded === 0)}
        className="w-full bg-surface border border-border text-text rounded py-2 text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-40 mb-2 mt-2"
      >
        {validating ? 'Wird geprüft...' : 'Datenbank mit Immich abgleichen'}
      </button>
      {pushResult && (
        <p className="text-xs text-muted mb-4">{pushResult}</p>
      )}

      {/* Immich logs */}
      <h3 className="text-text font-semibold text-sm mt-6 mb-2">Immich Logs</h3>
      <div className="bg-surface border border-border rounded-lg max-h-80 overflow-y-auto">
        {logs.length === 0 ? (
          <p className="text-muted text-xs p-3">Keine Immich-Logs vorhanden.</p>
        ) : (
          <div className="divide-y divide-border">
            {[...logs].reverse().map((entry, i) => (
              <div key={i} className="px-3 py-1.5 flex gap-2 text-xs">
                <span className="text-muted shrink-0">{entry.ts}</span>
                <span className={
                  entry.level === 'ERROR' ? 'text-red-400' :
                  entry.level === 'WARNING' ? 'text-yellow-400' :
                  'text-text'
                }>
                  {entry.msg}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
