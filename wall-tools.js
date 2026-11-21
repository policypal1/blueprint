import { isProjectNumber } from './editor-core.js';

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const MAX_WALL_INCHES = 24;
const MAX_WALL_PIXELS = 96;
export const maxWallThickness = unitsPerInch => Math.min(MAX_WALL_INCHES, MAX_WALL_PIXELS / unitsPerInch);
export const clampWallThickness = (inches, unitsPerInch) => {
  const max = maxWallThickness(unitsPerInch);
  return clamp(inches, Math.min(0.25, max), max);
};
export const isWallColor = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function wallStyle(wall) {
  return { color: isWallColor(wall?.color) ? wall.color : '#000000', thicknessInches: wall?.thicknessInches || 4.5 };
}

export function wallControls(wall, unitsPerInch, displayScale = 1) {
  const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const middle = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
  const offset = wallStyle(wall).thicknessInches * unitsPerInch / 2 + 28 / Math.max(displayScale, 0.01);
  return { normal, middle, thickness: { x: middle.x + normal.x * offset, y: middle.y + normal.y * offset } };
}

export function resizeWall(wall, handle, point, start, unitsPerInch) {
  if (![point.x, point.y].every(isProjectNumber)) return {};
  if (handle === 'a' || handle === 'b') {
    const anchor = wall[handle === 'a' ? 'b' : 'a'];
    return Math.hypot(point.x - anchor.x, point.y - anchor.y) >= 1 ? { [handle]: point } : {};
  }
  if (handle !== 'thickness' || !start || !(unitsPerInch > 0)) return {};
  const { normal } = wallControls(wall, unitsPerInch);
  const delta = (point.x - start.x) * normal.x + (point.y - start.y) * normal.y;
  const thicknessInches = clampWallThickness(wallStyle(wall).thicknessInches + 2 * delta / unitsPerInch, unitsPerInch);
  return { thicknessInches: clampWallThickness(Math.round(thicknessInches * 100) / 100, unitsPerInch) };
}

// Read the visible ink around a tap. Width is an estimate of a solid stroke,
// not an interpretation of architectural wall cavities or construction dimensions.
export function sampleWallStyle(image, x, y, pixelsPerUnit, unitsPerInch) {
  const { data, width, height } = image;
  const pixel = (px, py) => {
    px = Math.round(px); py = Math.round(py);
    if (px < 0 || py < 0 || px >= width || py >= height) return null;
    const index = (py * width + px) * 4, alpha = data[index + 3] / 255;
    return [0, 1, 2].map(channel => Math.round(data[index + channel] * alpha + 255 * (1 - alpha)));
  };
  const lightness = rgb => (rgb[0] + rgb[1] + rgb[2]) / 3;
  let ink;
  for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) {
    const rgb = pixel(x + dx, y + dy);
    const distance = Math.hypot(dx, dy);
    if (!rgb || lightness(rgb) >= 230 || distance > 16) continue;
    const score = distance + lightness(rgb) / 255;
    if (!ink || score < ink.score) ink = { x: Math.round(x + dx), y: Math.round(y + dy), rgb, score };
  }
  if (!ink) return null;
  // Prefer an interior pixel over a lighter antialiased edge at the tap.
  const tones = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const rgb = pixel(ink.x + dx, ink.y + dy);
    if (rgb && lightness(rgb) < 230) tones.push(rgb);
  }
  tones.sort((a, b) => lightness(a) - lightness(b));
  const tone = tones[Math.floor(tones.length / 4)] || ink.rgb;
  const matches = rgb => rgb && Math.max(...rgb.map((part, i) => Math.abs(part - tone[i]))) <= 55
    && lightness(rgb) < 230;
  let narrowest = Infinity;
  for (let direction = 0; direction < 16; direction++) {
    const angle = direction * Math.PI / 16;
    const runs = [];
    for (const sign of [-1, 1]) {
      let distance = 0;
      for (; distance < 96; distance += 0.5) {
        if (!matches(pixel(ink.x + sign * Math.cos(angle) * distance, ink.y + sign * Math.sin(angle) * distance))) break;
      }
      runs.push(distance);
    }
    if (runs.every(run => run > 0 && run < 96)) narrowest = Math.min(narrowest, runs[0] + runs[1] - 0.5);
  }
  const color = '#' + tone.map(part => part.toString(16).padStart(2, '0')).join('');
  const inches = narrowest / pixelsPerUnit / unitsPerInch;
  return { color, ...(Number.isFinite(inches) && inches > 0
    ? { thicknessInches: clampWallThickness(Math.round(inches * 100) / 100, unitsPerInch) } : {}) };
}
