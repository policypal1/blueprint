import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
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

test('every fit-to-page export preserves the workspace aspect ratio and stays inside the sheet', () => {
  for (const paper of ['letter', 'tabloid', 'a3']) {
    const r = pdfLayout({ paper });
    assert.equal(r.width / r.height, 1.6);
    assert.ok(r.x >= 0.49 && r.y >= 0.49);
    assert.ok(r.x + r.width <= r.pageWidth - 0.49);
    assert.ok(r.y + r.height <= r.pageHeight - 0.49);
  }
});
test('backup validation accepts a real sample and preserves a round trip', () => {
  const source = { ...sampleProject('original'), createdAt: 100, updatedAt: 200 };
  const restored = validateProject(JSON.parse(JSON.stringify(source)));
  assert.equal(restored.elements.length, source.elements.length);
  assert.equal(restored.unitsPerInch, 4);
  assert.equal(restored.calibrated, true);
  const legacy = restored.elements.find(el => el.type === 'dimension');
  const original = source.elements.find(el => el.type === 'dimension');
  assert.deepEqual([legacy.id, legacy.a, legacy.b], [original.id, original.a, original.b]);
  assert.equal(restored.createdAt, 100);
  assert.equal(restored.updatedAt, 200);
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
