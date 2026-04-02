import { useEffect, useRef } from 'react';
import { useLogs } from '../hooks/useLogs';
import type { LogEntry } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const LEVEL_STYLE: Record<LogEntry['level'], string> = {
  DEBUG:   'text-muted',
  INFO:    'text-text',
  WARNING: 'text-yellow-400',
  ERROR:   'text-red-400',
};

export function LogPanel({ open, onClose }: Props) {
  const logs      = useLogs(open);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!open) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border flex flex-col"
      style={{ height: '260px' }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-sm font-medium text-text">📋 Sync-Logs</span>
        <button onClick={onClose} className="text-muted hover:text-text text-sm">✕</button>
      </div>

      <div className="overflow-y-auto flex-1 px-4 py-2 font-mono text-xs">
        {logs.length === 0 && (
          <span className="text-muted">Noch keine Log-Einträge.</span>
        )}
        {logs.map((entry, i) => (
          <div key={i} className="flex gap-3 py-0.5 leading-5">
            <span className="text-muted shrink-0">{entry.ts}</span>
            <span className={`shrink-0 w-16 ${LEVEL_STYLE[entry.level]}`}>
              {entry.level}
            </span>
            <span className={LEVEL_STYLE[entry.level]}>{entry.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
