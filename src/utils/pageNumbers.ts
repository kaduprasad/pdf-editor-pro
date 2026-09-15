import type { PageNumberPosition, TextOverlayData } from '../types';

/** Distance from the page edge, in PDF points. */
const MARGIN_PT = 28;
const LINE_HEIGHT = 1.4;

/** Approximates pdf-lib's Helvetica metrics closely enough for alignment. */
function measureLabel(label: string, fontSize: number): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
  return ctx.measureText(label).width;
}

export function buildPageNumberOverlay(
  label: string,
  fontSize: number,
  position: PageNumberPosition,
  renderWidth: number,
  renderHeight: number,
  scale: number,
): TextOverlayData {
  const textWidth = measureLabel(label, fontSize);
  const margin = MARGIN_PT * scale;
  const height = fontSize * LINE_HEIGHT;
  const width = textWidth + fontSize;

  let x: number;
  if (position === 'bottom-left') {
    x = margin;
  } else if (position === 'bottom-right') {
    x = renderWidth - margin - textWidth;
  } else {
    x = (renderWidth - textWidth) / 2;
  }

  return {
    content: label,
    x: Math.max(0, x),
    y: Math.max(0, renderHeight - margin - height),
    width,
    height,
    fontSize,
    bold: false,
    role: 'page-number',
  };
}
