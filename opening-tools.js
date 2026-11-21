// Keep opening direction when moving between walls; fit the full opening on its wall.
export function snapOpening(opening, snap, elements, units, original = opening) {
  const wall = snap.wall;
  const oldWall = elements.find(el => el.type === 'wall' && el.id === original.attachedWallId);
  const oldAngle = oldWall ? Math.atan2(oldWall.b.y - oldWall.a.y, oldWall.b.x - oldWall.a.x) * 180 / Math.PI : null;
  const offset = oldAngle === null ? Math.round(((original.rotation || 0) - snap.rotation) / 180) * 180 : (original.rotation || 0) - oldAngle;
  const rotation = snap.rotation + offset;
  const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y;
  const length = Math.hypot(dx, dy);
  if (!length) return { x: snap.point.x, y: snap.point.y, rotation, attachedWallId: wall.id };
  const width = Math.min((opening.widthInches || 30) * units, length);
  const extent = width * Math.cos(offset * Math.PI / 180);
  const min = opening.type === 'window' ? width / 2 : Math.max(0, -extent);
  const max = opening.type === 'window' ? length - width / 2 : length - Math.max(0, extent);
  const along = ((snap.point.x - wall.a.x) * dx + (snap.point.y - wall.a.y) * dy) / length;
  const position = Math.max(min, Math.min(max, along));
  return { x: wall.a.x + dx / length * position, y: wall.a.y + dy / length * position,
    rotation, widthInches: width / units, attachedWallId: wall.id };
}

export function resizeWindow(base, handle, point, units, elements = []) {
  const angle = (base.rotation || 0) * Math.PI / 180;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const localX = (point.x - base.x) * ux + (point.y - base.y) * uy;
  const localY = -(point.x - base.x) * uy + (point.y - base.y) * ux;
  if (handle === 'thickness') return { heightInches: Math.max(.25, Math.min(10000, Math.abs(localY) * 2 / units)) };
  const half = base.widthInches * units / 2;
  const fixed = handle === 'start' ? half : -half;
  let moving = handle === 'start' ? Math.min(localX, fixed - units) : Math.max(localX, fixed + units);
  const wall = elements.find(el => el.id === base.attachedWallId && el.type === 'wall');
  if (wall) {
    const ends = [wall.a, wall.b].map(p => (p.x - base.x) * ux + (p.y - base.y) * uy);
    moving = Math.max(Math.min(...ends), Math.min(Math.max(...ends), moving));
  }
  const center = (fixed + moving) / 2;
  return { x: base.x + center * ux, y: base.y + center * uy,
    widthInches: Math.max(1, Math.min(10000, Math.abs(moving - fixed) / units)) };
}
