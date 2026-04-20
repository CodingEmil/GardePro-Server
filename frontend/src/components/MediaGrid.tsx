import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import 'yet-another-react-lightbox/styles.css';
import type { MediaItem } from '../types';
import { MetaPanel } from './MetaPanel';
import { extractCameraDate } from '../utils/cameraDate';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  items: MediaItem[];
  onSeen: (id: number) => void;
  onDelete: (id: number) => void;
}

// ── Date grouping ──────────────────────────────────────────────────────────

interface DateGroup {
  label: string;
  items: MediaItem[];
}

function getItemDate(item: MediaItem): Date | null {
  if (item.camera_meta) {
    try {
      const d = extractCameraDate(JSON.parse(item.camera_meta) as Record<string, unknown>);
      if (d) return d;
    } catch { /* ignore */ }
  }
  return item.downloaded_at ? new Date(item.downloaded_at) : null;
}

function groupByDate(items: MediaItem[]): DateGroup[] {
  const map = new Map<string, { ts: number; items: MediaItem[] }>();
  for (const item of items) {
    const d   = getItemDate(item);
    const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : '__unknown__';
    if (!map.has(key)) map.set(key, { ts: d?.getTime() ?? 0, items: [] });
    map.get(key)!.items.push(item);
  }
  return [...map.values()]
    .sort((a, b) => b.ts - a.ts)
    .map(({ ts, items }) => ({ label: formatGroupLabel(ts), items }));
}

