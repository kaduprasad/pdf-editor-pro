import { useState } from 'react';
import { X, Copy, Trash2, Layers, Eraser, Bold } from 'lucide-react';
import type { WatermarkData, WatermarkTile, WatermarkFont, WatermarkEffect } from '../types';
import { WATERMARK_FONTS, measureWatermarkText, TEXT_WM_BASE_FONT, removeWhiteBackground } from '../utils/watermark';
import './WatermarkPanel.css';

interface WatermarkPanelProps {
  wm: WatermarkData;
  onChange: (wm: WatermarkData) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
  onApplyAllPages: () => void;
}

const TILE_OPTIONS: Array<{ value: WatermarkTile; title: string; dots: Array<[number, number]> }> = [
  { value: 'single', title: 'Single', dots: [[11, 11]] },
  { value: 'grid', title: 'Grid', dots: [[7, 7], [15, 7], [7, 15], [15, 15]] },
  { value: 'diagonal', title: 'Diagonal', dots: [[6, 6], [16, 8], [11, 12], [6, 16], [16, 16]] },
];

export default function WatermarkPanel({
  wm,
  onChange,
  onDuplicate,
  onDelete,
  onClose,
  onApplyAllPages,
}: WatermarkPanelProps) {
  const [removingBg, setRemovingBg] = useState(false);

  const handleRemoveBackground = async () => {
    if (wm.type !== 'image' || removingBg) return;
    setRemovingBg(true);
    try {
      const src = await removeWhiteBackground(wm.src);
      onChange({ ...wm, src });
    } catch (err) {
      alert('Could not remove background. ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRemovingBg(false);
    }
  };

  const setText = (content: string) => {
    if (wm.type !== 'text') return;
    const { width, height } = measureWatermarkText(content, wm.font, wm.bold);
    onChange({ ...wm, content, width, height });
  };

  const setFont = (font: WatermarkFont) => {
    if (wm.type !== 'text') return;
    const { width, height } = measureWatermarkText(wm.content, font, wm.bold);
    onChange({ ...wm, font, width, height });
  };

  const toggleBold = () => {
    if (wm.type !== 'text') return;
    const bold = !wm.bold;
    const { width, height } = measureWatermarkText(wm.content, wm.font, bold);
    onChange({ ...wm, bold, width, height });
  };

  const setScale = (scale: number) => {
    onChange({ ...wm, scale: Math.max(0.2, Math.min(6, scale)) });
  };

  const fontSizePx = Math.round(TEXT_WM_BASE_FONT * wm.scale);

  return (
    <div className="wm-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="wm-panel-header">
        <h3>Properties</h3>
        <button className="wm-panel-close" onClick={onClose} title="Close">
          <X size={18} />
        </button>
      </div>

      {wm.type === 'image' && (
        <button
          className="wm-remove-bg-btn"
          onClick={handleRemoveBackground}
          disabled={removingBg}
          title="Make the white background of the logo transparent"
        >
          <Eraser size={16} />
          {removingBg ? 'Removing…' : 'Remove white background'}
        </button>
      )}

      {wm.type === 'text' && (
        <>
          <div className="wm-row">
            <label>Text</label>
            <textarea
              className="wm-text-input"
              value={wm.content}
              rows={1}
              onChange={(e) => setText(e.target.value)}
              placeholder="Your Text"
            />
          </div>

          <div className="wm-row">
            <label>Font</label>
            <select
              className="wm-select"
              value={wm.font}
              onChange={(e) => setFont(e.target.value as WatermarkFont)}
            >
              {WATERMARK_FONTS.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <button
              className={`wm-bold-btn ${wm.bold ? 'active' : ''}`}
              onClick={toggleBold}
              title="Bold"
            >
              <Bold size={15} />
            </button>
          </div>

          <div className="wm-row">
            <label>Color</label>
            <input
              type="color"
              className="wm-color-input"
              value={wm.color}
              onChange={(e) => onChange({ ...wm, color: e.target.value })}
            />
          </div>
        </>
      )}

      <div className="wm-row">
        <label>{wm.type === 'text' ? 'Font size' : 'Size'}</label>
        <div className="wm-slider-wrap">
          {wm.type === 'text' ? (
            <>
              <input
                type="range"
                min={6}
                max={168}
                step={1}
                value={fontSizePx}
                onChange={(e) => setScale(parseInt(e.target.value, 10) / TEXT_WM_BASE_FONT)}
              />
              <input
                type="number"
                className="wm-num-input"
                min={6}
                max={168}
                value={fontSizePx}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v)) setScale(v / TEXT_WM_BASE_FONT);
                }}
              />
              <span className="wm-deg-sign">px</span>
            </>
          ) : (
            <>
              <input
                type="range"
                min={0.2}
                max={6}
                step={0.1}
                value={wm.scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
              />
              <input
                type="number"
                className="wm-num-input"
                min={0.2}
                max={6}
                step={0.1}
                value={Number(wm.scale.toFixed(1))}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v)) setScale(v);
                }}
              />
              <span className="wm-deg-sign">x</span>
            </>
          )}
        </div>
      </div>

      <div className="wm-row">
        <label>Tile</label>
        <div className="wm-tile-group">
          {TILE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`wm-tile-btn ${wm.tile === opt.value ? 'active' : ''}`}
              title={opt.title}
              onClick={() => onChange({ ...wm, tile: opt.value })}
            >
              <svg width="22" height="22" viewBox="0 0 22 22">
                {opt.dots.map(([cx, cy], i) => (
                  <circle key={i} cx={cx} cy={cy} r="2.2" fill="currentColor" />
                ))}
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div className="wm-row">
        <label>Opacity</label>
        <div className="wm-slider-wrap">
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={wm.opacity}
            onChange={(e) => onChange({ ...wm, opacity: parseFloat(e.target.value) })}
          />
          <span className="wm-slider-value">{Math.round(wm.opacity * 100)}%</span>
        </div>
      </div>

      <div className="wm-row">
        <label>Rotation</label>
        <div className="wm-slider-wrap">
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={wm.rotation}
            onChange={(e) => onChange({ ...wm, rotation: parseInt(e.target.value, 10) })}
          />
          <input
            type="number"
            className="wm-num-input"
            min={-180}
            max={180}
            value={wm.rotation}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onChange({ ...wm, rotation: Number.isNaN(v) ? 0 : Math.max(-180, Math.min(180, v)) });
            }}
          />
          <span className="wm-deg-sign">&deg;</span>
        </div>
      </div>

      <div className="wm-row">
        <label>Effect</label>
        <select
          className="wm-select"
          value={wm.effect}
          onChange={(e) => onChange({ ...wm, effect: e.target.value as WatermarkEffect })}
        >
          <option value="none">None</option>
          <option value="grayscale">Grayscale</option>
        </select>
      </div>

      <button className="wm-apply-all-btn" onClick={onApplyAllPages} title="Copy this page's watermarks to every page">
        <Layers size={16} />
        Apply to all pages
      </button>

      <div className="wm-panel-footer">
        <button className="wm-icon-btn" onClick={onDuplicate} title="Duplicate watermark">
          <Copy size={18} />
        </button>
        <button className="wm-icon-btn wm-icon-btn-danger" onClick={onDelete} title="Delete watermark">
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
