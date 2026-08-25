import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { saveAs } from 'file-saver';
import { FileUp } from 'lucide-react';

import Toolbar from './components/Toolbar';
import PdfViewer from './components/PdfViewer';
import ImageOverlay from './components/ImageOverlay';
import TextOverlay from './components/TextOverlay';
import ShapeOverlay from './components/ShapeOverlay';
import DrawingLayer from './components/DrawingLayer';
import { useSessionStorage } from './hooks/useSessionStorage';
import { exportPdfWithEdits, extractOverlayData } from './utils/pdfExport';
import type { ImageOverlayData, TextOverlayData, ShapeOverlayData, ShapeKind, PageDimensionsMap, PageDimensions, SelectedOverlay } from './types';
import './App.css';

// Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

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
  const [activeTool, setActiveTool] = useState<ShapeKind | null>(null);

  const { overlays, getPageOverlays, setPageOverlays, updatePageOverlays, clearAll } = useSessionStorage();
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // Warn before leaving/closing the page if there are unsaved edits
  useEffect(() => {
    const hasEdits = pdfDoc && Object.values(overlays).some(
      p => (p.images?.length || 0) + (p.texts?.length || 0) + (p.shapes?.length || 0) > 0
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

  // ---- PDF Loading ----
  const loadPdf = useCallback(async (arrayBuffer: ArrayBuffer, fileName: string) => {
    setLoading(true);
    try {
      const bytes = new Uint8Array(arrayBuffer);
      setPdfBytes(bytes);
      setPdfName(fileName);

      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(0);

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
  const historyRef = useRef<Array<{ page: number; type: 'image' | 'text' | 'shape' }>>([]);

  const pushHistory = useCallback((page: number, type: 'image' | 'text' | 'shape') => {
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

  // Clipboard paste — place image at current mouse position
  useEffect(() => {
    if (!pdfDoc) return;
    const handlePaste = (e: ClipboardEvent) => {
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
  }, [pdfDoc, addImageFromDataUrl]);

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
  // Tool stays active after each shape so the user can keep drawing (toggle off to stop)
  const toggleTool = useCallback((tool: ShapeKind) => {
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

  // ---- Clear page ----
  const handleClearPage = useCallback(() => {
    if (confirm('Clear all overlays on this page?')) {
      setPageOverlays(currentPage, { images: [], texts: [], shapes: [] });
    }
  }, [currentPage, setPageOverlays]);

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
      if (e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (key === 't') { e.preventDefault(); handleAddText(); return; }
        if (key === 'l') { e.preventDefault(); toggleTool('line'); return; }
        if (key === 'b') { e.preventDefault(); toggleTool('rect'); return; }
      }
      if (e.key === 'ArrowLeft') handlePrevPage();
      if (e.key === 'ArrowRight') handleNextPage();
      if (e.key === 'Escape') setActiveTool(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pdfDoc, handlePrevPage, handleNextPage, handleAddText, toggleTool, handleUndo]);

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
        onAddText={handleAddText}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onFontSizeChange={setFontSize}
        onBoldToggle={() => setIsBold(b => !b)}
        onClearPage={handleClearPage}
        activeTool={activeTool}
        onToggleTool={toggleTool}
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
                onClick={(e) => {
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
                      onSelect={() => setSelectedOverlay({ type: 'image', index: i })}
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
                </div>

                {activeTool && (
                  <DrawingLayer tool={activeTool} onCommit={addShape} />
                )}
              </div>
            </div>
          )}
        </div>

        {pdfDoc && (
          <div className="page-indicator">
            Page {currentPage + 1} of {totalPages}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
