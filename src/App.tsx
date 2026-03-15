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
import { useSessionStorage } from './hooks/useSessionStorage';
import { exportPdfWithEdits, extractOverlayData } from './utils/pdfExport';
import type { ImageOverlayData, TextOverlayData, PageDimensionsMap, PageDimensions, SelectedOverlay } from './types';
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

  const { overlays, getPageOverlays, setPageOverlays, updatePageOverlays, clearAll } = useSessionStorage();
  const editorWrapperRef = useRef<HTMLDivElement>(null);
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

  // Reset selection on page change
  useEffect(() => {
    setSelectedOverlay(null);
  }, [currentPage]);

  // Current page overlays
  const pageOverlays = getPageOverlays(currentPage);
  const images = pageOverlays.images || [];
  const texts = pageOverlays.texts || [];

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

  // Track mouse position relative to the canvas-and-overlays container
  const mousePosRef = useRef({ x: 50, y: 50 });
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasWrapperRef.current) return;
      const rect = canvasWrapperRef.current.getBoundingClientRect();
      mousePosRef.current = {
        x: Math.max(0, e.clientX - rect.left),
        y: Math.max(0, e.clientY - rect.top),
      };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

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
      updatePageOverlays(currentPage, (prev) => ({
        ...prev,
        images: [...(prev.images || []), newImage],
      }));
    };
    img.onerror = (err) => {
      console.error('Failed to load image:', err);
    };
    img.src = dataUrl;
  }, [currentPage, updatePageOverlays]);

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
    const newText: TextOverlayData = {
      content: '',
      x: 80,
      y: 80,
      width: 200,
      height: 40,
      fontSize,
      bold: isBold,
    };
    const current = getPageOverlays(currentPage);
    setPageOverlays(currentPage, {
      ...current,
      texts: [...(current.texts || []), newText],
    });
  }, [currentPage, fontSize, isBold, getPageOverlays, setPageOverlays]);

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

  // ---- Clear page ----
  const handleClearPage = useCallback(() => {
    if (confirm('Clear all overlays on this page?')) {
      setPageOverlays(currentPage, { images: [], texts: [] });
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
      if (e.key === 'ArrowLeft') handlePrevPage();
      if (e.key === 'ArrowRight') handleNextPage();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pdfDoc, handlePrevPage, handleNextPage]);

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

        <div className="editor-area">
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
                </div>
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
