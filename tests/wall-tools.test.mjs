import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeWall, wallControls, wallStyle, sampleWallStyle } from '../wall-tools.js';
import { validateProject } from '../editor-core.js';
import { sampleProject } from '../sample-project.js';

const wall = { type: 'wall', a: { x: 100, y: 100 }, b: { x: 500, y: 100 }, thicknessInches: 4.5 };
test('wall endpoint and thickness drags work independently and cannot make a zero-length wall', () => {
  assert.deepEqual(resizeWall(wall, 'b', { x: 700, y: 120 }, null, 4), { b: { x: 700, y: 120 } });
  assert.deepEqual(resizeWall(wall, 'a', wall.b, null, 4), {});
  assert.deepEqual(resizeWall(wall, 'b', { x: Infinity, y: 0 }, null, 4), {});
  assert.equal(resizeWall(wall, 'thickness', { x: 400, y: 106 }, { x: 400, y: 100 }, 4).thicknessInches, 7.5);
  assert.equal(resizeWall(wall, 'thickness', { x: 450, y: 100 }, { x: 400, y: 100 }, 4).thicknessInches, 4.5);
  assert.equal(resizeWall(wall, 'thickness', { x: 400, y: -100 }, { x: 400, y: 100 }, 4).thicknessInches, 0.25);
  const vertical = { ...wall, b: { x: 100, y: 500 } };
  assert.equal(resizeWall(vertical, 'thickness', { x: 94, y: 300 }, { x: 100, y: 300 }, 4).thicknessInches, 7.5);
});

test('wall thickness handles stay a fixed screen distance from the wall at phone and desktop zooms', () => {
  for (const scale of [0.2, 0.5, 1, 2, 5]) {
    const { middle, thickness } = wallControls(wall, 4, scale);
    assert.equal(thickness.x, middle.x);
    assert.ok(Math.abs((thickness.y - middle.y - 9) * scale - 28) < 0.001);
  }
});

function raster(inside, rgb = [130, 130, 130]) {
  const width = 201, height = 201;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    data.set([...(inside(x, y) ? rgb : [255, 255, 255]), 255], index);
  }
  return { width, height, data };
}

test('sample matching preserves gray and tinted scan ink, and estimates horizontal and vertical stroke width', () => {
  const horizontal = raster((_x, y) => y >= 82 && y < 118);
  const style = sampleWallStyle(horizontal, 100, 100, 2, 4);
  assert.equal(style.color, '#828282');
  assert.ok(Math.abs(style.thicknessInches - 4.5) <= 0.2);
  const vertical = sampleWallStyle(raster((x) => x >= 82 && x < 118, [100, 110, 130]), 100, 100, 2, 4);
  assert.equal(vertical.color, '#646e82');
  assert.ok(Math.abs(vertical.thicknessInches - 4.5) <= 0.2);
  assert.equal(sampleWallStyle(raster(() => false), 100, 100, 2, 4), null);
  const speck = (100 * horizontal.width + 100) * 4;
  horizontal.data.set([0, 0, 0, 255], speck);
  assert.equal(sampleWallStyle(horizontal, 100, 100, 2, 4).color, '#828282');
});

test('diagonal scan matching estimates the cross-section instead of the wall length', () => {
  const diagonal = raster((x, y) => Math.abs(y - x) / Math.SQRT2 <= 18, [70, 70, 70]);
  const style = sampleWallStyle(diagonal, 100, 100, 2, 4);
  assert.equal(style.color, '#464646');
  assert.ok(Math.abs(style.thicknessInches - 4.5) < 0.3);
});

test('custom wall tones survive saving and backups while unsafe paint values are rejected', () => {
  const source = sampleProject();
  source.elements[0].color = '#737b83';
  assert.equal(validateProject(JSON.parse(JSON.stringify(source))).elements[0].color, '#737b83');
  for (const value of ['url(https://example.com/track)', 'red', '#12345', 123, null]) {
    source.elements[0].color = value;
    assert.throws(() => validateProject(source), /colors/);
  }
  assert.deepEqual(wallStyle({}), { color: '#000000', thicknessInches: 4.5 });
});

test('wall thickness stays within 24 inches and 96 drawing pixels at larger scales', () => {
  const to = { x:400, y:2000 };
  const from = { x:400, y:100 };
  assert.equal(resizeWall(wall, 'thickness', to, from, 4).thicknessInches, 24);
  assert.equal(resizeWall(wall, 'thickness', to, from, 12).thicknessInches, 8);
});
