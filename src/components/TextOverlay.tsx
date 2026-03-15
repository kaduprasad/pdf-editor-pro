import { Rnd } from 'react-rnd';
import { X, GripVertical } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent, ChangeEvent } from 'react';
import type { TextOverlayData } from '../types';

interface TextOverlayProps {
  text: TextOverlayData;
  index: number;
  onUpdate: (index: number, text: TextOverlayData) => void;
  onDelete: (index: number) => void;
}

export default function TextOverlay({ text, index, onUpdate, onDelete }: TextOverlayProps) {
  const [editing, setEditing] = useState(!text.content);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleBlur = () => {
    if (text.content?.trim()) {
      setEditing(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.content?.trim()) {
        setEditing(false);
      }
    }
  };

  return (
    <Rnd
      size={{ width: text.width || 200, height: text.height || 36 }}
      position={{ x: text.x, y: text.y }}
      onDragStop={(_e, d) => {
        onUpdate(index, { ...text, x: d.x, y: d.y });
      }}
      onResizeStop={(_e, _direction, ref, _delta, position) => {
        onUpdate(index, {
          ...text,
          width: parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
          x: position.x,
          y: position.y,
        });
      }}
      bounds="parent"
      dragHandleClassName="text-drag-handle"
      enableResizing={{
        right: true,
        bottom: true,
        bottomRight: true,
      }}
      minWidth={80}
      minHeight={30}
      style={{
        border: editing ? '2px solid rgba(233, 69, 96, 0.8)' : '1px dashed rgba(233, 69, 96, 0.4)',
        borderRadius: '4px',
        zIndex: 10,
        background: editing ? 'rgba(255,255,255,0.95)' : 'transparent',
        overflow: 'visible',
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
        title="Remove text"
      >
        <X size={14} />
      </button>

      <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div
          className="text-drag-handle"
          style={{ position: 'absolute', top: 0, left: 0, width: 20, height: '100%', cursor: 'move', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4, zIndex: 5 }}
          title="Drag to move"
        >
          <GripVertical size={14} color="#e94560" />
        </div>

        {editing ? (
          <textarea
            ref={inputRef}
            value={text.content || ''}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onUpdate(index, { ...text, content: e.target.value })}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%', height: '100%', border: 'none', outline: 'none',
              background: 'transparent', resize: 'none',
              fontSize: text.fontSize || 16, fontWeight: text.bold ? 'bold' : 'normal',
              fontFamily: 'Helvetica, Arial, sans-serif', color: '#000',
              paddingLeft: 22, paddingTop: 6, paddingRight: 6, paddingBottom: 6,
              boxSizing: 'border-box',
            }}
            placeholder="Type text here..."
          />
        ) : (
          <div
            onDoubleClick={() => setEditing(true)}
            style={{
              width: '100%', fontSize: text.fontSize || 16,
              fontWeight: text.bold ? 'bold' : 'normal',
              fontFamily: 'Helvetica, Arial, sans-serif', color: '#000',
              paddingLeft: 22, paddingRight: 6, cursor: 'default',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              userSelect: 'none', lineHeight: 1.4,
            }}
            title="Double-click to edit"
          >
            {text.content}
          </div>
        )}
      </div>
    </Rnd>
  );
}