function formatGroupLabel(ts: number): string {
  if (ts === 0) return 'Unbekannt';
  const d              = new Date(ts);
  const now            = new Date();
  const todayStart     = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const dStart         = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (dStart === todayStart)     return 'Heute';
  if (dStart === yesterdayStart) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Lazy image with fade-in ────────────────────────────────────────────────

function LazyImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function MediaGrid({ items, onSeen, onDelete }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [metaItem, setMetaItem]           = useState<MediaItem | null>(null);
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [lastSelected, setLastSelected]   = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; type: 'single' | 'bulk'; id?: number }>({ isOpen: false, type: 'single' });
  
  const slides = items.map(item =>
    item.type === 'photo'
      ? { src: `/media/${item.filename}` }
      : { type: 'video' as const, sources: [{ src: `/media/${item.filename}`, type: 'video/mp4' }] }
  );

  const handleOpen = (idx: number) => {
    setLightboxIndex(idx);
    onSeen(items[idx].id);
  };

  const handleInfo = (e: React.MouseEvent, item: MediaItem) => {
    e.stopPropagation();
    setMetaItem(prev => prev?.id === item.id ? null : item);
  };

  const toggleSelection = (e: React.MouseEvent | null, id: number) => {
    if (e) e.stopPropagation();
    const next = new Set(selectedIds);

    if (e?.shiftKey && lastSelected !== null) {
      const startIdx = items.findIndex(i => i.id === lastSelected);
      const endIdx = items.findIndex(i => i.id === id);

      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        for (let i = min; i <= max; i++) {
          next.add(items[i].id);
        }
      }
      setLastSelected(id);
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setLastSelected(id);
    }
    
    setSelectedIds(next);
  };

  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteConfirm({ isOpen: true, type: 'bulk' });
  };

  const confirmBulkDelete = async () => {
    const idsToTrash = Array.from(selectedIds);
    setSelectedIds(new Set());
    setDeleteConfirm({ isOpen: false, type: 'bulk' });
    idsToTrash.forEach(id => onDelete(id));
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setDeleteConfirm({ isOpen: true, type: 'single', id });
  };

  const confirmSingleDelete = () => {
    if (!deleteConfirm.id) return;
    if (metaItem?.id === deleteConfirm.id) setMetaItem(null);
    onDelete(deleteConfirm.id);
    setDeleteConfirm({ isOpen: false, type: 'single' });
  };

  const groups = groupByDate(items);

  return (
    <>
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="In den Papierkorb verschieben"
        message={deleteConfirm.type === 'bulk' 
          ? `Möchten Sie wirklich ${selectedIds.size} Elemente in den Papierkorb verschieben?`
          : 'Möchten Sie dieses Element wirklich in den Papierkorb verschieben?'}
        confirmText="Löschen"
        onCancel={() => setDeleteConfirm({ isOpen: false, type: 'bulk' })}
        onConfirm={deleteConfirm.type === 'bulk' ? confirmBulkDelete : confirmSingleDelete}
      />
      <div className="px-4 pb-8">
        
        {selectedIds.size > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border shadow-2xl rounded-full px-6 py-3 flex items-center justify-between gap-6">
            <span className="text-text font-medium text-sm whitespace-nowrap">{selectedIds.size} ausgewählt</span>
            <div className="flex gap-2">
              <button 
                onClick={bulkDelete}
                className="text-xs px-4 py-2 bg-red-600/20 text-red-500 border border-red-900/50 rounded-full hover:bg-red-600/30 transition-colors cursor-pointer"
                title="In den Papierkorb"
              >
                In den Papierkorb
              </button>
              <button 
                onClick={() => setSelectedIds(new Set())}
                className="text-xs px-4 py-2 text-muted hover:text-text transition-colors cursor-pointer rounded-full"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {groups.map(group => (
          <div key={group.label} className="mb-6">
            <h2 className="text-text font-semibold text-sm mb-2 sticky top-[52px] z-10
                           bg-bg/80 backdrop-blur-sm py-1">
              {group.label}
              <span className="text-muted font-normal ml-2 text-xs">{group.items.length}</span>
            </h2>

            <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {group.items.map(item => {
                const idx = items.indexOf(item);
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={(e) => {
                      if (selectedIds.size > 0) toggleSelection(e, item.id);
                      else handleOpen(idx);
                    }}
                    className={"group relative aspect-square overflow-hidden cursor-pointer select-none bg-surface border " + (isSelected ? "border-accent" : "border-transparent")}
                  >
                    {item.is_new && (
                      <span className="absolute top-1.5 left-1.5 z-10
                                       bg-accent text-bg text-[9px] font-bold
                                       px-1.5 py-0.5 rounded-sm">
                        NEU
                      </span>
                    )}

                    {/* AI Bounding Boxes overlay */}
                    {(() => {
                      let parsedTags: Array<string | {label: string, confidence?: number, box?: number[]}> = [];
                      try {
                        if (item.tags) parsedTags = JSON.parse(item.tags);
                      } catch(e) {}
                      
                      return parsedTags.map((tag, tIdx) => {
                        if (typeof tag === 'object' && tag.box) {
                          const [x1, y1, x2, y2] = tag.box;
                          return (
                            <div 
                              key={`box-${item.id}-${tIdx}`}
                              className="absolute border border-accent rounded-sm z-[5] pointer-events-none"
                              style={{
                                left: `${x1 * 100}%`,
                                top: `${y1 * 100}%`,
                                width: `${(x2 - x1) * 100}%`,
                                height: `${(y2 - y1) * 100}%`,
                                boxShadow: '0 0 4px rgba(74,222,128,0.4) inset, 0 0 4px rgba(74,222,128,0.4)',
                              }}
                            >
                              <span className="absolute -top-3.5 -left-px bg-accent text-bg text-[8px] font-bold px-0.5 rounded-t-sm whitespace-nowrap">
                                {(tag as any).label}
                              </span>
                            </div>
                          );
                        }
                        return null;
                      });
                    })()}

                    {/* CHECKBOX Overlay */}
                    <div 
                      className={"absolute top-1.5 left-1.5 z-20 w-5 h-5 sm:w-6 sm:h-6 rounded border flex items-center justify-center transition-colors shadow-sm cursor-pointer " + (isSelected ? "border-accent bg-accent" : "border-white/60 bg-black/40 hover:border-white opacity-0 group-hover:opacity-100")}
                      onClick={(e) => toggleSelection(e, item.id)}
                    >
                      {isSelected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                    </div>

                    <div className={"absolute top-1.5 right-1.5 z-10 flex gap-1 transition-opacity " + (isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                      <button
                        onClick={e => handleInfo(e, item)}
                        className="w-6 h-6 rounded bg-black/60 text-white/80 text-xs
                                   flex items-center justify-center hover:bg-white/20"
                        title="Metadaten"
                      >
                        ℹ
                      </button>
                      <button
                        onClick={e => handleDelete(e, item.id)}
                        className="w-6 h-6 rounded bg-black/60 text-white/80 text-xs
                                   flex items-center justify-center hover:bg-red-600"
                        title="In Papierkorb"
                      >
                        🗑
                      </button>
                    </div>

                    {item.type === 'photo' ? (
                      <LazyImage src={`/thumbnail/${item.id}`} alt={String(item.id)} />
                    ) : (
                      <div className="w-full h-full bg-[#1c2128] flex flex-col items-center justify-center gap-1">
                        <span className="text-2xl text-text">▶</span>
                        <span className="text-[10px] text-muted">Video</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <MetaPanel item={metaItem} onClose={() => setMetaItem(null)} />

      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex}
        on={{
          view: ({ index }) => {
            setLightboxIndex(index);
            onSeen(items[index].id);
          },
        }}
        toolbar={{
          buttons: [
            <button
              key="info"
              type="button"
              onClick={() => setMetaItem(prev =>
                prev?.id === items[lightboxIndex]?.id ? null : (items[lightboxIndex] ?? null)
              )}
              className="yarl__button"
              title="Metadaten"
              style={{
                opacity: metaItem?.id === items[lightboxIndex]?.id ? 1 : 0.7,
                background: metaItem?.id === items[lightboxIndex]?.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                borderRadius: '50%',
                padding: '8px',
                transition: 'opacity 0.2s, background 0.2s',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="8.5" strokeWidth="2.5" />
                <line x1="12" y1="12" x2="12" y2="17" />
              </svg>
            </button>,
            'close',
          ],
        }}
        slides={slides}
        plugins={[Video]}
      />
    </>
  );
}
