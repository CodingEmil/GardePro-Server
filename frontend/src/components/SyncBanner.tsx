interface Props {
  newCount: number;
  onDismiss: () => void;
}

export function SyncBanner({ newCount, onDismiss }: Props) {
  if (newCount === 0) return null;
  return (
    <div className="flex items-center gap-3 px-6 py-2.5
                    bg-accent/15 border-b border-accent/30 text-sm">
      <span className="text-accent font-medium">
        🆕 {newCount} neue Aufnahme{newCount !== 1 ? 'n' : ''} verfügbar
      </span>
      <button
        onClick={onDismiss}
        className="ml-auto text-accent/70 hover:text-accent underline text-xs"
      >
        Als gesehen markieren
      </button>
    </div>
  );
}
