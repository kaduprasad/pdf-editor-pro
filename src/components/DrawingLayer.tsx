import { useState, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { ShapeKind, ShapeOverlayData } from '../types';

interface DrawingLayerProps {
  tool: ShapeKind;
  strokeWidth: number;
  onCommit: (shape: ShapeOverlayData) => void;
}

interface Draft {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

/** Sits on top of the page while a shape tool is active and turns a drag into a shape. */
export default function DrawingLayer({ tool, strokeWidth, onCommit }: DrawingLayerProps) {
  const [draft, setDraft] = useState<Draft | null>(null);

  const getPos = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    setDraft({ startX: x, startY: y, curX: x, curY: y });
  }, []);

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!draft) return;
    const { x, y } = getPos(e);
    setDraft(d => (d ? { ...d, curX: x, curY: y } : d));
  }, [draft]);

  const finishDraft = useCallback(() => {
    if (!draft) return;
    const { startX, startY, curX, curY } = draft;
    setDraft(null);
    if (tool === 'arrow' && Math.abs(curY - startY) > Math.abs(curX - startX)) {
      // vertical arrow — snapped to the dominant drag axis
      const height = Math.abs(curY - startY);
      if (height < 5) return;
      onCommit({
        kind: 'arrow',
        x: startX,
        y: Math.min(startY, curY),
        width: 0,
        height,
        dir: curY >= startY ? 'down' : 'up',
        thickness: strokeWidth,
      });
    } else if (tool === 'line' || tool === 'arrow') {
      const width = Math.abs(curX - startX);
      if (width < 5) return;
      onCommit({
        kind: tool,
        x: Math.min(startX, curX),
        y: startY,
        width,
        height: 0,
        thickness: strokeWidth,
        ...(tool === 'arrow' ? { dir: (curX >= startX ? 'right' : 'left') as 'left' | 'right' } : {}),
      });
    } else {
      const width = Math.abs(curX - startX);
      const height = Math.abs(curY - startY);
      if (width < 5 || height < 5) return;
      onCommit({ kind: 'rect', x: Math.min(startX, curX), y: Math.min(startY, curY), width, height, thickness: strokeWidth });
    }
  }, [draft, tool, strokeWidth, onCommit]);

  // Draft preview geometry
  let preview = null;
  if (draft) {
    const isVerticalArrow = tool === 'arrow'
      && Math.abs(draft.curY - draft.startY) > Math.abs(draft.curX - draft.startX);
    if (isVerticalArrow) {
      const top = Math.min(draft.startY, draft.curY);
      const height = Math.abs(draft.curY - draft.startY);
      const headDown = draft.curY >= draft.startY;
      preview = (
        <div style={{
          position: 'absolute',
          left: draft.startX - strokeWidth / 2,
          top,
          width: strokeWidth,
          height,
          background: '#000',
          pointerEvents: 'none',
        }}>
          {height >= 5 && (
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
          )}
        </div>
      );
    } else if (tool === 'line' || tool === 'arrow') {
      const left = Math.min(draft.startX, draft.curX);
      const width = Math.abs(draft.curX - draft.startX);
      const headRight = draft.curX >= draft.startX;
      preview = (
        <div style={{
          position: 'absolute',
          left,
          top: draft.startY - strokeWidth / 2,
          width,
          height: strokeWidth,
          background: '#000',
          pointerEvents: 'none',
        }}>
          {tool === 'arrow' && width >= 5 && (
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
      );
    } else {
      preview = (
        <div style={{
          position: 'absolute',
          left: Math.min(draft.startX, draft.curX),
          top: Math.min(draft.startY, draft.curY),
          width: Math.abs(draft.curX - draft.startX),
          height: Math.abs(draft.curY - draft.startY),
          border: `${strokeWidth}px solid #000`,
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }} />
      );
    }
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={finishDraft}
      onMouseLeave={finishDraft}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        cursor: 'crosshair',
      }}
    >
      {preview}
    </div>
  );
}
