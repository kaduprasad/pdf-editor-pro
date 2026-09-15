import { PDFDocument, rgb, degrees, StandardFonts, PDFName, PDFArray, PDFContentStream, PDFOperator, PDFRef } from 'pdf-lib';
import type { PDFPage, PDFFont } from 'pdf-lib';
import type { OverlaysByPage, PageDimensionsMap, WatermarkFont } from '../types';
import { getTilePositions, getWatermarkSize, effectiveTextColor, TEXT_WM_BASE_FONT, TEXT_WM_LINE_HEIGHT } from './watermark';

function normalizeImageToPng(src: string, grayscale = false): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      if (grayscale) ctx.filter = 'grayscale(1)';
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Canvas toBlob returned null'));
        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Failed to load image for export'));
    img.src = src;
  });
}

function wrapExistingContentInGraphicsState(page: PDFPage, context: PDFDocument['context']) {
  const contentsRef = page.node.get(PDFName.of('Contents'));
  if (!contentsRef) return;

  const qStream = PDFContentStream.of(
    context.obj({}),
    [PDFOperator.of('q' as never)]
  );
  const bigQStream = PDFContentStream.of(
    context.obj({}),
    [PDFOperator.of('Q' as never)]
  );
  const qRef = context.register(qStream);
  const bigQRef = context.register(bigQStream);

  const resolved = context.lookup(contentsRef);
  let contentRefs: PDFRef[];
  if (resolved instanceof PDFArray) {
    contentRefs = [];
    for (let i = 0; i < resolved.size(); i++) {
      contentRefs.push(resolved.get(i) as PDFRef);
    }
  } else {
    contentRefs = [contentsRef as PDFRef];
  }

  const newArray = context.obj([qRef, ...contentRefs, bigQRef]);
  page.node.set(PDFName.of('Contents'), newArray);
}

