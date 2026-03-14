import { useRef, useEffect, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export default function PdfViewer({ pdfDoc, pageIndex, onDimensionsReady, containerSize, zoom }) {
  const canvasRef = useRef(null);
  const [_rendering, setRendering] = useState(false);
  const renderTaskRef = useRef(null);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    setRendering(true);
    try {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      const baseViewport = page.getViewport({ scale: 1 });
      let scale;
      if (zoom != null) {
        // Manual zoom: zoom=1 means 100% of PDF native size
        scale = zoom;
      } else {
        // Auto-fit to container
        const containerWidth = containerSize?.width || 800;
        const containerHeight = containerSize?.height || 600;
        const scaleW = (containerWidth - 32) / baseViewport.width;
        const scaleH = (containerHeight - 32) / baseViewport.height;
        scale = Math.min(scaleW, scaleH, 3.0);
      }

      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;

      if (onDimensionsReady) {
        onDimensionsReady(pageIndex, {
          renderWidth: viewport.width,
          renderHeight: viewport.height,
        });
      }
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Error rendering PDF page:', err);
      }
    } finally {
      setRendering(false);
    }
  }, [pdfDoc, pageIndex, onDimensionsReady, containerSize, zoom]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Re-render on window resize
  useEffect(() => {
    const handleResize = () => renderPage();
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
