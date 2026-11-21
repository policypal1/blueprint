import React, { useEffect, useRef, useState } from 'react';
import { Icon, Modal, PRODUCT_NAME, useDialog } from './ui.jsx';
import { DOORS, FIXTURES, PhoneControls, ToolButton, ToolChoices, editorMode } from './EditorControls.jsx';
import EditorGuide from './EditorGuide.jsx';
import EditorTour, { TourMarks, tourBaseline } from './EditorTour.jsx';
import { snapOpening, resizeWindow } from './opening-tools.js';
import { EXTRA_FIXTURES } from './fixtures.jsx';
import './conversion.css';
import { DoorwayControls, DoorwayMarks, markDoorway, movedDoorwayElements } from './DoorwayMove.jsx';
import {
  pdfLayout,
  MAX_FILE_BYTES,
  MAX_ELEMENTS,
  MAX_BRUSH_POINTS,
  MAX_PROJECT_NUMBER,
  isProjectNumber,
  validateProject,
  downloadBlob,
  clientToWorkspace,
} from './editor-core.js';
import { embedExportFont } from './export-font.js';
import { useProjectStore } from './useProjectStore.js';
import { sampleProject } from './sample-project.js';
import { isWallColor, wallStyle, wallControls, resizeWall, sampleWallStyle } from './wall-tools.js';
import RecentPlans from './RecentPlans.jsx';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

const W = 1600;
const H = 1000;
const GRID = 20;
const COMPACT_LAYOUT = '(max-width: 800px), (pointer: coarse) and (max-height: 520px)';
const DESKTOP_TIP_KEY = 'editfloorplans-hide-desktop-tip';
const FIRST_USE_GUIDE_KEY = 'editfloorplans-editor-guide';
const DRAWING_ACCENT = '#a9441b';
const TAP_SLOP = 10;
const DRAG_SLOP = 4;
const CLIPBOARD_IMAGES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);
const VIEW_TOOLS = [['select', 'Select'], ['pan', 'Pan']];
const OTHER_DRAW_TOOLS = [['window', 'Window'], ['line', 'Line'], ['rect', 'Rectangle']];
const PANEL_TITLES = {
  doors: 'Choose a door',
  cleanup: 'Clean up',
  properties: 'Object properties',
  settings: 'Plan settings',
  tools: 'More tools',
};
const TOOL_HINTS = {
  select: 'Tap or click an object to edit it.',
  pan: 'Drag to pan. Pinch to zoom on touchscreens.',
  wall: 'Drag to draw a wall.',
  line: 'Drag to draw a line.',
  rect: 'Drag to draw a rectangle.',
  clean: 'Drag a rectangle around the area to clear.',
  erase: 'Brush over the original or an object to erase it.',
  text: 'Place a label for a note or a known measurement.',
  window: 'Tap or click a wall to place a window.',
};

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function inchesLabel(inches) {
  if (!Number.isFinite(inches)) return '';
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  let feet = Math.floor(abs / 12);
  let inch = Math.round((abs - feet * 12) * 4) / 4;
  if (inch >= 12) {
    feet += 1;
    inch = 0;
  }
  const inchText = Number.isInteger(inch) ? `${inch}` : `${inch}`;
  return `${sign}${feet}' ${inchText}\"`;
}


