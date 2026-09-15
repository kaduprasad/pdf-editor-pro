import { useState } from 'react';
import { X, Save, Trash2, FileDown, Layers } from 'lucide-react';
import type { WatermarkData } from '../types';
import { loadTemplates, deleteTemplate } from '../utils/templates';
import './WatermarkPanel.css';

interface TemplatesMenuProps {
  onApply: (watermarks: WatermarkData[], allPages: boolean) => void;
  onSaveCurrent: (name: string) => boolean;
  onClose: () => void;
}

export default function TemplatesMenu({ onApply, onSaveCurrent, onClose }: TemplatesMenuProps) {
  const [templates, setTemplates] = useState(loadTemplates());
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const confirmSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (onSaveCurrent(trimmed)) {
      setTemplates(loadTemplates());
      setNaming(false);
      setName('');
    }
  };

  const handleDelete = (id: string) => {
    setTemplates(deleteTemplate(id));
  };

  return (
    <div className="wm-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="wm-panel-header">
        <h3>Watermark Templates</h3>
        <button className="wm-panel-close" onClick={onClose} title="Close">
          <X size={18} />
        </button>
      </div>

      {naming ? (
        <div className="wm-tpl-name-form">
          <input
            className="wm-text-input"
            autoFocus
            placeholder="Template name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmSave();
              if (e.key === 'Escape') setNaming(false);
            }}
          />
          <button className="wm-tpl-btn" onClick={confirmSave} title="Save template">
            <Save size={14} />
            Save
          </button>
          <button className="wm-tpl-btn" onClick={() => setNaming(false)} title="Cancel">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button className="wm-apply-all-btn" onClick={() => setNaming(true)} title="Save this page's watermarks as a reusable template">
          <Save size={16} />
          Save current page as template
        </button>
      )}

      {templates.length === 0 ? (
        <p className="wm-tpl-empty">
          No templates yet. Add watermarks to a page, then save them as a template
          to reuse in any PDF.
        </p>
      ) : (
        templates.map(tpl => (
          <div key={tpl.id} className="wm-tpl-row">
            <div className="wm-tpl-info">
              <span className="wm-tpl-name" title={tpl.name}>{tpl.name}</span>
              <span className="wm-tpl-meta">
                {tpl.watermarks.length} item{tpl.watermarks.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="wm-tpl-actions">
              <button
                className="wm-tpl-btn"
                onClick={() => onApply(tpl.watermarks, false)}
                title="Apply to current page"
              >
                <FileDown size={14} />
                Page
              </button>
              <button
                className="wm-tpl-btn"
                onClick={() => onApply(tpl.watermarks, true)}
                title="Apply to all pages"
              >
                <Layers size={14} />
                All
              </button>
              <button
                className="wm-icon-btn wm-icon-btn-danger wm-tpl-delete"
                onClick={() => handleDelete(tpl.id)}
                title="Delete template"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