export async function exportPdfWithEdits(
  originalPdfBytes: Uint8Array,
  overlaysByPage: OverlaysByPage,
  pageDimensions: PageDimensionsMap,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const wmFontCache: Record<string, PDFFont> = {};
  const getWatermarkFont = async (name: WatermarkFont, bold: boolean): Promise<PDFFont> => {
    const key = `${name}|${bold}`;
    if (!wmFontCache[key]) {
      const std = name === 'Times New Roman'
        ? (bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman)
        : name === 'Courier'
          ? (bold ? StandardFonts.CourierBold : StandardFonts.Courier)
          : (bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
      wmFontCache[key] = await pdfDoc.embedFont(std);
    }
    return wmFontCache[key]!;
  };

  // Derive render scale from any measured page so pages never opened in the
  // editor (e.g. watermarks applied to all pages) still export their overlays.
  let fallbackScale: number | null = null;
  for (const [idxStr, d] of Object.entries(pageDimensions)) {
    const p = pages[Number(idxStr)];
    if (p && d && d.renderWidth > 0) {
      fallbackScale = d.renderWidth / p.getSize().width;
      break;
    }
  }

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const pageData = overlaysByPage[i];
    if (!pageData) continue;

    const { width: pdfW, height: pdfH } = page.getSize();
    let dims = pageDimensions[i];
    if (!dims) {
      if (fallbackScale == null) continue;
      dims = { renderWidth: pdfW * fallbackScale, renderHeight: pdfH * fallbackScale };
    }

    wrapExistingContentInGraphicsState(page, pdfDoc.context);

    const scaleX = pdfW / dims.renderWidth;
    const scaleY = pdfH / dims.renderHeight;

    if (pageData.images) {
      for (const img of pageData.images) {
        if (!img.src) continue;
        try {
          const pngBytes = await normalizeImageToPng(img.src);
          const embeddedImage = await pdfDoc.embedPng(pngBytes);

          const imgX = img.x * scaleX;
          const imgY = pdfH - (img.y * scaleY) - (img.height * scaleY);
          const imgW = img.width * scaleX;
          const imgH = img.height * scaleY;

          page.drawImage(embeddedImage, {
            x: imgX,
            y: imgY,
            width: imgW,
            height: imgH,
          });
        } catch (err) {
          console.error('Failed to embed image on page ' + (i + 1) + ':', err);
          throw new Error('Failed to embed image on page ' + (i + 1) + '. ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    }

    if (pageData.shapes) {
      for (const shape of pageData.shapes) {
        const strokeW = Math.max(0.25, (shape.thickness ?? 2) * scaleX);
        const vertical = shape.kind === 'arrow' && (shape.dir === 'up' || shape.dir === 'down');
        if (vertical) {
          const xPdf = shape.x * scaleX;
          const yTop = pdfH - shape.y * scaleY;
          const yBot = pdfH - (shape.y + shape.height) * scaleY;
          page.drawLine({
            start: { x: xPdf, y: yTop },
            end: { x: xPdf, y: yBot },
            thickness: strokeW,
            color: rgb(0, 0, 0),
          });
          const headDown = shape.dir === 'down';
          // SVG y-axis points down the page; base sits behind the tip
          const head = headDown
            ? 'M 0 0 L -5 -10 L 5 -10 Z'
            : 'M 0 0 L -5 10 L 5 10 Z';
          page.drawSvgPath(head, {
            x: xPdf,
            y: headDown ? yBot : yTop,
            color: rgb(0, 0, 0),
            scale: Math.max(scaleX, 0.5),
          });
        } else if (shape.kind === 'line' || shape.kind === 'arrow') {
          const yPdf = pdfH - shape.y * scaleY;
          page.drawLine({
            start: { x: shape.x * scaleX, y: yPdf },
            end: { x: (shape.x + shape.width) * scaleX, y: yPdf },
            thickness: strokeW,
            color: rgb(0, 0, 0),
          });
          if (shape.kind === 'arrow') {
            const headRight = shape.dir !== 'left';
            const tipX = (headRight ? shape.x + shape.width : shape.x) * scaleX;
            // filled triangle head pointing along the line direction
            const head = headRight
              ? 'M 0 0 L -10 -5 L -10 5 Z'
              : 'M 0 0 L 10 -5 L 10 5 Z';
            page.drawSvgPath(head, {
              x: tipX,
              y: yPdf,
              color: rgb(0, 0, 0),
              scale: Math.max(scaleX, 0.5),
            });
          }
        } else {
          page.drawRectangle({
            x: shape.x * scaleX,
            y: pdfH - (shape.y * scaleY) - (shape.height * scaleY),
            width: shape.width * scaleX,
            height: shape.height * scaleY,
            borderWidth: strokeW,
            borderColor: rgb(0, 0, 0),
          });
        }
      }
    }

    if (pageData.texts) {
      for (const txt of pageData.texts) {
        const font = txt.bold ? helveticaBold : helvetica;
        const fontSize = (txt.fontSize || 16) * scaleX;
        const textX = txt.x * scaleX;
        const textY = pdfH - (txt.y * scaleY) - fontSize;

        page.drawText(txt.content || '', {
          x: textX,
          y: textY,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }

    if (pageData.watermarks) {
      for (const wm of pageData.watermarks) {
        const { width: rw, height: rh } = getWatermarkSize(wm);
        const tiles = getTilePositions(wm, dims.renderWidth, dims.renderHeight);
        // CSS rotation is clockwise (y-down); PDF rotation is counterclockwise (y-up)
        const angleDeg = -(wm.rotation || 0);
        const theta = (angleDeg * Math.PI) / 180;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const wPdf = rw * scaleX;
        const hPdf = rh * scaleY;

        // bottom-left placement so the box rotates about its center
        const rotatedOrigin = (cx: number, cy: number) => ({
          x: cx - (wPdf / 2) * cos + (hPdf / 2) * sin,
          y: cy - (wPdf / 2) * sin - (hPdf / 2) * cos,
        });

        if (wm.type === 'image') {
          if (!wm.src) continue;
          try {
            const pngBytes = await normalizeImageToPng(wm.src, wm.effect === 'grayscale');
            const embedded = await pdfDoc.embedPng(pngBytes);
            for (const t of tiles) {
              const cx = (t.x + rw / 2) * scaleX;
              const cy = pdfH - (t.y + rh / 2) * scaleY;
              const { x, y } = rotatedOrigin(cx, cy);
              page.drawImage(embedded, {
                x,
                y,
                width: wPdf,
                height: hPdf,
                rotate: degrees(angleDeg),
                opacity: wm.opacity,
              });
            }
          } catch (err) {
            console.error('Failed to embed watermark image on page ' + (i + 1) + ':', err);
            throw new Error('Failed to embed watermark image on page ' + (i + 1) + '. ' + (err instanceof Error ? err.message : String(err)));
          }
        } else {
          const font = await getWatermarkFont(wm.font, !!wm.bold);
          const fontSize = TEXT_WM_BASE_FONT * wm.scale * scaleX;
          const lineH = fontSize * TEXT_WM_LINE_HEIGHT;
          const lines = (wm.content || '').split('\n');
          const { r, g, b } = effectiveTextColor(wm.color, wm.effect);
          const color = rgb(r, g, b);
          for (const t of tiles) {
            const cx = (t.x + rw / 2) * scaleX;
            const cy = pdfH - (t.y + rh / 2) * scaleY;
            const { x: xr, y: yr } = rotatedOrigin(cx, cy);
            for (let k = 0; k < lines.length; k++) {
              // baseline offset of line k inside the unrotated box, then rotated
              const yOff = (lines.length - 1 - k) * lineH + lineH * 0.25;
              page.drawText(lines[k] || '', {
                x: xr - yOff * sin,
                y: yr + yOff * cos,
                size: fontSize,
                font,
                color,
                opacity: wm.opacity,
                rotate: degrees(angleDeg),
              });
            }
          }
        }
      }
    }
  }

  // Embed overlay data as a file attachment so the PDF can be re-opened for editing
  const overlayJson = JSON.stringify({ overlaysByPage, pageDimensions });
  const jsonBytes = new TextEncoder().encode(overlayJson);
  await pdfDoc.attach(jsonBytes, 'pdf-editor-pro-overlays.json', {
    mimeType: 'application/json',
    description: 'PDF Editor Pro overlay data for re-editing',
  });

  return await pdfDoc.save();
}

/**
 * Extract embedded overlay data from a PDF loaded via pdfjs-dist.
 * Returns null if the PDF was not previously edited with PDF Editor Pro.
 */
export async function extractOverlayData(
  pdfDoc: { getData: () => Promise<Uint8Array> } | null,
): Promise<{ overlaysByPage: OverlaysByPage; pageDimensions: PageDimensionsMap } | null> {
  if (!pdfDoc) return null;
  try {
    // Load the PDF with pdf-lib to read attachments
    const data = await pdfDoc.getData();
    const doc = await PDFDocument.load(data, { ignoreEncryption: true });
    const catalog = doc.catalog;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const namesDict = catalog.lookup(PDFName.of('Names')) as any;
    if (!namesDict || typeof namesDict.get !== 'function') return null;
    const embeddedFiles = namesDict.get(PDFName.of('EmbeddedFiles'));
    if (!embeddedFiles || typeof embeddedFiles.get !== 'function') return null;

    // Navigate the name tree to find our attachment
    const namesArray = embeddedFiles.get(PDFName.of('Names'));
    if (!namesArray || !(namesArray instanceof PDFArray)) return null;

    for (let i = 0; i < namesArray.size(); i += 2) {
      const nameObj = namesArray.get(i);
      const nameStr = nameObj?.toString?.() ?? '';
      if (nameStr.includes('pdf-editor-pro-overlays.json')) {
        const fileSpecRef = namesArray.get(i + 1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileSpec: any = fileSpecRef instanceof PDFRef
          ? doc.context.lookup(fileSpecRef)
          : fileSpecRef;
        if (!fileSpec || typeof fileSpec.get !== 'function') continue;

        const ef = fileSpec.get(PDFName.of('EF'));
        if (!ef || typeof ef.get !== 'function') continue;
        const streamRef = ef.get(PDFName.of('F'));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream: any = streamRef instanceof PDFRef
          ? doc.context.lookup(streamRef)
          : streamRef;
        if (!stream || typeof stream.getContents !== 'function') continue;

        const contents: Uint8Array = stream.getContents();
        const json = new TextDecoder().decode(contents);
        const parsed: { overlaysByPage: OverlaysByPage; pageDimensions: PageDimensionsMap } = JSON.parse(json);
        return parsed;
      }
    }
    return null;
  } catch (err) {
    console.warn('Could not extract overlay data:', err);
    return null;
  }
}
