import { useEffect, useState } from 'react';
import type { MediaItem } from '../types';

interface DetectionTag {
  label?: string;
  confidence?: number;
  box?: [number, number, number, number];
}

interface ImageRect { x: number; y: number; w: number; h: number }

const BRACKET = '1.5px solid rgba(255,255,255,0.82)';

export function AIOverlayLightbox({ item, open }: { item?: MediaItem | null; open: boolean }) {
  const [rect, setRect] = useState<ImageRect | null>(null);

  useEffect(() => {
    if (!open || !item?.tags) { setRect(null); return; }
    let rafId: number;
    const loop = () => {
      const img = document.querySelector('.yarl__slide_current .yarl__slide_image') as HTMLImageElement;
      if (img?.naturalWidth) {
        const r = img.getBoundingClientRect();
        const imgRatio = img.naturalWidth / img.naturalHeight;
        const ctnRatio = r.width / r.height;
        let w = r.width, h = r.height, x = r.left, y = r.top;
        if (imgRatio > ctnRatio) { h = w / imgRatio; y += (r.height - h) / 2; }
        else                     { w = h * imgRatio; x += (r.width  - w) / 2; }
        setRect(p => p?.x === x && p?.y === y && p?.w === w && p?.h === h ? p : { x, y, w, h });
      } else {
        setRect(null);
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [open, item]);

  if (!open || !item?.tags || !rect) return null;

  let tags: DetectionTag[] = [];
  try { tags = JSON.parse(item.tags); } catch { return null; }
  if (!Array.isArray(tags) || tags.length === 0) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10000 }}>
      {tags.map((tag, idx) => {
        if (!tag.box) return null;
        const [x1, y1, x2, y2] = tag.box;
        const bw = (x2 - x1) * rect.w;
        const bh = (y2 - y1) * rect.h;
        const cs = Math.max(6, Math.min(bw * 0.14, bh * 0.14, 14));
        const labelAbove = y1 > 0.07;

        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: rect.x + x1 * rect.w,
              top:  rect.y + y1 * rect.h,
              width:  bw,
              height: bh,
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {/* Corner brackets */}
            <div style={{ position:'absolute', top:-1,    left:-1,  width:cs, height:cs, borderTop:BRACKET,    borderLeft:BRACKET  }} />
            <div style={{ position:'absolute', top:-1,    right:-1, width:cs, height:cs, borderTop:BRACKET,    borderRight:BRACKET }} />
            <div style={{ position:'absolute', bottom:-1, left:-1,  width:cs, height:cs, borderBottom:BRACKET, borderLeft:BRACKET  }} />
            <div style={{ position:'absolute', bottom:-1, right:-1, width:cs, height:cs, borderBottom:BRACKET, borderRight:BRACKET }} />

            {/* Label */}
            {tag.label && (
              <span style={{
                position: 'absolute',
                ...(labelAbove ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 6 }),
                left: 0,
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 5,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                color: 'rgba(255,255,255,0.9)',
                padding: '2px 8px',
                fontSize: 12,
                fontWeight: 400,
                borderRadius: 4,
                letterSpacing: '0.025em',
                whiteSpace: 'nowrap',
              }}>
                {tag.label}
                {tag.confidence != null && (
                  <span style={{ opacity: 0.5, fontSize: 10 }}>
                    {Math.round(tag.confidence * 100)}%
                  </span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
