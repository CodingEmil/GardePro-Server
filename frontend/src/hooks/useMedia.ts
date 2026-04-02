import { useState, useEffect, useCallback } from 'react';
import type { MediaItem, FilterType } from '../types';

export function useMedia(filter: FilterType) {
  const [allItems, setAllItems] = useState<MediaItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/media');
      const json = await res.json();
      if (json.ok) {
        setAllItems(json.data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('[useMedia]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const markSeen = useCallback((id: number) => {
    setAllItems(prev => prev.map(i => i.id === id ? { ...i, is_new: false } : i));
    fetch(`/api/media/${id}/seen`, { method: 'POST' });
  }, []);

  const deleteItem = useCallback((id: number) => {
    setAllItems(prev => prev.filter(i => i.id !== id));
    fetch(`/api/media/${id}`, { method: 'DELETE' });
  }, []);

  const filtered  = filter === 'all' ? allItems : allItems.filter(i => i.type === filter);
  const newCount  = allItems.filter(i => i.is_new).length;
  return { items: filtered, total: allItems.length, newCount, lastUpdated, loading, reload: load, markSeen, deleteItem };
}
