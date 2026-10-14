import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';

const base = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await fs.mkdir(path.join(base, '.test-build'), { recursive: true });
// Unit/component environment only: PDF decoding and rasterization are platform mocks.
// This deliberately does not pretend to replace real-device PDF/browser acceptance tests.
await build({
  entryPoints: [path.join(base, 'App.jsx')],
  outfile: path.join(base, '.test-build/editor.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  plugins: [
    {
      name: 'pdf-platform-mock',
      setup(b) {
        b.onResolve({ filter: /\.woff2\?url$/ }, (args) => ({
          path: args.path,
          namespace: 'font-mock',
        }));
        b.onLoad({ filter: /.*/, namespace: 'font-mock' }, () => ({
          contents: `export default 'data:font/woff2;base64,AA==';`,
          loader: 'js',
        }));
        b.onResolve({ filter: /^pdfjs-dist/ }, (args) => ({
          path: args.path,
          namespace: 'pdf-mock',
        }));
        b.onLoad({ filter: /.*/, namespace: 'pdf-mock' }, (args) => ({
          contents: args.path.includes('worker')
            ? `export default 'mock-worker';`
            : `export const GlobalWorkerOptions={}; export function getDocument(options){return globalThis.__pdfDocument(options);}`,
          loader: 'js',
        }));
      },
    },
  ],
});
await build({
  entryPoints: [path.join(base, 'Marketing.jsx')],
  outfile: path.join(base, '.test-build/marketing.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://blueprint.test',
  pretendToBeVisual: true,
});
for (const k of [
  'window',
  'document',
  'HTMLElement',
  'HTMLCanvasElement',
  'SVGElement',
  'Element',
  'Node',
  'localStorage',
  'sessionStorage',
  'XMLSerializer',
  'FormData',
  'File',
  'FileReader',
  'Event',
  'MouseEvent',
])
  globalThis[k] = dom.window[k];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.indexedDB = indexedDB;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
dom.window.PointerEvent = dom.window.MouseEvent;
dom.window.SVGElement.prototype.setPointerCapture = function () {};
dom.window.SVGElement.prototype.hasPointerCapture = function () {
  return false;
};
dom.window.SVGElement.prototype.releasePointerCapture = function () {};
dom.window.SVGElement.prototype.getBoundingClientRect = () => ({
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 1600,
  bottom: 1000,
  width: 1600,
  height: 1000,
});
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
dom.window.HTMLCanvasElement.prototype.toDataURL = () => png;
dom.window.HTMLCanvasElement.prototype.toBlob = function (cb) {
  cb(new Blob(['test'], { type: 'image/png' }));
};
const downloads = [],
  urlBlobs = new Map();
let serial = 0;
globalThis.URL.createObjectURL = (blob) => {
  const url = `blob:test-${++serial}`;
  urlBlobs.set(url, blob);
  return url;
};
globalThis.URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function () {
  downloads.push({ name: this.download, blob: urlBlobs.get(this.href) });
};
globalThis.Image = class {
  naturalWidth = 1000;
  naturalHeight = 700;
  width = 1000;
  height = 700;
  set src(v) {
    queueMicrotask(() => this.onload?.());
  }
};
let pages = [];
globalThis.__pdfDocument = () => ({
  promise: Promise.resolve({
    numPages: 3,
    getPage: async (n) => {
      pages.push(n);
      return {
        getViewport: ({ scale }) => ({ width: 1000 * scale, height: 700 * scale }),
        render: () => ({ promise: Promise.resolve() }),
      };
    },
    destroy: async () => {},
  }),
});
const React = (await import('react')).default;
const { render, fireEvent, screen, within, waitFor, act, cleanup } =
  await import('@testing-library/react');
const { default: Editor } = await import('../.test-build/editor.mjs');
const { default: Marketing } = await import('../.test-build/marketing.mjs');
const click = (role, name) => {
  const dialog = screen.queryByRole('dialog');
  return fireEvent.click((dialog ? within(dialog) : screen).getByRole(role, { name, exact: true }));
};
const waitSaved = () => waitFor(() => assert.ok(screen.getByText('Saved in this browser')));
const svg = () => document.querySelector('.planCanvas');
const count = () =>
  Number(document.querySelector('.editorStatus span:last-child').textContent.match(/^\d+/)[0]);
function draw(x1, y1, x2, y2) {
  fireEvent.pointerDown(svg(), { button: 0, clientX: x1, clientY: y1, pointerId: 1 });
  fireEvent.pointerMove(svg(), { clientX: x2, clientY: y2, pointerId: 1 });
  fireEvent.pointerUp(svg(), { clientX: x2, clientY: y2, pointerId: 1 });
}
async function newProject(name) {
  fireEvent.click(document.querySelector('.projectButton'));
  click('button', 'New project');
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: name } });
  click('button', 'Create project');
  await waitFor(() => assert.equal(document.querySelector('.projectButton').textContent, name));
}

