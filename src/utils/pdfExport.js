import { PDFDocument, rgb, StandardFonts, PDFName, PDFArray, PDFContentStream, PDFOperator } from 'pdf-lib';

/**
 * Normalizes any image (PNG, JPEG, WebP, etc.) to PNG bytes via canvas.
 * This avoids pdf-lib limitations with certain PNG variants and unsupported formats.
 */
function normalizeImageToPng(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
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

/**
 * Wraps the existing page content streams in q (save) / Q (restore) so that
 * any graphics state changes in the original content don't affect overlays
 * we append afterwards. This ensures overlays always render ON TOP.
 */
function wrapExistingContentInGraphicsState(page, context) {
  const contentsRef = page.node.get(PDFName.of('Contents'));
  if (!contentsRef) return;

  // Create q (push graphics state) and Q (pop graphics state) streams
  const qStream = PDFContentStream.of(
    context.obj({}),
    [PDFOperator.of('q')]
  );
  const bigQStream = PDFContentStream.of(
    context.obj({}),
    [PDFOperator.of('Q')]
  );
  const qRef = context.register(qStream);
  const bigQRef = context.register(bigQStream);

  // Resolve current Contents to an array of refs
  const resolved = context.lookup(contentsRef);
  let contentRefs;
  if (resolved instanceof PDFArray) {
    contentRefs = [];
    for (let i = 0; i < resolved.size(); i++) {
      contentRefs.push(resolved.get(i));
    }
  } else {
    contentRefs = [contentsRef];
  }

  // Rebuild as: [q, ...originalStreams, Q]
  const newArray = context.obj([qRef, ...contentRefs, bigQRef]);
  page.node.set(PDFName.of('Contents'), newArray);
}

/**
 * Takes the original PDF bytes, plus arrays of image/text overlays for each page,
 * and produces a new PDF with all edits baked in.
 *
 * Modifies the PDF in-place. Wraps each page's existing content in q/Q to
 * isolate graphics state, then appends overlay content on top.
 *
 * @param {Uint8Array} originalPdfBytes
 * @param {Object} overlaysByPage - { [pageIndex]: { images: [], texts: [] } }
 * @param {Object} pageDimensions - { [pageIndex]: { renderWidth, renderHeight } }
 * @returns {Promise<Uint8Array>}
 */
export async function exportPdfWithEdits(originalPdfBytes, overlaysByPage, pageDimensions) {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageData = overlaysByPage[i];
    if (!pageData) continue;

    const { width: pdfW, height: pdfH } = page.getSize();
    const dims = pageDimensions[i];
    if (!dims) continue;

    // Wrap existing content in q/Q so overlays always render on top
    wrapExistingContentInGraphicsState(page, pdfDoc.context);

    const scaleX = pdfW / dims.renderWidth;
    const scaleY = pdfH / dims.renderHeight;

    // Embed images
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
          throw new Error('Failed to embed image on page ' + (i + 1) + '. ' + err.message);
        }
      }
    }

    // Embed texts
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

  return await pdfDoc.save();
}
