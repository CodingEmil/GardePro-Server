import { createPortal } from 'react-dom';
import type { MediaItem } from '../types';
import { extractCameraDate, formatGermanDateTime } from '../utils/cameraDate';

interface Props {
  item: MediaItem | null;
  onClose: () => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatValue(key: string, value: unknown): string {
  if (value == null) return '—';
  // Detect date-like values
  const lk = key.toLowerCase();
  if (lk.includes('date') || lk.includes('time') || lk.includes('timestamp')) {
    if (typeof value === 'number') {
      const ms = value > 1e12 ? value : value * 1000;
      const d  = new Date(ms);
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000)
        return formatGermanDateTime(d);
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000)
        return formatGermanDateTime(d);
    }
  }
  return String(value);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-border last:border-0">
      <span className="text-muted text-[11px] uppercase tracking-wide">{label}</span>
      <span className="text-text text-sm break-all">{value}</span>
    </div>
  );
}

export function MetaPanel({ item, onClose }: Props) {
  const open = item !== null;

  let cameraMeta: Record<string, unknown> | null = null;
  if (item?.camera_meta) {
    try { cameraMeta = JSON.parse(item.camera_meta); } catch { /* ignore */ }
  }

  const cameraDate = cameraMeta ? extractCameraDate(cameraMeta) : null;

  const panel = (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40"
          style={{ zIndex: 99998 }}
          onClick={onClose}
        />
      )}

      <aside
        className={[
          'fixed top-0 right-0 h-full w-72 bg-surface border-l border-border',  
          'flex flex-col shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        style={{ zIndex: 99999 }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-text font-medium text-sm">ℹ Metadaten</span>
          <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">✕</button>
        </div>

        {item && (
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {item.type === 'photo' && (
              <img
                src={`/thumbnail/${item.id}`}
                alt={String(item.id)}
                className="w-full rounded-lg mb-4 border border-border"
              />
            )}

            <Row label="ID" value={String(item.id)} />
            <Row label="Typ" value={item.type === 'photo' ? 'Foto' : 'Video'} />
            <Row label="Dateiname" value={item.filename} />
            <Row label="Dateigröße" value={formatBytes(item.file_size)} />
            {cameraDate && (
              <Row label="Aufnahmedatum" value={formatGermanDateTime(cameraDate)} />
            )}
            <Row
              label="Heruntergeladen"
              value={item.downloaded_at ? formatGermanDateTime(new Date(item.downloaded_at)) : '—'}
            />

            {cameraMeta && Object.keys(cameraMeta).length > 0 && (
              <>
                <p className="text-muted text-[11px] uppercase tracking-wide mt-4 mb-1">
                  Kamera-Rohdaten
                </p>
                {Object.entries(cameraMeta).map(([k, v]) => (
                  <Row key={k} label={k} value={formatValue(k, v)} />
                ))}
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );

  return createPortal(panel, document.body);
}
