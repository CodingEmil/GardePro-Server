import { useState, useEffect, useCallback } from 'react';
import type { SyncStatus } from '../types';

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status');
      const json = await res.json();
      if (json.ok) setStatus(json);
    } catch { /* ignore — server may not be ready yet */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, [load]);

  const triggerSync = async () => {
    await fetch('/api/sync', { method: 'POST' });
    setTimeout(load, 500);
  };

  return { status, triggerSync };
}
