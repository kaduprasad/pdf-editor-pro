import { useState, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { ShapeKind, ShapeOverlayData } from '../types';

interface DrawingLayerProps {
  tool: ShapeKind;
  onCommit: (shape: ShapeOverlayData) => void;
}

interface Draft {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

/** Sits on top of the page while a shape tool is active and turns a drag into a shape. */
export default function DrawingLayer({ tool, onCommit }: DrawingLayerProps) {
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
    if (tool === 'line') {
      const width = Math.abs(curX - startX);
      if (width < 5) return;
      onCommit({ kind: 'line', x: Math.min(startX, curX), y: startY, width, height: 0 });
    } else {
      const width = Math.abs(curX - startX);
      const height = Math.abs(curY - startY);
      if (width < 5 || height < 5) return;
      onCommit({ kind: 'rect', x: Math.min(startX, curX), y: Math.min(startY, curY), width, height });
    }
  }, [draft, tool, onCommit]);

  // Draft preview geometry
  let preview = null;
  if (draft) {
    if (tool === 'line') {
      preview = (
        <div style={{
          position: 'absolute',
          left: Math.min(draft.startX, draft.curX),
          top: draft.startY - 1,
          width: Math.abs(draft.curX - draft.startX),
          height: 2,
          background: '#000',
          pointerEvents: 'none',
        }} />
      );
    } else {
      preview = (
        <div style={{
          position: 'absolute',
          left: Math.min(draft.startX, draft.curX),
          top: Math.min(draft.startY, draft.curY),
          width: Math.abs(draft.curX - draft.startX),
          height: Math.abs(draft.curY - draft.startY),
          border: '2px solid #000',
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
