export const WIDTH = 1600;
export const HEIGHT = 1000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_ELEMENTS = 5000;
export const MAX_BRUSH_POINTS = 100000;
export const MAX_PROJECT_NUMBER = 1e7;

export function isProjectScale(value) {
  return Number.isFinite(value) && value > 0 && value <= 1e5;
}

export function isProjectNumber(value) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_PROJECT_NUMBER;
}

export function clientToWorkspace(clientX, clientY, rect) {
  // SVG's default xMidYMid meet adds letterboxing when a short viewport
  // constrains the canvas. Include that offset, plus CSS zoom and pan.
  const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
  return {
    x: (clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale,
    y: (clientY - rect.top - (rect.height - HEIGHT * scale) / 2) / scale,
  };
}

export function pdfLayout({ paper = 'tabloid' }) {
  const sizes = { tabloid: [17, 11], letter: [11, 8.5], a3: [16.5354, 11.6929] };
  const [pageWidth, pageHeight] = sizes[paper] || sizes.tabloid;
  const availableWidth = pageWidth - 1,
    availableHeight = pageHeight - 1;
  const factor = Math.min(availableWidth / WIDTH, availableHeight / HEIGHT);
  const width = WIDTH * factor;
  const height = HEIGHT * factor;
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
const point = (p) => p && isProjectNumber(p.x) && isProjectNumber(p.y);

export function validateProject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('This is not a Blueprint Studio project.');
  if (!Array.isArray(data.elements) || data.elements.length > MAX_ELEMENTS)
    throw new Error(`A project can contain up to ${MAX_ELEMENTS.toLocaleString()} objects.`);
  if (!isProjectScale(data.unitsPerInch))
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
    if (el.color !== undefined && (typeof el.color !== 'string' || !/^#[\da-f]{6}$/i.test(el.color)))
      throw new Error('Wall colors must use a six-digit hex color.');
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
      if (el[key] !== undefined && !isProjectNumber(el[key]))
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
      if (points > MAX_BRUSH_POINTS) throw new Error('This project contains too many brush points.');
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
    updatedAt: Number.isFinite(data.updatedAt) ? data.updatedAt : Date.now(),
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
