// Original demonstration drawing; no client plans are published.
export function sampleProject(id = 'sample') {
  const wall = (x1, y1, x2, y2) => ({
    type: 'wall',
    a: { x: x1, y: y1 },
    b: { x: x2, y: y2 },
    thicknessInches: 4.5,
  });
  const fixture = (symbol, x, y, widthInches, heightInches, rotation = 0) => ({
    type: 'symbol',
    symbol,
    x,
    y,
    widthInches,
    heightInches,
    rotation,
  });
  const label = (x, y, text) => ({ type: 'text', x, y, text, fontSize: 22, rotation: 0 });
  const elements = [
    wall(300, 140, 1300, 140),
    wall(1300, 140, 1300, 860),
    wall(1300, 860, 300, 860),
    wall(300, 860, 300, 140),
    wall(940, 140, 940, 420),
    wall(940, 540, 940, 860),
    wall(940, 590, 1300, 590),
    { type: 'door', x: 940, y: 420, widthInches: 30, rotation: 90, doorStyle: 'single-left' },
    { type: 'door', x: 560, y: 860, widthInches: 36, rotation: 0, doorStyle: 'single-left' },
    { type: 'window', x: 620, y: 140, widthInches: 48, heightInches: 4.5, rotation: 0 },
    { type: 'window', x: 1120, y: 140, widthInches: 30, heightInches: 4.5, rotation: 0 },
    fixture('bed', 590, 340, 60, 80),
    fixture('shower', 1190, 258, 48, 48),
    fixture('sink', 1000, 335, 24, 36),
    fixture('toilet', 1210, 450, 22, 28),
    fixture('counter', 1120, 800, 72, 24),
    label(520, 640, 'PRIMARY BEDROOM'),
    label(1030, 540, 'BATHROOM'),
    label(1020, 700, 'WALK-IN CLOSET'),
    { type: 'dimension', a: { x: 300, y: 65 }, b: { x: 1300, y: 65 } },
  ].map((el, i) => ({ ...el, id: `${id}-${i}` }));
  return {
    id,
    name: 'Sample · Primary suite',
    unitsPerInch: 4,
    calibrated: true,
    background: null,
    backgroundOpacity: 1,
    showBackground: true,
    elements,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
