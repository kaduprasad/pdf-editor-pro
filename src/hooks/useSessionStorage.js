import { useState, useEffect, useCallback } from 'react';

const SESSION_KEY = 'pdf-editor-pro-overlays';

/**
 * Strip large data URLs from overlays before saving to sessionStorage
 * to avoid exceeding the ~5MB limit.
 */
function stripForStorage(overlays) {
  const cleaned = {};
  for (const [page, data] of Object.entries(overlays)) {
    cleaned[page] = {
      texts: data.texts || [],
      // Only store image metadata, not the full data URL
      images: (data.images || []).map(img => ({
        x: img.x,
        y: img.y,
        width: img.width,
        height: img.height,
        // skip src to avoid sessionStorage overflow
      })),
    };
  }
  return cleaned;
}

export function useSessionStorage() {
  const [overlays, setOverlays] = useState(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? JSON.parse(stored) : {};
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

  const getPageOverlays = useCallback((pageIndex) => {
    return overlays[pageIndex] || { images: [], texts: [] };
  }, [overlays]);

  const setPageOverlays = useCallback((pageIndex, data) => {
    setOverlays(prev => ({
      ...prev,
      [pageIndex]: data,
    }));
  }, []);

  /**
   * Functional updater — avoids stale closure issues.
   * updater receives the current page overlays and returns the new value.
   */
  const updatePageOverlays = useCallback((pageIndex, updater) => {
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