test('landing and pricing explain the product, show the comparison, and lead to the open editor', async () => {
  render(React.createElement(Marketing, { page: 'home' }));
  assert.ok(screen.getByRole('heading', { name: /Update the plan/ }));
  assert.equal(
    screen.getByRole('link', { name: 'Access blueprint editor' }).getAttribute('href'),
    '#/editor',
  );
  click('button', 'Before');
  assert.ok(screen.getByRole('img', { name: /original primary suite/ }));
  click('button', 'After');
  assert.ok(screen.getByRole('img', { name: /revised primary suite/ }));
  cleanup();
  render(React.createElement(Marketing, { page: 'pricing' }));
  assert.ok(screen.getByText('$15'));
  assert.ok(screen.getByText('$29'));
  assert.ok(screen.getByText('The editor is free during beta.'));
  assert.equal(screen.getAllByRole('link', { name: 'Try the editor free' }).length, 2);
  assert.equal(
    document.querySelectorAll('input[type=password],input[autocomplete=cc-number]').length,
    0,
  );
  cleanup();
});

test('editor regression: draw, undo, property changes, switching, restore, PDF page import, export and reload', async () => {
  render(React.createElement(Editor));
  await waitSaved();
  assert.equal(count(), 0);
  click('button', 'Try a sample plan');
  assert.equal(count(), 20);
  // Make a new project and draw from a blank canvas using actual React event handlers.
  await newProject('Regression A');
  click('button', 'Wall');
  draw(200, 200, 600, 200);
  assert.equal(count(), 1);
  click('button', 'Undo');
  assert.equal(count(), 0);
  click('button', 'Redo');
  assert.equal(count(), 1);
  // Pointer-down selects a wall; properties persist as an undoable transaction.
  click('button', 'Select');
  const wall = svg().querySelector('line[stroke="#000"]');
  fireEvent.pointerDown(wall, { button: 0, clientX: 400, clientY: 200, pointerId: 2 });
  fireEvent.pointerUp(svg(), { pointerId: 2 });
  const thickness = screen.getByLabelText('Wall thickness (inches)');
  fireEvent.change(thickness, { target: { value: '8' } });
  fireEvent.blur(thickness);
  assert.equal(svg().querySelector('line[stroke="#000"]').getAttribute('stroke-width'), '32');
  click('button', 'Undo');
  assert.equal(svg().querySelector('line[stroke="#000"]').getAttribute('stroke-width'), '18');
  // A persistent dimension appears in the output geometry.
  click('button', 'Dimension');
  draw(200, 150, 600, 150);
  assert.equal(count(), 2);
  assert.ok(svg().textContent.includes(`8' 4"`));
  // Switch before the debounced disk write; recent edits must remain.
  await newProject('Regression B');
  click('button', 'Line');
  draw(400, 400, 800, 400);
  assert.equal(count(), 1);
  fireEvent.click(document.querySelector('.projectButton'));
  click('button', 'Regression A');
  assert.equal(count(), 2);
  click('button', 'Download backup');
  assert.ok(downloads.at(-1).name.endsWith('.blueprint.json'));
  const backup = JSON.parse(await downloads.at(-1).blob.text());
  assert.equal(backup.project.elements.length, 2);
  // Invalid external image references are rejected, without changing the drawing.
  const bad = {
    ...backup,
    project: { ...backup.project, background: 'https://example.com/tracking.png' },
  };
  const inputs = document.querySelectorAll('input[type=file]');
  fireEvent.change(inputs[1], {
    target: { files: [{ size: 100, text: async () => JSON.stringify(bad) }] },
  });
  await screen.findByRole('dialog', { name: 'Could not restore project' });
  click('button', 'Continue');
  assert.equal(count(), 2);
  // Restoring creates a new project rather than overwriting the original.
  fireEvent.change(inputs[1], {
    target: { files: [{ size: 100, text: async () => JSON.stringify(backup) }] },
  });
  await waitFor(() =>
    assert.equal(document.querySelector('.projectButton').textContent, 'Regression A (restored)'),
  );
  assert.equal(count(), 2);
  // PDF import lets users choose a page. Original files never get modified.
  fireEvent.change(document.querySelector('input[type=file]'), {
    target: {
      files: [{ size: 100, name: 'plan.pdf', arrayBuffer: async () => new ArrayBuffer(4) }],
    },
  });
  await screen.findByRole('dialog', { name: 'Replace the background?' });
  click('button', 'Import plan');
  await screen.findByRole('dialog', { name: 'Choose a PDF page' });
  fireEvent.change(screen.getByLabelText('Page number'), { target: { value: '2' } });
  click('button', 'Import page');
  await waitFor(() => assert.ok(svg().querySelector('image')));
  assert.deepEqual(pages, [2]);
  assert.equal(count(), 2);
  // Exact scale requires a known distance, then changes the printed measurements.
  fireEvent.pointerDown(svg(), { button: 0, clientX: 200, clientY: 200, pointerId: 5 });
  fireEvent.pointerUp(svg(), { pointerId: 5 });
  fireEvent.pointerDown(svg(), { button: 0, clientX: 600, clientY: 200, pointerId: 5 });
  fireEvent.pointerUp(svg(), { pointerId: 5 });
  click('button', 'Set real distance');
  await screen.findByRole('dialog', { name: 'Set blueprint scale' });
  fireEvent.change(screen.getByLabelText('Known distance'), { target: { value: '100' } });
  click('button', 'Set scale');
  await waitFor(() => assert.ok(screen.getByText('Scale calibrated')));
  click('button', 'Toggle grid');
  assert.ok(svg().querySelector('[data-editor-only]'));
  click('button', 'Export');
  click('button', 'PNG image');
  await waitFor(() => assert.ok(downloads.some((d) => d.name.endsWith('.png'))));
  const svgBlob = [...urlBlobs.values()]
    .filter((b) => b.type === 'image/svg+xml;charset=utf-8')
    .at(-1);
  assert.ok(svgBlob);
  assert.ok(!(await svgBlob.text()).includes('data-editor-only'));
  assert.ok((await svgBlob.text()).includes('@font-face'));
  click('button', 'Export');
  click('button', 'Export PDF');
  await waitFor(() => assert.ok(downloads.some((d) => d.name.endsWith('.pdf'))));
  const pdfDownload = downloads.find((d) => d.name.endsWith('.pdf'));
  assert.ok((await pdfDownload.blob.text()).startsWith('%PDF-'));
  await waitSaved();
  cleanup();
  render(React.createElement(Editor));
  await waitSaved();
  assert.equal(document.querySelector('.projectButton').textContent, 'Regression A (restored)');
  assert.equal(count(), 2);
  assert.ok(svg().querySelector('image'));
  cleanup();
});
