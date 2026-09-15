import type { ChangeEvent } from "react";
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
  PenLine,
  Square,
  Stamp,
  ImageUp,
  LayoutTemplate,
  MoveRight,
  MoreHorizontal,
} from "lucide-react";
import type { ToolKind } from "../types";
import "./Toolbar.css";

interface ToolbarProps {
  hasPdf: boolean;
  currentPage: number;
  totalPages: number;
  fontSize: number;
  isBold: boolean;
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onDownload: () => void;
  onAddImage: () => void;
  onAddTextWatermark: () => void;
  onAddLogoWatermark: () => void;
  templatesOpen: boolean;
  onToggleTemplates: () => void;
  moreOpen: boolean;
  onToggleMore: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onFontSizeChange: (size: number) => void;
  onBoldToggle: () => void;
  onClearPage: () => void;
  activeTool: ToolKind | null;
  onToggleTool: (tool: ToolKind) => void;
  strokeWidth: number;
  onCycleStrokeWidth: () => void;
  zoom: number | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}

export default function Toolbar({
  hasPdf,
  currentPage,
  totalPages,
  fontSize,
  isBold,
  onUpload,
  onDownload,
  onAddImage,
  onAddTextWatermark,
  onAddLogoWatermark,
  templatesOpen,
  onToggleTemplates,
  moreOpen,
  onToggleMore,
  onPrevPage,
  onNextPage,
  onFontSizeChange,
  onBoldToggle,
  onClearPage,
  activeTool,
  onToggleTool,
  strokeWidth,
  onCycleStrokeWidth,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-brand">
        <span className="toolbar-logo">PDF</span>
        <span className="toolbar-title">Editor Pro</span>
      </div>

      <div className="toolbar-divider" />

      <label className="toolbar-btn toolbar-btn-primary" title="Upload PDF">
        <Upload size={18} />
        <span>Upload</span>
        <input
          type="file"
          accept="application/pdf"
          onChange={onUpload}
          style={{ display: "none" }}
        />
      </label>

      {hasPdf && (
        <>
          <div className="toolbar-divider" />

          <button
            className="toolbar-btn toolbar-btn-icon"
            onClick={onAddImage}
            title="Add image from file"
          >
            <ImagePlus size={18} />
          </button>

          <button
            className={`toolbar-btn ${activeTool === "text" ? "active" : ""}`}
            onClick={() => onToggleTool("text")}
            title="Text tool (Shift+T) — click on the page to place a text box (click again to deselect)"
          >
            <Type size={18} />
            <span>Text</span>
          </button>

          <button
            className={`toolbar-btn ${activeTool === "line" ? "active" : ""}`}
            onClick={() => onToggleTool("line")}
            title="Line tool (Shift+L) — drag to draw a horizontal line (click again to deselect)"
          >
            <PenLine size={18} />
            <span>Line</span>
          </button>

          <button
            className={`toolbar-btn ${activeTool === "rect" ? "active" : ""}`}
            onClick={() => onToggleTool("rect")}
            title="Rectangle tool (Shift+B) — drag to draw a box (click again to deselect)"
          >
            <Square size={18} />
            <span>Box</span>
          </button>

          <button
            className={`toolbar-btn toolbar-btn-icon ${activeTool === "arrow" ? "active" : ""}`}
            onClick={() => onToggleTool("arrow")}
            title="Arrow tool (Shift+A) — drag to draw a horizontal or vertical arrow (click again to deselect)"
          >
            <MoveRight size={18} />
          </button>

          <button
            className="toolbar-btn toolbar-btn-icon"
            onClick={onCycleStrokeWidth}
            title={`Stroke thickness: ${strokeWidth === 0.5 ? "Extra thin" : strokeWidth === 1 ? "Thin" : strokeWidth === 2 ? "Medium" : "Thick"} — click to change (applies to new lines, boxes and arrows)`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <line
                x1="2" y1="9" x2="16" y2="9"
                stroke="currentColor"
                strokeWidth={strokeWidth === 0.5 ? 0.75 : strokeWidth === 1 ? 1.5 : strokeWidth === 2 ? 3 : 5}
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="toolbar-divider" />

          <button
            className="toolbar-btn toolbar-btn-icon"
            onClick={onAddTextWatermark}
            title="Add text watermark — click it on the page to edit properties"
          >
            <Stamp size={18} />
          </button>

          <button
            className="toolbar-btn toolbar-btn-icon"
            onClick={onAddLogoWatermark}
            title="Add logo watermark — upload an image from your PC"
          >
            <ImageUp size={18} />
          </button>

          <button
            className={`toolbar-btn toolbar-btn-icon ${templatesOpen ? "active" : ""}`}
            onClick={onToggleTemplates}
            title="Watermark templates — save this page's watermarks and reuse them in any PDF"
          >
            <LayoutTemplate size={18} />
          </button>

          <div className="toolbar-divider" />

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
            className={`toolbar-btn-sm ${isBold ? "active" : ""}`}
            onClick={onBoldToggle}
            title="Bold"
          >
            <Bold size={16} />
          </button>

          <div className="toolbar-divider" />

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

          <div className="toolbar-group">
            <button
              className="toolbar-btn-sm"
              onClick={onZoomOut}
              title="Zoom out (Ctrl+Scroll)"
            >
              <ZoomOut size={16} />
            </button>
            <button
              className="toolbar-btn-zoom-label"
              onClick={onZoomFit}
              title="Fit to screen"
            >
              {zoom != null ? `${Math.round(zoom * 100)}%` : "Fit"}
            </button>
            <button
              className="toolbar-btn-sm"
              onClick={onZoomIn}
              title="Zoom in (Ctrl+Scroll)"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <div className="toolbar-divider" />

          <button
            className="toolbar-btn toolbar-btn-icon toolbar-btn-danger"
            onClick={onClearPage}
            title="Clear overlays on this page"
          >
            <Trash2 size={18} />
          </button>

          <button
            className="toolbar-btn toolbar-btn-icon toolbar-btn-primary"
            onClick={onDownload}
            title="Download edited PDF"
          >
            <Download size={18} />
          </button>

          <button
            className={`toolbar-btn toolbar-btn-icon ${moreOpen ? "active" : ""}`}
            onClick={onToggleMore}
            title="More tools — page numbers and other occasional options"
          >
            <MoreHorizontal size={18} />
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
