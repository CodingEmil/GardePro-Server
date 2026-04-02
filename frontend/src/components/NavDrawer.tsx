import { createPortal } from 'react-dom';

export type Page = 'home' | 'camera' | 'trash' | 'immich' | 'settings';

interface Props {
  open: boolean;
  onClose: () => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  trashCount: number;
}

const NAV_ITEMS: { page: Page; label: string; icon: string }[] = [
  { page: 'home',     label: 'Home',         icon: '🏠' },
  { page: 'camera',   label: 'Kamera',       icon: '📷' },
  { page: 'immich',   label: 'Immich',       icon: '☁' },
  { page: 'trash',    label: 'Papierkorb',   icon: '🗑' },
  { page: 'settings', label: 'Einstellungen', icon: '⚙' },
];

export function NavDrawer({ open, onClose, currentPage, onNavigate, trashCount }: Props) {
  const drawer = (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          style={{ zIndex: 200 }}
          onClick={onClose}
        />
      )}

      <nav
        className={[
          'fixed top-0 left-0 h-full w-56 bg-surface border-r border-border',
          'flex flex-col shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        style={{ zIndex: 201 }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-accent font-semibold text-sm tracking-wide">🌿 GardePro</span>
          <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 py-2">
          {NAV_ITEMS.map(({ page, label, icon }) => (
            <button
              key={page}
              onClick={() => { onNavigate(page); onClose(); }}
              className={[
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                currentPage === page
                  ? 'text-accent bg-accent/10 font-medium'
                  : 'text-muted hover:text-text hover:bg-white/5',
              ].join(' ')}
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
              {page === 'trash' && trashCount > 0 && (
                <span className="ml-auto bg-border text-muted text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                  {trashCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </>
  );

  return createPortal(drawer, document.body);
}
