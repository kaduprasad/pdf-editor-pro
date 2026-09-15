import { Rnd } from 'react-rnd';
import { X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { WatermarkData } from '../types';
import {
  getTilePositions,
  getWatermarkSize,
  watermarkFontFamily,
  effectiveTextColor,
  TEXT_WM_BASE_FONT,
  TEXT_WM_LINE_HEIGHT,
} from '../utils/watermark';

const cornerHandle = (cursor: string): CSSProperties => ({
  width: 12,
  height: 12,
  background: '#1a8cff',
  border: '2px solid #fff',
  borderRadius: '50%',
  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  cursor,
  pointerEvents: 'auto',
});

interface WatermarkOverlayProps {
  wm: WatermarkData;
  index: number;
  selected: boolean;
  pageWidth: number;
  pageHeight: number;
  onSelect: () => void;
  onUpdate: (index: number, wm: WatermarkData) => void;
  onDelete: (index: number) => void;
}

function WatermarkContent({ wm }: { wm: WatermarkData }) {
  if (wm.type === 'image') {
    return (
      <img
        src={wm.src}
        alt="watermark"
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          opacity: wm.opacity,
          filter: wm.effect === 'grayscale' ? 'grayscale(1)' : 'none',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />
    );
  }
  const { r, g, b } = effectiveTextColor(wm.color, wm.effect);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        opacity: wm.opacity,
        fontSize: TEXT_WM_BASE_FONT * wm.scale,
        lineHeight: TEXT_WM_LINE_HEIGHT,
        fontFamily: watermarkFontFamily(wm.font),
        fontWeight: wm.bold ? 'bold' : 'normal',
        color: `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`,
        whiteSpace: 'pre',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {wm.content || ' '}
    </div>
  );
}

export default function WatermarkOverlay({
  wm,
  index,
  selected,
  pageWidth,
  pageHeight,
  onSelect,
  onUpdate,
  onDelete,
}: WatermarkOverlayProps) {
  const { width, height } = getWatermarkSize(wm);

  // Ghost tiles for grid/diagonal modes (the master tile lands exactly on wm.x/wm.y)
  const ghosts = wm.tile === 'single'
    ? []
    : getTilePositions(wm, pageWidth, pageHeight).filter(
        p => Math.abs(p.x - wm.x) > 0.5 || Math.abs(p.y - wm.y) > 0.5
      );

  const ghostStyle = (p: { x: number; y: number }): CSSProperties => ({
    position: 'absolute',
    left: p.x,
    top: p.y,
    width,
    height,
    transform: `rotate(${wm.rotation}deg)`,
    transformOrigin: 'center',
    pointerEvents: 'none',
    zIndex: 18,
  });

  return (
    <>
      {ghosts.map((p, i) => (
        <div key={`wm-ghost-${index}-${i}`} style={ghostStyle(p)}>
          <WatermarkContent wm={wm} />
        </div>
      ))}

      <Rnd
        size={{ width, height }}
        position={{ x: wm.x, y: wm.y }}
        onDragStart={onSelect}
        onDragStop={(_e, d) => onUpdate(index, { ...wm, x: d.x, y: d.y })}
        onResizeStart={onSelect}
        onResizeStop={(_e, _dir, ref, _delta, position) => {
          const newWidth = parseFloat(ref.style.width);
          const scale = Math.min(6, Math.max(0.2, newWidth / wm.width));
          onUpdate(index, { ...wm, scale, x: position.x, y: position.y });
        }}
        lockAspectRatio
        minWidth={20}
        minHeight={12}
        enableResizing={selected ? {
          topLeft: true,
          topRight: true,
          bottomLeft: true,
          bottomRight: true,
        } : false}
        resizeHandleStyles={selected ? {
          topLeft: cornerHandle('nwse-resize'),
          topRight: cornerHandle('nesw-resize'),
          bottomLeft: cornerHandle('nesw-resize'),
          bottomRight: cornerHandle('nwse-resize'),
        } : {}}
        resizeHandleWrapperStyle={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transform: `rotate(${wm.rotation}deg)`,
          transformOrigin: 'center',
          pointerEvents: 'none',
        }}
        style={{
          zIndex: 19,
          cursor: 'move',
          overflow: 'visible',
        }}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {/* rotated frame so the selection border tilts with the content */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transform: `rotate(${wm.rotation}deg)`,
            transformOrigin: 'center',
            border: selected ? '2px solid #1a8cff' : '1px dashed rgba(26, 140, 255, 0.35)',
            borderRadius: 2,
            boxSizing: 'border-box',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(index); }}
            style={{
              position: 'absolute', top: -12, right: -12, width: 24, height: 24,
              borderRadius: '50%', background: '#e94560', border: 'none', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, zIndex: 20,
            }}
            title="Remove watermark"
          >
            <X size={14} />
          </button>
          <WatermarkContent wm={wm} />
        </div>
      </Rnd>
    </>
  );
}
