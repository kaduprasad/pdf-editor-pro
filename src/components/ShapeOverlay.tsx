import { Rnd } from 'react-rnd';
import { X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ShapeOverlayData } from '../types';

const LINE_HIT_AREA = 12; // clickable band around the 2px line

const handleStyle = (cursor: string): CSSProperties => ({
  width: 10,
  height: 10,
  background: '#1a8cff',
  border: '2px solid #fff',
  borderRadius: '50%',
  position: 'absolute',
  zIndex: 15,
  cursor,
  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
});

interface ShapeOverlayProps {
  shape: ShapeOverlayData;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (index: number, shape: ShapeOverlayData) => void;
  onDelete: (index: number) => void;
}

export default function ShapeOverlay({ shape, index, selected, onSelect, onUpdate, onDelete }: ShapeOverlayProps) {
  const isLinear = shape.kind === 'line' || shape.kind === 'arrow';
  const vertical = shape.kind === 'arrow' && (shape.dir === 'up' || shape.dir === 'down');
  const headRight = shape.dir !== 'left';
  const headDown = shape.dir === 'down';
  const thickness = shape.thickness ?? 2;

  return (
    <Rnd
      size={{
        width: vertical ? LINE_HIT_AREA : shape.width,
        height: isLinear && !vertical ? LINE_HIT_AREA : shape.height,
      }}
      position={{
        x: vertical ? shape.x - LINE_HIT_AREA / 2 : shape.x,
        y: isLinear && !vertical ? shape.y - LINE_HIT_AREA / 2 : shape.y,
      }}
      onDragStop={(_e, d) => {
        onUpdate(index, {
          ...shape,
          x: vertical ? d.x + LINE_HIT_AREA / 2 : d.x,
          y: isLinear && !vertical ? d.y + LINE_HIT_AREA / 2 : d.y,
        });
      }}
      onResizeStop={(_e, _direction, ref, _delta, position) => {
        onUpdate(index, {
          ...shape,
          width: vertical ? 0 : parseFloat(ref.style.width),
          height: isLinear && !vertical ? 0 : parseFloat(ref.style.height),
          x: vertical ? position.x + LINE_HIT_AREA / 2 : position.x,
          y: isLinear && !vertical ? position.y + LINE_HIT_AREA / 2 : position.y,
        });
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!selected) onSelect();
      }}
      bounds="parent"
      minWidth={vertical ? LINE_HIT_AREA : 10}
      minHeight={isLinear && !vertical ? LINE_HIT_AREA : 10}
      enableResizing={!selected ? false : vertical
        ? { top: true, bottom: true }
        : isLinear
          ? { left: true, right: true }
          : { top: true, right: true, bottom: true, left: true, topRight: true, bottomRight: true, bottomLeft: true, topLeft: true }}
      resizeHandleStyles={vertical ? {
        top: { ...handleStyle('ns-resize'), top: -5, left: '50%', marginLeft: -5 },
        bottom: { ...handleStyle('ns-resize'), bottom: -5, left: '50%', marginLeft: -5 },
      } : isLinear ? {
        left: { ...handleStyle('ew-resize'), left: -5, top: '50%', marginTop: -5 },
        right: { ...handleStyle('ew-resize'), right: -5, top: '50%', marginTop: -5 },
      } : {
        topLeft: { ...handleStyle('nwse-resize'), top: -5, left: -5 },
        topRight: { ...handleStyle('nesw-resize'), top: -5, right: -5 },
        bottomLeft: { ...handleStyle('nesw-resize'), bottom: -5, left: -5 },
        bottomRight: { ...handleStyle('nwse-resize'), bottom: -5, right: -5 },
      }}
      style={{
        cursor: 'move',
        zIndex: selected ? 12 : 10,
        overflow: 'visible',
        outline: selected ? '1px dashed rgba(26, 140, 255, 0.6)' : 'none',
        outlineOffset: 2,
      }}
    >
      {vertical ? (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          width: thickness,
          height: '100%',
          marginLeft: -thickness / 2,
          background: '#000',
        }}>
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            [headDown ? 'bottom' : 'top']: -1,
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            [headDown ? 'borderTop' : 'borderBottom']: '10px solid #000',
          }} />
        </div>
      ) : isLinear ? (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          width: '100%',
          height: thickness,
          marginTop: -thickness / 2,
          background: '#000',
        }}>
          {shape.kind === 'arrow' && (
            <div style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              [headRight ? 'right' : 'left']: -1,
              width: 0,
              height: 0,
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              [headRight ? 'borderLeft' : 'borderRight']: '10px solid #000',
            }} />
          )}
        </div>
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          border: `${thickness}px solid #000`,
          boxSizing: 'border-box',
          background: 'transparent',
        }} />
      )}

      {selected && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(index); }}
          style={{
            position: 'absolute', top: -14, right: -14, width: 24, height: 24,
            borderRadius: '50%', background: '#e94560', border: 'none', color: '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, zIndex: 20,
          }}
          title="Remove shape"
        >
          <X size={14} />
        </button>
      )}
    </Rnd>
  );
}
