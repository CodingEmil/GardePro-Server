/**
 * Extract shooting date from camera_meta JSON blob.
 * GardePro cameras may return separate "date"/"time" fields or a combined timestamp.
 * Falls back to null if nothing parseable is found.
 */
export function extractCameraDate(meta: Record<string, unknown>): Date | null {
  // 1. Try separate date + time fields (e.g. { date: "2026-03-30", time: "15:23:00" })
  const rawDate = meta['date'] ?? meta['Date'];
  const rawTime = meta['time'] ?? meta['Time'];
  if (rawDate && typeof rawDate === 'string') {
    const combined = rawTime && typeof rawTime === 'string'
      ? `${rawDate}T${rawTime}`
      : rawDate;
    const d = new Date(combined);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
  }

  // 2. Try combined datetime / timestamp fields
  for (const key of ['datetime', 'Datetime', 'timestamp', 'create_date', 'shot_time']) {
    const val = meta[key];
    if (val == null) continue;
    if (typeof val === 'number') {
      const ms = val > 1e12 ? val : val * 1000;
      const d  = new Date(ms);
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
    }
    if (typeof val === 'string') {
      const d = new Date(val);
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d;
    }
  }

  return null;
}

export function formatGermanDate(d: Date): string {
  return d.toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function formatGermanDateTime(d: Date): string {
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
