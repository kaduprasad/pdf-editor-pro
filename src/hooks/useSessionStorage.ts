import { useState, useEffect, useCallback } from 'react';
import type { OverlaysByPage, PageOverlays } from '../types';

const SESSION_KEY = 'pdf-editor-pro-overlays';

function stripForStorage(overlays: OverlaysByPage): Record<string, { texts: PageOverlays['texts']; images: Array<Omit<PageOverlays['images'][number], 'src'>> }> {
  const cleaned: Record<string, { texts: PageOverlays['texts']; images: Array<Omit<PageOverlays['images'][number], 'src'>> }> = {};
  for (const [page, data] of Object.entries(overlays)) {
    cleaned[page] = {
      texts: data.texts || [],
      images: (data.images || []).map(img => ({
        x: img.x,
        y: img.y,
        width: img.width,
        height: img.height,
      })),
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
