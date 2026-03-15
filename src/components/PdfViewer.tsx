import { useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { PageDimensions } from '../types';

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface PdfViewerProps {
  pdfDoc: PDFDocumentProxy;
  pageIndex: number;
  onDimensionsReady: (pageIndex: number, dims: PageDimensions) => void;
  containerSize: { width: number; height: number };
  zoom: number | null;
}

export default function PdfViewer({ pdfDoc, pageIndex, onDimensionsReady, containerSize, zoom }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderingRef = useRef(false);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    // Cancel any in-flight render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    // Wait for the previous render to fully release the canvas
    if (renderingRef.current) return;
    renderingRef.current = true;

    try {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d')!;

      const baseViewport = page.getViewport({ scale: 1 });
      let scale: number;
      if (zoom != null) {
        scale = zoom;
      } else {
        const containerWidth = containerSize?.width || 800;
        const containerHeight = containerSize?.height || 600;
        const scaleW = (containerWidth - 32) / baseViewport.width;
        const scaleH = (containerHeight - 32) / baseViewport.height;
        scale = Math.min(scaleW, scaleH, 3.0);
      }

      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const task = page.render({
        canvasContext: context,
        viewport,
        canvas,
      });
      renderTaskRef.current = task;
      await task.promise;

      onDimensionsReady(pageIndex, {
        renderWidth: viewport.width,
        renderHeight: viewport.height,
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name !== 'RenderingCancelledException') {
        console.error('Error rendering PDF page:', err);
      }
    } finally {
      renderingRef.current = false;
      renderTaskRef.current = null;
    }
  }, [pdfDoc, pageIndex, onDimensionsReady, containerSize, zoom]);

  useEffect(() => {
    renderPage();
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [renderPage]);

  useEffect(() => {
    const handleResize = () => { renderPage(); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderPage]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        boxShadow: '0 0 30px rgba(0,0,0,0.5)',
        borderRadius: '4px',
      }}
    />
  );
}
