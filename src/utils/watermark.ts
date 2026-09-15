import type { WatermarkData, WatermarkFont } from '../types';

/** Rendered size of a watermark after applying its scale slider. */
export function getWatermarkSize(wm: WatermarkData): { width: number; height: number } {
  return { width: wm.width * wm.scale, height: wm.height * wm.scale };
}

/**
 * Top-left positions (render-space px) for every tile of a watermark.
 * 'single' → just the watermark position; 'grid' / 'diagonal' → repeated across the page,
 * anchored so one tile always lands exactly on the watermark's own position.
 */
export function getTilePositions(
  wm: WatermarkData,
  pageWidth: number,
  pageHeight: number,
): Array<{ x: number; y: number }> {
  const { width: w, height: h } = getWatermarkSize(wm);
  if (wm.tile === 'single') return [{ x: wm.x, y: wm.y }];

  const spacingX = Math.max(w * 1.6, 60);
  const spacingY = Math.max(h * 1.6, 60);
  const positions: Array<{ x: number; y: number }> = [];

  const startY = wm.y - Math.ceil((wm.y + h) / spacingY) * spacingY;
  const baseStartX = wm.x - Math.ceil((wm.x + w) / spacingX) * spacingX;

  let row = 0;
  for (let y = startY; y < pageHeight; y += spacingY, row++) {
    const offsetX = wm.tile === 'diagonal' && row % 2 === 1 ? spacingX / 2 : 0;
    for (let x = baseStartX + offsetX; x < pageWidth; x += spacingX) {
      if (x + w < 0 || y + h < 0) continue;
      positions.push({ x, y });
    }
  }
  return positions;
}

export const WATERMARK_FONTS: WatermarkFont[] = ['Arial', 'Times New Roman', 'Courier'];

/** Base font size (px) for text watermarks at scale 1. */
export const TEXT_WM_BASE_FONT = 28;
export const TEXT_WM_LINE_HEIGHT = 1.25;

export function measureWatermarkText(content: string, font: WatermarkFont, bold = false): { width: number; height: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${bold ? 'bold ' : ''}${TEXT_WM_BASE_FONT}px ${watermarkFontFamily(font)}`;
  const lines = (content || ' ').split('\n');
  const width = Math.max(20, ...lines.map(l => ctx.measureText(l).width));
  const height = TEXT_WM_BASE_FONT * TEXT_WM_LINE_HEIGHT * lines.length;
  return { width, height };
}

export function watermarkFontFamily(font: WatermarkFont): string {
  switch (font) {
    case 'Times New Roman': return '"Times New Roman", Times, serif';
    case 'Courier': return '"Courier New", Courier, monospace';
    default: return 'Helvetica, Arial, sans-serif';
  }
}

/** Text color after applying the effect (grayscale converts to luminance gray). */
export function effectiveTextColor(hex: string, effect: 'none' | 'grayscale'): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const val = m?.[1] ? parseInt(m[1], 16) : 0;
  let r = (val >> 16) & 0xff;
  let g = (val >> 8) & 0xff;
  let b = val & 0xff;
  if (effect === 'grayscale') {
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    r = g = b = gray;
  }
  return { r: r / 255, g: g / 255, b: b / 255 };
}

/** Makes near-white pixels transparent (feathered above the threshold). Returns a PNG data URL. */
export function removeWhiteBackground(src: string, threshold = 235): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const min = Math.min(px[i]!, px[i + 1]!, px[i + 2]!);
        if (min >= threshold) {
          const t = (min - threshold) / (255 - threshold);
          px[i + 3] = Math.round(px[i + 3]! * (1 - t));
        }
      }
      ctx.putImageData(data, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
