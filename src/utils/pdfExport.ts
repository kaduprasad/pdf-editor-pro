import { PDFDocument, rgb, StandardFonts, PDFName, PDFArray, PDFContentStream, PDFOperator, PDFRef } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import type { OverlaysByPage, PageDimensionsMap } from '../types';

function normalizeImageToPng(src: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
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

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const pageData = overlaysByPage[i];
    if (!pageData) continue;

    const { width: pdfW, height: pdfH } = page.getSize();
    const dims = pageDimensions[i];
    if (!dims) continue;

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