function emptyProject(name = 'New Project') {
  return {
    id: uid(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    unitsPerInch: 4,
    background: null,
    backgroundOpacity: 1,
    calibrated: false,
    showBackground: true,
    elements: [],
  };
}

function fitRasterToWorkspace(source) {
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the drawing. Try a smaller image or sheet.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
  const dw = source.width * scale,
    dh = source.height * scale;
  ctx.drawImage(source, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  const image = canvas.toDataURL('image/png');
  if (!image.startsWith('data:image/png;base64,') || image.length <= 'data:image/png;base64,'.length)
    throw new Error('Could not read the drawing image. Try a smaller image or sheet.');
  return image;
}

function fitBoxToWorkspace(width, height) {
  const safeW = Math.max(1, Number(width) || 1);
  const safeH = Math.max(1, Number(height) || 1);
  const scale = Math.min(W / safeW, H / safeH);
  const drawWidth = safeW * scale;
  const drawHeight = safeH * scale;
  return {
    scale,
    x: (W - drawWidth) / 2,
    y: (H - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

function closestPointOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return { ...a };
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function pointLineDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!len) return dist(p, a);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function snapPoint(point, elements, options = {}) {
  const opts = typeof options === 'boolean' ? { grid: options } : options;
  const {
    grid = true,
    align = true,
    magnet = true,
    excludeSegmentWallIds = [],
    lineFrom = null,
    lineTolerance = 10,
  } = opts;
  let p = { ...point };
  // Walls and annotation lines are both magnetic geometry. This lets line
  // endpoints connect cleanly to other lines instead of stopping a few
  // pixels short or overlapping by eye.
  const snapSegments = elements.filter((el) => el.type === 'wall' || el.type === 'line');

  if (magnet) {
    let best = null;
    let bestD = 20;
    for (const el of snapSegments) {
      const candidates = [el.a, el.b];
      if (!excludeSegmentWallIds.includes(el.id))
        candidates.push(closestPointOnSegment(p, el.a, el.b));
      for (const candidate of candidates) {
        if (lineFrom && pointLineDistance(candidate, lineFrom.a, lineFrom.b) > lineTolerance)
          continue;
        const d = dist(p, candidate);
        if (d < bestD) {
          best = candidate;
          bestD = d;
        }
      }
    }
    if (best) return { ...best, snapped: true };
  }

  if (align && snapSegments.length) {
    const anchors = snapSegments.flatMap((el) => [el.a, el.b]);
    let bestX = null,
      bestY = null,
      dx = 11,
      dy = 11;
    for (const a of anchors) {
      const xDelta = Math.abs(p.x - a.x);
      const yDelta = Math.abs(p.y - a.y);
      if (xDelta < dx) {
        bestX = a.x;
        dx = xDelta;
      }
      if (yDelta < dy) {
        bestY = a.y;
        dy = yDelta;
      }
    }
    if (bestX !== null) p.x = bestX;
    if (bestY !== null) p.y = bestY;
  }

  if (grid) {
    p.x = Math.round(p.x / GRID) * GRID;
    p.y = Math.round(p.y / GRID) * GRID;
  }
  return p;
}

function angleSnap(a, b, stepDeg = 15) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return b;
  const angle = Math.atan2(dy, dx);
  const step = (stepDeg * Math.PI) / 180;
  const snapped = Math.round(angle / step) * step;
  return { x: a.x + Math.cos(snapped) * len, y: a.y + Math.sin(snapped) * len };
}

function startWall(point, elements, awaitingEnd = false) {
  const startWallIds = elements
    .filter((el) => el.type === 'wall' && dist(point, closestPointOnSegment(point, el.a, el.b)) < 8)
    .map((el) => el.id);
  return { type: 'wall', a: point, b: point, startWallIds, awaitingEnd };
}

function endWall(draft, point, elements, freeAngle) {
  const target = freeAngle ? point : angleSnap(draft.a, point);
  return snapPoint(target, elements, {
    grid: false,
    align: false,
    magnet: true,
    excludeSegmentWallIds: draft.startWallIds,
    lineFrom: freeAngle ? null : { a: draft.a, b: target },
    lineTolerance: 3,
  });
}

const BLUEPRINT_IMPORT_SYMBOLS = new Set([
  ...EXTRA_FIXTURES.map(item => item.id),
  'toilet',
  'sink',
  'shower',
  'tub',
  'bed',
  'wh',
  'washerdryer',
  'counter',
  'stove',
]);
const BLUEPRINT_DOOR_STYLES = new Set([
  'single-left',
  'single-right',
  'double',
  'pocket',
  'sliding',
  'bifold',
]);

function stripCodeFences(value) {
  const text = String(value || '').trim();
  if (!text.startsWith('```')) return text;
  return text
    .replace(/^```(?:json|javascript|js|text)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function normalizeBlueprintImport(raw, projectState) {
  const currentUnitsPerInch =
    typeof projectState === 'number' ? projectState : Number(projectState?.unitsPerInch || 4);
  const data = Array.isArray(raw) ? { version: 1, units: 'canvas', elements: raw } : raw;
  if (!data || typeof data !== 'object' || !Array.isArray(data.elements))
    throw new Error('The code needs an "elements" array.');

  const unitName = String(data.units || 'inches').toLowerCase();
  const supportedUnits = [
    'inches',
    'inch',
    'in',
    'feet',
    'foot',
    'ft',
    'canvas',
    'pixels',
    'pixel',
    'normalized',
  ];
  if (!supportedUnits.includes(unitName)) throw new Error(`Unsupported units: ${data.units}`);
  const mode = ['feet', 'foot', 'ft'].includes(unitName)
    ? 'feet'
    : ['canvas', 'pixels', 'pixel'].includes(unitName)
      ? 'canvas'
      : unitName === 'normalized'
        ? 'normalized'
        : 'inches';
  const number = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const aliases = {
    bathtub: 'tub',
    bath: 'tub',
    'water-heater': 'wh',
    waterheater: 'wh',
    'water heater': 'wh',
    wd: 'washerdryer',
    washerdryer: 'washerdryer',
    'washer-dryer': 'washerdryer',
    washer: 'washerdryer',
    dryer: 'washerdryer',
    cooktop: 'stove',
    range: 'stove',
    countertop: 'counter',
    vanity: 'sink',
  };
  const neutral = [];

  for (const source of data.elements) {
    if (!source || typeof source !== 'object') continue;
    let type = String(source.type || source.kind || '')
      .toLowerCase()
      .trim();
    if (!type) continue;
    type = aliases[type] || type;

    if (type === 'wall' || type === 'line') {
      const a = source.a || { x: source.x1, y: source.y1 };
      const b = source.b || { x: source.x2, y: source.y2 };
      neutral.push({
        type,
        a: { x: number(a?.x), y: number(a?.y) },
        b: { x: number(b?.x), y: number(b?.y) },
        thicknessInches: number(source.thicknessInches ?? source.thickness, 4.5),
        ...(type === 'wall' && isWallColor(source.color) ? { color: source.color } : {}),
        strokeWidth: number(source.strokeWidth, 2),
      });
      continue;
    }
    if (type === 'rect' || type === 'rectangle') {
      neutral.push({
        type: 'rect',
        x: number(source.x),
        y: number(source.y),
        width: Math.abs(number(source.width, 12)),
        height: Math.abs(number(source.height, 12)),
        strokeWidth: number(source.strokeWidth, 2),
      });
      continue;
    }
    if (type === 'text' || type === 'label') {
      neutral.push({
        type: 'text',
        x: number(source.x),
        y: number(source.y),
        text: String(source.text ?? source.label ?? 'Label'),
        fontSize: number(source.fontSize, 22),
        rotation: number(source.rotation, 0),
      });
      continue;
    }
    if (type === 'door') {
      const style = String(source.style ?? source.doorStyle ?? 'single-left').toLowerCase();
      neutral.push({
        type: 'door',
        x: number(source.x),
        y: number(source.y),
        widthInches: Math.max(1, number(source.widthInches ?? source.width, 30)),
        rotation: number(source.rotation, 0),
        doorStyle: BLUEPRINT_DOOR_STYLES.has(style) ? style : 'single-left',
      });
      continue;
    }
    if (type === 'window') {
      neutral.push({
        type: 'window',
        x: number(source.x),
        y: number(source.y),
        widthInches: Math.max(1, number(source.widthInches ?? source.width, 30)),
        heightInches: Math.max(0.25, number(source.heightInches ?? source.height, 4.5)),
        rotation: number(source.rotation, 0),
      });
      continue;
    }
    const symbol =
      aliases[String(source.symbol || type).toLowerCase()] ||
      String(source.symbol || type).toLowerCase();
    if (BLUEPRINT_IMPORT_SYMBOLS.has(symbol)) {
      const defaults = {
        toilet: [14, 18],
        sink: [18, 12],
        shower: [24, 24],
        tub: [36, 18],
        bed: [36, 50],
        wh: [14, 14],
        washerdryer: [30, 18],
        counter: [48, 24],
        stove: [30, 26],
      }[symbol] || (() => { const item = EXTRA_FIXTURES.find(item => item.id === symbol); return [item.width,item.height]; })();
      neutral.push({
        type: 'symbol',
        symbol,
        x: number(source.x),
        y: number(source.y),
        widthInches: Math.max(1, number(source.widthInches ?? source.width, defaults[0])),
        heightInches: Math.max(1, number(source.heightInches ?? source.height, defaults[1])),
        rotation: number(source.rotation, 0),
      });
    }
  }
  if (!neutral.length) throw new Error('No supported editable objects were found in that code.');

  const sourceImageWidth = number(
    data.imageWidth ??
      data.image_width ??
      data.sourceWidth ??
      data.source_width ??
      data.backgroundWidth ??
      data.background_width,
    0,
  );
  const sourceImageHeight = number(
    data.imageHeight ??
      data.image_height ??
      data.sourceHeight ??
      data.source_height ??
      data.backgroundHeight ??
      data.background_height,
    0,
  );
  const hasSourceImageSize = sourceImageWidth > 0 && sourceImageHeight > 0;
  const fit = hasSourceImageSize ? fitBoxToWorkspace(sourceImageWidth, sourceImageHeight) : null;

  const mapCanvasLikePoint = (pt) => {
    if (!pt) return pt;
    if (fit) return { x: fit.x + pt.x * fit.scale, y: fit.y + pt.y * fit.scale };
    return { x: pt.x, y: pt.y };
  };
  const mapNormalizedPoint = (pt) => {
    if (!pt) return pt;
    if (fit)
      return {
        x: fit.x + (pt.x / 1000) * sourceImageWidth * fit.scale,
        y: fit.y + (pt.y / 1000) * sourceImageHeight * fit.scale,
      };
    return { x: pt.x * (W / 1000), y: pt.y * (H / 1000) };
  };

  if (mode === 'canvas' || mode === 'normalized') {
    let elements = neutral.map((el) => {
      const out = { id: uid(), ...el };
      if (mode === 'canvas') {
        if (out.a && out.b) {
          out.a = mapCanvasLikePoint(out.a);
          out.b = mapCanvasLikePoint(out.b);
        } else if (Number.isFinite(out.x) && Number.isFinite(out.y)) {
          const p = mapCanvasLikePoint({ x: out.x, y: out.y });
          out.x = p.x;
          out.y = p.y;
        }
        if (fit && out.type === 'rect') {
          out.width *= fit.scale;
          out.height *= fit.scale;
        }
      } else {
        if (out.a && out.b) {
          out.a = mapNormalizedPoint(out.a);
          out.b = mapNormalizedPoint(out.b);
        } else if (Number.isFinite(out.x) && Number.isFinite(out.y)) {
          const p = mapNormalizedPoint({ x: out.x, y: out.y });
          out.x = p.x;
          out.y = p.y;
        }
        if (fit && out.type === 'rect') {
          out.width = (out.width / 1000) * sourceImageWidth * fit.scale;
          out.height = (out.height / 1000) * sourceImageHeight * fit.scale;
        } else if (out.type === 'rect') {
          out.width *= W / 1000;
          out.height *= H / 1000;
        }
      }
      return out;
    });

    const unitsPerInch = fit ? clamp(Math.min(currentUnitsPerInch, fit.scale), 0.35, 8) : currentUnitsPerInch;
    elements = regularizeImportedElements(elements, unitsPerInch);
    return {
      elements,
      unitsPerInch,
      name: data.name,
    };
  }

  const feetFactor = mode === 'feet' ? 12 : 1;
  const points = [];
  const addPoint = (x, y) => points.push({ x: x * feetFactor, y: y * feetFactor });
  for (const el of neutral) {
    if (el.a && el.b) {
      addPoint(el.a.x, el.a.y);
      addPoint(el.b.x, el.b.y);
    } else if (Number.isFinite(el.x) && Number.isFinite(el.y)) {
      const halfW = (el.widthInches || 0) / 2,
        halfH = (el.heightInches || 0) / 2;
      addPoint(el.x - halfW / feetFactor, el.y - halfH / feetFactor);
      addPoint(el.x + halfW / feetFactor, el.y + halfH / feetFactor);
    }
    if (el.type === 'rect') {
      addPoint(el.x, el.y);
      addPoint(el.x + el.width, el.y + el.height);
    }
  }
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y)),
    maxY = Math.max(...points.map((p) => p.y));
  const spanX = Math.max(1, maxX - minX),
    spanY = Math.max(1, maxY - minY);
  let unitsPerInch = clamp(Math.min(4, (W - 140) / spanX, (H - 140) / spanY), 0.35, 8);
  const offsetX = (W - spanX * unitsPerInch) / 2 - minX * unitsPerInch,
    offsetY = (H - spanY * unitsPerInch) / 2 - minY * unitsPerInch;
  const coord = (v, axis) => v * feetFactor * unitsPerInch + (axis === 'x' ? offsetX : offsetY);
  let elements = neutral.map((el) => {
    const out = { id: uid(), ...el };
    if (out.a && out.b) {
      out.a = { x: coord(out.a.x, 'x'), y: coord(out.a.y, 'y') };
      out.b = { x: coord(out.b.x, 'x'), y: coord(out.b.y, 'y') };
    } else if (Number.isFinite(out.x) && Number.isFinite(out.y)) {
      out.x = coord(out.x, 'x');
      out.y = coord(out.y, 'y');
    }
    if (out.type === 'rect') {
      out.width = out.width * feetFactor * unitsPerInch;
      out.height = out.height * feetFactor * unitsPerInch;
    }
    return out;
  });
  elements = regularizeImportedElements(elements, unitsPerInch);
  return { elements, unitsPerInch, name: data.name };
}

const CHATGPT_BLUEPRINT_PROMPT = `Analyze the attached floor-plan/blueprint image and return ONLY valid JSON for ${PRODUCT_NAME}. Do not use markdown fences or explanations.

Preferred shape:
{"version":2,"name":"Project name","units":"pixels","imageWidth":1320,"imageHeight":930,"elements":[]}

IMPORTANT IMPORT RULES:
- Prefer units "pixels" whenever possible.
- Use the FULL IMAGE pixel coordinate system of the attached blueprint, with (0,0) at the image's top-left corner.
- Include imageWidth and imageHeight when using pixels.
- Use units "normalized" with coordinates from 0 to 1000 if image pixel dimensions are unknown. Copy legible printed dimensions as text labels.

Supported editable elements:
- wall: {"type":"wall","x1":0,"y1":0,"x2":120,"y2":0,"thickness":4.5}
- line: {"type":"line","x1":0,"y1":0,"x2":120,"y2":0,"strokeWidth":2}
- door: {"type":"door","x":60,"y":0,"width":30,"rotation":0,"style":"single-left"}
  Door styles: single-left, single-right, double, pocket, sliding, bifold
- window: {"type":"window","x":60,"y":0,"width":30,"height":4.5,"rotation":0}
- fixtures/objects: toilet, sink, shower, tub, bed, wh, washerdryer, counter, stove
  Example: {"type":"sink","x":100,"y":80,"width":18,"height":12,"rotation":0}
- text: {"type":"text","x":100,"y":100,"text":"BEDROOM","fontSize":22,"rotation":0}
- rect: {"type":"rect","x":50,"y":50,"width":100,"height":60,"strokeWidth":2}

Tracing instructions:
- Trace the visible wall CENTERLINES directly over the image. Exterior walls first, then interior walls.
- Break walls into separate wall segments at corners, T-junctions, door openings, and major changes in direction.
- Keep horizontal walls perfectly horizontal and vertical walls perfectly vertical unless a wall is clearly angled.
- Place doors and windows on the wall centerline with the correct rotation and approximate opening location.
- Include readable room labels and supported fixtures that are visibly present.
- Do not invent hidden geometry.
- Output JSON only.`;

function nearestWallSnap(point, elements, threshold = 34, excludeIds = []) {
  let best = null;
  for (const wall of elements) {
    if (wall.type !== 'wall' || excludeIds.includes(wall.id)) continue;
    const projected = closestPointOnSegment(point, wall.a, wall.b);
    const distance = dist(point, projected);
    if (distance > threshold || (best && distance >= best.distance)) continue;
    const rotation = (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI;
    best = { point: projected, rotation, wall, distance };
  }
  return best;
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function segmentOutsideRect(a, b, rect) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0,
    t1 = 1;
  const checks = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return [[a, b]];
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return [[a, b]];
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return [[a, b]];
      if (r < t1) t1 = r;
    }
  }
  if (t0 <= 0 && t1 >= 1) return [];
  const at = (t) => ({ x: a.x + dx * t, y: a.y + dy * t });
  const pieces = [];
  if (t0 > 0.0001) pieces.push([a, at(t0)]);
  if (t1 < 0.9999) pieces.push([at(t1), b]);
  return pieces.filter(([p1, p2]) => dist(p1, p2) > 1);
}

function elementBounds(el, units) {
  if (el.type === 'wall' || el.type === 'line') {
    const pad =
      el.type === 'wall'
        ? Math.max(4, ((el.thicknessInches || 4.5) * units) / 2)
        : el.strokeWidth || 2;
    return {
      x: Math.min(el.a.x, el.b.x) - pad,
      y: Math.min(el.a.y, el.b.y) - pad,
      width: Math.abs(el.a.x - el.b.x) + pad * 2,
      height: Math.abs(el.a.y - el.b.y) + pad * 2,
    };
  }
  if (el.type === 'rect' || el.type === 'clean')
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  if (el.type === 'ellipse')
    return { x: el.x - el.rx, y: el.y - el.ry, width: el.rx * 2, height: el.ry * 2 };
  if (el.type === 'door') {
    const w = (el.widthInches || 30) * units;
    return { x: el.x - w * 0.15, y: el.y - w * 1.15, width: w * 1.35, height: w * 1.35 };
  }
  if (el.type === 'window') {
    const w = (el.widthInches || 30) * units,
      h = Math.max(12, (el.heightInches || 4.5) * units);
    return { x: el.x - w / 2, y: el.y - h / 2, width: w, height: h };
  }
  if (el.type === 'symbol') {
    const w = (el.widthInches || 24) * units,
      h = (el.heightInches || 24) * units;
    return { x: el.x - w / 2, y: el.y - h / 2, width: w, height: h };
  }
  if (el.type === 'text')
    return {
      x: el.x - 10,
      y: el.y - (el.fontSize || 24),
      width: Math.max(30, (el.text || '').length * (el.fontSize || 24) * 0.6),
      height: (el.fontSize || 24) * 1.4,
    };
  if (el.type === 'erase') {
    const xs = el.points.map((p) => p.x),
      ys = el.points.map((p) => p.y),
      pad = (el.size || 36) / 2;
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      width: Math.max(...xs) - Math.min(...xs) + pad * 2,
      height: Math.max(...ys) - Math.min(...ys) + pad * 2,
    };
  }
  return { x: -99999, y: -99999, width: 0, height: 0 };
}

function segmentDistance(a, b, c, d) {
  const abX = b.x - a.x, abY = b.y - a.y;
  const cdX = d.x - c.x, cdY = d.y - c.y;
  const denominator = abX * cdY - abY * cdX;
  if (denominator) {
    const x = c.x - a.x, y = c.y - a.y;
    const alongAB = (x * cdY - y * cdX) / denominator;
    const alongCD = (x * abY - y * abX) / denominator;
    if (alongAB >= 0 && alongAB <= 1 && alongCD >= 0 && alongCD <= 1) return 0;
  }
  return Math.min(
    dist(a, closestPointOnSegment(a, c, d)), dist(b, closestPointOnSegment(b, c, d)),
    dist(c, closestPointOnSegment(c, a, b)), dist(d, closestPointOnSegment(d, a, b)),
  );
}

function brushHitsObject(el, from, to, radius, units) {
  if (el.type === 'clean' || el.type === 'erase') return false;
  if (el.type === 'wall' || el.type === 'line' || el.type === 'dimension') {
    const width = el.type === 'wall' ? Math.max(3, (el.thicknessInches || 4.5) * units) : (el.strokeWidth || 2);
    if (segmentDistance(from, to, el.a, el.b) <= radius + width / 2) return true;
    return el.type === 'dimension' && [el.a, el.b].some(({ x, y }) =>
      segmentDistance(from, to, { x, y: y - 10 }, { x, y: y + 10 }) <= radius + 1);
  }

  if (el.rotation && ['door', 'window', 'symbol', 'text'].includes(el.type)) {
    const radians = -el.rotation * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    const unrotate = ({ x, y }) => ({
      x: el.x + (x - el.x) * cos - (y - el.y) * sin,
      y: el.y + (x - el.x) * sin + (y - el.y) * cos,
    });
    from = unrotate(from);
    to = unrotate(to);
  }

  const bounds = elementBounds(el, units);
  const left = bounds.x, right = bounds.x + bounds.width;
  const top = bounds.y, bottom = bounds.y + bounds.height;
  const reach = radius + (el.strokeWidth || 2) / 2;
  if (Math.max(from.x, to.x) + reach < left || Math.min(from.x, to.x) - reach > right
    || Math.max(from.y, to.y) + reach < top || Math.min(from.y, to.y) - reach > bottom) return false;

  if (el.type === 'ellipse') {
    const outline = Array.from({ length: 24 }, (_, i) => {
      const angle = i * 2 * Math.PI / 24;
      return { x: el.x + el.rx * Math.cos(angle), y: el.y + el.ry * Math.sin(angle) };
    });
    return outline.some((point, index) => segmentDistance(from, to, point, outline[(index + 1) % outline.length]) <= reach);
  }
  if (el.type !== 'rect' && [from, to].some(({ x, y }) => x >= left && x <= right && y >= top && y <= bottom)) return true;
  const corners = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
  return corners.some((point, index) => segmentDistance(from, to, point, corners[(index + 1) % corners.length]) <= reach);
}

function cleanElementsInRect(elements, rect, units) {
  const out = [];
  for (const el of elements) {
    if (el.type === 'wall' || el.type === 'line' || el.type === 'dimension') {
      const pieces = segmentOutsideRect(el.a, el.b, rect);
      if (!pieces.length) continue;
      if (pieces.length === 1 && pieces[0][0] === el.a && pieces[0][1] === el.b) {
        out.push(el);
        continue;
      }
      pieces.forEach((piece, i) =>
        out.push({ ...el, id: i === 0 ? el.id : uid(), a: piece[0], b: piece[1] }),
      );
      continue;
    }
    if (el.type === 'erase' || el.type === 'clean') {
      out.push(el);
      continue;
    }
    if (rectsIntersect(elementBounds(el, units), rect)) continue;
    out.push(el);
  }
  return out;
}

function translatePoint(point, dx, dy) {
  return {
    x: clamp(point.x + dx, -MAX_PROJECT_NUMBER, MAX_PROJECT_NUMBER),
    y: clamp(point.y + dy, -MAX_PROJECT_NUMBER, MAX_PROJECT_NUMBER),
  };
}

function offsetElement(el, amount = 24) {
  const clone = JSON.parse(JSON.stringify(el));
  clone.id = uid();
  if (clone.a && clone.b) {
    clone.a = translatePoint(clone.a, amount, amount);
    clone.b = translatePoint(clone.b, amount, amount);
  } else if (Array.isArray(clone.points)) {
    clone.points = clone.points.map((p) => translatePoint(p, amount, amount));
  } else if (Number.isFinite(clone.x) && Number.isFinite(clone.y)) {
    Object.assign(clone, translatePoint(clone, amount, amount));
  }
  return clone;
}

function countBrushPoints(elements) {
  return elements.reduce((count, el) => count + (el.type === 'erase' ? el.points.length : 0), 0);
}

function regularizeImportedElements(elements, unitsPerInch = 4) {
  const cloned = elements.map((el) => JSON.parse(JSON.stringify(el)));
  const segments = cloned.filter((el) => el.type === 'wall' || el.type === 'line');
  const AXIS_TOL = 10;
  const SNAP_TOL = 12;

  const isVertical = (seg) => Math.abs(seg.a.x - seg.b.x) <= AXIS_TOL;
  const isHorizontal = (seg) => Math.abs(seg.a.y - seg.b.y) <= AXIS_TOL;

  for (const seg of segments) {
    if (isVertical(seg)) {
      const x = (seg.a.x + seg.b.x) / 2;
      seg.a.x = x;
      seg.b.x = x;
    }
    if (isHorizontal(seg)) {
      const y = (seg.a.y + seg.b.y) / 2;
      seg.a.y = y;
      seg.b.y = y;
    }
  }

  const verticalXs = [];
  const horizontalYs = [];
  for (const seg of segments) {
    if (isVertical(seg)) verticalXs.push(seg.a.x, seg.b.x);
    if (isHorizontal(seg)) horizontalYs.push(seg.a.y, seg.b.y);
  }
  const snapAxis = (value, list, tol = SNAP_TOL) => {
    let best = value;
    let bestDelta = tol + 0.001;
    for (const candidate of list) {
      const delta = Math.abs(candidate - value);
      if (delta < bestDelta) {
        best = candidate;
        bestDelta = delta;
      }
    }
    return best;
  };

  for (const seg of segments) {
    if (isVertical(seg)) {
      const x = snapAxis(seg.a.x, verticalXs);
      seg.a.x = x;
      seg.b.x = x;
      seg.a.y = snapAxis(seg.a.y, horizontalYs, 8);
      seg.b.y = snapAxis(seg.b.y, horizontalYs, 8);
    } else if (isHorizontal(seg)) {
      const y = snapAxis(seg.a.y, horizontalYs);
      seg.a.y = y;
      seg.b.y = y;
      seg.a.x = snapAxis(seg.a.x, verticalXs, 8);
      seg.b.x = snapAxis(seg.b.x, verticalXs, 8);
    }
  }

  const allSegments = cloned.filter((el) => el.type === 'wall' || el.type === 'line');
  const attractPoint = (pt, currentSeg) => {
    let best = { point: pt, distance: SNAP_TOL + 0.001 };
    for (const other of allSegments) {
      if (other.id === currentSeg.id) continue;
      for (const candidate of [other.a, other.b, closestPointOnSegment(pt, other.a, other.b)]) {
        const d = dist(pt, candidate);
        if (d < best.distance) best = { point: candidate, distance: d };
      }
    }
    return best.point;
  };

  for (const seg of allSegments) {
    const vertical = isVertical(seg);
    const horizontal = isHorizontal(seg);
    seg.a = attractPoint(seg.a, seg);
    seg.b = attractPoint(seg.b, seg);
    if (vertical) {
      const x = (seg.a.x + seg.b.x) / 2;
      seg.a.x = x;
      seg.b.x = x;
    }
    if (horizontal) {
      const y = (seg.a.y + seg.b.y) / 2;
      seg.a.y = y;
      seg.b.y = y;
    }
  }

  return cloned.map((el) => {
    if (el.type === 'door' || el.type === 'window') {
      const snapped = nearestWallSnap({ x: el.x, y: el.y }, cloned, 48);
      if (snapped)
        return { ...el, x: snapped.point.x, y: snapped.point.y, rotation: snapped.rotation };
    }
    return el;
  });
}

function hasHiddenDesktopTip() {
  try {
    return localStorage.getItem(DESKTOP_TIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function BlueprintApp({
  active = true, showRecent = false, sampleRequested = false, onSampleOpened, onOpenWorkspace,
  repository, projectAccess: paidProjectAccess, lockedProjectIds = [], owner, authBusy = false, onRegisterSave, canDownload,
  showMobileTip = false, showFirstUseGuide = false,
  freeEditing = false,
  previewOnly = false, previewPlan, onPreviewPlanChange, onRequestEditing, onPreviewPlanOpened,
}) {
  const projectAccess = freeEditing ? null : paidProjectAccess;
  const viewOnly = previewOnly && !freeEditing;
  const svgRef = useRef(null);
  const fileRef = useRef(null);
  const clipboardRef = useRef(null);
  const panPointers = useRef(new Map());
  const pinch = useRef(null);
  const wallTap = useRef(null);
  const dragRef = useRef(null);
  const panSelection = useRef(null);
  const routeVersion = useRef(0);
  const importPending = useRef(false);
  const {
    projects, setProjects, project, setProject, addLocalProject, selectProject, hydrated,
    saveStatus, projectRef, cloud, accountId, accountIdRef, flush,
  } = useProjectStore(
    () => (previewOnly && previewPlan) || emptyProject('Untitled project'),
    repository, active && showRecent, owner, viewOnly,
  );
  const singleProject = Boolean(projectAccess);
  const showPlans = !previewOnly && (showRecent || (singleProject && !accountId));
  const canCreateProject = !projectAccess || projectAccess.credits > 0;
  const originalLocked = Boolean(accountId && (lockedProjectIds.includes(accountId) || projectAccess?.ids.includes(accountId)));
  const [accountNotice, setAccountNotice] = useState('');
  const accountOperation = useRef(false);
  const accountDraft = cloud.current(accountId);
  const [ask, dialog, dismissDialog] = useDialog();
  const backupRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [editorPanel, setEditorPanel] = useState(null);
  const [phoneMode, setPhoneMode] = useState('view');
  const [compact, setCompact] = useState(() => window.matchMedia?.(COMPACT_LAYOUT).matches ?? false);
  const [desktopTipDismissed, setDesktopTipDismissed] = useState(() => showMobileTip && hasHiddenDesktopTip());
  const [guideMode, setGuideMode] = useState(null);
  const [tour, setTour] = useState(null);
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const checkedFirstUseGuide = useRef(false);
  const [paper, setPaper] = useState('tabloid');
  const [tool, setTool] = useState(() => compact ? 'pan' : 'select');
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [displayScale, setDisplayScale] = useState(1);
  const [doorMove, setDoorMove] = useState(null);
  const [wallMatch, setWallMatch] = useState(null);
  const wallDefaults = useRef(wallStyle(null));
  const matchTap = useRef(null);
  const matchRequest = useRef(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState('Ready');
  const [projectMenu, setProjectMenu] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportCheck = useRef(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [importReplace, setImportReplace] = useState(true);
  const [importError, setImportError] = useState('');
  const [eraseSize, setEraseSize] = useState(28);
  const [brushPoint, setBrushPoint] = useState(null);

  function requestEditing() {
    if (busy || !active) return;
    const plan = projectRef.current;
    setEditorPanel(null);
    setProjectMenu(false);
    setGuideMode(null);
    onRequestEditing?.(plan.background || plan.elements.length ? plan : null);
  }

  function openToolPanel(panel) {
    if (viewOnly && panel !== 'properties') requestEditing();
    else setEditorPanel(panel);
  }

  const cancelWallMatch = () => {
    matchRequest.current += 1;
    matchTap.current = null;
    setWallMatch(null);
  };

  useEffect(() => {
    wallDefaults.current = wallStyle(project.elements.filter(el => el.type === 'wall').at(-1));
    cancelWallMatch();
  }, [project.id]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const bounds = svg.getBoundingClientRect();
      const scale = Math.min(bounds.width / W, bounds.height / H);
      if (scale > 0) setDisplayScale(scale);
    };
    measure();
    const observer = window.ResizeObserver ? new window.ResizeObserver(measure) : null;
    observer?.observe(svg);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [active, showPlans, hydrated, compact, zoom, project.id]);

  const selected = project.elements.find((e) => e.id === selectedId) || null;
  const showDoorPreview = doorMove?.step === 'preview' && doorMove.base === project && !viewOnly && !exporting;
  const drawnElements = showDoorPreview
    ? movedDoorwayElements(project, doorMove, nearestWallSnap, wallDefaults.current)
    : project.elements;
  const backgroundEdits = drawnElements.filter(el => el.type === 'clean' || el.type === 'erase');
  const useWallTaps = compact && tool === 'wall';
  const awaitingWallEnd = useWallTaps && draft?.awaitingEnd;
  const showDesktopTip = showMobileTip && active && hydrated && compact && !desktopTipDismissed;

  useEffect(() => {
    if (freeEditing || !showFirstUseGuide || checkedFirstUseGuide.current || !active || showPlans || !hydrated || busy
      || showDesktopTip || dialog || editorPanel || exportMenu || importOpen || guideMode) return;
    checkedFirstUseGuide.current = true;
    const storageKey = owner ? `${FIRST_USE_GUIDE_KEY}:${owner}` : FIRST_USE_GUIDE_KEY;
    try {
      if (localStorage.getItem(storageKey) === '1') return;
      localStorage.setItem(storageKey, '1');
    } catch {
      // Keep the walkthrough one-time for the mounted editor when storage is unavailable.
    }
    setWalkthroughStep(0);
    setGuideMode('walkthrough');
  }, [active, busy, dialog, editorPanel, exportMenu, guideMode, hydrated, importOpen, owner, showDesktopTip, showFirstUseGuide, showPlans]);

  useEffect(() => {
    if (showMobileTip && !active) setDesktopTipDismissed(hasHiddenDesktopTip());
  }, [active, showMobileTip]);

  function dismissDesktopTip(remember) {
    setDesktopTipDismissed(true);
    if (remember) {
      try {
        localStorage.setItem(DESKTOP_TIP_KEY, '1');
      } catch {
        // Dismiss for this visit if browser storage is unavailable.
      }
    }
  }

  useEffect(() => {
    const media = window.matchMedia?.(COMPACT_LAYOUT);
    if (!media) return;
    const update = () => {
      setCompact(media.matches);
      resetPointerInput();
      setEditorPanel(null);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const pushHistory = (snapshot = projectRef.current) => {
    setHistory((h) => [...h.slice(-49), snapshot]);
    setFuture([]);
  };

  const finishDrag = (commit) => {
    const drag = dragRef.current;
    const before = drag?.before;
    dragRef.current = null;
    const current = projectRef.current;
    if (!before || before.id !== current.id || before === current) return;
    if (commit) {
      pushHistory(before);
      if (drag.kind === 'erase') setStatus('Erased · Undo to restore');
    }
    else setProject(before);
  };

  const resetPointerInput = () => {
    setDoorMove(null);
    setTool(current => current === 'move-doorway' ? 'select' : current);
    cancelWallMatch();
    panSelection.current = null;
    finishDrag(false);
    panPointers.current.clear();
    pinch.current = null;
    wallTap.current = null;
    setDraft(null);
    setBrushPoint(null);
  };

  useEffect(() => {
    routeVersion.current += 1;
    if (active && !showPlans) return;
    resetPointerInput();


    setEditorPanel(null);
    setProjectMenu(false);
    setExportMenu(false);
    setImportOpen(false);
    setGuideMode(null);
    dismissDialog();
  }, [active, showPlans]);

  useEffect(() => {
    onRegisterSave?.(async () => {
      const results = await Promise.all([flush(), cloud.flush()]);
      return results.every(Boolean);
    });
    return () => {
      routeVersion.current += 1;
      onRegisterSave?.(null);
    };
  }, [repository, onRegisterSave]);

  const captureRoute = () => {
    const hash = window.location.hash;
    const version = routeVersion.current;
    return () => window.location.hash === hash && routeVersion.current === version;
  };

  const updateProject = (fn) => setProject((p) => ({ ...fn(p), updatedAt: Date.now() }));
  const commitElement = (id, patch) => {
    const current = projectRef.current.elements.find((el) => el.id === id);
    if (!current || Object.entries(patch).every(([key, value]) => current[key] === value)) return;
    if (Object.values(patch).some((value) => typeof value === 'number' && !isProjectNumber(value))) {
      setStatus('Choose a smaller value');
      return;
    }
    pushHistory();
    if (current.type === 'wall') wallDefaults.current = { ...wallStyle(current), ...patch };
    updateElement(id, patch);
  };
  const changeTool = (next) => {
    if (viewOnly && next !== 'pan' && next !== 'select') {
      requestEditing();
      return;
    }
    if (next === 'wall' && selected?.type === 'wall') wallDefaults.current = wallStyle(selected);
    resetPointerInput();


    setTool(next);
    if (next !== 'select' && next !== 'pan') setSelectedId(null);
    setPhoneMode(editorMode(next));
    setEditorPanel(null);
  };

  useEffect(() => {
    if (doorMove && (doorMove.base !== project || viewOnly || !active || showPlans)) changeTool('select');
  }, [doorMove, project, previewOnly, active, showPlans]);

  function beginDoorMove() {
    if (viewOnly) { requestEditing(); return; }
    if (busy || !active || !hydrated) return;
    changeTool('move-doorway');
    setDoorMove({ step: 'start', style: 'single-left', base: projectRef.current, doorId: uid(), wallId: uid(), maskId: uid() });
  }

  function updateDoorMove(next, remember = true) {
    if (next !== doorMove) setDoorMove(remember ? { ...next, previous: doorMove } : next);
  }

  function applyDoorMove() {
    if (viewOnly) { requestEditing(); return; }
    if (!showDoorPreview || !active || busy || projectRef.current !== doorMove.base) return;
    if (drawnElements.length > MAX_ELEMENTS || countBrushPoints(drawnElements) > MAX_BRUSH_POINTS) {
      setStatus('Project is full. Remove an object or brush stroke before moving the doorway.');
      return;
    }
    const door = drawnElements.at(-1);
    if (![door.x, door.y, door.widthInches, doorMove.b.x, doorMove.b.y].every(isProjectNumber)) {
      setStatus('This doorway is outside the drawing limits.');
      return;
    }
    pushHistory();
    updateProject(p => ({ ...p, elements: drawnElements }));
    changeTool('select');
    setSelectedId(door.id);
    setStatus('Doorway moved');
  }

  function tryWalkthroughTool(action) {
    if (viewOnly && action !== 'pan' && action !== 'select') {
      requestEditing();
      return;
    }
    setGuideMode('practice');
    if (action === 'export') void openExport();
    else if (['doors', 'cleanup', 'tools'].includes(action)) setEditorPanel(action);
    else changeTool(action);
  }

  const addElement = (el) => {
    if (projectRef.current.elements.length >= MAX_ELEMENTS) {
      setStatus('Project object limit reached');
      return;
    }
    pushHistory();
    const element = { id: uid(), ...(el.type === 'wall' ? wallDefaults.current : {}), ...el };
    updateProject((p) => ({ ...p, elements: [...p.elements, element] }));
    if (['text', 'symbol', 'door', 'window'].includes(el.type)) {
      setSelectedId(element.id);
      setTool('select');
    }
  };

  const updateElement = (id, patch) => {
    updateProject((p) => ({
      ...p,
      elements: p.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    updateProject((p) => ({ ...p, elements: p.elements.filter((e) => e.id !== selectedId) }));
    setSelectedId(null);
    if (editorPanel === 'properties') setEditorPanel(null);
    setStatus('Object deleted · Undo to restore');
  };

  const clearAll = async () => {
    setEditorPanel(null);
    if ((!project.background || originalLocked) && project.elements.length === 0) return;
    if (
      !(await ask({
        title: 'Clear this drawing?',
        message: originalLocked
          ? 'This clears your edits and keeps the original blueprint. You can undo this change.'
          : 'The background and all objects will be removed. You can undo this change.',
        type: 'confirm',
        confirmLabel: originalLocked ? 'Clear edits' : 'Clear drawing',
        danger: true,
      }))
    )
      return;
    pushHistory();
    updateProject((p) => ({
      ...p,
      background: originalLocked ? p.background : null,
      elements: [],
      unitsPerInch: 4,
      calibrated: false,
    }));
    setSelectedId(null);
    setDraft(null);


    setTool('select');
    setPhoneMode('view');
    setStatus('Canvas cleared');
  };

  const undo = () => {
    if (!history.length) return;
    resetPointerInput();


    const snapshot = projectRef.current;
    setFuture((f) => [snapshot, ...f].slice(0, 50));
    setHistory((h) => h.slice(0, -1));
    setProject({ ...history.at(-1), updatedAt: Date.now() });
    setSelectedId(null);
    setStatus('Undid last change');
  };

  const redo = () => {
    if (!future.length) return;
    resetPointerInput();


    const snapshot = projectRef.current;
    setHistory((h) => [...h, snapshot].slice(-50));
    setFuture((f) => f.slice(1));
    setProject({ ...future[0], updatedAt: Date.now() });
    setSelectedId(null);
    setStatus('Redid last change');
  };

  const copySelected = () => {
    if (!selected) return;
    clipboardRef.current = JSON.parse(JSON.stringify(selected));
    setStatus('Copied');
  };

  const pasteCopied = () => {
    const copied = clipboardRef.current;
    const elements = projectRef.current.elements;
    if (!copied || elements.length >= MAX_ELEMENTS) return;
    if (copied.type === 'erase' && countBrushPoints(elements) + copied.points.length > MAX_BRUSH_POINTS) {
      setStatus('Project brush limit reached');
      return;
    }
    pushHistory();
    const clone = offsetElement(copied, 24);
    updateProject((p) => ({ ...p, elements: [...p.elements, clone] }));
    setSelectedId(clone.id);
    setTool('select');
    setStatus('Pasted copy');
  };

  useEffect(() => {
    const onKey = (e) => {
      if (
        !active ||
        showPlans ||
        e.defaultPrevented ||
        document.querySelector('[role=dialog]') ||
        busy ||
        exporting ||
        !hydrated ||
        svgRef.current?.closest('[hidden]')
      )
        return;
      const typing =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) ||
        document.activeElement?.isContentEditable;
      const unmodified = !e.ctrlKey && !e.metaKey && !e.altKey;
      if (viewOnly && !typing) {
        const modifier = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        if ((modifier && ['z', 'y', 's'].includes(key)) ||
            (selected && (['Delete', 'Backspace'].includes(e.key) || (unmodified && key === 'r') || (modifier && key === 'c')))) {
          e.preventDefault();
          requestEditing();
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !typing && selected) {
        e.preventDefault();
        copySelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && !typing && clipboardRef.current) {
        e.preventDefault();
        pasteCopied();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        e.preventDefault();
        deleteSelected();
      }
      if (
        e.key.toLowerCase() === 'r' &&
        unmodified &&
        !typing &&
        selected &&
        ['door', 'window', 'symbol'].includes(selected.type)
      ) {
        e.preventDefault();
        pushHistory();
        updateElement(selected.id, { rotation: ((selected.rotation || 0) + 90) % 360 });
        setStatus('Rotated 90°');
      }
      if (e.key === 'Escape') {
        resetPointerInput();
        setSelectedId(null);


        setProjectMenu(false);
      }
      if (!typing && unmodified) {
        const shortcuts = {
          v: 'select',
          h: 'pan',
          w: 'wall',
          l: 'line',
          t: 'text',
          e: 'erase',
        };
        if (shortcuts[e.key.toLowerCase()]) {
          e.preventDefault();
          changeTool(shortcuts[e.key.toLowerCase()]);
        }
      }
    };
    const onPaste = (event) => {
      if (!active || (!showPlans && !previewOnly) || !canCreateProject || busy || !hydrated || document.querySelector('[role=dialog]')) return;
      const clipboard = event.clipboardData;
      const file = Array.from(clipboard?.files ?? []).find((item) =>
        CLIPBOARD_IMAGES.has(item.type),
      );
      const item = file ? null : Array.from(clipboard?.items ?? []).find((entry) =>
        entry.kind === 'file' && CLIPBOARD_IMAGES.has(entry.type),
      );
      const image = file ?? item?.getAsFile();
      if (!image) return;
      event.preventDefault();
      const extension = CLIPBOARD_IMAGES.get(image.type) ?? CLIPBOARD_IMAGES.get(item?.type);
      void handleImport(new File([image], `Pasted blueprint.${extension}`, { type: image.type }));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  });

  const clientToWorld = (evt) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return clientToWorkspace(evt.clientX, evt.clientY, rect);
  };

  const beginWallMatch = () => {
    if (wallMatch) { cancelWallMatch(); return; }
    if (selected?.type !== 'wall') return;
    resetPointerInput();
    setWallMatch({ id: selected.id });
    setTool('select');
    setPhoneMode('view');
    setEditorPanel(null);
    setStatus('Tap an existing wall to match its color and thickness');
  };

  const matchWallAt = async (event, source) => {
    const target = wallMatch;
    const request = ++matchRequest.current;
    const current = projectRef.current;
    const point = clientToWorld(event);
    const samePage = captureRoute();
    if (!target) return;
    if (source?.id === target.id) {
      if (current.background && current.showBackground) source = null;
      else { setStatus('Choose a different wall to match'); return; }
    }
    try {
      let style;
      if (source?.type === 'wall') style = wallStyle(source);
      else {
        if (!current.background || !current.showBackground) throw new Error('Tap an existing wall or show the original drawing first.');
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('Could not read the original drawing.'));
          image.src = current.background;
        });
        const canvas = document.createElement('canvas');
        const rasterScale = 2;
        canvas.width = W * rasterScale; canvas.height = H * rasterScale;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Color matching is unavailable in this browser.');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        const ratio = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
        const width = image.naturalWidth * ratio, height = image.naturalHeight * ratio;
        context.globalAlpha = current.backgroundOpacity ?? 1;
        context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        context.globalAlpha = 1;
        context.save(); context.scale(rasterScale, rasterScale);
        context.fillStyle = '#fff'; context.strokeStyle = '#fff'; context.lineCap = 'round'; context.lineJoin = 'round';
        for (const edit of current.elements) {
          if (edit.type === 'clean') context.fillRect(edit.x, edit.y, edit.width, edit.height);
          if (edit.type !== 'erase') continue;
          context.lineWidth = edit.size || 36;
          context.beginPath();
          if (edit.points.length === 1) {
            context.arc(edit.points[0].x, edit.points[0].y, context.lineWidth / 2, 0, Math.PI * 2); context.fill();
          } else {
            edit.points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)); context.stroke();
          }
        }
        context.restore();
        const x = clamp(Math.round(point.x * rasterScale), 0, canvas.width - 1);
        const y = clamp(Math.round(point.y * rasterScale), 0, canvas.height - 1);
        const left = Math.max(0, x - 100), top = Math.max(0, y - 100);
        const pixels = context.getImageData(left, top, Math.min(201, canvas.width - left), Math.min(201, canvas.height - top));
        style = sampleWallStyle(pixels, x - left, y - top, rasterScale, current.unitsPerInch);
        if (!style) throw new Error('No wall found there. Zoom in and tap the middle of a wall.');
      }
      if (!samePage() || request !== matchRequest.current || projectRef.current.id !== current.id) return;
      commitElement(target.id, style);
      cancelWallMatch();
      setStatus(source ? 'Wall color and thickness matched' : style.thicknessInches
        ? 'Drawing color and visual thickness matched' : 'Drawing color matched · adjust width with the handle');
    } catch (error) {
      if (samePage() && request === matchRequest.current) setStatus(error.message || 'Could not match that wall.');
    }
  };

  const extendBrush = (drag, point) => {
    const from = drag.last || point;
    if (drag.last && dist(from, point) < 1.5) return;
    drag.last = point;
    const current = projectRef.current;
    const elements = current.elements.filter((el) => !brushHitsObject(el, from, point, drag.size / 2, current.unitsPerInch));
    let changed = elements.length !== current.elements.length;
    if (drag.maskId && drag.maxPoints > 0) {
      const index = elements.findIndex((el) => el.id === drag.maskId);
      if (index < 0 && elements.length < MAX_ELEMENTS) {
        const points = drag.maxPoints > 1 && from !== point ? [from, point] : [point];
        elements.push({ id: drag.maskId, type: 'erase', points, size: drag.size });
        changed = true;
      } else if (index >= 0 && elements[index].points.length < drag.maxPoints) {
        const stroke = elements[index];
        elements[index] = { ...stroke, points: [...stroke.points, point] };
        changed = true;
      }
    }
    if (changed) updateProject((p) => ({ ...p, elements }));
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0 || busy || exporting || !hydrated) return;
    e.preventDefault();
    svgRef.current.setPointerCapture(e.pointerId);
    if (doorMove) {
      wallTap.current = e.isPrimary === false ? null : { id: e.pointerId, x: e.clientX, y: e.clientY,
        elementId: e.target.closest?.('[data-element-id]')?.getAttribute('data-element-id') };
      return;
    }
    if (wallMatch) {
      if (e.isPrimary !== false) matchTap.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (useWallTaps) {
      wallTap.current = e.pointerType === 'touch' && e.isPrimary === false
        ? null
        : { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (tool !== 'pan' && e.isPrimary === false) return;
    if (tool === 'pan') {
      const start = { x: e.clientX, y: e.clientY };
      if (e.pointerType === 'touch') {
        const pointers = panPointers.current;
        if (pointers.size >= 2) return;
        pointers.set(e.pointerId, start);
        if (pointers.size === 2 && !pinch.current) {
          panSelection.current = null;
          const [[first, a], [second, b]] = pointers;
          const bounds = svgRef.current.getBoundingClientRect();
          pinch.current = {
            first,
            second,
            zoom,
            pan,
            distance: Math.max(1, dist(a, b)),
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            centerX: bounds.left + bounds.width / 2,
            centerY: bounds.top + bounds.height / 2,
          };
          dragRef.current = null;
        }
        if (pinch.current) return;
      }
      dragRef.current = { kind: 'pan', pointerId: e.pointerId, start, pan };
      return;
    }

    const raw = clientToWorld(e);
    if (!isProjectNumber(raw.x) || !isProjectNumber(raw.y)) return;
    if (tool === 'erase') {
      const before = projectRef.current;
      const maskId = before.background && before.showBackground ? uid() : null;
      const drag = {
        kind: 'erase', pointerId: e.pointerId, before, maskId, size: eraseSize, last: null,
        maxPoints: maskId ? Math.min(10000, MAX_BRUSH_POINTS - countBrushPoints(before.elements)) : 0,
      };
      dragRef.current = drag;
      setBrushPoint(raw);
      extendBrush(drag, raw);
      return;
    }
    const linePrecision = tool === 'line' && e.shiftKey;
    const point =
      linePrecision
        ? raw
        : snapPoint(raw, project.elements, { grid: !e.shiftKey, align: true, magnet: true });

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }

    if (['wall', 'line', 'rect'].includes(tool)) {
      if (tool === 'wall') {
        setDraft(startWall(point, project.elements));
      } else {
        setDraft({ type: tool, a: point, b: point });
      }
      return;
    }

    if (tool === 'clean') {
      setDraft({ type: 'clean', a: raw, b: raw });
      return;
    }

    const common = { x: point.x, y: point.y, rotation: 0 };
    if (tool.startsWith('door-')) {
      const wallSnap = nearestWallSnap(raw, project.elements, 38);
      const doorPlacement = wallSnap
        ? {
            x: wallSnap.point.x,
            y: wallSnap.point.y,
            rotation: wallSnap.rotation,
            attachedWallId: wallSnap.wall.id,
          }
        : common;
      addElement({
        type: 'door',
        ...doorPlacement,
        widthInches: 30,
        doorStyle: tool.replace('door-', ''),
      });
      setStatus(wallSnap ? 'Door snapped to wall' : 'Door placed');
    }
    if (tool === 'window') {
      const snap = nearestWallSnap(raw, project.elements, 38);
      addElement({
        type: 'window',
        ...(snap ? snapOpening({ type: 'window', widthInches: 30, rotation: snap.rotation }, snap, project.elements, project.unitsPerInch) : common),
        widthInches: 30,
        heightInches: 4.5,
      });
    }
    if (tool === 'text') addElement({ type: 'text', ...common, text: 'Room label', fontSize: 22 });
    if (tool === 'toilet')
      addElement({
        type: 'symbol',
        symbol: 'toilet',
        ...common,
        widthInches: 14,
        heightInches: 18,
      });
    if (tool === 'sink')
      addElement({ type: 'symbol', symbol: 'sink', ...common, widthInches: 18, heightInches: 12 });
    if (tool === 'shower')
      addElement({
        type: 'symbol',
        symbol: 'shower',
        ...common,
        widthInches: 24,
        heightInches: 24,
      });
    if (tool === 'tub')
      addElement({ type: 'symbol', symbol: 'tub', ...common, widthInches: 36, heightInches: 18 });
    if (tool === 'bed')
      addElement({ type: 'symbol', symbol: 'bed', ...common, widthInches: 36, heightInches: 50 });
    if (tool === 'wh')
      addElement({ type: 'symbol', symbol: 'wh', ...common, widthInches: 14, heightInches: 14 });
    if (tool === 'washerdryer')
      addElement({
        type: 'symbol',
        symbol: 'washerdryer',
        ...common,
        widthInches: 30,
        heightInches: 18,
      });
    if (tool === 'counter')
      addElement({
        type: 'symbol',
        symbol: 'counter',
        ...common,
        widthInches: 48,
        heightInches: 24,
      });
    const fixture = EXTRA_FIXTURES.find(item => item.id === tool);
    if (fixture) addElement({ type: 'symbol', symbol: tool, ...common, widthInches: fixture.width, heightInches: fixture.height });
    if (tool === 'stove')
      addElement({ type: 'symbol', symbol: 'stove', ...common, widthInches: 30, heightInches: 26 });
  };

  const handlePointerMove = (e) => {
    if (doorMove || useWallTaps) {
      const tap = wallTap.current;
      if (tap?.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) {
        wallTap.current = null;
      }
      return;
    }
    if (tool !== 'pan' && e.isPrimary === false) return;
    const drag = dragRef.current;
    if (tool === 'pan') {
      const pointers = panPointers.current;
      const gesture = pinch.current;
      if (pointers.has(e.pointerId)) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (gesture) {
        const a = pointers.get(gesture.first);
        const b = pointers.get(gesture.second);
        if (a && b) {
          const nextZoom = clamp(gesture.zoom * dist(a, b) / gesture.distance, 0.25, 5);
          const shift = 1 - nextZoom / gesture.zoom;
          setZoom(nextZoom);
          setPan({
            x: gesture.pan.x + (a.x + b.x) / 2 - gesture.x + shift * (gesture.x - gesture.centerX),
            y: gesture.pan.y + (a.y + b.y) / 2 - gesture.y + shift * (gesture.y - gesture.centerY),
          });
        }
      } else if (drag?.kind === 'pan' && drag.pointerId === e.pointerId) {
        setPan({
          x: drag.pan.x + e.clientX - drag.start.x,
          y: drag.pan.y + e.clientY - drag.start.y,
        });
      }
      return;
    }
    if (drag && drag.pointerId !== e.pointerId) return;
    if (tool === 'erase') {
      const point = clientToWorld(e);
      if (!isProjectNumber(point.x) || !isProjectNumber(point.y)) return;
      if (drag || e.pointerType !== 'touch') setBrushPoint(point);
      if (drag?.kind === 'erase') extendBrush(drag, point);
      return;
    }
    if (!draft && !drag) return;
    if (drag?.origin && drag.before === projectRef.current &&
        Math.hypot(e.clientX - drag.origin.x, e.clientY - drag.origin.y) < DRAG_SLOP) return;

    const raw = clientToWorld(e);
    if (!isProjectNumber(raw.x) || !isProjectNumber(raw.y)) return;
    const precisionWall = draft?.type === 'wall' && e.shiftKey;
    const precisionLine = draft?.type === 'line' && e.shiftKey;
    const drawingTarget = precisionLine ? raw : angleSnap(draft?.a || raw, raw);
    const angledPoint =
      draft?.type === 'wall'
        ? endWall(draft, raw, project.elements, precisionWall)
        : draft?.type === 'line'
          ? precisionLine
            ? raw
            : snapPoint(drawingTarget, project.elements, {
                grid: false,
                align: false,
                magnet: true,
                lineFrom: { a: draft.a, b: drawingTarget },
                lineTolerance: 3,
              })
          : snapPoint(drawingTarget, project.elements, {
              grid: !e.shiftKey,
              align: true,
              magnet: true,
            });
    const freePoint = snapPoint(raw, project.elements, {
      grid: !e.shiftKey,
      align: true,
      magnet: true,
    });
    if (draft && ['wall', 'line'].includes(draft.type)) setDraft((d) => ({ ...d, b: angledPoint }));
    if (draft?.type === 'rect') setDraft((d) => ({ ...d, b: freePoint }));
    if (draft?.type === 'wall') {
      setStatus(
        precisionWall
          ? `Free precision · release Shift to restore angle lock`
          : `Angle lock ON · hold Shift for free precision`,
      );
    }
    if (draft?.type === 'line') {
      setStatus(
        precisionLine
          ? `Free line · snapping bypassed while Shift is held`
          : `Line snap ON · hold Shift to bypass snapping`,
      );
    }
    if (draft?.type === 'clean') setDraft((d) => ({ ...d, b: raw }));

    if (viewOnly && drag?.kind === 'move') {
      dragRef.current = null;
      requestEditing();
      return;
    }
    if (drag?.kind === 'move') {
      const dx = raw.x - drag.start.x,
        dy = raw.y - drag.start.y;
      const base = drag.base;
      if (base.type === 'wall' || base.type === 'dimension' || base.type === 'line') {
        updateElement(base.id, {
          a: translatePoint(base.a, dx, dy),
          b: translatePoint(base.b, dx, dy),
        });
      } else if (base.type === 'erase') {
        updateElement(base.id, {
          points: base.points.map((p) => translatePoint(p, dx, dy)),
        });
      } else if (base.type === 'door' || base.type === 'window') {
        const target = translatePoint(base, dx, dy);
        const wallSnap = nearestWallSnap(target, project.elements, 30);
        updateElement(
          base.id,
          wallSnap
            ? snapOpening({ ...base, x: target.x, y: target.y }, wallSnap, project.elements, project.unitsPerInch, base)
            : { x: target.x, y: target.y, rotation: base.rotation || 0, attachedWallId: null },
        );
      } else {
        updateElement(base.id, translatePoint(base, dx, dy));
      }
    }
    if (drag?.kind === 'resize') {
      const base = drag.base;
      if (base.type === 'wall') {
        const point = drag.handle === 'thickness' ? raw : snapPoint(raw, project.elements.filter(el => el.id !== base.id), {
          grid: !e.shiftKey, align: true, magnet: true,
        });
        const patch = resizeWall(base, drag.handle, point, drag.start, project.unitsPerInch);
        updateElement(base.id, patch);
        setStatus(drag.handle === 'thickness' ? 'Wall thickness adjusted' : 'Wall endpoint moved');
      } else {
        const angle = (-(base.rotation || 0) * Math.PI) / 180;
        const dx = raw.x - (base.x || 0);
        const dy = raw.y - (base.y || 0);
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
        if (base.type === 'symbol') {
          updateElement(base.id, {
            widthInches: clamp((Math.abs(localX) * 2) / project.unitsPerInch, 1, MAX_PROJECT_NUMBER),
            heightInches: clamp((Math.abs(localY) * 2) / project.unitsPerInch, 1, MAX_PROJECT_NUMBER),
          });
        } else if (base.type === 'window') {
          updateElement(base.id, resizeWindow(base, drag.handle, raw, project.unitsPerInch, project.elements, drag.start));
        } else if (base.type === 'door') {
          updateElement(base.id, {
            widthInches: clamp(Math.abs(localX) / project.unitsPerInch, 1, MAX_PROJECT_NUMBER),
          });
        }
      }
    }
  };

  const cleanBackgroundRect = (rect) => {
    const current = projectRef.current;
    const elements = cleanElementsInRect(current.elements, rect, current.unitsPerInch);
    if (current.background && current.showBackground) elements.push({ id: uid(), type: 'clean', ...rect });
    if (elements.length > MAX_ELEMENTS) {
      setStatus('Project object limit reached');
      return;
    }
    if (elements.length === current.elements.length && elements.every((el, i) => el === current.elements[i])) return;
    pushHistory(current);
    updateProject((p) => ({ ...p, elements }));
    setSelectedId(null);
    setStatus('Area cleaned · Undo to restore');
  };

  const releasePanPointer = (pointerId) => {
    if (panSelection.current?.pointerId === pointerId) panSelection.current = null;
    const pointers = panPointers.current;
    const tracked = pointers.delete(pointerId);
    if (pinch.current && tracked) {
      pinch.current = null;
      const remaining = pointers.entries().next().value;
      dragRef.current = remaining
        ? { kind: 'pan', pointerId: remaining[0], start: remaining[1], pan }
        : null;
    } else if (dragRef.current?.pointerId === pointerId) dragRef.current = null;
  };

  const handlePointerUp = (e) => {
    if (svgRef.current?.hasPointerCapture(e.pointerId))
      svgRef.current.releasePointerCapture(e.pointerId);
    if (doorMove) {
      const tap = wallTap.current;
      wallTap.current = null;
      if (tap?.id !== e.pointerId || e.isPrimary === false || busy || exporting || viewOnly ||
          Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) return;
      const point = clientToWorld(e);
      if (![point.x, point.y].every(isProjectNumber) || point.x < 0 || point.x > W || point.y < 0 || point.y > H) return;
      const source = doorMove.step === 'start' && project.elements.find(el => el.id === tap.elementId && el.type === 'door');
      const snap = doorMove.step === 'place' && nearestWallSnap(point, project.elements, 12 / Math.max(displayScale, 0.01));
      updateDoorMove(markDoorway(doorMove, point, source, snap, project));
      return;
    }
    if (wallMatch) {
      const tap = matchTap.current;
      matchTap.current = null;
      if (tap?.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= TAP_SLOP)
        void matchWallAt(e, tap.source);
      return;
    }
    if (tool === 'pan') {
      const tap = panSelection.current;
      const selectOnTap = !pinch.current && panPointers.current.size <= 1 && tap?.pointerId === e.pointerId
        && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= TAP_SLOP;
      releasePanPointer(e.pointerId);
      if (selectOnTap) {
        setSelectedId(tap.id);
        setTool('select');
        setPhoneMode('view');
        setStatus(previewOnly ? 'Object selected' : 'Selected · drag the handles to resize, or open Properties');
      }
      return;
    }
    if (e.isPrimary === false) return;
    if (useWallTaps) {
      const tap = wallTap.current;
      if (!tap || tap.id !== e.pointerId) return;
      wallTap.current = null;
      if (busy || exporting ||
          Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) return;
      const point = clientToWorld(e);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          point.x < 0 || point.x > W || point.y < 0 || point.y > H) return;
      if (!awaitingWallEnd) {
        const start = snapPoint(point, project.elements, { grid: true, align: true, magnet: true });
        setDraft(startWall(start, project.elements, true));
      } else {
        const b = endWall(draft, point, project.elements, e.shiftKey);
        if (dist(draft.a, b) > 3) {
          setStatus('Wall added');
          addElement({ type: 'wall', a: draft.a, b });
          setDraft(null);
        }
      }
      return;
    }
    if (dragRef.current && dragRef.current.pointerId !== e.pointerId) return;
    if (draft?.type === 'wall' && dist(draft.a, draft.b) > 3) {
      setStatus('Wall added');
      addElement({ type: 'wall', a: draft.a, b: draft.b });
    }
    if (draft?.type === 'line' && dist(draft.a, draft.b) > 3)
      addElement({ type: 'line', a: draft.a, b: draft.b, strokeWidth: 2 });
    if (draft?.type === 'rect') {
      const x = Math.min(draft.a.x, draft.b.x),
        y = Math.min(draft.a.y, draft.b.y);
      const width = Math.abs(draft.a.x - draft.b.x),
        height = Math.abs(draft.a.y - draft.b.y);
      if (width > 3 && height > 3)
        addElement({ type: 'rect', x, y, width, height, strokeWidth: 2 });
    }
    if (draft?.type === 'clean') {
      const x = Math.min(draft.a.x, draft.b.x),
        y = Math.min(draft.a.y, draft.b.y);
      const width = Math.abs(draft.a.x - draft.b.x),
        height = Math.abs(draft.a.y - draft.b.y);
      if (width > 3 && height > 3) cleanBackgroundRect({ x, y, width, height });
    }
    setDraft(null);
    if (compact) setBrushPoint(null);
    finishDrag(true);
  };

  const handlePointerCancel = (e) => {
    if (tool === 'pan') {
      releasePanPointer(e.pointerId);
    } else if (doorMove || useWallTaps) {
      if (wallTap.current?.id === e.pointerId) wallTap.current = null;
    } else if (e.isPrimary !== false && (!dragRef.current || dragRef.current.pointerId === e.pointerId)) {
      resetPointerInput();
    }
  };

  const startMove = (e, el) => {
    if (el.type === 'wall') {
      const nearest = nearestWallSnap(clientToWorld(e), projectRef.current.elements, 18 / Math.max(displayScale, 0.01));
      if (nearest) el = nearest.wall;
    }
    if (compact && tool === 'pan' && e.pointerType === 'touch' && e.isPrimary !== false && !busy && !exporting) {
      panSelection.current = { id: el.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    }
    if (e.button !== 0 || e.isPrimary === false || tool !== 'select' || busy || exporting) return;
    svgRef.current.setPointerCapture(e.pointerId);
    e.stopPropagation();
    if (wallMatch) {
      matchTap.current = { id: e.pointerId, x: e.clientX, y: e.clientY, source: el.type === 'wall' ? el : null };
      return;
    }
    setSelectedId(el.id);
    dragRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      origin: { x: e.clientX, y: e.clientY },
      start: clientToWorld(e),
      base: el,
      before: projectRef.current,
    };
  };

  const startResize = (e, el, handle = 'corner') => {
    if (e.button !== 0 || e.isPrimary === false || tool !== 'select' || busy || exporting) return;
    svgRef.current.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    dragRef.current = {
      kind: 'resize',
      pointerId: e.pointerId,
      origin: { x: e.clientX, y: e.clientY },
      base: el,
      start: clientToWorld(e),
      before: projectRef.current,
      handle,
    };
  };

  async function handleImport(file) {
    if (!file || busy || importPending.current || !active || !hydrated) return;
    if (!showPlans && originalLocked) return;
    if (file.size > MAX_FILE_BYTES) {
      await ask({
        title: 'File is too large',
        message: 'Choose a PDF or image under 25 MB.',
        type: 'notice',
      });
      return;
    }
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      await ask({
        title: 'Unsupported file',
        message: 'Choose a PDF, PNG, JPG, or WebP file.',
        type: 'notice',
      });
      return;
    }
    const target = projectRef.current;
    const onSamePage = captureRoute();
    let pdfTask, pdf, objectUrl;
    importPending.current = true;
    setBusy(true);
    try {
      if (
        !viewOnly && !showPlans &&
        (target.background || target.elements.length) &&
        !(await ask({
          title: 'Replace the background?',
          message:
            'Your drawn objects stay in place. Undo restores the previous background.',
          type: 'confirm',
          confirmLabel: 'Import plan',
        }))
      )
        return;
      if (!onSamePage()) return;
      setStatus('Importing plan…');
      let dataUrl,
        pageNumber = 1;
      if (/\.pdf$/i.test(file.name)) {
        const [data, pdfjs] = await Promise.all([file.arrayBuffer(), import('pdfjs-dist')]);
        if (!onSamePage()) return;
        pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
        pdfTask = pdfjs.getDocument({ data, isEvalSupported: false });
        pdf = await pdfTask.promise;
        if (!onSamePage()) return;
        if (pdf.numPages > 1) {
          const choice = await ask({
            title: 'Choose a PDF page',
            message: `This PDF contains ${pdf.numPages} pages. Import one sheet at a time.`,
            label: 'Page number',
            type: 'number',
            min: 1,
            max: pdf.numPages,
            initialValue: '1',
            confirmLabel: 'Import page',
          });
          if (choice === null) return;
          pageNumber = Number(choice);
          if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages)
            throw new Error('Choose a page within the PDF.');
        }
        const page = await pdf.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(3200 / base.width, 2000 / base.height),
        });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        dataUrl = fitRasterToWorkspace(canvas);
      } else {
        objectUrl = URL.createObjectURL(file);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('This image could not be read.'));
          img.src = objectUrl;
        });
        if (img.naturalWidth * img.naturalHeight > 40000000)
          throw new Error('Choose an image smaller than 40 megapixels.');
        dataUrl = fitRasterToWorkspace(img);
      }
      if (!onSamePage() || projectRef.current.id !== target.id) return;
      const background = {
        background: dataUrl,
        showBackground: true,
        backgroundOpacity: 1,
      };
      if (previewOnly || showPlans) {
        const name = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 100) || 'Untitled plan';
        if (!(await openNewPlan({ ...emptyProject(name), ...background }))) return;
      } else {
        pushHistory();
        updateProject((p) => ({ ...p, ...background }));
      }
      setStatus(`Plan imported${pdf ? ` · page ${pageNumber}` : ''}`);
      changeTool(compact ? 'pan' : 'select');
    } catch (err) {
      if (!onSamePage()) return;
      setStatus('Import failed');
      await ask({
        title: 'Could not import this file',
        message:
          err?.name === 'PasswordException'
            ? 'This PDF is password-protected. Export an unlocked copy from your PDF viewer first.'
            : err?.message || 'Try a different PDF or image.',
        type: 'notice',
      });
    } finally {
      try {
        if (pdf) await pdf.destroy();
        else await pdfTask?.destroy();
      } catch {
        /* Release UI state even if the worker has already stopped. */
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      importPending.current = false;
      setBusy(false);
    }
  }

  async function pastePlan() {
    const onSamePage = captureRoute();
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(type => CLIPBOARD_IMAGES.has(type));
        if (type) {
          const image = await item.getType(type);
          if (onSamePage()) await handleImport(new File([image], `Pasted blueprint.${CLIPBOARD_IMAGES.get(type)}`, { type }));
          return;
        }
      }
      if (onSamePage()) await ask({ title: 'No plan image found', message: 'Copy a PNG, JPG or WebP image, then paste it here.', type: 'notice' });
    } catch {
      if (onSamePage()) await ask({ title: 'Paste your plan', message: 'Use your browser’s Paste command, or upload the PDF or image from your device.', type: 'notice' });
    }
  }

  const restoreProject = async (file) => {
    if (!file || busy || importPending.current || !active || !hydrated) return;
    const onSamePage = captureRoute();
    importPending.current = true;
    setBusy(true);
    try {
      if (file.size > MAX_FILE_BYTES * 1.5)
        throw new Error('Choose a project backup smaller than 37.5 MB.');
      const content = JSON.parse(await file.text());
      if (!onSamePage()) return;
      if (content.format !== 'blueprint-studio-project' || content.version !== 1)
        throw new Error('Choose a project .json backup.');
      const restored = validateProject(content.project);
      if (!(await openNewPlan({
        ...restored, id: uid(), name: restored.name.slice(0, 89) + ' (restored)', updatedAt: Date.now(),
      }))) return;
      setStatus('Backup restored as a new project');
    } catch (err) {
      if (onSamePage()) {
        await ask({ title: 'Could not restore project', message: err.message, type: 'notice' });
      }
    } finally {
      importPending.current = false;
      setBusy(false);
    }
  };
  const checkDownload = async () => {
    if (canDownload && !(await canDownload(accountIdRef.current))) {
      throw new Error('Unlock a clean download with a $9 project credit or $19/month access. Your work is saved in this browser.');
    }
  };
  async function openExport() {
    if (busy || exporting || !hydrated || exportCheck.current) return;
    exportCheck.current = true;
    const onSamePage = captureRoute();
    const exportPlan = projectRef.current;
    setTour(null);
    try {
      if (freeEditing && canDownload && !(await canDownload(accountIdRef.current))) {
        if (!onSamePage() || projectRef.current !== exportPlan) return;
        const plan = exportPlan;
        if (!accountIdRef.current && paidProjectAccess?.credits > 0 && plan.background) {
          const saved = await cloud.saveNew(plan);
          if (!saved) throw new Error('Could not unlock this project. Your local draft is saved. Try again.');
          void paidProjectAccess.refresh();
          if (!onSamePage() || projectRef.current !== exportPlan) return;
          selectProject(saved.project, saved.id);
          await checkDownload();
        } else {
          requestEditing();
          return;
        }
      }
      if (viewOnly) { requestEditing(); return; }
      if (onSamePage()) setExportMenu(true);
    } catch (error) {
      if (onSamePage()) setAccountNotice(error.message || 'Could not check download access. Try again.');
    } finally { exportCheck.current = false; }
  }
  const backupProject = async () => {
    const onSamePage = captureRoute();
    const saved = projectRef.current;
    try {
      if (canDownload) await checkDownload();
    } catch (err) {
      if (onSamePage()) await ask({ title: 'Backup unavailable', message: err.message, type: 'notice' });
      return;
    }
    if (!onSamePage() || projectRef.current.id !== saved.id) return;
    downloadBlob(
      new Blob(
        [
          JSON.stringify({
            format: 'blueprint-studio-project',
            version: 1,
            project: saved,
          }),
        ],
        { type: 'application/json' },
      ),
      `${saved.name.replace(/[^a-z0-9]+/gi, '-')}.blueprint.json`,
    );
    setStatus('Project backup downloaded');
  };
  const openLockedImport = () => {
    setEditorPanel(null);
    setImportOpen(true);
    setImportError('');
  };

  const importEditableCode = () => {
    try {
      if (importCode.length > 2000000) throw new Error('Keep editable JSON under 2 MB.');
      const parsed = JSON.parse(stripCodeFences(importCode));
      if (!Array.isArray(parsed.elements) || parsed.elements.length > MAX_ELEMENTS)
        throw new Error('JSON needs an elements array with at most 5,000 objects.');
      const normalized = normalizeBlueprintImport(parsed, project);
      if (normalized.elements.length + (importReplace ? 0 : project.elements.length) > MAX_ELEMENTS)
        throw new Error('This import would exceed 5,000 objects.');
      // The drawing factor belongs to the existing project. Appending a trace must
      // keep its existing wall widths, symbols and historical dimension labels intact.
      const unitsPerInch = importReplace ? normalized.unitsPerInch : project.unitsPerInch;
      const ratio = normalized.unitsPerInch / unitsPerInch;
      const imported = ratio === 1 ? normalized.elements : normalized.elements.map(element => {
        const placed = { ...element };
        for (const key of ['thicknessInches', 'widthInches', 'heightInches']) {
          if (placed[key] !== undefined) placed[key] *= ratio;
        }
        return placed;
      });
      const next = {
        ...project,
        name: String(normalized.name || '').trim() || project.name,
        calibrated: importReplace ? false : project.calibrated,
        unitsPerInch,
        elements: importReplace ? imported : [...project.elements, ...imported],
      };
      validateProject(next);
      pushHistory();
      updateProject(() => next);
      setSelectedId(null);
      setImportOpen(false);
      setImportError('');
      setImportCode('');
      setStatus(`Imported ${normalized.elements.length} editable objects`);
    } catch (err) {
      console.error(err);
      setImportError(err?.message || 'Could not read that project JSON.');
    }
  };

  const copyChatGPTPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CHATGPT_BLUEPRINT_PROMPT);
      setStatus('ChatGPT import prompt copied');
    } catch {
      setImportError('Could not copy automatically.');
    }
  };

  const exportRaster = async (kind = 'png') => {
    if (exporting || busy) return;
    const onSamePage = captureRoute();
    let svgUrl = null;
    try {
      const layout = kind === 'pdf' ? pdfLayout({ paper }) : null;
      setExporting(true);
      setStatus(kind === 'pdf' ? 'Preparing PDF…' : 'Preparing PNG…');

      // Wait for React to hide selection handles and unfinished edits before rendering.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!onSamePage()) return;

      const svg = svgRef.current;
      if (!svg) throw new Error('Blueprint canvas is not available.');

      const clone = svg.cloneNode(true);
      // XMLSerializer emits the SVG namespace from the namespaced DOM node.
      clone.setAttribute('width', String(W * 2));
      clone.setAttribute('height', String(H * 2));
      clone.setAttribute('viewBox', `0 0 ${W} ${H}`);
      clone.querySelectorAll('[data-editor-only]').forEach((node) => node.remove());
      await embedExportFont(clone);

      // Event handlers are React-only and are not serialized, but these attributes
      // make the exported SVG self-contained and predictable across browsers.
      const serialized = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
      svgUrl = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.decoding = 'async';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Could not render the blueprint for export.'));
        img.src = svgUrl;
      });

      const exportWidth = 3200;
      const exportHeight = Math.round((exportWidth * H) / W);
      const canvas = document.createElement('canvas');
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create an export canvas.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, exportWidth, exportHeight);
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

      const safeName =
        project.name
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-+|-+$/g, '')
          .toLowerCase() || 'blueprint';

      let output;
      if (kind === 'pdf') {
        const png = canvas.toDataURL('image/png', 1);
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'in',
          format: [layout.pageWidth, layout.pageHeight],
          compress: true,
        });
        pdf.addImage(
          png,
          'PNG',
          layout.x,
          layout.y,
          layout.width,
          layout.height,
          undefined,
          'FAST',
        );
        pdf.setFontSize(8);
        pdf.setTextColor(90);
        pdf.text(
          'Reference drawing - fit to page, not to scale',
          0.5,
          layout.pageHeight - 0.2,
        );
        output = pdf.output('blob');
      } else {
        output = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Could not create PNG file.'))),
            'image/png',
            1,
          );
        });
      }
      await checkDownload();
      if (!onSamePage() || projectRef.current.id !== project.id) return;
      downloadBlob(output, `${safeName}.${kind}`);
      setStatus(`${kind.toUpperCase()} exported`);
    } catch (err) {
      console.error('Export failed', err);
      setStatus('Export failed');
      if (onSamePage()) {
        await ask({
          title: 'Export needs attention',
          message: err?.message || 'Try again or download a project backup.',
          type: 'notice',
        });
      }
    } finally {
      if (svgUrl) URL.revokeObjectURL(svgUrl);
      setExporting(false);
    }
  };

  const createProject = async () => {
    if (!canCreateProject) return;
    const suggested = `Project ${Math.max(1, projects.length + 1)}`;
    const name = await ask({
      title: 'New project',
      label: 'Project name',
      initialValue: suggested,
      confirmLabel: 'Create project',
    });
    if (name === null) return;
    const cleanName = name.trim().slice(0, 100) || suggested;
    await openNewPlan(emptyProject(cleanName));
  };

  const renameProject = async (target = project) => {
    const nextName = await ask({
      title: 'Rename project',
      label: 'Project name',
      initialValue: target.name,
      confirmLabel: 'Save name',
    });
    if (nextName === null || !nextName.trim()) return;
    const cleanName = nextName.trim().slice(0, 100);
    if (target === projectRef.current) updateProject((p) => ({ ...p, name: cleanName }));
  };

  const chooseProject = (p, addToRecent = true, savedId = null) => {
    resetPointerInput();
    if (addToRecent) addLocalProject(p);
    else selectProject(p, savedId);
    setAccountNotice('');
    setSelectedId(null);
    setHistory([]);
    setFuture([]);
    setProjectMenu(false);
    setExportMenu(false);
    setImportOpen(false);
    setGuideMode(null);
    setTour(null);

    setTool(compact ? 'pan' : 'select');
    setPhoneMode('view');
    setEditorPanel(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const openNewPlan = async (plan, navigate = onOpenWorkspace, existingDeviceDraft = false) => {
    if (previewOnly) {
      chooseProject(plan, freeEditing);
      onPreviewPlanChange?.(plan);
      navigate?.();
      return true;
    }
    if (!projectAccess) {
      chooseProject(plan, !existingDeviceDraft);
      navigate?.();
      return true;
    }
    if (!canCreateProject || accountOperation.current) {
      setAccountNotice('This plan needs a project credit. Open Billing to add one.');
      return false;
    }
    if (!plan.background) {
      await ask({
        title: 'Upload an original blueprint',
        message: 'A project credit is linked to the PDF or image you start with.',
        type: 'notice',
      });
      return false;
    }
    const onSamePage = captureRoute();
    accountOperation.current = true;
    setBusy(true);
    try {
      const saved = await cloud.saveNew(plan);
      if (!saved) throw new Error('Could not save the new account project.');
      void projectAccess.refresh();
      if (!onSamePage()) return false;
      // The cloud save owns the credit. Keep the device draft until that save succeeds.
      if (existingDeviceDraft) setProjects((list) => list.filter((item) => item.id !== plan.id));
      chooseProject(saved.project, false, saved.id);
      navigate?.();
      return true;
    } catch {
      if (onSamePage()) setAccountNotice('Could not create this project. Check your available credits and try again.');
      void projectAccess.refresh();
      return false;
    } finally {
      accountOperation.current = false;
      setBusy(false);
    }
  };
  const loadSample = async (navigate = onOpenWorkspace) => {
    if (await openNewPlan(sampleProject(uid()), navigate)) {
      if (freeEditing) { setGuideMode(null); setPhoneMode('edit'); setTour(tourBaseline(projectRef.current));
        try { localStorage.setItem('editfloorplans-sample-guide:' + (owner || 'guest'), 'seen'); } catch {} }
    }
  };
  const checkedSampleIntro = useRef(false);
  useEffect(() => {
    if (!freeEditing || !active || !hydrated || busy || sampleRequested || checkedSampleIntro.current) return;
    if (showPlans && repository && cloud.listStatus !== 'ready') return;
    checkedSampleIntro.current = true;
    try { if (localStorage.getItem('editfloorplans-sample-guide:' + (owner || 'guest'))) return; } catch {}
    if (project.background || project.elements.length || projects.some(plan => plan.background || plan.elements.length) || cloud.list?.length) return;
    void loadSample();
  }, [freeEditing, active, hydrated, busy, sampleRequested, cloud.listStatus]);
  useEffect(() => {
    if (!tour) return;
    if (tour.step === 5 || tour.step === 7) setEditorPanel('tools');
  }, [tour?.step]);
  useEffect(() => {
    if (hydrated && sampleRequested && window.location.hash === '#/editor/sample') {
      if (canCreateProject) void loadSample(onSampleOpened);
    }
  }, [hydrated, sampleRequested]);

  useEffect(() => {
    if (previewOnly && previewPlan && previewPlan.id !== projectRef.current.id) {
      chooseProject(previewPlan, false);
    }
  }, [previewOnly, previewPlan]);

  // The same tab can carry a preview through sign-in and trial activation.
  // Credit-based projects require an explicit purchase decision on Recent plans.
  useEffect(() => {
    if (!previewOnly && active && hydrated && previewPlan && !singleProject) {
      chooseProject(previewPlan);
      onPreviewPlanOpened?.();
      onOpenWorkspace?.();
    }
  }, [previewOnly, active, hydrated, previewPlan, singleProject]);

  const deleteProject = async (id) => {
    if (
      !(await ask({
        title: 'Delete this project?',
        detail: projects.find(item => item.id === id)?.name || 'Untitled project',
        message:
          'This removes the saved draft from this browser. Download a backup first if you want to keep a copy.',
        type: 'confirm',
        confirmLabel: 'Delete project',
        danger: true,
      }))
    )
      return;
    const next = projects.filter((p) => p.id !== id);
    setProjects(next);
    if (!accountIdRef.current && projectRef.current.id === id)
      chooseProject(next[0] || emptyProject('Untitled project'), false);
  };

  const openAccountPlan = async (id) => {
    if (accountOperation.current || busy || (projectAccess && !projectAccess.ids.includes(id))) return;
    accountOperation.current = true;
    const onSamePage = captureRoute();
    setAccountNotice('');
    setBusy(true);
    try {
      const saved = await cloud.open(id);
      if (!onSamePage()) return;
      chooseProject(saved, false, id);
      onOpenWorkspace?.();
    } catch {
      if (onSamePage()) setAccountNotice('Could not open this plan. Try again.');
    } finally {
      accountOperation.current = false;
      setBusy(false);
    }
  };

  const saveAccountCopy = async () => {
    if (!accountId || accountOperation.current || busy || !canCreateProject) return;
    const local = projectRef.current;
    const onSamePage = captureRoute();
    accountOperation.current = true;
    setBusy(true);
    setAccountNotice('');
    try {
      const saved = await cloud.saveNew(local, accountId);
      if (!saved) throw new Error('Account save failed');
      if (!onSamePage() || projectRef.current.id !== local.id) return;
      const latest = projectRef.current;
      const next = latest === local ? saved.project : { ...latest, name: saved.project.name };
      selectProject(next, saved.id);
      if (projectAccess) void projectAccess.refresh();
      if (next !== saved.project) cloud.edit(saved.id, next);
      cloud.dropDraft(accountId);
    } catch {
      if (onSamePage()) setAccountNotice('Could not save to your account. Try again.');
    } finally {
      accountOperation.current = false;
      setBusy(false);
    }
  };

  const removeAccountPlan = async () => {
    setProjectMenu(false);
    if (accountOperation.current || !(await ask({
      title: 'Delete this account plan?',
      message: projectAccess
        ? 'This removes the plan from every device. Its project credit stays used.'
        : 'This removes the plan from your account on every device.',
      type: 'confirm',
      confirmLabel: 'Delete plan',
      danger: true,
    }))) return;
    const id = accountIdRef.current;
    if (!id || id !== accountId) return;
    const onSamePage = captureRoute();
    accountOperation.current = true;
    setBusy(true);
    setAccountNotice('');
    try {
      await cloud.remove(id);
      if (projectAccess) void projectAccess.refresh();
      if (accountIdRef.current === id) chooseProject(projects[0] || emptyProject('Untitled project'), false);
      if (onSamePage()) window.location.hash = '#/editor';
    } catch {
      if (onSamePage()) setAccountNotice('Could not finish deleting this plan. Try again.');
    } finally {
      accountOperation.current = false;
      setBusy(false);
    }
  };

  const toolPalette = (
    <>
      <Section title="View">
        <ToolChoices choices={VIEW_TOOLS} tool={tool} setTool={changeTool} />
      </Section>
      <Section title="Edit">
        <ToolButton tool={tool} id="wall" setTool={changeTool} label="Wall" />
        <button className={`tool${tool.startsWith('door-') ? ' active' : ''}`}
          aria-haspopup="dialog" onClick={() => openToolPanel('doors')}>
          <Icon name="door" size={17} /> Door
        </button>
        <button className={`tool${['clean', 'erase'].includes(tool) ? ' active' : ''}`}
          aria-haspopup="dialog" onClick={() => openToolPanel('cleanup')}>
          <Icon name="clean" size={17} /> Clean up
        </button>
        <ToolButton tool={tool} id="text" setTool={changeTool} label="Text" />
      </Section>
      <div className="paletteActions">
        <button className="tool" aria-haspopup="dialog" onClick={() => openToolPanel('tools')}>
          <Icon name="more" size={17} /> More tools
        </button>
        <button className="tool" aria-haspopup="dialog" onClick={() => openToolPanel('settings')}>
          <Icon name="settings" size={17} /> Plan settings
        </button>
      </div>
    </>
  );

  const objectProperties = selected && viewOnly ? (
    <div className="propStack">
      <div className="badge">{selected.type.toUpperCase()}</div>
      <button className="wide" onClick={requestEditing}>{owner ? 'Unlock editing' : 'Sign up to edit'}</button>
    </div>
  ) : selected ? (
    <Properties
      key={selected.id}
      selected={selected}
      drawingUnits={project.unitsPerInch}
      updateElement={commitElement}
      deleteSelected={deleteSelected}
      onMatchWall={beginWallMatch}
      matching={Boolean(wallMatch)}
    />
  ) : <p className="propertiesHint">Use Select, then click an object on the plan.</p>;

  const planSettings = (
    <>
      {project.background && (
        <div className="backgroundSettings">
          <label className="field">
            <span>Background opacity</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={project.backgroundOpacity}
              onChange={(e) =>
                updateProject((p) => ({ ...p, backgroundOpacity: Number(e.target.value) }))
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={project.showBackground}
              onChange={(e) => {
                pushHistory();
                updateProject((p) => ({ ...p, showBackground: e.target.checked }));
              }}
            />{' '}
            Show imported blueprint
          </label>
        </div>
      )}
      <details className="projectUtilities">
        <summary>Project actions</summary>
        <div className="projectUtilityButtons">
          <button className="wide" onClick={backupProject}>
            <Icon name="download" /> Download backup
          </button>
          <button className="wide subtle" onClick={openLockedImport}>
            Advanced JSON import
          </button>
          <button className="wide danger" onClick={clearAll}>
            {originalLocked ? 'Clear edits' : 'Clear drawing'}
          </button>
          <p className="hint">Download a backup before clearing browser data.</p>
        </div>
      </details>
    </>
  );

  let toolHint = TOOL_HINTS[tool];
  if (compact && tool === 'pan') toolHint = 'Drag to move. Pinch to zoom. Tap an object to edit.';
  if (viewOnly) toolHint = tool === 'pan' ? 'Drag to pan. Pinch to zoom.' : 'Tap or click an object to select it.';
  if (useWallTaps) {
    toolHint = awaitingWallEnd ? 'Tap the other endpoint.' : 'Tap the first endpoint.';
  } else if (!toolHint) {
    toolHint = tool.startsWith('door-')
      ? 'Choose a spot on the plan for the door.'
      : 'Choose a spot on the plan for the fixture.';
  }

  if (wallMatch) toolHint = 'Tap an existing wall to match its color and width.';
  if (doorMove) toolHint = 'Move a doorway';

  const fileInputs = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void handleImport(file);
        }}
      />
      <input
        ref={backupRef}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void restoreProject(file);
        }}
      />
    </>
  );

  const desktopTip = showDesktopTip && !tour && !dialog && !guideMode && !importOpen && !editorPanel && !exportMenu && (
      <Modal title="Best on desktop" className="mobileEditorTip" onClose={() => dismissDesktopTip(false)}>
        <div className="mobileTipBody">
          <span className="mobileTipIcon"><Icon name="desktop" size={28} /></span>
          <p>A bigger screen gives you more room for precise edits. On your phone, pinch to zoom and tap an object to adjust it.</p>
        </div>
        <div className="modalActions">
          <button onClick={() => dismissDesktopTip(true)}>Don’t show again</button>
          <button className="primary" data-dialog-focus onClick={() => dismissDesktopTip(false)}>Continue on phone</button>
        </div>
      </Modal>
    );

  if (showPlans) {
    return (
      <>
        {tour && active && <EditorTour step={tour.step} tool={tool} project={project} compact={compact} baseline={tour}
        onStep={step => setTour(current => current ? { ...current, step } : null)} onClose={() => { setTour(null); setEditorPanel(null); }}
        onEditLabel={(id,text) => updateElement(id,{text})}
        onOpenPlan={() => { setTour(null); setEditorPanel(null); fileRef.current?.click(); }} />}
      {fileInputs}
        <RecentPlans
          projects={projects}
          canCreate={canCreateProject}
          singleProject={singleProject}
          hydrated={hydrated}
          busy={busy}
          saveStatus={saveStatus}
          onUpload={() => fileRef.current?.click()}
          onSelect={(plan) => openNewPlan(plan, onOpenWorkspace, true)}
          preview={previewPlan?.background && projectAccess ? {
            name: previewPlan.name,
            onOpen: async () => {
              if (await openNewPlan(previewPlan)) onPreviewPlanOpened?.();
            },
          } : null}
          account={repository ? {
            plans: projectAccess ? cloud.list.filter((plan) => projectAccess.ids.includes(plan.id)) : cloud.list,
            status: cloud.listStatus, notice: accountNotice,
            onRefresh: cloud.refresh, onSelect: openAccountPlan,
          } : null}
        />
        {dialog}
        {desktopTip}
      </>
    );
  }

  const savedStatus = !accountDraft ? saveStatus
    : accountDraft.writing ? 'Saving to your account…'
    : accountDraft.error ? accountDraft.error.message
    : accountDraft.project !== accountDraft.saved ? 'Unsaved changes' : 'Saved to your account';
  const conflict = accountDraft?.error?.name === 'ProjectConflict';
  const saveAction = accountDraft?.error
    ? { label: conflict ? 'Save a copy' : 'Retry save', onClick: () => {
      if (conflict) void saveAccountCopy();
      else void cloud.restart(accountId);
    } }
    : null;

  return (
    <div className={`app${compact ? ' compactEditor' : ''}`}>
      <div className="topbar" role="group" aria-label="Project controls">
        <a className="recentBack" href={previewOnly ? '/#/' : '#/editor'}
          aria-label={previewOnly ? 'Back to home' : 'Back to plans'} title={previewOnly ? 'Back to home' : 'Back to plans'}>
          <Icon name="back" /> <span>{previewOnly ? 'Back to home' : 'Back to plans'}</span>
        </a>
        <div className="projectTitleWrap">
          <button
            className="projectButton"
            disabled={busy || !hydrated}
            onClick={() => setProjectMenu((v) => !v)}
            aria-expanded={projectMenu}
          >
            <span>{project.name}</span>
            <Icon name="chevron" size={15} />
          </button>
          <div className="accountSaveRow">
            <span className={`saveStatus${accountDraft?.error || /failed|unavailable/.test(saveStatus) ? ' saveWarning' : ''}`} role="status">
              {conflict ? 'Newer changes on another device' : accountDraft?.error ? 'Account save failed' : savedStatus}
            </span>
            {saveAction && (
              <button className="accountSaveButton" disabled={busy || authBusy || !hydrated || (conflict && !canCreateProject)}
                onClick={saveAction.onClick}>
                {saveAction.label}
              </button>
            )}
          </div>
          {accountNotice && <span className="saveStatus saveWarning" role="alert">{accountNotice}</span>}
          {projectMenu && (
            <>
              <button
                className="menuDismiss"
                aria-label="Close project menu"
                onClick={() => setProjectMenu(false)}
              />
              <div className="projectMenu">
                {!previewOnly && (projectAccess
                  ? <a className="button" href="#/editor"><Icon name="plus" /> Start another project</a>
                  : <button onClick={createProject}><Icon name="plus" /> New project</button>)}
                {!previewOnly && <button onClick={() => renameProject(project)}>
                  <Icon name="text" /> Rename current project
                </button>}
                {accountId && (
                  <button className="danger" onClick={removeAccountPlan}>
                    <Icon name="trash" /> Delete account plan
                  </button>
                )}
                {!projectAccess && <button onClick={() => loadSample()}><Icon name="file" /> Open sample project</button>}
                {!originalLocked && (
                  <button aria-label="Import plan" onClick={() => { setProjectMenu(false); fileRef.current?.click(); }}>
                    <Icon name="upload" /> {project.background ? 'Replace blueprint' : 'Upload a plan'}
                  </button>
                )}
                {!previewOnly && <button disabled={!canCreateProject} onClick={() => { setProjectMenu(false); backupRef.current?.click(); }}>
                  <Icon name="folder" /> Import saved backup
                </button>}
                {!previewOnly && compact && (
                  <button disabled={!future.length} onClick={() => { redo(); setProjectMenu(false); }}>
                    <Icon name="redo" /> Redo
                  </button>
                )}
                {!previewOnly && <div className="projectMenuDivider" />}
                {!projectAccess && projects.map((p) => (
                  <div className="projectRow" key={p.id}>
                    <button onClick={() => chooseProject(p, false)}>{p.name}</button>
                    <button
                      className="dangerMini"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => deleteProject(p.id)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="headerActions">
          <button
            className="iconButton"
            title="Undo (Ctrl/Cmd+Z)"
            aria-label="Undo"
            onClick={undo}
            disabled={!history.length || busy}
          >
            <Icon name="undo" />
          </button>
          {!compact && (
            <button
              className="iconButton"
              title="Redo (Ctrl/Cmd+Shift+Z)"
              aria-label="Redo"
              onClick={redo}
              disabled={!future.length || busy}
            >
              <Icon name="redo" />
            </button>
          )}
          <button
            className="iconButton editorGuideButton"
            aria-label={guideMode === 'practice' ? 'Resume walkthrough' : 'Editor guide'}
            title={guideMode === 'practice' ? 'Resume walkthrough' : 'Editor guide'}
            onClick={() => {
              if (guideMode !== 'practice') setWalkthroughStep(0);
              if (freeEditing && project.elements.length) { setGuideMode(null); setPhoneMode('edit'); setTour(tourBaseline(project)); }
              else setGuideMode('walkthrough');
            }}
          >
            <Icon name="help" /> <span>{guideMode === 'practice' ? 'Resume guide' : 'Guide'}</span>
          </button>
          <button
            aria-label="Export"
            className="primary"
            disabled={exporting || busy || !hydrated || !!doorMove}
            onClick={openExport}
            data-tour="export"
          >
            <Icon name="download" />
            <span>{exporting ? 'Exporting…' : 'Export'}</span>
          </button>
        </div>
      </div>
      {tour && active && <EditorTour step={tour.step} tool={tool} project={project} compact={compact} baseline={tour}
        onStep={step => setTour(current => current ? { ...current, step } : null)} onClose={() => { setTour(null); setEditorPanel(null); }}
        onEditLabel={(id,text) => updateElement(id,{text})}
        onOpenPlan={() => { setTour(null); setEditorPanel(null); fileRef.current?.click(); }} />}
      {fileInputs}
      <div className="workspace">
        {!compact && <aside className="sidebar leftbar" aria-label="Drawing tools">{toolPalette}</aside>}

        <main className="canvasArea" aria-label="Drawing workspace">
          {!compact && <div className="canvasCaption">
            <span key={tool} className="currentToolHint">{toolHint}</span>
          </div>}
          {!originalLocked && !project.background && !project.elements.length && !busy && ['select', 'pan'].includes(tool) && (
            <div className="canvasWelcome">
              <span className="uploadWelcomeIcon"><Icon name="upload" size={30} /></span><h2>Upload or paste your floor plan</h2>
              {previewOnly && <p className="hint">Bring your existing plan. Make it your own.</p>}
              <div className="canvasImportActions">
                <button className="primary" disabled={!hydrated} onClick={() => fileRef.current?.click()}>
                  Upload
                </button>
                {(previewOnly || freeEditing) && (
                  <button type="button" disabled={!hydrated} onClick={() => loadSample()}>
                    Try a sample plan
                  </button>
                )}
                {previewOnly && navigator.clipboard?.read && (
                  <button disabled={!hydrated} onClick={pastePlan}>Paste image</button>
                )}
              </div>
            </div>
          )}
          {busy && (
            <div className="canvasBusy" role="status">
              Opening your plan…
            </div>
          )}
          <div
            className="canvasChrome"
            style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}
          >
            <svg
              data-tour="canvas"
              key={project.id}
              ref={svgRef}
              className="planCanvas"
              style={{ fontFamily: 'Inter, Arial, sans-serif' }}
              viewBox={`0 0 ${W} ${H}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onPointerLeave={() => setBrushPoint(null)}
            >
              <defs>
                <pattern id="smallGrid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                  <path
                    d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
                    fill="none"
                    stroke="#f2ece3"
                    strokeWidth="1"
                  />
                </pattern>
                <pattern id="grid" width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
                  <rect width={GRID * 5} height={GRID * 5} fill="url(#smallGrid)" />
                  <path
                    d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`}
                    fill="none"
                    stroke="#dfd9cc"
                    strokeWidth="1.5"
                  />
                </pattern>
                {backgroundEdits.length > 0 && (
                  <mask id="blueprintBackgroundMask" x={0} y={0} width={W} height={H} maskUnits="userSpaceOnUse">
                    <rect width={W} height={H} fill="white" />
                    {backgroundEdits.map((el) => <BackgroundEdit key={el.id} el={el} />)}
                  </mask>
                )}
              </defs>
              <rect width={W} height={H} fill="#fff" />
              {showGrid && !exporting && (
                <rect data-editor-only width={W} height={H} fill="url(#grid)" />
              )}
              {project.background && project.showBackground && (
                <image
                  href={project.background}
                  x="0"
                  y="0"
                  width={W}
                  height={H}
                  preserveAspectRatio="xMidYMid meet"
                  opacity={project.backgroundOpacity}
                  mask={backgroundEdits.length ? 'url(#blueprintBackgroundMask)' : undefined}
                />
              )}
              {drawnElements
                .filter((e) => ['wall', 'line', 'rect', 'dimension', 'ellipse'].includes(e.type))
                .map((el) => (
                  <Element
                    key={el.id}
                    el={el}
                    project={project}
                    selected={!exporting && selectedId === el.id}
                    onDown={startMove}
                    onResizeDown={startResize}
                    displayScale={displayScale}
                  />
                ))}
              {drawnElements
                .filter((e) => ['door', 'window'].includes(e.type))
                .map((el) => (
                  <Element
                    key={el.id}
                    el={el}
                    project={project}
                    selected={!exporting && selectedId === el.id}
                    onDown={startMove}
                    onResizeDown={startResize}
                    displayScale={displayScale}
                  />
                ))}
              {drawnElements
                .filter((e) => e.type === 'symbol')
                .map((el) => (
                  <Element
                    key={el.id}
                    el={el}
                    project={project}
                    selected={!exporting && selectedId === el.id}
                    onDown={startMove}
                    onResizeDown={startResize}
                    displayScale={displayScale}
                  />
                ))}
              {drawnElements
                .filter((e) => e.type === 'text')
                .map((el) => (
                  <Element
                    key={el.id}
                    el={el}
                    project={project}
                    selected={!exporting && selectedId === el.id}
                    onDown={startMove}
                    onResizeDown={startResize}
                    displayScale={displayScale}
                  />
                ))}
              {!viewOnly && !exporting && selected && tool === 'select' && !wallMatch && (
                <SelectionHandles el={selected} project={project} onResizeDown={startResize}
                  displayScale={displayScale} onOpenProperties={() => setEditorPanel('properties')} />
              )}
              {!exporting && doorMove && <DoorwayMarks move={doorMove} />}
              {!exporting && draft && <Draft draft={draft} project={project} zoom={zoom} wallAppearance={wallDefaults.current} />}
              {!exporting && tool === 'erase' && brushPoint && (
                <circle data-editor-only pointerEvents="none" cx={brushPoint.x} cy={brushPoint.y} r={eraseSize / 2}
                  fill="none" stroke={DRAWING_ACCENT} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              )}
              {tour && !exporting && <TourMarks step={tour.step} />}
            </svg>
          </div>
          <div className="zoomBox">
            <button aria-label="Zoom out" disabled={zoom <= 0.25} onClick={() => setZoom((z) => clamp(z - 0.1, 0.25, 5))}>
              <Icon name="minus" size={16} />
            </button>
            <select aria-label="Zoom level" value={Math.round(zoom * 100)} onChange={event => setZoom(clamp(Number(event.target.value) / 100, 0.25, 5))}>
              {[...new Set([25, 50, 75, 100, 150, 200, 300, 400, 500, Math.round(zoom * 100)])].sort((a, b) => a - b)
                .map(value => <option key={value} value={value}>{value}%</option>)}
            </select>
            <button aria-label="Zoom in" disabled={zoom >= 5} onClick={() => setZoom((z) => clamp(z + 0.1, 0.25, 5))}>
              <Icon name="plus" size={16} />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Fit
            </button>
            <button
              aria-label="Toggle grid"
              aria-pressed={showGrid}
              onClick={() => setShowGrid((v) => !v)}
            >
              <Icon name="grid" size={16} />
            </button>
          </div>
        </main>

        {!compact && (
          <aside className="sidebar properties" aria-label="Object properties">
            <h3>Object properties</h3>
            {objectProperties}
          </aside>
        )}
      </div>
      {doorMove && <DoorwayControls move={doorMove} onUpdate={updateDoorMove} onBack={() => setDoorMove(doorMove.previous)}
        onCancel={() => changeTool('select')} onApply={applyDoorMove} />}
      {compact && !doorMove && (
        <PhoneControls
          mode={phoneMode}
          tool={tool}
          selected={Boolean(selected)}
          hint={toolHint}
          onCancelWall={wallMatch ? cancelWallMatch : awaitingWallEnd ? () => changeTool('wall') : undefined}
          onTool={changeTool}
          onMode={previewOnly ? setPhoneMode : undefined}
          onOpen={openToolPanel}
        />
      )}
      <footer className="editorStatus">
        <span role="status">{status}</span>
        <span>
          {project.elements.filter(el => el.type !== 'clean' && el.type !== 'erase').length} objects
        </span>
      </footer>
      {editorPanel && (
        <Modal
          title={PANEL_TITLES[editorPanel]}
          className="toolDialog"
          onClose={() => setEditorPanel(null)}
        >
          {editorPanel === 'doors' && (
            <>
              <button type="button" className="doorwayStart" onClick={beginDoorMove}><Icon name="door-single-left" size={18} />Move a doorway</button>
              <div className="sheetTools"><ToolChoices choices={DOORS} tool={tool} setTool={changeTool} /></div>
            </>
          )}
          {editorPanel === 'cleanup' && (
            <>
              <div className="sheetTools">
                <ToolButton tool={tool} id="clean" setTool={changeTool} label="Rectangle" />
                <ToolButton tool={tool} id="erase" setTool={changeTool} label="Brush eraser" />
              </div>
              <p className="cleanupHint">Draw a rectangle to clear an area, or brush over the original drawing and any objects you want to remove.</p>
              <label className="brushControl">
                <span>Brush size <strong>{eraseSize}px</strong></span>
                <input type="range" aria-label="Brush size" min="8" max="120" step="2" value={eraseSize}
                  onChange={(e) => setEraseSize(Number(e.target.value))} />
              </label>
            </>
          )}
          {editorPanel === 'properties' && objectProperties}
          {editorPanel === 'settings' && planSettings}
          {editorPanel === 'tools' && (
            <>
              <Section title="Draw">
                <ToolChoices choices={OTHER_DRAW_TOOLS} tool={tool} setTool={changeTool} />
              </Section>
              <Section title="Fixtures">
                <ToolChoices choices={FIXTURES} tool={tool} setTool={changeTool} />
              </Section>
            </>
          )}
        </Modal>
      )}
      {dialog}
      {desktopTip}
      {guideMode && guideMode !== 'practice' && (
        <EditorGuide compact={compact} mode={guideMode} step={walkthroughStep}
          inEditor
          onStep={setWalkthroughStep}
          onReplay={() => { setWalkthroughStep(0); setGuideMode('walkthrough'); }}
          onReference={() => setGuideMode('controls')}
          onTry={tryWalkthroughTool}
          onClose={() => setGuideMode(null)} />
      )}
      {exportMenu && (
        <Modal
          title="Export plan"
          onClose={() => setExportMenu(false)}
        >
          <details className="printSettings">
            <summary>PDF print settings</summary>
            <div>
              <label className="field">
                <span>PDF sheet</span>
                <select value={paper} onChange={(e) => setPaper(e.target.value)}>
                  <option value="tabloid">Tabloid · 17 × 11 in</option>
                  <option value="letter">Letter · 11 × 8.5 in</option>
                  <option value="a3">A3 · landscape</option>
                </select>
              </label>
            </div>
            <p className="hint">The drawing fits the selected sheet for review.</p>
          </details>
          <div className="modalActions exportActions">
            <button
              className="primary"
              onClick={() => {
                setExportMenu(false);
                void exportRaster('pdf');
              }}
            >
              <Icon name="download" /> Download PDF
            </button>
            <button
              onClick={() => {
                setExportMenu(false);
                void exportRaster('png');
              }}
            >
              PNG image
            </button>
          </div>
        </Modal>
      )}

      {importOpen && (
        <Modal
          title="Import editable JSON"
          className="importModal"
          onClose={() => setImportOpen(false)}
        >
          <p className="modalLead">
            Paste project JSON generated from a blueprint image. Walls, doors, windows,
            labels and supported fixtures become normal editable objects.
          </p>
          <div className="importWorkflow">
            <div>
              <strong>1</strong>
              <span>Give the blueprint image to ChatGPT.</span>
            </div>
            <div>
              <strong>2</strong>
              <span>Use the project format prompt.</span>
            </div>
            <div>
              <strong>3</strong>
              <span>Paste the JSON below and import.</span>
            </div>
          </div>
          <button className="copyPromptButton" onClick={copyChatGPTPrompt}>
            Copy ChatGPT format prompt
          </button>
          <textarea
            className="importTextarea"
            value={importCode}
            onChange={(e) => {
              setImportCode(e.target.value);
              setImportError('');
            }}
            placeholder={'Paste JSON here…\n\n{"version":2,"units":"normalized","elements":[…]}'}
          />
          <label className="replaceCheck">
            <input
              type="checkbox"
              checked={importReplace}
              onChange={(e) => setImportReplace(e.target.checked)}
            />
            <span>
              <b>Replace current editable drawing</b>
              <small>
                The uploaded background image is kept. Turn this off to add the imported objects to
                the current drawing.
              </small>
            </span>
          </label>
          {importError && <div className="importError">{importError}</div>}
          <div className="modalActions">
            <button onClick={() => setImportOpen(false)}>Cancel</button>
            <button className="primary" disabled={!importCode.trim()} onClick={importEditableCode}>
              Import editable plan
            </button>
          </div>
          <div className="modalFootnote">
            Check the traced objects against the original drawing before sharing.
          </div>
        </Modal>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="section">
      <div className="sectionTitle">{title}</div>
      <div className="sectionBody">{children}</div>
    </div>
  );
}
function BackgroundEdit({ el }) {
  if (el.type === 'clean')
    return <rect x={el.x} y={el.y} width={el.width} height={el.height} fill="black" />;
  const size = el.size || 36;
  if (el.points.length === 1)
    return <circle cx={el.points[0].x} cy={el.points[0].y} r={size / 2} fill="black" />;
  const d = el.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  return <path d={d} fill="none" stroke="black" strokeWidth={size} strokeLinecap="round" strokeLinejoin="round" />;
}

function Element({ el, project, selected, onDown, onResizeDown, displayScale = 1 }) {
  const common = { 'data-element-id': el.id, onPointerDown: (e) => onDown(e, el), style: { cursor: 'pointer' } };
  const outline = selected ? DRAWING_ACCENT : '#111';
  if (el.type === 'wall') {
    const width = Math.max(3, (el.thicknessInches || 4.5) * project.unitsPerInch);
    return (
      <g>
        {selected && (
          <line
            x1={el.a.x}
            y1={el.a.y}
            x2={el.b.x}
            y2={el.b.y}
            stroke={DRAWING_ACCENT}
            strokeOpacity=".28"
            strokeWidth={width + 10}
            strokeLinecap="square"
            pointerEvents="none"
          />
        )}
        <line {...common} data-editor-only className="wallTouchTarget"
          x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y}
          stroke="transparent" strokeWidth={Math.max(width, 32 / Math.max(displayScale, 0.01))}
          strokeLinecap="square" pointerEvents="stroke" />
        <line
          {...common}
          x1={el.a.x}
          y1={el.a.y}
          x2={el.b.x}
          y2={el.b.y}
          stroke={wallStyle(el).color === '#000000' ? '#000' : wallStyle(el).color}
          strokeWidth={width}
          strokeLinecap="square"
        />
      </g>
    );
  }
  if (el.type === 'line')
    return (
      <line
        {...common}
        x1={el.a.x}
        y1={el.a.y}
        x2={el.b.x}
        y2={el.b.y}
        stroke={outline}
        strokeWidth={el.strokeWidth || 2}
        strokeLinecap="round"
      />
    );
  if (el.type === 'rect')
    return (
      <rect
        {...common}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        fill="none"
        stroke={outline}
        strokeWidth={el.strokeWidth || 2}
      />
    );
  if (el.type === 'ellipse')
    return (
      <ellipse
        {...common}
        cx={el.x}
        cy={el.y}
        rx={el.rx}
        ry={el.ry}
        fill="none"
        stroke={outline}
        strokeWidth={el.strokeWidth || 2}
      />
    );
  if (el.type === 'dimension') {
    const inches = dist(el.a, el.b) / project.unitsPerInch;
    return (
      <g {...common} stroke={outline} fill="none">
        <line x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y} strokeWidth="2" />
        <line x1={el.a.x} y1={el.a.y - 10} x2={el.a.x} y2={el.a.y + 10} strokeWidth="2" />
        <line x1={el.b.x} y1={el.b.y - 10} x2={el.b.x} y2={el.b.y + 10} strokeWidth="2" />
        <text
          x={(el.a.x + el.b.x) / 2}
          y={(el.a.y + el.b.y) / 2 - 10}
          textAnchor="middle"
          fill={outline}
          stroke="none"
          fontWeight="700"
          fontSize="20"
        >
          {inchesLabel(inches)}
        </text>
      </g>
    );
  }
  if (el.type === 'door')
    return (
      <g>
        <DoorSymbol el={el} project={project} outline={outline} common={common} />
      </g>
    );
  if (el.type === 'window') {
    const width = (el.widthInches || 36) * project.unitsPerInch;
    const height = Math.max(12, (el.heightInches || 4.5) * project.unitsPerInch);
    return (
      <g>
        <g {...common} transform={`translate(${el.x} ${el.y}) rotate(${el.rotation || 0})`}>
          <rect
            x={-width / 2 - 4}
            y={-height / 2 - 4}
            width={width + 8}
            height={height + 8}
            fill="#fff"
            stroke="none"
          />
          <rect
            x={-width / 2}
            y={-height / 2}
            width={width}
            height={height}
            fill="#fff"
            stroke={outline}
            strokeWidth="4"
          />
          <line
            x1={-width / 2 + 5}
            y1={-height * 0.18}
            x2={width / 2 - 5}
            y2={-height * 0.18}
            stroke={outline}
            strokeWidth="2"
          />
          <line
            x1={-width / 2 + 5}
            y1={height * 0.18}
            x2={width / 2 - 5}
            y2={height * 0.18}
            stroke={outline}
            strokeWidth="2"
          />
          <line
            x1={-width / 2}
            y1={-height / 2 - 6}
            x2={-width / 2}
            y2={height / 2 + 6}
            stroke={outline}
            strokeWidth="3"
          />
          <line
            x1={width / 2}
            y1={-height / 2 - 6}
            x2={width / 2}
            y2={height / 2 + 6}
            stroke={outline}
            strokeWidth="3"
          />
        </g>
      </g>
    );
  }
  if (el.type === 'text')
    return (
      <text
        {...common}
        x={el.x}
        y={el.y}
        transform={`rotate(${el.rotation || 0} ${el.x} ${el.y})`}
        fontSize={el.fontSize || 24}
        fill={outline}
        fontFamily="Inter, Arial, sans-serif"
      >
        {el.text}
      </text>
    );
  if (el.type === 'symbol')
    return (
      <g>
        <Symbol el={el} selected={selected} common={common} project={project} />
      </g>
    );
  return null;
}

function SelectionHandles({ el, project, onResizeDown, displayScale = 1, onOpenProperties }) {
  if (!onResizeDown || !['wall', 'symbol', 'door', 'window'].includes(el.type)) return null;
  const scale = Math.max(displayScale, 0.01);
  const units = project.unitsPerInch;
  const handle = (name, x, y, label, cursor = 'nwse-resize') => (
    <g key={name}>
      <circle data-resize-handle={name} role="button" aria-label={label} tabIndex={0}
        cx={x} cy={y} r={22 / scale} fill="transparent" pointerEvents="all"
        onPointerDown={e => onResizeDown(e, el, name)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenProperties?.(); } }}
        style={{ cursor }} />
      <circle cx={x} cy={y} r={9 / scale} fill="#fff" stroke={DRAWING_ACCENT} strokeWidth="2"
        vectorEffect="non-scaling-stroke" pointerEvents="none" />
      <circle cx={x} cy={y} r={3 / scale} fill={DRAWING_ACCENT} pointerEvents="none" />
    </g>
  );
  if (el.type === 'wall') {
    const { middle, thickness } = wallControls(el, units, scale);
    return (
      <g data-editor-only aria-label="Wall resize handles" pointerEvents="none">
        <line x1={middle.x} y1={middle.y} x2={thickness.x} y2={thickness.y} stroke={DRAWING_ACCENT}
          strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        {handle('a', el.a.x, el.a.y, 'Resize wall start', 'move')}
        {handle('b', el.b.x, el.b.y, 'Resize wall end', 'move')}
        {handle('thickness', thickness.x, thickness.y, 'Resize wall thickness', 'ns-resize')}
      </g>
    );
  }
  if (el.type === 'window') {
    const width = el.widthInches * units, height = (el.heightInches || 4.5) * units;
    return <g data-editor-only aria-label="Window resize handles" transform={`translate(${el.x} ${el.y}) rotate(${el.rotation || 0})`} pointerEvents="none">
      <line x1={-width / 2} y1="0" x2={width / 2} y2="0" stroke={DRAWING_ACCENT} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      {handle('start', -width / 2, 0, 'Resize window start', 'ew-resize')}
      {handle('end', width / 2, 0, 'Resize window end', 'ew-resize')}
      {handle('thickness', 0, height / 2 + 30 / scale, 'Resize window thickness', 'ns-resize')}
    </g>;
  }
  const w = (el.widthInches || (el.type === 'door' ? 32 : 24)) * units;
  const h = (el.heightInches || (el.type === 'window' ? 4.5 : 24)) * units;
  return (
    <g data-editor-only transform={`translate(${el.x} ${el.y}) rotate(${el.rotation || 0})`} pointerEvents="none">
      {el.type === 'door'
        ? <line x1="0" y1="0" x2={w} y2="0" stroke={DRAWING_ACCENT} strokeWidth="1.5"
          strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        : <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" stroke={DRAWING_ACCENT}
          strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
      {handle(el.type === 'door' ? 'width' : 'corner', el.type === 'door' ? w : w / 2,
        el.type === 'door' ? 0 : h / 2, `Resize ${el.type === 'symbol' ? 'fixture' : el.type}`)}
    </g>
  );
}

function DoorSymbol({ el, project, outline, common }) {
  const w = (el.widthInches || 36) * project.unitsPerInch;
  const style = el.doorStyle || 'single-left';
  const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation || 0})`;
  const openingDepth = Math.max(30, 10 * project.unitsPerInch);
  const base = {
    ...common,
    transform,
    stroke: outline,
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  const mask = (
    <rect
      x="-5"
      y={-openingDepth / 2}
      width={w + 10}
      height={openingDepth}
      fill="#fff"
      stroke="none"
    />
  );
  if (style === 'single-right')
    return (
      <g {...base}>
        {mask}
        <line x1="0" y1="0" x2="0" y2={w} strokeWidth="4" />
        <path d={`M ${w} 0 A ${w} ${w} 0 0 1 0 ${w}`} strokeWidth="2" />
        <line x1="0" y1="0" x2={w} y2="0" strokeWidth="2" strokeDasharray="8 8" />
      </g>
    );
  if (style === 'double') {
    const h = w / 2;
    return (
      <g {...base}>
        {mask}
        <line x1="0" y1="0" x2="0" y2={-h} strokeWidth="4" />
        <line x1={w} y1="0" x2={w} y2={-h} strokeWidth="4" />
        <path d={`M ${h} 0 A ${h} ${h} 0 0 0 0 ${-h}`} strokeWidth="2" />
        <path d={`M ${h} 0 A ${h} ${h} 0 0 1 ${w} ${-h}`} strokeWidth="2" />
        <line x1="0" y1="0" x2={w} y2="0" strokeWidth="2" strokeDasharray="8 8" />
      </g>
    );
  }
  if (style === 'pocket')
    return (
      <g {...base}>
        {mask}
        <rect x="0" y="-8" width={w} height="16" strokeWidth="3" />
        <line x1={w * 0.5} y1="-18" x2={w * 1.45} y2="-18" strokeWidth="4" />
        <line x1={w * 0.5} y1="18" x2={w * 1.45} y2="18" strokeWidth="2" strokeDasharray="8 7" />
        <path
          d={`M ${w * 0.75} -2 L ${w * 0.95} -2 M ${w * 0.88} -9 L ${w * 0.95} -2 L ${w * 0.88} 5`}
          strokeWidth="2"
        />
      </g>
    );
  if (style === 'sliding')
    return (
      <g {...base}>
        {mask}
        <rect x="0" y="-12" width={w * 0.58} height="24" strokeWidth="3" />
        <rect x={w * 0.42} y="-3" width={w * 0.58} height="24" strokeWidth="3" />
        <line x1={w * 0.15} y1="22" x2={w * 0.85} y2="22" strokeWidth="2" />
        <path
          d={`M ${w * 0.35} 17 L ${w * 0.25} 22 L ${w * 0.35} 27 M ${w * 0.65} 17 L ${w * 0.75} 22 L ${w * 0.65} 27`}
          strokeWidth="2"
        />
      </g>
    );
  if (style === 'bifold') {
    const q = w / 4;
    return (
      <g {...base}>
        {mask}
        <polyline
          points={`0,0 ${q},${-q * 0.8} ${q * 2},0 ${q * 3},${-q * 0.8} ${w},0`}
          strokeWidth="4"
        />
        <line x1="0" y1="0" x2={w} y2="0" strokeWidth="2" strokeDasharray="7 7" />
      </g>
    );
  }
  return (
    <g {...base}>
      {mask}
      <line x1="0" y1="0" x2="0" y2={-w} strokeWidth="4" />
      <path d={`M ${w} 0 A ${w} ${w} 0 0 0 0 ${-w}`} strokeWidth="2" />
      <line x1="0" y1="0" x2={w} y2="0" strokeWidth="2" strokeDasharray="8 8" />
    </g>
  );
}

function Symbol({ el, selected, common, project }) {
  const stroke = selected ? DRAWING_ACCENT : '#111';
  const w = (el.widthInches || 24) * project.unitsPerInch,
    h = (el.heightInches || 24) * project.unitsPerInch;
  const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation || 0})`;
  const extraFixture = EXTRA_FIXTURES.find(item => item.id === el.symbol);
  if (extraFixture) return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">{extraFixture.draw(w, h)}</g>;
  if (el.symbol === 'toilet')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <ellipse cx="0" cy="5" rx={w * 0.28} ry={h * 0.34} />
        <rect x={-w * 0.28} y={-h * 0.44} width={w * 0.56} height={h * 0.22} rx="4" />
        <ellipse cx="0" cy="5" rx={w * 0.13} ry={h * 0.18} fill="#f1f3f5" />
      </g>
    );
  if (el.symbol === 'sink')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="6" />
        <ellipse cx="0" cy="0" rx={w * 0.28} ry={h * 0.27} />
        <circle cx="0" cy="0" r="4" fill={stroke} />
      </g>
    );
  if (el.symbol === 'shower')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} />
        <line x1={-w / 2} y1={-h / 2} x2={w / 2} y2={h / 2} />
        <circle cx={w * 0.28} cy={-h * 0.28} r="5" fill={stroke} />
      </g>
    );
  if (el.symbol === 'bed')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} />
        <rect x={-w * 0.42} y={-h * 0.42} width={w * 0.36} height={h * 0.18} rx="8" />
        <rect x={w * 0.06} y={-h * 0.42} width={w * 0.36} height={h * 0.18} rx="8" />
        <rect x={-w * 0.43} y={-h * 0.14} width={w * 0.86} height={h * 0.54} fill="#f2f2f2" />
      </g>
    );
  if (el.symbol === 'wh')
    return (
      <g {...common} transform={transform}>
        <circle r={Math.min(w, h) / 2} fill="#fff" stroke={stroke} strokeWidth="3" />
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="700"
          fontSize="24"
          fill={stroke}
        >
          WH
        </text>
      </g>
    );
  if (el.symbol === 'tub')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(18, h * 0.22)} />
        <rect
          x={-w * 0.42}
          y={-h * 0.34}
          width={w * 0.84}
          height={h * 0.68}
          rx={Math.min(16, h * 0.25)}
          fill="#f6fbff"
        />
        <circle cx={w * 0.31} cy="0" r="4" fill={stroke} />
      </g>
    );
  if (el.symbol === 'vanity')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} />
        <ellipse cx="0" cy="0" rx={w * 0.22} ry={h * 0.28} />
        <circle cx="0" cy={-h * 0.3} r="4" fill={stroke} />
        <line x1={-w * 0.38} y1={h * 0.28} x2={w * 0.38} y2={h * 0.28} />
      </g>
    );
  if (el.symbol === 'washerdryer')
    return (
      <g {...common} transform={transform}>
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          fill="#fff"
          stroke={stroke}
          strokeWidth="3"
        />
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="800"
          fontSize={Math.max(16, Math.min(w, h) * 0.42)}
          fill={stroke}
        >
          WD
        </text>
      </g>
    );
  if (el.symbol === 'counter')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} />
        <line x1={-w / 2} y1={-h * 0.28} x2={w / 2} y2={-h * 0.28} strokeWidth="2" />
        <line x1={-w / 2} y1={h * 0.28} x2={w / 2} y2={h * 0.28} strokeWidth="2" />
      </g>
    );
  if (el.symbol === 'stove')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} />
        {[
          [-0.24, -0.22],
          [0.24, -0.22],
          [-0.24, 0.22],
          [0.24, 0.22],
        ].map(([x, y], i) => (
          <circle key={i} cx={w * x} cy={h * y} r={Math.max(4, Math.min(w, h) * 0.12)} />
        ))}
      </g>
    );
  if (el.symbol === 'cabinet')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} />
        <line x1={-w / 2} y1={-h / 2} x2={w / 2} y2={h / 2} />
        <line x1={w / 2} y1={-h / 2} x2={-w / 2} y2={h / 2} />
      </g>
    );
  if (el.symbol === 'fridge')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="4" />
        <line x1="0" y1={-h / 2} x2="0" y2={h / 2} />
        <line x1={-w * 0.08} y1={-h * 0.22} x2={-w * 0.08} y2={h * 0.22} strokeWidth="2" />
        <line x1={w * 0.08} y1={-h * 0.22} x2={w * 0.08} y2={h * 0.22} strokeWidth="2" />
      </g>
    );
  if (el.symbol === 'range')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} />
        {[
          [-0.24, -0.22],
          [0.24, -0.22],
          [-0.24, 0.22],
          [0.24, 0.22],
        ].map(([x, y], i) => (
          <circle key={i} cx={w * x} cy={h * y} r={Math.min(w, h) * 0.12} />
        ))}
      </g>
    );
  if (el.symbol === 'sofa')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h * 0.34} width={w} height={h * 0.68} rx="10" />
        <rect x={-w * 0.42} y={-h * 0.2} width={w * 0.84} height={h * 0.4} rx="7" fill="#f3f5f7" />
        <line x1="0" y1={-h * 0.2} x2="0" y2={h * 0.2} />
      </g>
    );
  if (el.symbol === 'stairs')
    return (
      <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3">
        <rect x={-w / 2} y={-h / 2} width={w} height={h} />
        {Array.from({ length: 8 }, (_, i) => (
          <line
            key={i}
            x1={-w / 2}
            y1={-h / 2 + ((i + 1) * h) / 9}
            x2={w / 2}
            y2={-h / 2 + ((i + 1) * h) / 9}
            strokeWidth="2"
          />
        ))}
        <path
          d={`M 0 ${h * 0.3} L 0 ${-h * 0.28} M ${-w * 0.1} ${-h * 0.16} L 0 ${-h * 0.28} L ${w * 0.1} ${-h * 0.16}`}
          strokeWidth="3"
        />
      </g>
    );
  return null;
}

function Draft({ draft, project, zoom, wallAppearance }) {
  if (draft.awaitingEnd) {
    return (
      <circle
        data-editor-only
        data-wall-start
        aria-hidden="true"
        pointerEvents="none"
        cx={draft.a.x}
        cy={draft.a.y}
        r={20 / zoom}
        fill={DRAWING_ACCENT}
        stroke="#fff"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (draft.type === 'wall')
    return (
      <line
        x1={draft.a.x}
        y1={draft.a.y}
        x2={draft.b.x}
        y2={draft.b.y}
        stroke={wallAppearance?.color || '#000'}
        strokeOpacity="0.82"
        strokeWidth={Math.max(3, (wallAppearance?.thicknessInches || 4.5) * project.unitsPerInch)}
        strokeLinecap="square"
      />
    );
  if (draft.type === 'line')
    return (
      <line
        x1={draft.a.x}
        y1={draft.a.y}
        x2={draft.b.x}
        y2={draft.b.y}
        stroke={DRAWING_ACCENT}
        strokeWidth="2"
      />
    );
  if (draft.type === 'rect')
    return (
      <rect
        x={Math.min(draft.a.x, draft.b.x)}
        y={Math.min(draft.a.y, draft.b.y)}
        width={Math.abs(draft.a.x - draft.b.x)}
        height={Math.abs(draft.a.y - draft.b.y)}
        fill="none"
        stroke={DRAWING_ACCENT}
        strokeWidth="2"
      />
    );
  if (draft.type === 'clean')
    return (
      <rect
        x={Math.min(draft.a.x, draft.b.x)}
        y={Math.min(draft.a.y, draft.b.y)}
        width={Math.abs(draft.a.x - draft.b.x)}
        height={Math.abs(draft.a.y - draft.b.y)}
        fill="#fff"
        fillOpacity="0.8"
        stroke={DRAWING_ACCENT}
        strokeWidth="3"
        strokeDasharray="10 8"
      />
    );
  return null;
}

function symbolLabel(symbol) {
  const fixture = EXTRA_FIXTURES.find(item => item.id === symbol);
  if (fixture) return fixture.label;
  return (
    {
      toilet: 'Toilet',
      sink: 'Sink',
      shower: 'Shower',
      tub: 'Bathtub',
      bed: 'Bed',
      wh: 'Water heater',
      washerdryer: 'Washer / dryer',
      counter: 'Counter',
      stove: 'Stove',
    }[symbol] || 'Object'
  );
}

function NumberInput({ value, onCommit, min = -MAX_PROJECT_NUMBER, max = MAX_PROJECT_NUMBER, step = 'any' }) {
  const [text, setText] = useState(String(value ?? ''));
  useEffect(() => {
    setText(String(value ?? ''));
  }, [value]);
  const commit = () => {
    const parsed = text.trim() ? Number(text) : NaN;
    if (!Number.isFinite(parsed)) {
      setText(String(value ?? ''));
      return;
    }
    const next = clamp(parsed, min, max);
    onCommit(next);
    setText(String(next));
  };
  return (
    <input
      type="number"
      step={step}
      min={Number.isFinite(min) ? min : undefined}
      max={Number.isFinite(max) ? max : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function WallColorInput({ value, onCommit }) {
  const last = useRef(value);
  useEffect(() => { last.current = value; }, [value]);
  const change = (event) => {
    const color = event.currentTarget.value;
    if (!isWallColor(color) || last.current === color) return;
    last.current = color;
    onCommit(color);
  };
  return <input type="color" value={value} onInput={change} onChange={change} />;
}

function Properties({
  selected,
  drawingUnits,
  updateElement,
  deleteSelected,
  onMatchWall,
  matching,
}) {
  const set = (key, val) => updateElement(selected.id, { [key]: val });
  return (
    <div className="propStack">
      <div className="badge">{selected.type.toUpperCase()}</div>
      {selected.type === 'wall' && (
        <>
          <label className="field">
            <span>Wall thickness (px)</span>
            <NumberInput
              value={(selected.thicknessInches || 4.5) * drawingUnits}
              min={0.25 * drawingUnits}
              step="any"
              max={120 * drawingUnits}
              onCommit={(pixels) => set('thicknessInches', pixels / drawingUnits)}
            />
          </label>
          <label className="field wallColorField">
            <span>Wall color</span>
            <WallColorInput value={wallStyle(selected).color} onCommit={color => set('color', color)} />
          </label>
          <button className="wide" onClick={onMatchWall}>{matching ? 'Cancel matching' : 'Match another wall'}</button>
          <p className="hint compactHint">Drag the end handles to change length. Drag the middle handle to change thickness.</p>
          <p className="hint compactHint">Match copies the other wall’s color and thickness.</p>
        </>
      )}
      {['door', 'window'].includes(selected.type) && (
        <>
          {selected.type === 'door' && (
            <label className="field">
              <span>Door type</span>
              <select
                value={selected.doorStyle || 'single-left'}
                onChange={(e) => set('doorStyle', e.target.value)}
              >
                <option value="single-left">Single left</option>
                <option value="single-right">Single right</option>
                <option value="double">Double</option>
                <option value="pocket">Pocket</option>
                <option value="sliding">Sliding</option>
                <option value="bifold">Bifold</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>Drawing width (px)</span>
            <NumberInput value={(selected.widthInches || 36) * drawingUnits} min={drawingUnits} step="any"
              onCommit={(pixels) => set('widthInches', pixels / drawingUnits)} />
          </label>
          {selected.type === 'window' && (
            <label className="field">
              <span>Drawing depth (px)</span>
              <NumberInput value={(selected.heightInches || 4.5) * drawingUnits} min={0.25 * drawingUnits} step="any"
                onCommit={(pixels) => set('heightInches', pixels / drawingUnits)} />
            </label>
          )}
          <label className="field">
            <span>Rotation (degrees)</span>
            <NumberInput value={selected.rotation || 0} onCommit={(v) => set('rotation', v)} />
          </label>
          <div className="quickActions">
            <button onClick={() => set('rotation', (selected.rotation || 0) - 90)}>↶ 90°</button>
            <button onClick={() => set('rotation', (selected.rotation || 0) + 90)}>↷ 90°</button>
          </div>
          <div className="hint compactHint">
            {selected.type === 'window' ? 'Drag either endpoint to resize the width; use the offset handle for depth.' : 'Drag the endpoint handle to resize the door.'} Press{' '}
            <b>R</b> to rotate 90°.
          </div>
        </>
      )}
      {selected.type === 'text' && (
        <>
          <label className="field">
            <span>Text</span>
            <input
              key={selected.id}
              value={selected.text || ''}
              onChange={(e) => updateElement(selected.id, { text: e.target.value })}
              placeholder="Room name, note, or a known measurement"
              maxLength={2000}
              onBlur={(e) => set('text', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </label>
          <label className="field">
            <span>Font size</span>
            <NumberInput
              value={selected.fontSize || 24}
              min={1}
              onCommit={(v) => set('fontSize', v)}
            />
          </label>
          <label className="field">
            <span>Rotation</span>
            <NumberInput value={selected.rotation || 0} onCommit={(v) => set('rotation', v)} />
          </label>
        </>
      )}
      {selected.type === 'symbol' && (
        <>
          <div className="objectName">{symbolLabel(selected.symbol)}</div>
          <div className="sizeGrid">
            <label className="field">
              <span>Drawing width (px)</span>
              <NumberInput value={(selected.widthInches || 24) * drawingUnits} min={drawingUnits} step="any"
                onCommit={(pixels) => set('widthInches', pixels / drawingUnits)} />
            </label>
            <label className="field">
              <span>Drawing height (px)</span>
              <NumberInput value={(selected.heightInches || 24) * drawingUnits} min={drawingUnits} step="any"
                onCommit={(pixels) => set('heightInches', pixels / drawingUnits)} />
            </label>
          </div>
          <label className="field">
            <span>Rotation (degrees)</span>
            <NumberInput value={selected.rotation || 0} onCommit={(v) => set('rotation', v)} />
          </label>
          <div className="quickActions">
            <button onClick={() => set('rotation', (selected.rotation || 0) - 90)}>↶ 90°</button>
            <button onClick={() => set('rotation', (selected.rotation || 0) + 90)}>↷ 90°</button>
          </div>
          <div className="quickActions">
            <button
              onClick={() =>
                updateElement(selected.id, {
                  widthInches: Math.max(1, (selected.widthInches || 24) * 0.9),
                  heightInches: Math.max(1, (selected.heightInches || 24) * 0.9),
                })
              }
            >
              − Smaller
            </button>
            <button
              onClick={() =>
                updateElement(selected.id, {
                  widthInches: (selected.widthInches || 24) * 1.1,
                  heightInches: (selected.heightInches || 24) * 1.1,
                })
              }
            >
              ＋ Larger
            </button>
          </div>
          <div className="hint compactHint">
            Drag the corner handle on the canvas to resize. Press <b>R</b> to rotate 90°.
          </div>
        </>
      )}
      {['line', 'rect'].includes(selected.type) && (
        <label className="field">
          <span>Line weight</span>
          <NumberInput
            value={selected.strokeWidth || 2}
            min={1}
            max={20}
            onCommit={(v) => set('strokeWidth', v)}
          />
        </label>
      )}
      {selected.type === 'erase' && (
        <label className="field">
          <span>Eraser size</span>
          <NumberInput value={selected.size || 36} min={1} onCommit={(v) => set('size', v)} />
        </label>
      )}
      <button className="wide danger" onClick={deleteSelected}>
        Delete selected
      </button>
    </div>
  );
}

export default BlueprintApp;
