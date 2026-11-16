import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { IDBFactory, indexedDB } from 'fake-indexeddb';

const base = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await fs.mkdir(path.join(base, '.test-build'), { recursive: true });
// Unit/component environment only: PDF decoding and rasterization are platform mocks.
// This deliberately does not pretend to replace real-device PDF/browser acceptance tests.
await build({
  entryPoints: {
    editor: path.join(base, 'App.jsx'),
    marketing: path.join(base, 'Marketing.jsx'),
    root: path.join(base, 'Root.jsx'),
    account: path.join(base, 'Account.jsx'),
    auth: path.join(base, 'Auth.jsx'),
  },
  outdir: path.join(base, '.test-build'),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  loader: { '.svg': 'dataurl' },
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
dom.window.scrollTo = () => {};
dom.window.PointerEvent = class extends dom.window.MouseEvent {
  constructor(type, options = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 0;
    this.pointerType = options.pointerType ?? 'mouse';
    this.isPrimary = options.isPrimary ?? true;
  }
};
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
afterEach(cleanup);
const { default: Editor } = await import('../.test-build/editor.mjs');
const { default: Marketing, SiteHeader } = await import('../.test-build/marketing.mjs');
const { default: Root } = await import('../.test-build/root.mjs');
const { default: AccountPage } = await import('../.test-build/account.mjs');
const { SignInPage, ResetPasswordPage } = await import('../.test-build/auth.mjs');
const click = (role, name) => {
  const dialog = screen.queryByRole('dialog');
  return fireEvent.click((dialog ? within(dialog) : screen).getByRole(role, { name, exact: true }));
};
const waitSaved = () => waitFor(() => assert.ok(screen.getByText('Saved in this browser')));
const waitForUpload = () => waitFor(() =>
  assert.equal(screen.getByRole('button', { name: 'Upload a plan', exact: true }).disabled, false),
);
const svg = () => document.querySelector('.planCanvas');
const count = () =>
  Number(document.querySelector('.editorStatus span:last-child').textContent.match(/^\d+/)[0]);
function draw(x1, y1, x2, y2) {
  fireEvent.pointerDown(svg(), { button: 0, clientX: x1, clientY: y1, pointerId: 1 });
  fireEvent.pointerMove(svg(), { clientX: x2, clientY: y2, pointerId: 1 });
  fireEvent.pointerUp(svg(), { clientX: x2, clientY: y2, pointerId: 1 });
}
function tap(x, y) {
  const pointer = { button: 0, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch' };
  fireEvent.pointerDown(svg(), pointer);
  fireEvent.pointerUp(svg(), pointer);
}
async function newProject(name) {
  fireEvent.click(document.querySelector('.projectButton'));
  click('button', 'New project');
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: name } });
  click('button', 'Create project');
  await waitFor(() => assert.equal(document.querySelector('.projectButton').textContent, name));
}

