import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLength,
  pdfLayout,
  validateProject,
  MAX_ELEMENTS,
  clientToWorkspace,
} from '../editor-core.js';
import { sampleProject } from '../sample-project.js';

test('pointer coordinates account for centered letterboxing, pan, and CSS zoom', () => {
  assert.deepEqual(clientToWorkspace(500, 250, { left: 100, top: 50, width: 800, height: 400 }), {
    x: 800,
    y: 500,
  });
  assert.deepEqual(clientToWorkspace(100, 0, { left: 0, top: 0, width: 1000, height: 500 }), {
    x: 0,
    y: 0,
  });
  assert.deepEqual(
    clientToWorkspace(900, 1050, { left: 100, top: 50, width: 1600, height: 2000 }),
    { x: 800, y: 500 },
  );
});

test('measurement parser supports inches, feet, and mixed fractions without silently dropping characters', () => {
  for (const [input, expected] of [
    [120, 120],
    ['120', 120],
    [`10' 6"`, 126],
    ['10 ft 6.25 in', 126.25],
    ['8 feet', 96],
    ['8′ 10½″', NaN],
    ['10 1/2', 10.5],
    [`8' 10 1/2"`, 106.5],
    ['1/4', 0.25],
  ]) {
    if (Number.isNaN(expected)) assert.ok(Number.isNaN(parseLength(input)));
    else assert.equal(parseLength(input), expected);
  }
  for (const bad of ['', '-5', 'abc123', '1/0', '12 meters', '8 inches junk', Infinity])
    assert.ok(!Number.isFinite(parseLength(bad)));
});
test('every fit-to-page export preserves the workspace aspect ratio and stays inside the sheet', () => {
  for (const paper of ['letter', 'tabloid', 'a3']) {
    const r = pdfLayout({ paper, scale: 'fit' });
    assert.equal(r.width / r.height, 1.6);
    assert.ok(r.x >= 0.49 && r.y >= 0.49);
    assert.ok(r.x + r.width <= r.pageWidth - 0.49);
    assert.ok(r.y + r.height <= r.pageHeight - 0.49);
  }
});
test('scaled export maps a known 120-inch wall to 2.5 inches on paper at 1:48', () => {
  const r = pdfLayout({ paper: 'tabloid', scale: '48', unitsPerInch: 4, calibrated: true });
  assert.equal(((120 * 4) / 1600) * r.width, 2.5);
  assert.throws(() => pdfLayout({ scale: '48', unitsPerInch: 4 }), /Set the blueprint scale/);
  assert.throws(
    () => pdfLayout({ scale: '24', unitsPerInch: 0.1, calibrated: true }),
    /will not fit/,
  );
  assert.throws(
    () => pdfLayout({ scale: 'banana', unitsPerInch: 4, calibrated: true }),
    /supported/,
  );
});
test('backup validation accepts a real sample and preserves a round trip', () => {
  const source = sampleProject('original');
  const restored = validateProject(JSON.parse(JSON.stringify(source)));
  assert.equal(restored.elements.length, source.elements.length);
  assert.equal(restored.unitsPerInch, 4);
  assert.equal(restored.calibrated, true);
});
test('backup validation rejects remote/script backgrounds and invalid geometry', () => {
  for (const bg of [
    'https://example.com/track',
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz4=',
  ])
    assert.throws(() => validateProject({ ...sampleProject(), background: bg }), /embedded/);
  assert.throws(() => validateProject({ ...sampleProject(), unitsPerInch: 0 }), /measurement/);
  assert.throws(
    () =>
      validateProject({
        ...sampleProject(),
        elements: [{ id: 'a', type: 'wall', a: { x: Infinity, y: 0 }, b: { x: 1, y: 2 } }],
      }),
    /endpoints/,
  );
  assert.throws(
    () =>
      validateProject({
        ...sampleProject(),
        elements: [{ id: 'a', type: 'symbol', x: 1, y: 2, symbol: 'unknown' }],
      }),
    /fixture/,
  );
  assert.throws(
    () => validateProject({ ...sampleProject(), elements: Array(MAX_ELEMENTS + 1).fill({}) }),
    /objects/,
  );
  const p = sampleProject();
  p.elements[1].id = p.elements[0].id;
  assert.throws(() => validateProject(p), /duplicate/);
});
