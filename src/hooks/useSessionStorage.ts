import { useState, useEffect, useCallback } from 'react';
import type { OverlaysByPage, PageOverlays, WatermarkData } from '../types';

const SESSION_KEY = 'pdf-editor-pro-overlays';

interface StoredPageOverlays {
  texts: PageOverlays['texts'];
  shapes: PageOverlays['shapes'];
  images: Array<Omit<PageOverlays['images'][number], 'src'>>;
  watermarks: WatermarkData[];
}

function stripForStorage(overlays: OverlaysByPage): Record<string, StoredPageOverlays> {
  const cleaned: Record<string, StoredPageOverlays> = {};
  for (const [page, data] of Object.entries(overlays)) {
    cleaned[page] = {
      texts: data.texts || [],
      shapes: data.shapes || [],
      images: (data.images || []).map(img => ({
        x: img.x,
        y: img.y,
        width: img.width,
        height: img.height,
      })),
      // image watermark sources are too large for sessionStorage
      watermarks: (data.watermarks || []).map(wm =>
        wm.type === 'image' ? { ...wm, src: '' } : wm
      ),
    };
  }
  return cleaned;
}

export function useSessionStorage() {
  const [overlays, setOverlays] = useState<OverlaysByPage>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? JSON.parse(stored) as OverlaysByPage : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(stripForStorage(overlays)));
    } catch {
      // session storage full or unavailable
    }
  }, [overlays]);

  const getPageOverlays = useCallback((pageIndex: number): PageOverlays => {
    return overlays[pageIndex] || { images: [], texts: [] };
  }, [overlays]);

  const setPageOverlays = useCallback((pageIndex: number, data: PageOverlays) => {
    setOverlays(prev => ({
      ...prev,
      [pageIndex]: data,
    }));
  }, []);

  const updatePageOverlays = useCallback((pageIndex: number, updater: (current: PageOverlays) => PageOverlays) => {
    setOverlays(prev => {
      const current = prev[pageIndex] || { images: [], texts: [] };
      return {
        ...prev,
        [pageIndex]: updater(current),
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    setOverlays({});
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  return { overlays, getPageOverlays, setPageOverlays, updatePageOverlays, clearAll };
}
