import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Takes the original PDF bytes, plus arrays of image/text overlays for each page,
 * and produces a new PDF with all edits baked in.
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

    const scaleX = pdfW / dims.renderWidth;
    const scaleY = pdfH / dims.renderHeight;

    // Embed images
    if (pageData.images) {
      for (const img of pageData.images) {
        try {
          let embeddedImage;
          const dataUrl = img.src;
          const base64 = dataUrl.split(',')[1];
          const byteString = atob(base64);
          const arrayBuffer = new Uint8Array(byteString.length);
          for (let j = 0; j < byteString.length; j++) {
            arrayBuffer[j] = byteString.charCodeAt(j);
          }

          if (dataUrl.includes('image/png')) {
            embeddedImage = await pdfDoc.embedPng(arrayBuffer);
          } else {
            embeddedImage = await pdfDoc.embedJpg(arrayBuffer);
          }

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
          console.warn('Failed to embed image:', err);
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
