import type { FilterType } from '../types';

interface Props {
  active: FilterType;
  onChange: (f: FilterType) => void;
  total: number;
  filtered: number;
}

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'Alle', value: 'all' },
  { label: 'Fotos', value: 'photo' },
  { label: 'Videos', value: 'video' },
];

export function FilterBar({ active, onChange, total, filtered }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {FILTERS.map(f => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={[
            'px-3 py-1.5 rounded-md text-sm border transition-colors',
            active === f.value
              ? 'border-accent text-accent bg-accent/10'
              : 'border-border text-muted hover:border-accent hover:text-accent',
          ].join(' ')}
        >
          {f.label}
        </button>
      ))}
      <span className="text-muted text-sm ml-2">
        {filtered} von {total} Dateien
      </span>
    </div>
  );
}
