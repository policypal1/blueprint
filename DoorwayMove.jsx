import React from 'react';
import { DOORS } from './EditorControls.jsx';
import { wallStyle, clampWallThickness } from './wall-tools.js';

const prompts = {
  start: 'Tap the old hinge, or tap a door you added.',
  jamb: 'Tap the other edge of the old opening.',
  swing: 'Tap the tip of the old door leaf to clear its swing.',
  place: 'Tap the new hinge location.',
  direction: 'Tap along the new wall toward the other jamb.',
  preview: 'Check the swing, then apply the move.',
};
const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const radians = degrees => degrees * Math.PI / 180;
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const along = (a, angle, width) => ({ x: a.x + Math.cos(angle) * width, y: a.y + Math.sin(angle) * width });

export function markDoorway(move, point, door, wallSnap, project) {
  switch (move.step) {
    case 'start': {
      if (!door) return { ...move, step: 'jamb', a: point };
      const a = { x: door.x, y: door.y };
      const width = (door.widthInches || 36) * project.unitsPerInch;
      return { ...move, step: 'place', sourceId: door.id, a, b: along(a, radians(door.rotation || 0), width),
        style: door.doorStyle || 'single-left' };
    }
    case 'jamb':
      if (length(move.a, point) < 3) return move;
      return { ...move, b: point, step: project.background && project.showBackground ? 'swing' : 'place' };
    case 'swing': {
      if (length(move.a, point) < 3) return move;
      const side = Math.sin(angleTo(move.a, point) - angleTo(move.a, move.b));
      return { ...move, tip: point, style: side > 0 ? 'single-right' : 'single-left', step: 'place' };
    }
    case 'place':
      return { ...move, destination: wallSnap?.point || point, wall: wallSnap?.wall, step: 'direction' };
    case 'direction': {
      if (length(move.destination, point) < 3) return move;
      let angle = angleTo(move.destination, point);
      let attachedWallId;
      if (move.wall) {
        const wallAngle = angleTo(move.wall.a, move.wall.b);
        const delta = angle - wallAngle;
        if (Math.abs(Math.sin(delta)) < 0.22) {
          angle = Math.cos(delta) >= 0 ? wallAngle : wallAngle + Math.PI;
          attachedWallId = move.wall.id;
        }
      }
      return { ...move, angle, attachedWallId, step: 'preview' };
    }
    default:
      return move;
  }
}

// Trace the ink of the leaf and swing arc on the imported sheet. The rest of the room stays visible.
function swingMask(move) {
  const { a, b, tip } = move;
  const width = length(a, b), radius = length(a, tip);
  const start = angleTo(a, tip), end = angleTo(a, b);
  const arc = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  const segments = Math.max(6, Math.ceil(Math.abs(arc) * Math.max(radius, width) / 6));
  const points = [a, tip];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    points.push(along(a, start + arc * t, radius + (width - radius) * t));
  }
  return { id: move.maskId, type: 'erase', size: Math.max(5, Math.min(16, width * 0.09)), points };
}

export function movedDoorwayElements(project, move, nearestWall, fallbackStyle) {
  const { a, b } = move;
  const source = project.elements.find(el => el.id === move.sourceId);
  const elements = project.elements.filter(el => el.id !== move.sourceId);
  const width = length(a, b);
  const adjacent = nearestWall(a, elements, 6)?.wall || nearestWall(b, elements, 6)?.wall;
  // A door on an unbroken editable wall already reveals the original wall when moved.
  const covered = elements.some(wall => wall.type === 'wall' &&
    nearestWall(a, [wall], 2) && nearestWall(b, [wall], 2));
  if (move.tip) elements.push(swingMask(move));
  if (!covered && (!source || adjacent)) {
    const style = wallStyle(adjacent || fallbackStyle);
    elements.push({ id: move.wallId, type: 'wall', a, b, ...style,
      thicknessInches: clampWallThickness(style.thicknessInches, project.unitsPerInch) });
  }

  const hinge = move.swap ? along(move.destination, move.angle, width) : move.destination;
  elements.push({
    ...source,
    id: source?.id || move.doorId, type: 'door', ...hinge,
    rotation: (move.angle * 180 / Math.PI + (move.swap ? 180 : 0) + 360) % 360,
    widthInches: source?.widthInches || width / project.unitsPerInch,
    doorStyle: move.style, attachedWallId: move.attachedWallId,
  });
  return elements;
}

export function DoorwayMarks({ move }) {
  if (move.step === 'preview') return null;
  return (
    <g data-editor-only pointerEvents="none" stroke="#a9441b" fill="white">
      {move.a && move.b && <line x1={move.a.x} y1={move.a.y} x2={move.b.x} y2={move.b.y}
        strokeDasharray="5 4" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      {[move.a, move.b, move.tip, move.destination].map((point, i) => point &&
        <circle key={i} cx={point.x} cy={point.y} r="6" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
    </g>
  );
}

export function DoorwayControls({ move, onUpdate, onBack, onCancel, onApply }) {
  return (
    <section className="doorwayControls" aria-label="Move a doorway">
      <div><strong>Move a doorway</strong><span role="status">{prompts[move.step]}</span></div>
      <div className="doorwayButtons">
        {move.step === 'swing' && <button onClick={() => onUpdate({ ...move, step: 'place' })}>Skip swing</button>}
        {move.step === 'preview' && <>
          <select aria-label="Door swing or style" value={'door-' + move.style}
            onChange={event => onUpdate({ ...move, style: event.target.value.slice(5) }, false)}>
            {DOORS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <button aria-pressed={!!move.swap} onClick={() => onUpdate({ ...move, swap: !move.swap }, false)}>Swap hinge</button>
        </>}
        {move.previous && <button onClick={onBack}>Back</button>}
        <button onClick={onCancel}>Cancel</button>
        {move.step === 'preview' && <button className="primary" onClick={onApply}>Apply move</button>}
      </div>
    </section>
  );
}
