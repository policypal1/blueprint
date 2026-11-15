export const WIDTH = 1600;
export const HEIGHT = 1000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_ELEMENTS = 5000;

export function clientToWorkspace(clientX, clientY, rect) {
  // SVG's default xMidYMid meet adds letterboxing when a short viewport
  // constrains the canvas. Include that offset, plus CSS zoom and pan.
  const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
  return {
    x: (clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale,
    y: (clientY - rect.top - (rect.height - HEIGHT * scale) / 2) / scale,
  };
}

function fraction(value) {
  const match = String(value)
    .trim()
    .match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (match) return Number(match[1] || 0) + Number(match[2]) / Number(match[3]);
  return /^\d+(?:\.\d+)?$/.test(String(value).trim()) ? Number(value) : NaN;
}

// Bare numbers are inches. Accept feet, decimals, and common mixed fractions.
export function parseLength(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = String(value).trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″“”]/g, '"');
  const feet = text.match(/^(\d+(?:\.\d+)?)\s*(?:'|feet|foot|ft)\s*(.*?)\s*$/);
  if (feet) {
    const rest = feet[2].replace(/\s*(?:inches|inch|in|\")$/, '').trim();
    return Number(feet[1]) * 12 + (rest ? fraction(rest) : 0);
  }
  return fraction(text.replace(/\s*(?:inches|inch|in|\")$/, '').trim());
}

export function pdfLayout({ paper = 'tabloid', scale = 'fit', unitsPerInch, calibrated = false }) {
  const sizes = { tabloid: [17, 11], letter: [11, 8.5], a3: [16.5354, 11.6929] };
  const [pageWidth, pageHeight] = sizes[paper] || sizes.tabloid;
  const availableWidth = pageWidth - 1,
    availableHeight = pageHeight - 1;
  let width, height;
  if (scale === 'fit') {
    const factor = Math.min(availableWidth / WIDTH, availableHeight / HEIGHT);
    width = WIDTH * factor;
    height = HEIGHT * factor;
  } else {
    if (!calibrated || !Number.isFinite(unitsPerInch) || unitsPerInch <= 0)
      throw new Error('Set the blueprint scale before exporting to a drawing scale.');
    const denominator = Number(scale);
    if (![24, 48, 96].includes(denominator)) throw new Error('Choose a supported print scale.');
    width = WIDTH / unitsPerInch / denominator;
    height = HEIGHT / unitsPerInch / denominator;
    if (width > availableWidth + 0.001 || height > availableHeight + 0.001)
      throw new Error(
        'The full workspace will not fit at this scale. Choose a larger sheet, a smaller drawing scale, or Fit to page.',
      );
  }
  return {
    pageWidth,
    pageHeight,
    width,
    height,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
  };
}

const types = new Set([
  'wall',
  'line',
  'rect',
  'dimension',
  'ellipse',
  'door',
  'window',
  'symbol',
  'text',
  'erase',
  'clean',
]);
const symbols = new Set([
  'toilet',
  'sink',
  'shower',
  'tub',
  'bed',
  'wh',
  'washerdryer',
  'counter',
  'stove',
  'vanity',
  'cabinet',
  'fridge',
  'range',
  'sofa',
  'stairs',
]);
const styles = new Set(['single-left', 'single-right', 'double', 'pocket', 'sliding', 'bifold']);
const finite = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7;
const point = (p) => p && finite(p.x) && finite(p.y);

export function validateProject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('This is not a Blueprint Studio project.');
  if (!Array.isArray(data.elements) || data.elements.length > MAX_ELEMENTS)
    throw new Error(`A project can contain up to ${MAX_ELEMENTS.toLocaleString()} objects.`);
  if (!Number.isFinite(data.unitsPerInch) || data.unitsPerInch <= 0 || data.unitsPerInch > 1e5)
    throw new Error('The project has an invalid measurement scale.');
  if (
    data.background != null &&
    (typeof data.background !== 'string' ||
      data.background.length > MAX_FILE_BYTES * 1.4 ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data.background))
  )
    throw new Error('Project backgrounds must be embedded PNG, JPEG, or WebP images.');
  let points = 0;
  const elements = data.elements.map((el, index) => {
    if (!el || !types.has(el.type)) throw new Error(`Unsupported object at position ${index + 1}.`);
    for (const key of [
      'x',
      'y',
      'width',
      'height',
      'rotation',
      'fontSize',
      'thicknessInches',
      'strokeWidth',
      'widthInches',
      'heightInches',
      'size',
      'rx',
      'ry',
    ]) {
      if (el[key] !== undefined && !finite(el[key]))
        throw new Error('An object contains an invalid number.');
    }
    for (const key of [
      'width',
      'height',
      'fontSize',
      'thicknessInches',
      'strokeWidth',
      'widthInches',
      'heightInches',
      'size',
      'rx',
      'ry',
    ]) {
      if (el[key] !== undefined && el[key] <= 0) throw new Error('Object sizes must be positive.');
    }
    if (['wall', 'line', 'dimension'].includes(el.type)) {
      if (!point(el.a) || !point(el.b)) throw new Error('A line has invalid endpoints.');
    } else if (el.type === 'erase') {
      if (!Array.isArray(el.points) || !el.points.length || !el.points.every(point))
        throw new Error('An erase stroke is invalid.');
      points += el.points.length;
      if (points > 100000) throw new Error('This project contains too many brush points.');
    } else if (!point(el)) throw new Error('An object has invalid coordinates.');
    if (el.type === 'symbol' && !symbols.has(el.symbol)) throw new Error('Unknown fixture.');
    if (el.type === 'door' && el.doorStyle && !styles.has(el.doorStyle))
      throw new Error('Unknown door style.');
    return {
      ...el,
      id: typeof el.id === 'string' ? el.id.slice(0, 100) : `restored-${index}`,
      text: el.type === 'text' ? String(el.text || '').slice(0, 2000) : undefined,
    };
  });
  if (new Set(elements.map((el) => el.id)).size !== elements.length)
    throw new Error('The project contains duplicate object identifiers.');
  return {
    id: typeof data.id === 'string' ? data.id.slice(0, 100) : 'restored',
    name: String(data.name || 'Restored project').slice(0, 100),
    elements,
    unitsPerInch: data.unitsPerInch,
    calibrated: data.calibrated === true,
    background: data.background || null,
    backgroundOpacity: Math.max(
      0,
      Math.min(1, Number.isFinite(data.backgroundOpacity) ? data.backgroundOpacity : 1),
    ),
    showBackground: data.showBackground !== false,
    createdAt: Number.isFinite(data.createdAt) ? data.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
