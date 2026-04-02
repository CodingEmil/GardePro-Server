import { useState, useEffect, useCallback } from 'react';
import type { LogEntry } from '../types';

export function useLogs(enabled: boolean) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/logs');
      const json = await res.json();
      if (json.ok) setLogs(json.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const id = setInterval(load, 3_000);
    return () => clearInterval(id);
  }, [enabled, load]);

  return logs;
}
