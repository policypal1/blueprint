import { downloadBlob } from './editor-core.js';

export async function downloadRevisionPdf(svgElement) {
  if (svgElement?.localName !== 'svg') throw new Error('The revision drawing is unavailable.');

  const originalUrl = window.location.href;
  const wasMounted = svgElement.isConnected;
  const drawing = svgElement.cloneNode(true);
  const width = 3200;
  const height = 2000;
  drawing.setAttribute('viewBox', '0 0 800 500');
  drawing.setAttribute('width', String(width));
  drawing.setAttribute('height', String(height));
  drawing.querySelectorAll('[data-editor-only]').forEach((node) => node.remove());

  const source = new XMLSerializer().serializeToString(drawing);
  const svgUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = svgUrl;
    const [{ jsPDF }] = await Promise.all([import('jspdf'), image.decode()]);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not render the revision.');
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: 'letter', compress: true });
    pdf.setProperties({ title: 'Laundry doorway revision' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const drawingWidth = pageWidth - 0.6;
    const drawingHeight = drawingWidth * height / width;
    pdf.addImage(canvas, 'PNG', 0.3, (pageHeight - drawingHeight) / 2, drawingWidth, drawingHeight, undefined, 'FAST');

    if (window.location.href !== originalUrl || (wasMounted && !svgElement.isConnected)) {
      throw new Error('The demo was closed before the revision finished downloading.');
    }
    downloadBlob(pdf.output('blob'), 'laundry-doorway-revision.pdf');
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
