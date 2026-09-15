import { useState } from 'react';
import { X, Hash, AlignLeft, AlignCenter, AlignRight, Trash2 } from 'lucide-react';
import type { PageNumberOptions, PageNumberPosition } from '../types';
import './WatermarkPanel.css';

interface MoreMenuProps {
  onApplyPageNumbers: (opts: PageNumberOptions) => void;
  onRemovePageNumbers: () => void;
  onClose: () => void;
}

const POSITIONS: Array<{ value: PageNumberPosition; icon: typeof AlignLeft; title: string }> = [
  { value: 'bottom-left', icon: AlignLeft, title: 'Bottom left' },
  { value: 'bottom-center', icon: AlignCenter, title: 'Bottom center' },
  { value: 'bottom-right', icon: AlignRight, title: 'Bottom right' },
];

export default function MoreMenu({ onApplyPageNumbers, onRemovePageNumbers, onClose }: MoreMenuProps) {
  const [startNumber, setStartNumber] = useState(1);
  const [fontSize, setFontSize] = useState(12);
  const [position, setPosition] = useState<PageNumberPosition>('bottom-center');

  return (
    <div className="wm-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="wm-panel-header">
        <h3>More Tools</h3>
        <button className="wm-panel-close" onClick={onClose} title="Close">
          <X size={18} />
        </button>
      </div>

      <div className="more-section">
        <div className="more-section-title">
          <Hash size={15} />
          Page Numbers
        </div>

        <div className="wm-row">
          <label htmlFor="pn-start">Start at</label>
          <input
            id="pn-start"
            className="wm-num-input"
            type="number"
            min={0}
            value={startNumber}
            onChange={(e) => setStartNumber(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>

        <div className="wm-row">
          <label htmlFor="pn-size">Font size</label>
          <input
            id="pn-size"
            className="wm-num-input"
            type="number"
            min={6}
            max={72}
            value={fontSize}
            onChange={(e) => setFontSize(Math.min(72, Math.max(6, Number(e.target.value) || 12)))}
          />
          <span className="wm-deg-sign">px</span>
        </div>

        <div className="wm-row">
          <label>Position</label>
          <div className="wm-tile-group">
            {POSITIONS.map(({ value, icon: Icon, title }) => (
              <button
                key={value}
                className={`wm-tile-btn ${position === value ? 'active' : ''}`}
                onClick={() => setPosition(value)}
                title={title}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>

        <button
          className="wm-apply-all-btn"
          onClick={() => onApplyPageNumbers({ startNumber, fontSize, position })}
          title="Number every page sequentially, starting from the number above"
        >
          <Hash size={16} />
          Apply to all pages
        </button>

        <button className="more-remove-btn" onClick={onRemovePageNumbers} title="Remove page numbers from every page">
          <Trash2 size={14} />
          Remove page numbers
        </button>
      </div>
    </div>
  );
}
