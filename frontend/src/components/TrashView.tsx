import { useState, useEffect, useCallback } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import 'yet-another-react-lightbox/styles.css';
import type { MediaItem } from '../types';
import { MetaPanel } from './MetaPanel';

export function TrashView({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [items, setItems]     = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  
  const [metaItem, setMetaItem] = useState<MediaItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const slides = items.map(item =>
    item.type === 'photo'
      ? { src: `/media/${item.filename}` }
      : { type: 'video' as const, sources: [{ src: `/media/${item.filename}`, type: 'video/mp4' }] }
  );

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/trash');
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        onCountChange(json.data.length);
      }
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const toggleSelection = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const restoreSelected = async () => {
    if (selectedIds.size === 0) return;
    await Promise.all(Array.from(selectedIds).map(id => 
      fetch(`/api/trash/${id}/restore`, { method: 'POST' })
    ));
    setItems(prev => { 
      const next = prev.filter(i => !selectedIds.has(i.id)); 
      onCountChange(next.length); 
      return next; 
    });
    setSelectedIds(new Set());
  };

  const permanentDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Wirklich ${selectedIds.size} Elemente endgültig löschen?`)) return;
    await Promise.all(Array.from(selectedIds).map(id => 
      fetch(`/api/trash/${id}`, { method: 'DELETE' })
    ));
    setItems(prev => { 
      const next = prev.filter(i => !selectedIds.has(i.id)); 
      onCountChange(next.length); 
      return next; 
    });
    setSelectedIds(new Set());
  };

  const restore = async (id: number) => {
    await fetch(`/api/trash/${id}/restore`, { method: 'POST' });
    setItems(prev => { const next = prev.filter(i => i.id !== id); onCountChange(next.length); return next; });
    const newSelected = new Set(selectedIds);
    newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const permanentDelete = async (id: number) => {
    if (!confirm("Wirklich endgültig löschen?")) return;
    await fetch(`/api/trash/${id}`, { method: 'DELETE' });
    setItems(prev => { const next = prev.filter(i => i.id !== id); onCountChange(next.length); return next; });
    const newSelected = new Set(selectedIds);
    newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const emptyTrash = async () => {
    if (!confirm("Papierkorb wirklich komplett leeren? Dies kann nicht rückgängig gemacht werden!")) return;
    await fetch('/api/trash/empty', { method: 'POST' });
    setItems([]);
    onCountChange(0);
    setSelectedIds(new Set());
  };

  if (loading) return <div className="flex justify-center py-20 text-muted">Lade…</div>;

  return (
    <div className="px-4 pb-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between py-4">
        <h2 className="text-text font-semibold flex items-center gap-4">
          <span>Papierkorb {items.length > 0 && <span className="text-muted font-normal text-sm">({items.length})</span>}</span>
          
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 border-l border-border pl-4">
              <span className="text-sm text-text font-normal">{selectedIds.size} ausgewählt</span>
              <button 
                onClick={restoreSelected} 
                className="text-xs px-3 py-1.5 bg-surface border border-border rounded hover:bg-white/10 transition-colors"
              >
                Wiederherstellen
              </button>
              <button 
                onClick={permanentDeleteSelected} 
                className="text-xs px-3 py-1.5 bg-red-600/20 text-red-500 border border-red-900/50 rounded hover:bg-red-600/30 transition-colors"
              >
                Löschen
              </button>
              <button 
                onClick={() => setSelectedIds(new Set())} 
                className="text-xs px-3 py-1.5 text-muted hover:text-text transition-colors"
              >
                Abbrechen
              </button>
            </div>
          )}
        </h2>
        {items.length > 0 && selectedIds.size === 0 && (
          <button
            onClick={emptyTrash}
            className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-300/50 px-3 py-1.5 rounded transition-colors"
          >
            Papierkorb leeren
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted gap-2">
          <span className="text-4xl">🗑</span>
          <span className="text-sm">Papierkorb ist leer</span>
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {items.map((item, idx) => {
            const isSelected = selectedIds.has(item.id);
            return (
            <div key={item.id} className={"relative group rounded-lg overflow-hidden bg-surface border " + (isSelected ? "border-accent" : "border-border")} onClick={() => setLightboxIndex(idx)}>
              {item.type === 'photo' ? (
                <img
                  src={`/thumbnail/${item.id}`}
                  alt={String(item.id)}
                  className={"w-full aspect-square object-cover transition-opacity " + (isSelected ? "opacity-100 cursor-pointer" : "opacity-60 group-hover:opacity-30 cursor-pointer")}
                  loading="lazy"
                />
              ) : (
                <div className={"w-full aspect-square bg-[#1c2128] flex items-center justify-center transition-opacity " + (isSelected ? "opacity-100 cursor-pointer" : "opacity-60 group-hover:opacity-30 cursor-pointer")}>       
                  <span className="text-2xl">▶</span>
                </div>
              )}

              {/* CHECKBOX Overlay */}
              <div 
                className={"absolute top-2 left-2 z-20 w-6 h-6 rounded border flex items-center justify-center transition-colors shadow-sm cursor-pointer " + (isSelected ? "border-accent bg-accent" : "border-white/60 bg-black/40 hover:border-white opacity-0 group-hover:opacity-100")}
                onClick={(e) => { e.stopPropagation(); toggleSelection(item.id); }}
              >
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </div>

               {/* INFO Button Overlay */}
              <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); setMetaItem(item); }}
                  className="w-6 h-6 rounded bg-black/60 text-white/80 text-xs flex items-center justify-center hover:bg-white/30 shadow-sm"
                  title="Metadaten"
                >
                  ℹ
                </button>
              </div>

              {!isSelected && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <span className="text-white mb-2 shadow-sm font-semibold">Ansehen</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); restore(item.id); }}   
                    className="px-3 py-1 rounded bg-accent text-bg text-xs font-medium hover:bg-accent/80 transition-colors shadow z-20"
                  >
                    Wiederherstellen
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); permanentDelete(item.id); }}
                    className="px-3 py-1 rounded bg-red-600/80 text-white text-xs hover:bg-red-600 transition-colors shadow z-20"
                  >
                    Löschen
                  </button>
                </div>
              )}

              <div className="px-2 py-1 border-t border-border">
                <p className="text-muted text-[10px] truncate">{item.filename}</p>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <MetaPanel item={metaItem} onClose={() => setMetaItem(null)} />

      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex}
        slides={slides}
        plugins={[Video]}
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
      />
    </div>
  );
}