test('landing and pricing explain the product and lead to the editor', async () => {
  render(React.createElement(Marketing, { page: 'home' }));
  const hero = screen.getByRole('region', { name: /Edit your current blueprint/ });
  assert.ok(within(hero).getByRole('heading', { name: /Edit your current blueprint/ }));
  assert.ok(screen.getByText(/Paste a blueprint image or upload a PDF/));
  assert.equal(
    within(hero).getByRole('link', { name: 'Edit your blueprint' }).getAttribute('href'),
    '#/editor',
  );
  assert.equal(document.querySelector('video').getAttribute('src'), '/planpatch-demo.mp4');
  assert.equal(document.querySelector('.stickyEdit').getAttribute('aria-hidden'), 'true');
  assert.ok(screen.getByRole('heading', { name: 'How it works' }));
  assert.equal(screen.queryByText('Bring your plan'), null);
  const pricing = screen.getByRole('heading', { name: 'Pay per project' });
  const comparison = screen.getByRole('heading', { name: 'See what changed' });
  assert.ok(pricing.compareDocumentPosition(comparison) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(screen.getByRole('img', { name: /the old doorway is filled.*a window is added/i }));
  assert.ok(document.querySelector('.mobileMenu .siteNav a.mobileEditorLink[href="#/editor"]'));
  const desktopNav = within(document.querySelector('.siteHeaderActions > nav'));
  assert.equal(desktopNav.queryByRole('link', { name: 'How it works' }), null);
  assert.equal(
    desktopNav.getByRole('link', { name: 'Pricing' }).getAttribute('href'),
    '#/pricing',
  );
  assert.doesNotMatch(screen.getByRole('main').textContent, /\bbeta\b/i);
  cleanup();
  render(React.createElement(Marketing, { page: 'pricing' }));
  assert.ok(screen.getByRole('heading', { name: 'Pricing', level: 1 }));
  assert.ok(screen.getByText('$10'));
  assert.ok(screen.getByText('$19'));
  assert.ok(screen.getByRole('heading', { name: 'FAQs' }));
  assert.doesNotMatch(screen.getByRole('main').textContent, /\bbeta\b/i);
  assert.equal(screen.getAllByRole('article').length, 2);
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
  click('button', 'Plan settings');
  assert.equal(screen.queryByLabelText('Show imported blueprint'), null);
  fireEvent.click(screen.getByText('Project actions'));
  click('button', 'Download backup');
  click('button', 'Close dialog');
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
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Import plan' }).disabled, false));
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
  click('button', 'Plan settings');
  fireEvent.click(screen.getByLabelText('Show imported blueprint'));
  assert.equal(svg().querySelector('image'), null);
  click('button', 'Close dialog');
  click('button', 'Undo');
  assert.ok(svg().querySelector('image'));

  click('button', 'Plan settings');
  fireEvent.click(screen.getByText('Project actions'));
  click('button', 'Clear drawing');
  click('button', 'Cancel');
  assert.equal(count(), 2);
  click('button', 'Plan settings');
  fireEvent.click(screen.getByText('Project actions'));
  click('button', 'Clear drawing');
  click('button', 'Clear drawing');
  await waitFor(() => assert.equal(count(), 0));
  click('button', 'Undo');
  assert.equal(count(), 2);
  assert.ok(svg().querySelector('image'));

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
  click('button', 'Download PDF');
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

test('phone editor reaches the core drawing tools and keeps pinch gestures in View', async () => {
  const previousMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  try {
    render(React.createElement(Editor));
    await waitSaved();
    await newProject('Phone plan');
    click('button', 'Edit');
    draw(200, 200, 600, 200);
    assert.equal(count(), 0);
    tap(200, 200);
    assert.ok(svg().querySelector('[data-wall-start]'));
    assert.ok(screen.getByText('Tap the other endpoint.'));
    assert.equal(count(), 0);
    click('button', 'Cancel');
    assert.ok(!svg().querySelector('[data-wall-start]'));
    tap(200, 200);
    tap(600, 200);
    assert.equal(count(), 1);
    assert.ok(!svg().querySelector('[data-wall-start]'));

    click('button', 'Door');
    assert.ok(screen.getByRole('dialog', { name: 'Choose a door' }));
    click('button', 'Single left');
    fireEvent.pointerDown(svg(), { button: 0, clientX: 390, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg(), { pointerId: 1 });
    assert.equal(count(), 2);
    click('button', 'Properties');
    assert.ok(screen.getByRole('dialog', { name: 'Object properties' }));
    click('button', 'Close dialog');

    click('button', 'Fixture');
    click('button', 'Shower');
    fireEvent.pointerDown(svg(), { button: 0, clientX: 500, clientY: 380, pointerId: 1 });
    fireEvent.pointerUp(svg(), { pointerId: 1 });
    assert.equal(count(), 3);

    click('button', 'View');
    fireEvent.pointerDown(svg(), {
      button: 0, clientX: 600, clientY: 400, pointerId: 2, pointerType: 'touch',
    });
    fireEvent.pointerDown(svg(), {
      button: 0, clientX: 800, clientY: 400, pointerId: 3, pointerType: 'touch',
    });
    fireEvent.pointerMove(svg(), {
      clientX: 900, clientY: 400, pointerId: 3, pointerType: 'touch',
    });
    assert.ok(screen.getByText('150%'));
    fireEvent.pointerUp(svg(), { pointerId: 2, pointerType: 'touch' });
    const canvasStyle = () => document.querySelector('.canvasChrome').style.transform;
    const afterPinch = canvasStyle();
    fireEvent.pointerMove(svg(), {
      clientX: 910, clientY: 410, pointerId: 3, pointerType: 'touch',
    });
    assert.notEqual(canvasStyle(), afterPinch);
    fireEvent.pointerUp(svg(), { pointerId: 3, pointerType: 'touch' });
    assert.equal(count(), 3);

    click('button', 'Fit');
    click('button', 'Edit');
    tap(150, 640);
    assert.ok(svg().querySelector('[data-wall-start]'));
    click('button', 'Undo');
    assert.equal(count(), 2);
    assert.equal(svg().querySelector('[data-wall-start]'), null);
    fireEvent.click(document.querySelector('.projectButton'));
    click('button', 'Redo');
    assert.equal(count(), 3);

    click('button', 'More');
    const tools = within(screen.getByRole('dialog', { name: 'More tools' }));
    assert.ok(tools.getByRole('button', { name: 'Window' }));
    assert.ok(tools.getByRole('button', { name: 'Erase background' }));
    assert.equal(tools.queryByRole('button', { name: 'Wall' }), null);
    click('button', 'Window');
    tap(310, 200);
    assert.equal(count(), 4);
    click('button', 'Measure');
    assert.ok(screen.getByRole('button', { name: 'Distance' }));

    await waitSaved();
  } finally {
    cleanup();
    window.matchMedia = previousMedia;
  }
});

test('selecting, cancelling a move, and cancelling an erase preserve redo', async () => {
  render(React.createElement(Editor));
  try {
    await waitSaved();
    await newProject('Interrupted gestures');
    click('button', 'Wall');
    draw(200, 200, 600, 200);
    draw(200, 400, 600, 400);
    click('button', 'Undo');
    assert.equal(count(), 1);
    click('button', 'Select');
    const wall = () => svg().querySelector('line[stroke="#000"]');
    const start = { button: 0, clientX: 400, clientY: 200, pointerId: 7 };
    fireEvent.pointerDown(wall(), start);
    fireEvent.pointerUp(svg(), start);
    assert.equal(screen.getByRole('button', { name: 'Redo' }).disabled, false);

    fireEvent.pointerDown(wall(), start);
    fireEvent.pointerMove(svg(), { ...start, clientY: 250 });
    assert.equal(wall().getAttribute('y1'), '250');
    fireEvent.pointerCancel(svg(), { pointerId: 7 });
    assert.equal(wall().getAttribute('y1'), '200');

    click('button', 'Erase background');
    fireEvent.pointerDown(svg(), start);
    fireEvent.pointerMove(svg(), { ...start, clientX: 450 });
    fireEvent.pointerCancel(svg(), { pointerId: 7 });
    assert.equal(count(), 1);
    click('button', 'Redo');
    assert.equal(count(), 2);

    click('button', 'Select');
    fireEvent.pointerDown(wall(), start);
    fireEvent.pointerMove(svg(), { ...start, clientY: 280 });
    fireEvent.pointerUp(svg(), { ...start, clientY: 280 });
    assert.equal(wall().getAttribute('y1'), '280');
    click('button', 'Undo');
    assert.equal(wall().getAttribute('y1'), '200');
    assert.equal(count(), 2);
    await waitSaved();
  } finally {
    cleanup();
  }
});

test('reload shortcuts leave selected objects alone and plain R rotates them', async () => {
  render(React.createElement(Editor));
  try {
    await waitSaved();
    await newProject('Keyboard controls');
    click('button', 'Sink');
    tap(400, 300);
    const rotation = () => screen.getByLabelText('Rotation (degrees)').value;
    assert.equal(rotation(), '0');
    assert.equal(fireEvent.keyDown(window, { key: 'r', ctrlKey: true }), true);
    assert.equal(fireEvent.keyDown(window, { key: 'r', metaKey: true }), true);
    assert.equal(rotation(), '0');
    fireEvent.keyDown(window, { key: 'r' });
    assert.equal(rotation(), '90');
    click('button', 'Undo');
    assert.equal(count(), 1);
    await waitSaved();
  } finally {
    cleanup();
  }
});

test('all door and fixture choices place objects and copy, delete, and undo stay consistent', async () => {
  render(React.createElement(Editor));
  await waitSaved();
  await newProject('Tool choices');
  const doors = ['Single left', 'Single right', 'Double', 'Pocket', 'Sliding', 'Bifold'];
  const fixtures = ['Toilet', 'Sink', 'Shower', 'Bathtub', 'Bed', 'Water heater', 'Washer / dryer', 'Counter', 'Stove'];
  const choices = [...doors, ...fixtures];
  for (const [index, choice] of choices.entries()) {
    click('button', choice);
    tap(180 + (index % 5) * 250, 200 + Math.floor(index / 5) * 260);
    assert.equal(count(), index + 1, choice);
  }
  fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
  fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
  assert.equal(count(), choices.length + 1);
  click('button', 'Delete selected');
  assert.equal(count(), choices.length);
  click('button', 'Undo');
  assert.equal(count(), choices.length + 1);
  click('button', 'Export');
  click('button', 'Project backup');
  const { project } = JSON.parse(await downloads.at(-1).blob.text());
  assert.equal(new Set(project.elements.map((el) => el.id)).size, choices.length + 1);
  assert.equal(project.elements.filter((el) => el.type === 'door').length, doors.length);
  assert.equal(project.elements.filter((el) => el.type === 'symbol').length, fixtures.length + 1);
  await waitSaved();
});

test('out-of-range measurements cannot make a project fail to reopen', async () => {
  render(React.createElement(Editor));
  try {
    await waitSaved();
    await newProject('Measurement limits');
    click('button', 'Wall');
    draw(200, 200, 600, 200);
    click('button', 'Select');
    const wall = svg().querySelector('line[stroke="#000"]');
    fireEvent.pointerDown(wall, { button: 0, clientX: 400, clientY: 200, pointerId: 2 });
    fireEvent.pointerUp(svg(), { pointerId: 2 });
    const length = screen.getByLabelText('Exact wall length');
    fireEvent.change(length, { target: { value: '10000000' } });
    fireEvent.blur(length);
    assert.equal(wall.getAttribute('x2'), '600');

    click('button', 'Set scale');
    tap(200, 300);
    tap(600, 300);
    click('button', 'Set real distance');
    fireEvent.change(screen.getByLabelText('Known distance'), { target: { value: '0.000001' } });
    click('button', 'Set scale');
    await screen.findByRole('dialog', { name: 'Could not set scale' });
    click('button', 'Continue');
    assert.ok(screen.getByText('Scale not calibrated'));
    await waitSaved();
    cleanup();
    render(React.createElement(Editor));
    await waitSaved();
    assert.equal(document.querySelector('.projectButton').textContent, 'Measurement limits');
    assert.equal(count(), 1);
  } finally {
    cleanup();
  }
});

test('reopening shows saved plans and uploading from the list creates a new plan', async () => {
  window.history.replaceState(null, '', '#/editor/workspace');
  render(React.createElement(Root));
  await screen.findByRole('heading', { name: 'Recent plans' });
  await waitForUpload();
  assert.ok(within(screen.getByRole('banner')).getByRole('link', { name: 'PlanPatch home' }));
  assert.equal(window.location.hash, '#/editor');
  assert.equal(screen.queryByRole('button', { name: 'Restore backup' }), null);
  assert.equal(screen.queryByRole('button', { name: 'Try a sample plan' }), null);
  assert.equal(screen.queryByRole('button', { name: 'New blank plan' }), null);
  assert.equal(screen.queryByText(/Paste a blueprint image/), null);

  fireEvent.change(document.querySelector('input[type=file]'), {
    target: { files: [new File(['test image'], 'Kitchen revision.png', { type: 'image/png' })] },
  });
  await screen.findByRole('main', { name: 'Drawing workspace' });
  assert.ok(within(screen.getByRole('banner')).getByRole('link', { name: 'PlanPatch home' }));
  click('button', 'Wall');
  draw(200, 200, 600, 200);
  assert.equal(count(), 1);
  await waitSaved();

  click('link', 'Recent plans');
  await screen.findByRole('heading', { name: 'Recent plans' });
  assert.ok(screen.getByRole('button', { name: /Kitchen revision/ }));
  const upload = () => fireEvent.change(document.querySelector('input[type=file]'), {
    target: {
      files: [{ size: 100, name: 'Garage addition.pdf', arrayBuffer: async () => new ArrayBuffer(4) }],
    },
  });
  upload();
  await screen.findByRole('dialog', { name: 'Choose a PDF page' });
  click('button', 'Cancel');
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Upload a plan' }).disabled, false));
  assert.equal(screen.queryByRole('button', { name: /Garage addition/ }), null);

  upload();
  await screen.findByRole('dialog', { name: 'Choose a PDF page' });
  fireEvent.change(screen.getByLabelText('Page number'), { target: { value: '2' } });
  click('button', 'Import page');
  await screen.findByRole('main', { name: 'Drawing workspace' });
  assert.equal(document.querySelector('.projectButton').textContent, 'Garage addition');
  assert.ok(svg().querySelector('image'));
  assert.equal(count(), 0);
  await waitSaved();
  cleanup();

  render(React.createElement(Root));
  await screen.findByRole('heading', { name: 'Recent plans' });
  assert.ok(await screen.findByRole('button', { name: /Garage addition/ }));
  fireEvent.click(screen.getByRole('button', { name: /Kitchen revision/ }));
  await screen.findByRole('main', { name: 'Drawing workspace' });
  assert.equal(count(), 1);
  assert.ok(svg().querySelector('image'));
  click('link', 'Recent plans');
  await screen.findByRole('heading', { name: 'Recent plans' });
  const image = new File(['test image'], 'image.png', { type: 'image/png' });
  fireEvent.paste(document.body, { clipboardData: { files: [image] } });
  await screen.findByRole('main', { name: 'Drawing workspace' });
  assert.equal(document.querySelector('.projectButton').textContent, 'Pasted blueprint');
  assert.ok(svg().querySelector('image'));
  assert.equal(count(), 0);
  await waitSaved();
  cleanup();
});

test('leaving Recent plans during an import keeps the destination page and allows retry', async () => {
  window.history.replaceState(null, '', '#/editor');
  render(React.createElement(Root));
  try {
    await screen.findByRole('heading', { name: 'Recent plans' });
    await waitForUpload();
    let finishReading;
    const file = {
      size: 100,
      name: 'Delayed blueprint.pdf',
      arrayBuffer: () => new Promise((resolve) => { finishReading = resolve; }),
    };
    const upload = (plan) => fireEvent.change(document.querySelector('input[type=file]'), {
      target: { files: [plan] },
    });
    const navigate = async (hash) => {
      await act(async () => {
        window.location.hash = hash;
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };
    upload(file);
    assert.equal(typeof finishReading, 'function');
    await navigate('#/pricing');
    await screen.findByRole('heading', { name: 'Pricing', level: 1 });
    await act(async () => finishReading(new ArrayBuffer(4)));
    assert.equal(window.location.hash, '#/pricing');
    assert.equal(screen.queryByRole('dialog'), null);

    await navigate('#/editor');
    await screen.findByRole('heading', { name: 'Recent plans' });
    assert.equal(screen.queryByRole('button', { name: /Delayed blueprint/ }), null);
    upload({ ...file, name: 'Retry blueprint.pdf', arrayBuffer: async () => new ArrayBuffer(4) });
    await screen.findByRole('dialog', { name: 'Choose a PDF page' });
    click('button', 'Import page');
    await screen.findByRole('main', { name: 'Drawing workspace' });
    assert.equal(document.querySelector('.projectButton').textContent, 'Retry blueprint');
    assert.ok(svg().querySelector('image'));
    await waitSaved();
  } finally {
    cleanup();
  }
});

function AccountEditor({ repository }) {
  const [showRecent, setShowRecent] = React.useState(true);
  React.useEffect(() => {
    const navigate = () => setShowRecent(window.location.hash === '#/editor');
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  return React.createElement(Editor, {
    repository,
    showRecent,
    onOpenWorkspace: () => {
      window.location.hash = '#/editor/workspace';
      setShowRecent(false);
    },
  });
}

test('recent plans lists device and account plans together, and older account plans still autosave and reopen', async () => {
  const initial = {
    id: 'account-garage', name: 'Account garage', elements: [],
    unitsPerInch: 4, background: png, showBackground: true,
    createdAt: 1700000000000, updatedAt: 1700000000000,
  };
  const rows = new Map([[initial.id, { project: initial, record: { id: initial.id, revision: 1 } }]]);
  let firstWrite = true;
  const repository = {
    list: async () => Array.from(rows.values(), ({ record, project }) => ({
      id: record.id, name: project.name, updatedAt: project.updatedAt,
    })),
    open: async (id) => structuredClone(rows.get(id)),
    async save(project, record, _saved, writeId) {
      const previous = rows.get(record.id);
      if (previous?.record.writeId === writeId) return structuredClone(previous.record);
      const next = { id: record.id, revision: record.revision + 1, writeId };
      rows.set(record.id, { project: structuredClone(project), record: next });
      if (firstWrite) {
        firstWrite = false;
        throw new Error('Connection dropped after save');
      }
      return structuredClone(next);
    },
    remove: async ({ id }) => { rows.delete(id); },
  };
  const originalDb = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  window.history.replaceState(null, '', '#/editor');
  try {
    render(React.createElement(AccountEditor, { repository }));
    await waitForUpload();
    fireEvent.change(document.querySelector('input[type=file]'), {
      target: { files: [new File(['test image'], 'Device garage.png', { type: 'image/png' })] },
    });
    await screen.findByRole('main', { name: 'Drawing workspace' });
    assert.ok(svg().querySelector('image'));
    await waitSaved();
    assert.equal(screen.queryByRole('button', { name: 'Save to account' }), null);
    assert.equal(rows.size, 1);

    click('link', 'Recent plans');
    await screen.findByRole('heading', { name: 'Recent plans' });
    const list = screen.getByRole('list');
    assert.deepEqual([...list.querySelectorAll('strong')].map((name) => name.textContent), [
      'Device garage', 'Account garage',
    ]);
    assert.equal(screen.queryByText('Saved to your account'), null);
    assert.equal(screen.queryByText('Saved in this browser'), null);
    fireEvent.click(within(list).getByRole('button', { name: /Account garage/ }));
    await screen.findByRole('main', { name: 'Drawing workspace' });
    await screen.findByText('Saved to your account', { selector: '.saveStatus' });
    click('button', 'Wall');
    draw(200, 200, 520, 200);
    const retry = await screen.findByRole('button', { name: 'Retry save' }, { timeout: 3000 });
    const savedRecord = rows.get(initial.id).record;
    fireEvent.click(retry);
    await screen.findByText('Saved to your account', { selector: '.saveStatus' });
    assert.equal(rows.get(initial.id).project.elements.length, 1);
    assert.equal(savedRecord.revision, 2);
    assert.deepEqual(rows.get(initial.id).record, savedRecord);
    cleanup();

    window.history.replaceState(null, '', '#/editor');
    render(React.createElement(AccountEditor));
    await screen.findByRole('button', { name: /Device garage/ });
    assert.equal(screen.queryByRole('button', { name: /Account garage/ }), null);
    cleanup();

    globalThis.indexedDB = new IDBFactory();
    render(React.createElement(AccountEditor, { repository }));
    const savedPlan = await screen.findByRole('button', { name: /Account garage/ });
    await waitFor(() => assert.equal(savedPlan.disabled, false));
    assert.equal(screen.queryByRole('button', { name: /Device garage/ }), null);
    fireEvent.click(savedPlan);
    await screen.findByRole('main', { name: 'Drawing workspace' });
    assert.equal(count(), 1);
    assert.ok(svg().querySelector('image'));
    fireEvent.click(document.querySelector('.projectButton'));
    click('button', 'Delete account plan');
    click('button', 'Delete plan');
    await screen.findByText('No plans yet');
    assert.equal(rows.size, 0);
  } finally {
    cleanup();
    globalThis.indexedDB = originalDb;
  }
});

test('when a newer account save exists, the editor can save local changes as a copy', async () => {
  const initial = {
    name: 'Kitchen plan', id: 'first', elements: [], unitsPerInch: 4,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  const rows = new Map([[initial.id, { project: initial, record: { id: initial.id, revision: 1 } }]]);
  const repository = {
    list: async () => Array.from(rows.values(), ({ record, project }) => ({
      id: record.id, name: project.name, updatedAt: project.updatedAt,
    })),
    open: async (id) => structuredClone(rows.get(id)),
    async save(project, record) {
      if ((rows.get(record.id)?.record.revision ?? 0) !== record.revision)
        throw Object.assign(new Error('Changed on another device'), { name: 'ProjectConflict' });
      const next = { id: record.id, revision: record.revision + 1 };
      rows.set(record.id, { project: structuredClone(project), record: next });
      return next;
    },
  };
  window.history.replaceState(null, '', '#/editor');
  render(React.createElement(AccountEditor, { repository }));
  const plan = await screen.findByRole('button', { name: /Kitchen plan/ });
  await waitFor(() => assert.equal(plan.disabled, false));
  fireEvent.click(plan);
  await screen.findByRole('main', { name: 'Drawing workspace' });

  rows.set(initial.id, {
    project: { ...initial, name: 'Edited from a phone' }, record: { id: initial.id, revision: 2 },
  });
  click('button', 'Wall');
  draw(200, 200, 600, 200);
  const saveCopy = await screen.findByRole('button', { name: 'Save a copy' }, { timeout: 3000 });
  fireEvent.click(saveCopy);
  await screen.findByRole('button', { name: 'Kitchen plan (copy)' });
  assert.equal(rows.size, 2);
  assert.equal(rows.get(initial.id).project.name, 'Edited from a phone');
  assert.equal([...rows.values()].find(({ record }) => record.id !== initial.id).project.elements.length, 1);
});

test('account settings save a trimmed display name and allow retry after a failed save', async () => {
  const requested = [];
  const user = { id: 'account-test', email: 'morgan@example.com', user_metadata: { full_name: 'Morgan Test' } };
  const account = {
    user,
    updateDisplayName: async (name) => {
      requested.push(name);
      if (requested.length === 1) throw new Error('Profile request failed');
      user.user_metadata.planpatch_display_name = name;
    },
  };
  let signedOut = false;
  const onSignOut = () => { signedOut = true; };
  const view = render(React.createElement(AccountPage, { account, onSignOut }));

  const name = screen.getByLabelText('Display name');
  const save = screen.getByRole('button', { name: 'Save changes' });
  assert.equal(name.value, 'Morgan Test');
  assert.equal(screen.getByLabelText('Email address').readOnly, true);
  assert.equal(save.disabled, true);
  fireEvent.change(name, { target: { value: '   ' } });
  assert.equal(save.disabled, true);
  fireEvent.change(name, { target: { value: '  Morgan Plans  ' } });
  fireEvent.click(save);
  await screen.findByRole('alert');
  assert.equal(name.value, '  Morgan Plans  ');
  fireEvent.click(save);
  await screen.findByText('Profile saved.');
  view.rerender(React.createElement(AccountPage, { account, onSignOut }));
  assert.equal(name.value, 'Morgan Plans');
  assert.equal(save.disabled, true);
  assert.deepEqual(requested, ['Morgan Plans', 'Morgan Plans']);
  click('button', 'Sign out');
  assert.ok(signedOut);
});

test('the billing route requires sign-in and the sandbox portal is labeled', async () => {
  const previous = window.location.href;
  window.history.replaceState(null, '', '#/account/billing');
  try {
    render(React.createElement(Root));
    await screen.findByRole('heading', { name: 'Billing', level: 1 });
    assert.ok(screen.getByRole('heading', { name: 'Sign in to continue' }));
    assert.equal(screen.queryByRole('link', { name: /billing portal/i }), null);
    cleanup();
  } finally {
    window.history.replaceState(null, '', previous);
  }

  const account = { user: { id: 'account-test' } };
  const view = render(React.createElement(AccountPage, { billing: true, account }));
  const portal = screen.getByRole('link', { name: 'Open test billing portal' });
  assert.match(portal.href, /^https:\/\/billing\.stripe\.com\/p\/login\/test_/);
  assert.equal(portal.rel, 'noopener noreferrer');
  assert.ok(screen.getByText('Test mode'));
  const sections = within(screen.getByRole('navigation', { name: 'Account' }));
  assert.deepEqual(sections.getAllByRole('link').map((link) => link.getAttribute('href')), [
    '#/account', '#/account/security', '#/account/billing',
  ]);
  assert.equal(sections.getByRole('link', { name: 'Billing' }).getAttribute('aria-current'), 'page');

  view.rerender(React.createElement(AccountPage, {
    billing: true,
    account,
    portalUrl: 'https://billing.stripe.com.example.com/p/login/invalid',
  }));
  assert.equal(screen.queryByRole('link', { name: /billing portal/i }), null);
  assert.ok(screen.getByText('Billing is currently unavailable.'));
});

test('the desktop header shows the account name, and the dropdown works in the editor', () => {
  const user = { email: 'morgan@example.test', user_metadata: { planpatch_display_name: 'Morgan Lee' } };
  const onSignOut = () => { signedOut += 1; };
  let signedOut = 0;
  const account = { signedIn: true, user, onSignOut };
  const view = render(React.createElement(SiteHeader, { page: 'account', account }));
  const header = screen.getByRole('banner');
  const nav = within(header.querySelector('.siteHeaderActions > .siteNav'));
  assert.ok(nav.getByRole('link', { name: 'Pricing' }));
  assert.ok(nav.getByRole('link', { name: 'Edit your blueprint' }));
  assert.equal(header.querySelector('.accountMenuName').textContent, 'Morgan Lee');

  view.rerender(React.createElement(SiteHeader, { page: 'workspace', account }));
  const details = header.querySelector('.accountMenu');
  assert.equal(details.querySelector('summary').getAttribute('aria-label'), 'Account menu for Morgan Lee');
  assert.equal(details.querySelector('summary .accountAvatar').textContent, 'M');
  assert.equal(within(header).queryByRole('link', { name: 'Edit your blueprint' }), null);
  fireEvent.click(details.querySelector('summary'));
  assert.equal(within(header).getByRole('link', { name: 'Profile settings' }).getAttribute('href'), '#/account');
  assert.equal(within(header).getByRole('link', { name: 'Billing & payment methods' }).getAttribute('href'), '#/account/billing');
  assert.equal(within(header).queryByRole('link', { name: 'Saved plans' }), null);
  fireEvent.click(within(header).getByRole('button', { name: 'Sign out' }));
  assert.equal(signedOut, 1);
  assert.equal(details.open, false);
});

test('public sign-in route shows account sign-in and retains guest editor access', async () => {
  const previous = window.location.href;
  window.history.replaceState(null, '', '#/sign-in');
  try {
    render(React.createElement(Root));
    await screen.findByRole('heading', { name: 'Sign in to PlanPatch', level: 1 });
    assert.ok(screen.getByText('Account sign-in is currently unavailable.'));
    assert.ok(screen.getAllByRole('link', { name: 'Edit your blueprint' })
      .some((link) => link.getAttribute('href') === '#/editor'));
  } finally {
    cleanup();
    window.history.replaceState(null, '', previous);
  }
});

test('sign-up requests verification and supports resending and password recovery', async () => {
  const account = { client: {} };
  const requested = [];
  const onAuthenticate = async (...args) => {
    requested.push(args);
    return false;
  };
  render(React.createElement(SignInPage, { account, onAuthenticate, onGoogle: async () => {} }));
  assert.ok(screen.getByRole('button', { name: 'Continue with Google' }).querySelector('svg'));

  click('button', 'Create an account');
  const email = screen.getByLabelText('Email address');
  const password = screen.getByLabelText('Password');
  fireEvent.change(email, { target: { value: 'sam@example.test' } });
  assert.equal(password.autocomplete, 'new-password');
  fireEvent.change(password, { target: { value: 'test-password-2026' } });
  click('button', 'Create account');
  await screen.findByText(/Check your inbox for a confirmation link/);
  assert.equal(screen.getByLabelText('Password').value, '');
  click('button', 'Resend confirmation');
  click('button', 'Resend confirmation');
  await screen.findByText(/Check your inbox for a confirmation link/);

  click('button', 'Forgot password?');
  assert.equal(screen.queryByLabelText('Password'), null);
  click('button', 'Send reset link');
  await screen.findByText(/If that email is registered/);
  assert.deepEqual(requested, [
    ['create', 'sam@example.test', 'test-password-2026'],
    ['resend', 'sam@example.test', ''],
    ['forgot', 'sam@example.test', ''],
  ]);
});

test('the editor sign-in dialog retries credentials and completes a valid sign-in', async () => {
  const account = { client: {} };
  let attempts = 0, completed = 0;
  const onAuthenticate = async (mode, email, password) => {
    assert.deepEqual([mode, email, password], ['signIn', 'sam@example.test', 'test-password-2026']);
    if (++attempts === 1) throw { code: 'invalid_credentials' };
    return true;
  };
  render(React.createElement(SignInPage, {
    account, onAuthenticate, onGoogle: async () => {},
    onClose: () => {}, onAuthenticated: () => { completed += 1; },
  }));

  assert.ok(screen.getByRole('dialog', { name: 'Sign in to PlanPatch' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'sam@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password-2026' } });
  click('button', 'Sign in');
  await screen.findByText('The email or password was incorrect.');
  click('button', 'Sign in');
  await waitFor(() => assert.equal(completed, 1));
});

test('password reset screens require a recovery session and matching passwords', async () => {
  const updated = [];
  const account = { user: { id: 'sandbox-user' }, completePasswordReset: async (value) => updated.push(value) };
  const view = render(React.createElement(ResetPasswordPage, { account }));
  assert.equal(screen.queryByRole('button', { name: 'Update password' }), null);
  view.rerender(React.createElement(ResetPasswordPage, { account: { ...account, recovering: true } }));
  fireEvent.change(screen.getByLabelText('New password', { exact: true }), { target: { value: 'new-horse-2026' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'wrong-horse-2026' } });
  click('button', 'Update password');
  await screen.findByText('The passwords don’t match.');
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-horse-2026' } });
  click('button', 'Update password');
  await screen.findByText('Your password was updated.');
  assert.deepEqual(updated, ['new-horse-2026']);
});

test('account security updates email through confirmation and offers a reset link', async () => {
  const requests = [];
  const account = {
    user: { id: 'sandbox-user', email: 'sam@example.test' },
    updateEmail: async (email) => requests.push(['updateEmail', email]),
    requestPasswordReset: async (email) => requests.push(['resetPassword', email]),
  };
  render(React.createElement(AccountPage, { account, security: true }));
  assert.ok(screen.getByRole('region', { name: 'Sign-in & security' }));
  fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'new@example.test' } });
  click('button', 'Send email change link');
  await screen.findByText(/confirm the change/);
  click('button', 'Send password reset link');
  await screen.findByText(/Check your current email/);
  assert.deepEqual(requests, [['updateEmail', 'new@example.test'], ['resetPassword', 'sam@example.test']]);
});

test('account deletion requires a typed confirmation from the account owner', async () => {
  const requests = [];
  const account = { user: { id: 'owner', email: 'morgan@example.test' } };
  const access = {
    data: {},
    deleteAccount: async (confirmation) => { requests.push(confirmation); },
    refresh: async () => {},
  };
  let deleted = 0;
  render(React.createElement(AccountPage, { account, access, security: true, onDeleted: () => { deleted += 1; } }));
  click('button', 'Delete account');
  const confirmation = screen.getByLabelText('Type DELETE to confirm');
  const action = screen.getByRole('button', { name: 'Permanently delete account' });
  assert.equal(action.disabled, true);
  fireEvent.change(confirmation, { target: { value: 'delete' } });
  assert.equal(action.disabled, true);
  fireEvent.change(confirmation, { target: { value: 'DELETE' } });
  assert.equal(action.disabled, false);
  fireEvent.click(action);
  await waitFor(() => assert.equal(deleted, 1));
  assert.deepEqual(requests, ['DELETE']);
});
