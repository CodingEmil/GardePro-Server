import { useState } from 'react';
import { useMedia } from './hooks/useMedia';
import { useSyncStatus } from './hooks/useSyncStatus';
import { FilterBar } from './components/FilterBar';
import { SyncBanner } from './components/SyncBanner';
import { MediaGrid } from './components/MediaGrid';
import { LogPanel } from './components/LogPanel';
import { NavDrawer, type Page } from './components/NavDrawer';
import { TrashView } from './components/TrashView';
import { SettingsPage } from './components/SettingsPage';
import { ImmichPage } from './components/ImmichPage';
import { CameraPage } from './components/CameraPage';
import type { FilterType } from './types';

export default function App() {
  const [filter, setFilter]       = useState<FilterType>('all');
  const [showLogs, setShowLogs]   = useState(false);
  const [navOpen, setNavOpen]     = useState(false);
  const [page, setPage]           = useState<Page>('home');
  const [trashCount, setTrashCount] = useState(0);

  const { items, total, newCount, loading, reload, markSeen, deleteItem } = useMedia(filter);
  const { status, triggerSync } = useSyncStatus();

  const handleDismiss = async () => {
    await fetch('/api/seen', { method: 'POST' });
    reload();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-20 bg-surface border-b border-border px-4 py-3 flex items-center gap-3">
        {/* Hamburger */}
        <button
          onClick={() => setNavOpen(true)}
          className="text-muted hover:text-accent transition-colors flex flex-col gap-1 p-1"
          title="Menü"
          aria-label="Menü öffnen"
        >
          <span className="block w-5 h-0.5 bg-current rounded" />
          <span className="block w-5 h-0.5 bg-current rounded" />
          <span className="block w-5 h-0.5 bg-current rounded" />
        </button>

        <h1 className="text-accent font-semibold text-lg tracking-wide">🌿 GardePro</h1>

        {page === 'home' && (
          <FilterBar active={filter} onChange={setFilter} total={total} filtered={items.length} />
        )}

        <div className="ml-auto flex items-center gap-3">
          {status?.storage && (
             <div className="hidden sm:flex text-xs items-center gap-1.5 px-2 py-1 bg-surface border border-border rounded-md" title={`Total: ${formatBytes(status.storage.total)}\nFrei: ${formatBytes(status.storage.free)}`}>
               <span className="text-muted">💾</span>
               <span className={status.storage.free < 5 * 1024 * 1024 * 1024 ? "text-red-400" : "text-muted"}>
                 {formatBytes(status.storage.used)} / {formatBytes(status.storage.total)}
               </span>
             </div>
          )}
          {status?.running && (
            <span className="text-accent text-xs animate-pulse">⟳ Synchronisiert…</span>
          )}
          {!status?.running && status?.last_sync_at && (
            <span className="text-muted text-xs hidden sm:block">
              {new Date(status.last_sync_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={triggerSync}
            disabled={status?.running ?? false}
            className="text-muted hover:text-accent transition-colors disabled:opacity-40 text-lg"
            title="Jetzt synchronisieren"
          >
            ⟳
          </button>
          <button
            onClick={() => setShowLogs(v => !v)}
            className={`transition-colors text-sm ${showLogs ? 'text-accent' : 'text-muted hover:text-accent'}`}
            title="Logs anzeigen"
          >
            📋
          </button>
        </div>
      </header>

      {page === 'home' && <SyncBanner newCount={newCount} onDismiss={handleDismiss} />}

      <main className={showLogs ? 'pb-[280px]' : ''}>
        {page === 'home' && (
          <>
            {loading && <div className="flex justify-center py-20 text-muted">Lade Dateien…</div>}
            {!loading && items.length === 0 && (
              <div className="flex justify-center py-20 text-muted">
                Keine Dateien. Kamera erreichbar und Sync gestartet?
              </div>
            )}
            {!loading && items.length > 0 && (
              <MediaGrid items={items} onSeen={markSeen} onDelete={deleteItem} />
            )}
          </>
        )}

        {page === 'camera' && <CameraPage />}

        {page === 'trash' && <TrashView onCountChange={setTrashCount} />}

        {page === 'immich' && <ImmichPage />}

        {page === 'settings' && <SettingsPage />}
      </main>

      <LogPanel open={showLogs} onClose={() => setShowLogs(false)} />

      <NavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        currentPage={page}
        onNavigate={setPage}
        trashCount={trashCount}
      />
    </div>
  );
}
