import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { saveAs } from 'file-saver';
import { FileUp, RotateCcw, X } from 'lucide-react';

import Toolbar from './components/Toolbar';
import PdfViewer from './components/PdfViewer';
import ImageOverlay from './components/ImageOverlay';
import TextOverlay from './components/TextOverlay';
import ShapeOverlay from './components/ShapeOverlay';
import DrawingLayer from './components/DrawingLayer';
import WatermarkOverlay from './components/WatermarkOverlay';
import WatermarkPanel from './components/WatermarkPanel';
import TemplatesMenu from './components/TemplatesMenu';
import MoreMenu from './components/MoreMenu';
import { useSessionStorage } from './hooks/useSessionStorage';
import { exportPdfWithEdits, extractOverlayData } from './utils/pdfExport';
import { measureWatermarkText } from './utils/watermark';
import { saveTemplate } from './utils/templates';
import { buildPageNumberOverlay } from './utils/pageNumbers';
import {
  getSessionId,
  newSessionId,
  savePdfBytes,
  saveBackupMeta,
  listBackups,
  getBackup,
  deleteBackup,
} from './utils/backup';
import type { BackupMeta } from './utils/backup';
import type { ImageOverlayData, TextOverlayData, ShapeOverlayData, ToolKind, PageDimensionsMap, PageDimensions, SelectedOverlay, WatermarkData, TextWatermarkData, ImageWatermarkData, OverlaysByPage, PageNumberOptions } from './types';
import './App.css';

// Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const STROKE_WIDTH_KEY = 'pdf-editor-pro-stroke-width';
const STROKE_LEVELS = [0.5, 1, 2, 3];
const AUTOSAVE_INTERVAL_MS = 30_000;

