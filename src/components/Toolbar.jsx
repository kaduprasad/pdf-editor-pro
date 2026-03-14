import {
  Upload,
  Download,
  ImagePlus,
  Type,
  ChevronLeft,
  ChevronRight,
  Bold,
  Minus,
  Plus,
  Trash2,
  ClipboardPaste,
  ZoomIn,
  ZoomOut,
  Maximize,
} from 'lucide-react';
import './Toolbar.css';

export default function Toolbar({
  hasPdf,
  currentPage,
  totalPages,
  fontSize,
  isBold,
  onUpload,
  onDownload,
  onAddImage,
  onAddText,
  onPrevPage,
  onNextPage,
  onFontSizeChange,
  onBoldToggle,
  onClearPage,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-brand">
        <span className="toolbar-logo">PDF</span>
        <span className="toolbar-title">Editor Pro</span>
      </div>

      <div className="toolbar-divider" />

      {/* Upload */}
      <label className="toolbar-btn toolbar-btn-primary" title="Upload PDF">
        <Upload size={18} />
        <span>Upload</span>
        <input
          type="file"
          accept="application/pdf"
          onChange={onUpload}
          style={{ display: 'none' }}
        />
      </label>

      {hasPdf && (
        <>
          <div className="toolbar-divider" />

          {/* Add Image */}
          <button className="toolbar-btn" onClick={onAddImage} title="Add image from file">
            <ImagePlus size={18} />
            <span>Image</span>
          </button>

          {/* Add Text */}
          <button className="toolbar-btn" onClick={onAddText} title="Add text box">
            <Type size={18} />
            <span>Text</span>
          </button>

          <div className="toolbar-divider" />

          {/* Text controls */}
          <div className="toolbar-group" title="Font size">
            <button
              className="toolbar-btn-sm"
              onClick={() => onFontSizeChange(Math.max(8, fontSize - 2))}
            >
              <Minus size={14} />
            </button>
            <span className="toolbar-font-size">{fontSize}px</span>
            <button
              className="toolbar-btn-sm"
              onClick={() => onFontSizeChange(Math.min(72, fontSize + 2))}
            >
              <Plus size={14} />
            </button>
          </div>

          <button
            className={`toolbar-btn-sm ${isBold ? 'active' : ''}`}
            onClick={onBoldToggle}
            title="Bold"
          >
            <Bold size={16} />
          </button>

          <div className="toolbar-divider" />

          {/* Page navigation */}
          <div className="toolbar-group">
            <button
              className="toolbar-btn-sm"
              onClick={onPrevPage}
              disabled={currentPage <= 0}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="toolbar-page-info">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              className="toolbar-btn-sm"
              onClick={onNextPage}
              disabled={currentPage >= totalPages - 1}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Zoom controls */}
          <div className="toolbar-group">
            <button className="toolbar-btn-sm" onClick={onZoomOut} title="Zoom out (Ctrl+Scroll)">
              <ZoomOut size={16} />
            </button>
            <button className="toolbar-btn-zoom-label" onClick={onZoomFit} title="Fit to screen">
              {zoom != null ? `${Math.round(zoom * 100)}%` : 'Fit'}
            </button>
            <button className="toolbar-btn-sm" onClick={onZoomIn} title="Zoom in (Ctrl+Scroll)">
              <ZoomIn size={16} />
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Clear page overlays */}
          <button className="toolbar-btn toolbar-btn-danger" onClick={onClearPage} title="Clear overlays on this page">
            <Trash2 size={18} />
            <span>Clear</span>
          </button>

          {/* Download */}
          <button className="toolbar-btn toolbar-btn-primary" onClick={onDownload} title="Download edited PDF">
            <Download size={18} />
            <span>Download</span>
          </button>
        </>
      )}

      {hasPdf && (
        <div className="toolbar-hint">
          <ClipboardPaste size={14} />
          <span>Ctrl+V to paste image</span>
        </div>
      )}
    </div>
  );
}