function App() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfName, setPdfName] = useState('');
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [isBold, setIsBold] = useState(false);
  const [pageDimensions, setPageDimensions] = useState<PageDimensionsMap>({});
  const [zoom, setZoom] = useState<number | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<SelectedOverlay | null>(null);
  const [activeTool, setActiveTool] = useState<ToolKind | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [backupList, setBackupList] = useState<BackupMeta[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [strokeWidth, setStrokeWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem(STROKE_WIDTH_KEY));
    return STROKE_LEVELS.includes(v) ? v : 1;
  });

  const cycleStrokeWidth = useCallback(() => {
    setStrokeWidth(prev => {
      const next = STROKE_LEVELS[(STROKE_LEVELS.indexOf(prev) + 1) % STROKE_LEVELS.length] ?? 1;
      localStorage.setItem(STROKE_WIDTH_KEY, String(next));
      return next;
    });
  }, []);

  const { overlays, getPageOverlays, setPageOverlays, updatePageOverlays, clearAll } = useSessionStorage();
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // Warn before leaving/closing the page if there are unsaved edits
  useEffect(() => {
    const hasEdits = pdfDoc && Object.values(overlays).some(
      p => (p.images?.length || 0) + (p.texts?.length || 0) + (p.shapes?.length || 0) + (p.watermarks?.length || 0) > 0
    );
    if (!hasEdits) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // required by some browsers to show the confirmation dialog
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pdfDoc, overlays]);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // Measure the editor wrapper so PdfViewer can scale to fill it
  useEffect(() => {
    const measure = () => {
      if (editorWrapperRef.current) {
        const rect = editorWrapperRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Reset zoom to auto-fit when a new PDF is loaded
  const zoomFit = useCallback(() => setZoom(null), []);
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min((prev || 1) + 0.25, 5));
  }, []);
  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max((prev || 1) - 0.25, 0.25));
  }, []);

  // Ctrl+Scroll to zoom
  useEffect(() => {
    if (!pdfDoc) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom(prev => Math.min((prev || 1) + 0.1, 5));
      } else {
        setZoom(prev => Math.max((prev || 1) - 0.1, 0.25));
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [pdfDoc]);

  // Reset selection and scroll back to the top of the page on page change
  useEffect(() => {
    setSelectedOverlay(null);
    editorAreaRef.current?.scrollTo({ top: 0, left: 0 });
  }, [currentPage]);

  // Current page overlays
  const pageOverlays = getPageOverlays(currentPage);
  const images = pageOverlays.images || [];
  const texts = pageOverlays.texts || [];
  const shapes = pageOverlays.shapes || [];
  const watermarks = pageOverlays.watermarks || [];

  // ---- PDF Loading ----
  const sessionIdRef = useRef<string>(getSessionId());

  const loadPdf = useCallback(async (
    arrayBuffer: ArrayBuffer,
    fileName: string,
    restore?: { overlays: OverlaysByPage; pageDimensions: PageDimensionsMap },
  ) => {
    setLoading(true);
    try {
      const bytes = new Uint8Array(arrayBuffer);
      setPdfBytes(bytes);
      setPdfName(fileName);

      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(0);

      // Every load (upload or restore) gets its own backup slot so tabs never
      // overwrite each other, even after tab duplication or a shared restore
      sessionIdRef.current = newSessionId();
      savePdfBytes(sessionIdRef.current, bytes.slice()).catch(err =>
        console.warn('Backup of PDF bytes failed:', err)
      );

      if (restore) {
        for (const [pageIdx, pageData] of Object.entries(restore.overlays)) {
          setPageOverlays(Number(pageIdx), pageData);
        }
        setPageDimensions(restore.pageDimensions);
        return;
      }

      // Check for embedded overlay data from a previous edit session
      const embedded = await extractOverlayData(doc);
      if (embedded) {
        for (const [pageIdx, pageData] of Object.entries(embedded.overlaysByPage)) {
          setPageOverlays(Number(pageIdx), pageData);
        }
        setPageDimensions(embedded.pageDimensions);
      }
    } catch (err) {
      console.error('Failed to load PDF:', err);
      alert('Failed to load PDF. Please try a different file.');
    } finally {
      setLoading(false);
    }
  }, [setPageOverlays]);

  const handleUpload = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearAll();
    historyRef.current = [];
    const reader = new FileReader();
    reader.onload = () => loadPdf(reader.result as ArrayBuffer, file.name);
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, [loadPdf, clearAll]);

  // ---- Crash recovery ----
  // Offer the most recent backup from any tab when starting with no PDF open
  useEffect(() => {
    if (pdfDoc) return;
    let cancelled = false;
    const refresh = () => {
      listBackups()
        .then(list => { if (!cancelled) setBackupList(list); })
        .catch(() => {});
    };
    refresh();
    // pick up backups written by other tabs while this one sits on the start screen
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
    };
  }, [pdfDoc]);

  const handleRestoreBackup = useCallback(async (sessionId: string) => {
    setLoading(true);
    try {
      const backup = await getBackup(sessionId);
      if (!backup) {
        alert('That backup is no longer available.');
        setBackupList(prev => prev.filter(b => b.sessionId !== sessionId));
        return;
      }
      clearAll();
      historyRef.current = [];
      const buffer = backup.pdfBytes.slice().buffer as ArrayBuffer;
      await loadPdf(buffer, backup.pdfName, {
        overlays: backup.overlays,
        pageDimensions: backup.pageDimensions,
      });
      // work now lives in this tab's fresh slot; drop the old one to avoid duplicates
      deleteBackup(sessionId).catch(() => {});
      setBackupList(prev => prev.filter(b => b.sessionId !== sessionId));
    } catch (err) {
      console.error('Restore failed:', err);
      alert('Could not restore the backup.');
    } finally {
      setLoading(false);
    }
  }, [loadPdf, clearAll]);

  const handleDeleteBackup = useCallback((sessionId: string) => {
    deleteBackup(sessionId).catch(() => {});
    setBackupList(prev => prev.filter(b => b.sessionId !== sessionId));
  }, []);

  // ---- Autosave every 30s (only when something changed) ----
  const backupStateRef = useRef({ overlays, pageDimensions, pdfName, totalPages, hasPdf: false });
  backupStateRef.current = { overlays, pageDimensions, pdfName, totalPages, hasPdf: !!pdfDoc };

  useEffect(() => {
    if (!pdfDoc) return;
    let lastSerialized = '';
    const save = () => {
      const s = backupStateRef.current;
      if (!s.hasPdf) return;
      const serialized = JSON.stringify(s.overlays) + JSON.stringify(s.pageDimensions);
      if (serialized === lastSerialized) return;
      lastSerialized = serialized;
      saveBackupMeta({
        sessionId: sessionIdRef.current,
        pdfName: s.pdfName,
        totalPages: s.totalPages,
        overlays: s.overlays,
        pageDimensions: s.pageDimensions,
        updatedAt: Date.now(),
      })
        .then(() => setLastSavedAt(Date.now()))
        .catch(err => console.warn('Autosave failed:', err));
    };
    save();
    const id = setInterval(save, AUTOSAVE_INTERVAL_MS);
    return () => { clearInterval(id); save(); };
  }, [pdfDoc]);

  // ---- Page Navigation ----
  const handlePrevPage = useCallback(() => {
    setCurrentPage(p => Math.max(0, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(p => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  // ---- Dimension tracking ----
  const handleDimensionsReady = useCallback((_pageIdx: number, dims: PageDimensions) => {
    setPageDimensions(prev => ({ ...prev, [_pageIdx]: dims }));
  }, []);

  // Track mouse position relative to the canvas-and-overlays container.
  // Only updated while the cursor is over the page, so toolbar clicks reuse the last on-page position.
  const mousePosRef = useRef({ x: 50, y: 50 });
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasWrapperRef.current) return;
      const rect = canvasWrapperRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      mousePosRef.current = { x, y };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // ---- Undo history (one entry per added overlay; undo removes that item) ----
  const historyRef = useRef<Array<{ page: number; type: 'image' | 'text' | 'shape' | 'watermark' }>>([]);

  const pushHistory = useCallback((page: number, type: 'image' | 'text' | 'shape' | 'watermark') => {
    historyRef.current.push({ page, type });
    if (historyRef.current.length > 100) historyRef.current.shift();
  }, []);

  const handleUndo = useCallback(() => {
    const entry = historyRef.current.pop();
    if (!entry) return;
    updatePageOverlays(entry.page, (current) => {
      if (entry.type === 'image') {
        return { ...current, images: (current.images || []).slice(0, -1) };
      }
      if (entry.type === 'text') {
        return { ...current, texts: (current.texts || []).slice(0, -1) };
      }
      if (entry.type === 'watermark') {
        return { ...current, watermarks: (current.watermarks || []).slice(0, -1) };
      }
      return { ...current, shapes: (current.shapes || []).slice(0, -1) };
    });
    setSelectedOverlay(null);
  }, [updatePageOverlays]);

  // ---- Image handling ----
  const addImageFromDataUrl = useCallback((dataUrl: string, position?: { x: number; y: number }) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 300;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const w = img.width * scale;
      const h = img.height * scale;
      const px = position ? Math.max(0, position.x - w / 2) : 50;
      const py = position ? Math.max(0, position.y - h / 2) : 50;
      const newImage: ImageOverlayData = {
        src: dataUrl,
        x: px,
        y: py,
        width: w,
        height: h,
      };
      pushHistory(currentPage, 'image');
      updatePageOverlays(currentPage, (prev) => ({
        ...prev,
        images: [...(prev.images || []), newImage],
      }));
      setActiveTool(null);
    };
    img.onerror = (err) => {
      console.error('Failed to load image:', err);
    };
    img.src = dataUrl;
  }, [currentPage, updatePageOverlays, pushHistory]);

  const handleAddImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => addImageFromDataUrl(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  }, [addImageFromDataUrl]);

  const updateImage = useCallback((index: number, updatedImage: ImageOverlayData) => {
    const current = getPageOverlays(currentPage);
    const newImages = [...(current.images || [])];
    newImages[index] = updatedImage;
    setPageOverlays(currentPage, { ...current, images: newImages });
  }, [currentPage, getPageOverlays, setPageOverlays]);

  const deleteImage = useCallback((index: number) => {
    const current = getPageOverlays(currentPage);
    const newImages = [...(current.images || [])];
    newImages.splice(index, 1);
    setPageOverlays(currentPage, { ...current, images: newImages });
  }, [currentPage, getPageOverlays, setPageOverlays]);

  // ---- Text handling ----
  const handleAddText = useCallback(() => {
    const width = 200;
    const height = 40;
    const dims = pageDimensions[currentPage];
    const { x, y } = mousePosRef.current;
    const maxX = dims ? Math.max(0, dims.renderWidth - width) : x;
    const maxY = dims ? Math.max(0, dims.renderHeight - height) : y;
    const newText: TextOverlayData = {
      content: '',
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y - height / 2), maxY),
      width,
      height,
      fontSize,
      bold: isBold,
    };
    const current = getPageOverlays(currentPage);
    pushHistory(currentPage, 'text');
    setPageOverlays(currentPage, {
      ...current,
      texts: [...(current.texts || []), newText],
    });
  }, [currentPage, fontSize, isBold, pageDimensions, getPageOverlays, setPageOverlays, pushHistory]);

  const updateText = useCallback((index: number, updatedText: TextOverlayData) => {
    const current = getPageOverlays(currentPage);
    const newTexts = [...(current.texts || [])];
    newTexts[index] = updatedText;
    setPageOverlays(currentPage, { ...current, texts: newTexts });
  }, [currentPage, getPageOverlays, setPageOverlays]);

  const deleteText = useCallback((index: number) => {
    const current = getPageOverlays(currentPage);
    const newTexts = [...(current.texts || [])];
    newTexts.splice(index, 1);
    setPageOverlays(currentPage, { ...current, texts: newTexts });
  }, [currentPage, getPageOverlays, setPageOverlays]);

  // ---- Shape handling ----
  // Tool stays active after each shape so the user can keep drawing (toggle off to stop);
  // selecting any tool deactivates the others (text / line / box are mutually exclusive)
  const toggleTool = useCallback((tool: ToolKind) => {
    setActiveTool(prev => (prev === tool ? null : tool));
    setSelectedOverlay(null);
  }, []);

  const addShape = useCallback((shape: ShapeOverlayData) => {
    pushHistory(currentPage, 'shape');
    updatePageOverlays(currentPage, (prev) => ({
      ...prev,
      shapes: [...(prev.shapes || []), shape],
    }));
  }, [currentPage, updatePageOverlays, pushHistory]);

  const updateShape = useCallback((index: number, updatedShape: ShapeOverlayData) => {
    const current = getPageOverlays(currentPage);
    const newShapes = [...(current.shapes || [])];
    newShapes[index] = updatedShape;
    setPageOverlays(currentPage, { ...current, shapes: newShapes });
  }, [currentPage, getPageOverlays, setPageOverlays]);

  const deleteShape = useCallback((index: number) => {
    const current = getPageOverlays(currentPage);
    const newShapes = [...(current.shapes || [])];
    newShapes.splice(index, 1);
    setPageOverlays(currentPage, { ...current, shapes: newShapes });
    setSelectedOverlay(null);
  }, [currentPage, getPageOverlays, setPageOverlays]);

  // ---- Watermark handling ----
  const addWatermark = useCallback((wm: WatermarkData) => {
    pushHistory(currentPage, 'watermark');
    let newIndex = 0;
    updatePageOverlays(currentPage, (prev) => {
      const list = [...(prev.watermarks || []), wm];
      newIndex = list.length - 1;
      return { ...prev, watermarks: list };
    });
    setSelectedOverlay({ type: 'watermark', index: newIndex });
  }, [currentPage, updatePageOverlays, pushHistory]);

  // Clipboard paste — watermarks (copied via Ctrl+C) take priority, then images
  useEffect(() => {
    if (!pdfDoc) return;
    const handlePaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.includes('pdfEditorWatermark') && tag !== 'TEXTAREA' && tag !== 'INPUT') {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.pdfEditorWatermark) {
            e.preventDefault();
            const wm = parsed.pdfEditorWatermark as WatermarkData;
            addWatermark({ ...wm, x: wm.x + 24, y: wm.y + 24 });
            return;
          }
        } catch { /* not watermark data */ }
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const pos = { ...mousePosRef.current };
          const blob = item.getAsFile();
          if (!blob) break;
          const reader = new FileReader();
          reader.onload = () => addImageFromDataUrl(reader.result as string, pos);
          reader.readAsDataURL(blob);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [pdfDoc, addImageFromDataUrl, addWatermark]);

  const handleAddTextWatermark = useCallback(() => {
    const content = 'Your Text';
    const font = 'Arial' as const;
    const { width, height } = measureWatermarkText(content, font);
    const dims = pageDimensions[currentPage];
    const wm: TextWatermarkData = {
      type: 'text',
      content,
      font,
      color: '#333333',
      x: dims ? Math.max(0, (dims.renderWidth - width) / 2) : 100,
      y: dims ? Math.max(0, (dims.renderHeight - height) / 2) : 100,
      width,
      height,
      scale: 1.5,
      tile: 'single',
      opacity: 0.5,
      rotation: 0,
      effect: 'none',
    };
    addWatermark(wm);
  }, [currentPage, pageDimensions, addWatermark]);

  const handleAddLogoWatermark = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const maxW = 160;
          const s = img.width > maxW ? maxW / img.width : 1;
          const w = img.width * s;
          const h = img.height * s;
          const dims = pageDimensions[currentPage];
          const wm: ImageWatermarkData = {
            type: 'image',
            src: dataUrl,
            x: dims ? Math.max(0, (dims.renderWidth - w) / 2) : 100,
            y: dims ? Math.max(0, (dims.renderHeight - h) / 2) : 100,
            width: w,
            height: h,
            scale: 1,
            tile: 'single',
            opacity: 0.5,
            rotation: 0,
            effect: 'none',
          };
          addWatermark(wm);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [currentPage, pageDimensions, addWatermark]);

  const updateWatermark = useCallback((index: number, wm: WatermarkData) => {
    updatePageOverlays(currentPage, (prev) => {
      const list = [...(prev.watermarks || [])];
      list[index] = wm;
      return { ...prev, watermarks: list };
    });
  }, [currentPage, updatePageOverlays]);

  const deleteWatermark = useCallback((index: number) => {
    updatePageOverlays(currentPage, (prev) => {
      const list = [...(prev.watermarks || [])];
      list.splice(index, 1);
      return { ...prev, watermarks: list };
    });
    setSelectedOverlay(null);
  }, [currentPage, updatePageOverlays]);

  const duplicateWatermark = useCallback((index: number) => {
    const current = getPageOverlays(currentPage);
    const src = (current.watermarks || [])[index];
    if (!src) return;
    const copy: WatermarkData = { ...src, x: src.x + 24, y: src.y + 24 };
    addWatermark(copy);
  }, [currentPage, getPageOverlays, addWatermark]);

  // Copy this page's watermarks to every page of the PDF
  const applyWatermarksToAllPages = useCallback(() => {
    const current = getPageOverlays(currentPage);
    const template = current.watermarks || [];
    if (template.length === 0) return;
    for (let p = 0; p < totalPages; p++) {
      if (p === currentPage) continue;
      updatePageOverlays(p, (prev) => ({
        ...prev,
        watermarks: template.map(wm => ({ ...wm })),
      }));
    }
  }, [currentPage, totalPages, getPageOverlays, updatePageOverlays]);

  // ---- Watermark templates (persisted in localStorage across PDFs) ----
  const handleSaveTemplate = useCallback((name: string): boolean => {
    const wms = getPageOverlays(currentPage).watermarks || [];
    if (wms.length === 0) {
      alert('No watermarks on this page to save. Add a text or logo watermark first.');
      return false;
    }
    try {
      saveTemplate(name, wms);
      return true;
    } catch {
      alert('Could not save template — browser storage is full. Try deleting old templates.');
      return false;
    }
  }, [currentPage, getPageOverlays]);

  const handleApplyTemplate = useCallback((wms: WatermarkData[], allPages: boolean) => {
    const pages = allPages ? Array.from({ length: totalPages }, (_, p) => p) : [currentPage];
    for (const p of pages) {
      updatePageOverlays(p, (prev) => ({
        ...prev,
        watermarks: [...(prev.watermarks || []), ...wms.map(wm => ({ ...wm }))],
      }));
    }
    setShowTemplates(false);
  }, [currentPage, totalPages, updatePageOverlays]);

  // ---- Clear page ----
  const handleClearPage = useCallback(() => {
    if (confirm('Clear all overlays on this page?')) {
      setPageOverlays(currentPage, { images: [], texts: [], shapes: [], watermarks: [] });
    }
  }, [currentPage, setPageOverlays]);

  // ---- Page numbers ----
  // Pages never opened have no measured dimensions, so derive each page's render
  // size from the current page's scale; that keeps placement and export aligned.
  const handleApplyPageNumbers = useCallback(async (opts: PageNumberOptions) => {
    if (!pdfDoc) return;
    const baseDims = pageDimensions[currentPage];
    if (!baseDims) return;
    const baseViewport = (await pdfDoc.getPage(currentPage + 1)).getViewport({ scale: 1 });
    const scale = baseDims.renderWidth / baseViewport.width;

    const derivedDims: PageDimensionsMap = {};
    for (let i = 0; i < totalPages; i++) {
      const viewport = (await pdfDoc.getPage(i + 1)).getViewport({ scale: 1 });
      const renderWidth = viewport.width * scale;
      const renderHeight = viewport.height * scale;
      derivedDims[i] = { renderWidth, renderHeight };

      const overlay = buildPageNumberOverlay(
        String(opts.startNumber + i),
        opts.fontSize,
        opts.position,
        renderWidth,
        renderHeight,
        scale,
      );
      // kept first in the list so Ctrl+Z still targets the user's own last text
      updatePageOverlays(i, (prev) => ({
        ...prev,
        texts: [overlay, ...(prev.texts || []).filter(t => t.role !== 'page-number')],
      }));
    }
    setPageDimensions(prev => ({ ...derivedDims, ...prev }));
    setShowMore(false);
  }, [pdfDoc, currentPage, totalPages, pageDimensions, updatePageOverlays]);

  const handleRemovePageNumbers = useCallback(() => {
    for (let i = 0; i < totalPages; i++) {
      updatePageOverlays(i, (prev) => ({
        ...prev,
        texts: (prev.texts || []).filter(t => t.role !== 'page-number'),
      }));
    }
  }, [totalPages, updatePageOverlays]);

  // ---- Download ----
  const handleDownload = useCallback(async () => {
    if (!pdfBytes) return;
    setLoading(true);
    try {
      const editedBytes = await exportPdfWithEdits(pdfBytes, overlays, pageDimensions);
      const blob = new Blob([editedBytes as BlobPart], { type: 'application/pdf' });
      const name = pdfName.replace(/\.pdf$/i, '') + '_edited.pdf';
      saveAs(blob, name);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export PDF. ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, [pdfBytes, pdfName, overlays, pageDimensions]);

  // Copy the selected watermark to the OS clipboard as JSON
  const handleCopyWatermark = useCallback((): boolean => {
    if (selectedOverlay?.type !== 'watermark') return false;
    const wm = getPageOverlays(currentPage).watermarks?.[selectedOverlay.index];
    if (!wm) return false;
    navigator.clipboard?.writeText(JSON.stringify({ pdfEditorWatermark: wm })).catch(() => {});
    return true;
  }, [selectedOverlay, currentPage, getPageOverlays]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    if (!pdfDoc) return;
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey && key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (e.ctrlKey && key === 'c') {
        if (handleCopyWatermark()) e.preventDefault();
        return;
      }
      if (e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (key === 't') { e.preventDefault(); toggleTool('text'); return; }
        if (key === 'l') { e.preventDefault(); toggleTool('line'); return; }
        if (key === 'b') { e.preventDefault(); toggleTool('rect'); return; }
        if (key === 'a') { e.preventDefault(); toggleTool('arrow'); return; }
      }
      if (e.key === 'ArrowLeft') handlePrevPage();
      if (e.key === 'ArrowRight') handleNextPage();
      if (e.key === 'Escape') setActiveTool(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pdfDoc, handlePrevPage, handleNextPage, toggleTool, handleUndo, handleCopyWatermark]);

  return (
    <div className="app">
      <Toolbar
        hasPdf={!!pdfDoc}
        currentPage={currentPage}
        totalPages={totalPages}
        fontSize={fontSize}
        isBold={isBold}
        onUpload={handleUpload}
        onDownload={handleDownload}
        onAddImage={handleAddImage}
        onAddTextWatermark={handleAddTextWatermark}
        onAddLogoWatermark={handleAddLogoWatermark}
        templatesOpen={showTemplates}
        onToggleTemplates={() => { setShowTemplates(s => !s); setShowMore(false); }}
        moreOpen={showMore}
        onToggleMore={() => { setShowMore(s => !s); setShowTemplates(false); }}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onFontSizeChange={setFontSize}
        onBoldToggle={() => setIsBold(b => !b)}
        onClearPage={handleClearPage}
        activeTool={activeTool}
        onToggleTool={toggleTool}
        strokeWidth={strokeWidth}
        onCycleStrokeWidth={cycleStrokeWidth}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
      />

      <div className="editor-wrapper" ref={editorWrapperRef}>
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
          </div>
        )}

        <div className="editor-area" ref={editorAreaRef}>
          {!pdfDoc ? (
            <div className="editor-scroll-content">
              <div className="empty-state">
                {backupList.length > 0 && (
                  <div className="recovery-panel">
                    <div className="recovery-title">
                      <RotateCcw size={16} />
                      Unsaved work found ({backupList.length})
                    </div>
                    {backupList.map(b => (
                      <div className="recovery-item" key={b.sessionId}>
                        <div className="recovery-text">
                          <strong>{b.pdfName}</strong>
                          <span>
                            {b.totalPages} page{b.totalPages === 1 ? '' : 's'} — {new Date(b.updatedAt).toLocaleString()}
                          </span>
                        </div>
                        <button className="recovery-restore" onClick={() => handleRestoreBackup(b.sessionId)}>
                          Restore
                        </button>
                        <button
                          className="recovery-dismiss"
                          onClick={() => handleDeleteBackup(b.sessionId)}
                          title="Discard backup"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="empty-icon">
                  <FileUp size={48} color="#e94560" />
                </div>
                <h2>Welcome to PDF Editor Pro</h2>
                <p>
                  Upload a PDF to start editing. Add images, text, resize and drag
                  elements freely. Download the edited file when you're done.
                </p>
                <label className="empty-upload-btn">
                  <FileUp size={18} />
                  Upload PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="editor-scroll-content">
              <div className="canvas-and-overlays" ref={canvasWrapperRef}
                style={{ cursor: activeTool === 'text' ? 'text' : undefined }}
                onClick={(e) => {
                  // text tool places exactly one box, then deactivates
                  if (activeTool === 'text') {
                    handleAddText();
                    setActiveTool(null);
                    return;
                  }
                  if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'CANVAS') {
                    setSelectedOverlay(null);
                  }
                }}
              >
                <PdfViewer
                  pdfDoc={pdfDoc}
                  pageIndex={currentPage}
                  onDimensionsReady={handleDimensionsReady}
                  containerSize={containerSize}
                  zoom={zoom}
                />

                <div className="overlay-container">
                  {images.map((img, i) => (
                    <ImageOverlay
                      key={`img-${currentPage}-${i}`}
                      image={img}
                      index={i}
                      selected={selectedOverlay?.type === 'image' && selectedOverlay?.index === i}
                      onSelect={() => { setSelectedOverlay({ type: 'image', index: i }); setActiveTool(null); }}
                      onUpdate={updateImage}
                      onDelete={deleteImage}
                    />
                  ))}
                  {texts.map((txt, i) => (
                    <TextOverlay
                      key={`txt-${currentPage}-${i}`}
                      text={txt}
                      index={i}
                      onUpdate={updateText}
                      onDelete={deleteText}
                    />
                  ))}
                  {shapes.map((shape, i) => (
                    <ShapeOverlay
                      key={`shape-${currentPage}-${i}`}
                      shape={shape}
                      index={i}
                      selected={selectedOverlay?.type === 'shape' && selectedOverlay?.index === i}
                      onSelect={() => setSelectedOverlay({ type: 'shape', index: i })}
                      onUpdate={updateShape}
                      onDelete={deleteShape}
                    />
                  ))}
                  {watermarks.map((wm, i) => (
                    <WatermarkOverlay
                      key={`wm-${currentPage}-${i}`}
                      wm={wm}
                      index={i}
                      selected={selectedOverlay?.type === 'watermark' && selectedOverlay?.index === i}
                      pageWidth={pageDimensions[currentPage]?.renderWidth || containerSize.width}
                      pageHeight={pageDimensions[currentPage]?.renderHeight || containerSize.height}
                      onSelect={() => setSelectedOverlay({ type: 'watermark', index: i })}
                      onUpdate={updateWatermark}
                      onDelete={deleteWatermark}
                    />
                  ))}
                </div>

                {activeTool && activeTool !== 'text' && (
                  <DrawingLayer tool={activeTool} strokeWidth={strokeWidth} onCommit={addShape} />
                )}
              </div>
            </div>
          )}
        </div>

        {pdfDoc && showTemplates && (
          <TemplatesMenu
            onApply={handleApplyTemplate}
            onSaveCurrent={handleSaveTemplate}
            onClose={() => setShowTemplates(false)}
          />
        )}

        {pdfDoc && showMore && (
          <MoreMenu
            onApplyPageNumbers={handleApplyPageNumbers}
            onRemovePageNumbers={handleRemovePageNumbers}
            onClose={() => setShowMore(false)}
          />
        )}

        {pdfDoc && !showTemplates && !showMore && selectedOverlay?.type === 'watermark' && watermarks[selectedOverlay.index] && (
          <WatermarkPanel
            wm={watermarks[selectedOverlay.index]!}
            onChange={(wm) => updateWatermark(selectedOverlay.index, wm)}
            onDuplicate={() => duplicateWatermark(selectedOverlay.index)}
            onDelete={() => deleteWatermark(selectedOverlay.index)}
            onClose={() => setSelectedOverlay(null)}
            onApplyAllPages={applyWatermarksToAllPages}
          />
        )}

        {pdfDoc && (
          <div className="page-indicator">
            Page {currentPage + 1} of {totalPages}
            {lastSavedAt && (
              <span className="autosave-note">
                · backed up {new Date(lastSavedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
