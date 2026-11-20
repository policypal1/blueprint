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
    trial: path.join(base, 'Trial.jsx'),
    editorGuide: path.join(base, 'EditorGuide.jsx'),
    trialStatus: path.join(base, 'TrialStatus.jsx'),
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
const { default: TrialPage } = await import('../.test-build/trial.mjs');
const { default: EditorGuide } = await import('../.test-build/editorGuide.mjs');
const { default: TrialStatus } = await import('../.test-build/trialStatus.mjs');
function Walkthrough() {
  const [step, onStep] = React.useState(0);
  const [open, setOpen] = React.useState(true);
  return open ? React.createElement(EditorGuide, { mode: 'walkthrough', inEditor: true, step, onStep, onClose: () => setOpen(false) }) : null;
}
const { canOpenEditor, fullEditorAccess, trialTimeLeft } = await import('../access.js');
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

test('trial countdown ticks each second and catches up after a background pause', () => {
  const realNow = Date.now;
  const realInterval = window.setInterval;
  const realClear = window.clearInterval;
  let now = Date.parse('2026-11-20T00:00:00Z');
  let tick;
  Date.now = () => now;
  window.setInterval = (callback, delay) => { assert.equal(delay, 1000); tick = callback; return 987654; };
  window.clearInterval = () => {};
  try {
    render(React.createElement(TrialStatus, { expiresAt: '2026-11-20T03:28:05Z' }));
    assert.equal(screen.getByRole('timer').textContent, '03:28:05');
    now += 1000;
    act(tick);
    assert.equal(screen.getByRole('timer').textContent, '03:28:04');
    now += 65_000;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(screen.getByRole('timer').textContent, '03:26:59');
    now = Date.parse('2026-11-20T03:28:05Z');
    act(tick);
    assert.equal(screen.queryByRole('timer'), null);
  } finally {
    cleanup(); Date.now = realNow; window.setInterval = realInterval; window.clearInterval = realClear;
  }
});

test('live billing uses live consent and keeps purchases disabled during Stripe review', async () => {
  const { LIVE_MONTHLY_VERSION, LIVE_MONTHLY_DISCLOSURE } = await import('../supabase/functions/planpatch-account/monthly-offer.js');
  const calls = [];
  const account = { user: { id: 'live-billing-ui' } };
  const access = { data: { billingMode: 'live', checkoutReady: false, activationPending: true,
    billingAvailable: true, monthlyOfferVersion: LIVE_MONTHLY_VERSION }, refresh: async () => {}, checkout: async (...args) => calls.push(args) };
  const view = render(React.createElement(AccountPage, { account, access: { ...access, data: null, loading: true }, billing: true }));
  assert.equal(screen.queryByRole('link', { name: 'Open test billing portal' }), null);
  assert.equal(screen.queryByRole('button', { name: 'Start test subscription' }), null);
  view.rerender(React.createElement(AccountPage, { account, access, billing: true }));
  assert.equal(screen.queryByText('Payments are awaiting Stripe activation.'), null);
  assert.equal(screen.queryByText('Live billing'), null);
  assert.equal(screen.queryByText('Billing support', { exact: true }), null);
  assert.equal(screen.queryByRole('button', { name: 'Refresh access' }), null);
  assert.equal(screen.getByRole('button', { name: 'Buy a project credit' }).disabled, true);
  assert.equal(screen.queryByRole('link', { name: 'Open test billing portal' }), null);
  access.data.checkoutReady = true;
  view.rerender(React.createElement(AccountPage, { account, access, billing: true }));
  const [terms, renewal] = screen.getAllByRole('checkbox');
  assert.equal(renewal.labels[0].textContent, LIVE_MONTHLY_DISCLOSURE);
  fireEvent.click(terms); fireEvent.click(renewal);
  click('button', 'Start subscription');
  await waitFor(() => assert.equal(calls.length, 1));
  assert.deepEqual(calls[0][2], { accepted: true, version: LIVE_MONTHLY_VERSION });
});

test('a Stripe return rechecks access automatically until the delayed webhook can be observed', () => {
  const previous = window.location.href;
  const schedule = window.setTimeout;
  const cancel = window.clearTimeout;
  const pending = new Map();
  let refreshed = 0;
  try {
    window.history.replaceState(null, '', '/?checkout=returned#/account/billing');
    window.setTimeout = (fn, delay) => { pending.set(delay, fn); return delay; };
    window.clearTimeout = (key) => pending.delete(key);
    const view = render(React.createElement(AccountPage, {
      account: { user: { id: 'returning-customer' } }, billing: true,
      access: { data: { billingMode: 'live', paymentsRequired: true }, refresh: () => refreshed++ },
    }));
    assert.match(screen.getByRole('status').textContent, /updates automatically/);
    assert.ok(pending.size > 0);
    act([...pending.values()][0]);
    assert.equal(refreshed, 1);
    view.unmount();
    assert.equal(pending.size, 0);
  } finally {
    window.setTimeout = schedule;
    window.clearTimeout = cancel;
    window.history.replaceState(null, '', previous);
  }
});

test('landing and pricing explain the product and lead to the editor', async () => {
  render(React.createElement(Marketing, { page: 'home' }));
  const hero = screen.getByRole('region', { name: /Edit your existing floor plan/ });
  assert.ok(within(hero).getByRole('heading', { name: /Edit your existing floor plan/ }));
  assert.ok(screen.getByText(/Upload a PDF or image, mark up walls/));
  assert.equal(within(hero).getAllByRole('link').length, 1);
  assert.equal(
    within(hero).getByRole('link', { name: 'Open editor' }).getAttribute('href'),
    '/#/editor',
  );
  assert.equal(document.querySelector('video').getAttribute('src'), '/planpatch-demo.mp4');
  assert.equal(document.querySelector('.stickyEdit').getAttribute('aria-hidden'), 'true');
  assert.ok(screen.getByRole('heading', { name: 'How it works' }));
  assert.equal(screen.queryByText('Bring your plan'), null);
  const pricing = screen.getByRole('heading', { name: 'One project or monthly access' });
  const comparison = screen.getByRole('heading', { name: 'See what changed' });
  assert.ok(comparison.compareDocumentPosition(pricing) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(screen.getByRole('img', { name: /the old doorway is filled.*a window is added/i }));
  assert.ok(document.querySelector('.mobileMenu .siteNav a.navEditorLink[href="/#/editor"]'));
  const desktopNav = within(document.querySelector('.siteHeaderActions > nav'));
  assert.equal(desktopNav.queryByRole('link', { name: 'How it works' }), null);
  assert.equal(
    desktopNav.getByRole('link', { name: 'Pricing' }).getAttribute('href'),
    '/pricing',
  );
  assert.doesNotMatch(screen.getByRole('main').textContent, /\bbeta\b/i);
  cleanup();
  render(React.createElement(Marketing, { page: 'pricing' }));
  assert.ok(screen.getByRole('heading', { name: 'Pricing', level: 1 }));
  assert.ok(screen.getByText('$10'));
  assert.ok(screen.getByText('$19'));
  assert.equal(screen.getByRole('link', { name: 'Buy single project' }).getAttribute('href'), '/?plan=project#/account/billing');
  assert.equal(screen.getByRole('link', { name: 'Get monthly access' }).getAttribute('href'), '/?plan=monthly#/account/billing');
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
  assert.ok(screen.getByRole('heading', { name: 'Start with a plan' }));
  assert.ok(screen.getByRole('button', { name: 'Upload', exact: true }));
  assert.equal(screen.queryByText('Open a PDF or a photo of the drawing.'), null);
  fireEvent.click(document.querySelector('.projectButton'));
  click('button', 'Open sample project');
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
  click('button', 'More tools');
  click('button', 'Dimension');
  draw(200, 150, 600, 150);
  assert.equal(count(), 2);
  assert.ok(svg().textContent.includes(`8' 4"`));
  // Switch before the debounced disk write; recent edits must remain.
  await newProject('Regression B');
  click('button', 'More tools');
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
  await waitFor(() => assert.equal(document.querySelector('.projectButton').disabled, false));
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
  click('button', 'Set scale');
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

    click('button', 'More');
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
    assert.equal(tools.queryByRole('button', { name: 'Wall' }), null);
    click('button', 'Window');
    tap(310, 200);
    assert.equal(count(), 4);
    click('button', 'Clean up');
    const cleanupDialog = within(screen.getByRole('dialog', { name: 'Clean up' }));
    assert.ok(cleanupDialog.getByRole('button', { name: 'Rectangle' }));
    assert.ok(cleanupDialog.getByRole('button', { name: 'Brush eraser' }));
    click('button', 'Close dialog');
    click('button', 'Measure');
    assert.ok(screen.getByRole('button', { name: 'Distance' }));

    await waitSaved();
  } finally {
    cleanup();
    window.matchMedia = previousMedia;
  }
});

test('wall endpoints and width resize by touch with one undo per drag', async () => {
  render(React.createElement(Editor));
  await waitSaved(); await newProject('Touch wall resizing');
  click('button', 'Wall'); draw(200, 200, 600, 200); click('button', 'Select');
  const wall = svg().querySelector('line[stroke="#000"]');
  fireEvent.pointerDown(wall, { button: 0, clientX: 400, clientY: 200, pointerId: 41 });
  fireEvent.pointerUp(svg(), { clientX: 400, clientY: 200, pointerId: 41 });
  const end = screen.getByRole('button', { name: 'Resize wall end' });
  const pointer = { button: 0, pointerId: 42, pointerType: 'touch' };
  fireEvent.pointerDown(end, { ...pointer, clientX: 600, clientY: 200 });
  fireEvent.pointerMove(svg(), { ...pointer, clientX: 800, clientY: 200 });
  fireEvent.pointerUp(svg(), { ...pointer, clientX: 800, clientY: 200 });
  assert.equal(wall.getAttribute('x2'), '800');
  const width = screen.getByRole('button', { name: 'Resize wall thickness' });
  const x = Number(width.getAttribute('cx')), y = Number(width.getAttribute('cy'));
  fireEvent.pointerDown(width, { ...pointer, clientX: x, clientY: y });
  fireEvent.pointerMove(svg(), { ...pointer, clientX: x, clientY: y + 6 });
  fireEvent.pointerUp(svg(), { ...pointer, clientX: x, clientY: y + 6 });
  assert.equal(screen.getByLabelText('Wall thickness (inches)').value, '7.5');
  assert.equal(wall.getAttribute('stroke-width'), '30');
  click('button', 'Undo');
  assert.equal(svg().querySelector('line[stroke="#000"]').getAttribute('stroke-width'), '18');
  assert.equal(svg().querySelector('line[stroke="#000"]').getAttribute('x2'), '800');
  click('button', 'Undo');
  assert.equal(svg().querySelector('line[stroke="#000"]').getAttribute('x2'), '600');
  await waitSaved();
});

test('wall colors persist, new walls inherit the chosen style and matching is undoable', async () => {
  render(React.createElement(Editor));
  await waitSaved(); await newProject('Wall appearance matching');
  click('button', 'Wall'); draw(200, 200, 600, 200); click('button', 'Select');
  const first = svg().querySelector('line[stroke="#000"]');
  const select = (node, y) => {
    fireEvent.pointerDown(node, { button: 0, clientX: 400, clientY: y, pointerId: 43 });
    fireEvent.pointerUp(svg(), { clientX: 400, clientY: y, pointerId: 43 });
  };
  select(first, 200);
  fireEvent.input(screen.getByLabelText('Wall color'), { target: { value: '#777777' } });
  fireEvent.change(screen.getByLabelText('Wall thickness (inches)'), { target: { value: '6' } });
  fireEvent.blur(screen.getByLabelText('Wall thickness (inches)'));
  click('button', 'Wall'); draw(200, 400, 600, 400); click('button', 'Select');
  const walls = svg().querySelectorAll('line[stroke="#777777"]');
  assert.equal(walls.length, 2);
  assert.equal(walls[1].getAttribute('stroke-width'), '24');
  select(walls[1], 400);
  fireEvent.change(screen.getByLabelText('Wall color'), { target: { value: '#222222' } });
  fireEvent.change(screen.getByLabelText('Wall thickness (inches)'), { target: { value: '2' } });
  fireEvent.blur(screen.getByLabelText('Wall thickness (inches)'));
  click('button', 'Match another wall');
  select(first, 200);
  await waitFor(() => assert.equal(screen.getByLabelText('Wall color').value, '#777777'));
  assert.equal(screen.getByLabelText('Wall thickness (inches)').value, '6');
  click('button', 'Undo');
  assert.ok(svg().querySelector('line[stroke="#222222"][stroke-width="8"]'));
  await waitSaved(); cleanup(); render(React.createElement(Editor)); await waitSaved();
  assert.ok(svg().querySelector('line[stroke="#777777"][stroke-width="24"]'));
  assert.ok(svg().querySelector('line[stroke="#222222"][stroke-width="8"]'));
});

test('phone users can pan past a wall, tap it to select, and zoom directly to 500 percent', async () => {
  const previousMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  try {
    render(React.createElement(Editor)); await waitSaved(); await newProject('Phone selection and zoom');
    click('button', 'Edit'); tap(200, 200); tap(600, 200); click('button', 'View');
    const wall = svg().querySelector('.wallTouchTarget');
    const pointer = { button: 0, pointerId: 44, pointerType: 'touch' };
    fireEvent.pointerDown(wall, { ...pointer, clientX: 400, clientY: 200 });
    fireEvent.pointerMove(svg(), { ...pointer, clientX: 450, clientY: 230 });
    fireEvent.pointerUp(svg(), { ...pointer, clientX: 450, clientY: 230 });
    assert.equal(screen.queryByRole('button', { name: 'Resize wall end' }), null);
    assert.equal(screen.getByRole('button', { name: 'Pan', exact: true }).getAttribute('aria-pressed'), 'true');
    fireEvent.pointerDown(wall, { ...pointer, clientX: 400, clientY: 200 });
    fireEvent.pointerUp(svg(), { ...pointer, clientX: 400, clientY: 200 });
    assert.ok(screen.getByRole('button', { name: 'Resize wall end' }));
    assert.equal(screen.getByRole('button', { name: 'Select', exact: true }).getAttribute('aria-pressed'), 'true');
    fireEvent.change(screen.getByLabelText('Zoom level'), { target: { value: '500' } });
    assert.match(document.querySelector('.canvasChrome').style.transform, /scale\(5\)/);
    assert.equal(screen.getByRole('button', { name: 'Zoom in' }).disabled, true);
    click('button', 'Fit'); assert.equal(screen.getByLabelText('Zoom level').value, '100');
    await waitSaved();
  } finally { cleanup(); window.matchMedia = previousMedia; }
});

test('the desktop tip returns on a new mobile editor visit unless opted out', async () => {
  const previousMedia = window.matchMedia;
  const key = 'editfloorplans-hide-desktop-tip';
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  const editor = (props) => React.createElement(Editor, { showMobileTip: true, showRecent: true, ...props });
  const tip = { name: 'Best on desktop' };
  try {
    const view = render(editor());
    await screen.findByRole('dialog', tip);
    click('button', 'Continue on phone');
    view.rerender(editor({ showRecent: false }));
    assert.equal(screen.queryByRole('dialog', tip), null);
    assert.equal(localStorage.getItem(key), null);

    view.rerender(editor({ active: false }));
    view.rerender(editor({ active: true }));
    await screen.findByRole('dialog', tip);
    click('button', 'Don’t show again');
    view.unmount();
    render(editor());
    await waitForUpload();
    assert.equal(screen.queryByRole('dialog', tip), null);
    assert.equal(localStorage.getItem(key), '1');
  } finally {
    window.matchMedia = previousMedia;
    localStorage.removeItem(key);
  }
});

test('the walkthrough opens once and the complete editor guide stays available', async () => {
  const owner = 'walkthrough-test-user';
  const editor = (props) => React.createElement(Editor, { owner, showFirstUseGuide: true, ...props });
  const walkthrough = { name: 'Editor walkthrough' };
  try {
    const view = render(editor({ showRecent: true }));
    await waitForUpload();
    assert.equal(screen.queryByRole('dialog', walkthrough), null);
    view.rerender(editor({ showRecent: false }));
    await screen.findByRole('dialog', walkthrough);
    assert.ok(screen.getByText('Step 1 of 10'));
    click('button', 'Try Pan');
    assert.equal(screen.queryByRole('dialog', walkthrough), null);
    assert.equal(screen.getByRole('button', { name: 'Pan', exact: true }).getAttribute('aria-pressed'), 'true');
    click('button', 'Resume walkthrough');
    assert.ok(screen.getByText('Step 1 of 10'));
    for (let step = 2; step <= 10; step++) {
      click('button', 'Next');
      assert.ok(screen.getByText(`Step ${step} of 10`));
    }
    assert.ok(within(screen.getByRole('dialog', walkthrough)).getByRole('heading', { name: 'Export your plan' }));
    click('button', 'Finish');
    view.unmount();
    render(editor({ showRecent: false }));
    await waitSaved();
    assert.equal(screen.queryByRole('dialog', walkthrough), null);
    click('button', 'Editor guide');
    assert.ok(screen.getByRole('dialog', walkthrough));
    assert.ok(document.querySelector('.inEditorWalkthrough .sampleDemoCursor'));
    click('button', 'Tool reference');
    assert.ok(screen.getByRole('dialog', { name: 'Editor guide' }));
    click('button', 'Replay walkthrough');
    assert.ok(screen.getByRole('dialog', walkthrough));
    assert.ok(screen.getByText('Step 1 of 10'));
  } finally {
    localStorage.removeItem(`editfloorplans-editor-guide:${owner}`);
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

    click('button', 'Clean up');
    click('button', 'Brush eraser');
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

test('the brush deletes touched walls and masks the imported sheet, and undo restores both', async () => {
  render(React.createElement(Editor));
  await waitSaved();
  await newProject('Brush cleanup');
  fireEvent.change(document.querySelector('input[type=file]'), {
    target: { files: [new File(['floor plan'], 'brush-plan.png', { type: 'image/png' })] },
  });
  await waitFor(() => assert.ok(svg().querySelector('image')));
  click('button', 'Wall');
  draw(200, 200, 800, 200);
  draw(200, 500, 800, 500);
  assert.equal(count(), 2);

  click('button', 'Clean up');
  fireEvent.change(screen.getByRole('slider', { name: 'Brush size' }), { target: { value: '20' } });
  click('button', 'Brush eraser');
  draw(500, 80, 500, 300);
  assert.equal(count(), 1);
  assert.equal(svg().querySelector('line[stroke="#000"]').getAttribute('y1'), '500');
  const background = () => svg().querySelector('image');
  const stroke = () => svg().querySelector('mask path');
  assert.equal(background().getAttribute('mask'), 'url(#blueprintBackgroundMask)');
  assert.equal(stroke().getAttribute('stroke'), 'black');
  assert.equal(stroke().getAttribute('stroke-width'), '20');

  click('button', 'Undo');
  assert.equal(count(), 2);
  assert.equal(background().getAttribute('mask'), null);
  click('button', 'Redo');
  assert.equal(count(), 1);
  assert.ok(stroke());
  click('button', 'Export');
  click('button', 'PNG image');
  await waitFor(() => assert.ok(downloads.some((item) => item.name === 'brush-cleanup.png')));
  const exportedSVG = [...urlBlobs.values()].filter((blob) => blob.type.startsWith('image/svg+xml')).at(-1);
  assert.match(await exportedSVG.text(), /mask="url\(#blueprintBackgroundMask\)"/);
});

test('reload shortcuts leave selected objects alone and plain R rotates them', async () => {
  render(React.createElement(Editor));
  try {
    await waitSaved();
    await newProject('Keyboard controls');
    click('button', 'More tools');
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
    click('button', index < doors.length ? 'Door' : 'More tools');
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
  const exports = within(screen.getByRole('dialog', { name: 'Export plan' }));
  assert.ok(exports.getByRole('button', { name: 'Download PDF' }));
  assert.ok(exports.getByRole('button', { name: 'PNG image' }));
  assert.equal(exports.queryByRole('button', { name: 'Project backup' }), null);
  click('button', 'Close dialog');
  click('button', 'Plan settings');
  fireEvent.click(screen.getByText('Project actions', { exact: true }));
  click('button', 'Download backup');
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

test('reopening shows saved plans and uploading from the list creates a new plan', async (t) => {
  localStorage.setItem('editfloorplans-editor-guide', '1');
  t.after(() => localStorage.removeItem('editfloorplans-editor-guide'));
  window.history.replaceState(null, '', '#/editor/workspace');
  render(React.createElement(Root));
  await screen.findByRole('heading', { name: 'Recent plans' });
  await waitForUpload();
  assert.ok(within(screen.getByRole('banner')).getByRole('link', { name: 'editfloorplans.com home' }));
  assert.equal(window.location.hash, '#/editor');
  assert.equal(screen.queryByRole('button', { name: 'Restore backup' }), null);
  assert.equal(screen.queryByRole('button', { name: 'Try a sample plan' }), null);
  assert.equal(screen.queryByRole('button', { name: 'New blank plan' }), null);
  assert.equal(screen.queryByText(/Paste a blueprint image/), null);

  fireEvent.change(document.querySelector('input[type=file]'), {
    target: { files: [new File(['test image'], 'Kitchen revision.png', { type: 'image/png' })] },
  });
  await screen.findByRole('main', { name: 'Drawing workspace' });
  assert.equal(screen.queryByRole('banner'), null);
  click('button', 'Wall');
  draw(200, 200, 600, 200);
  assert.equal(count(), 1);
  await waitSaved();

  click('link', 'Back to plans');
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
  click('link', 'Back to plans');
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

function AccountEditor({ repository, owner = repository ? 'editor-test-owner' : undefined, ...props }) {
  const [showRecent, setShowRecent] = React.useState(true);
  React.useEffect(() => {
    const navigate = () => setShowRecent(window.location.hash === '#/editor');
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  return React.createElement(Editor, {
    repository,
    owner,
    ...props,
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

    click('link', 'Back to plans');
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
    render(React.createElement(AccountEditor, { owner: 'second-account' }));
    await waitForUpload();
    assert.equal(screen.queryByRole('button', { name: /Device garage/ }), null);
    assert.equal(screen.queryByRole('button', { name: /Account garage/ }), null);
    cleanup();

    render(React.createElement(AccountEditor, { repository }));
    await screen.findByRole('button', { name: /Device garage/ });
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

test('a credit-locked project keeps its blueprint when cleared and has no replace action', async () => {
  const project = {
    name: 'Locked original', id: 'locked', elements: [], unitsPerInch: 4,
    background: png, showBackground: true, createdAt: Date.now(), updatedAt: Date.now(),
  };
  const repository = {
    list: async () => [project],
    open: async () => ({ project, record: { id: project.id, revision: 1 } }),
  };
  window.history.replaceState(null, '', '#/editor');
  render(React.createElement(AccountEditor, { repository, lockedProjectIds: [project.id] }));
  const plan = await screen.findByRole('button', { name: /Locked original/ });
  await waitFor(() => assert.equal(plan.disabled, false));
  fireEvent.click(plan);
  await screen.findByRole('main', { name: 'Drawing workspace' });
  assert.ok(svg().querySelector('image'));
  assert.equal(screen.queryByRole('button', { name: 'Import plan' }), null);
  click('button', 'Wall');
  draw(300, 300, 600, 300);
  click('button', 'Plan settings');
  fireEvent.click(screen.getByText('Project actions', { exact: true }));
  click('button', 'Clear edits');
  click('button', 'Clear edits');
  await waitFor(() => assert.equal(count(), 0));
  assert.ok(svg().querySelector('image'));
});

test('the editor walkthrough plays edits, pauses and advances without changing saved drawings', () => {
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  const pending = new Map();
  let nextId = 100000;
  window.setTimeout = (callback, delay, ...args) => {
    if (![1300, 6500].includes(delay)) return originalSetTimeout(callback, delay, ...args);
    const id = nextId++;
    pending.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = (id) => pending.delete(id) || originalClearTimeout(id);
  const tick = (delay) => {
    const timer = [...pending.entries()].find(([, entry]) => entry.delay === delay);
    assert.ok(timer, `expected a ${delay} ms playback timer`);
    pending.delete(timer[0]);
    act(() => timer[1].callback());
  };
  const saved = { ...localStorage };
  try {
    render(React.createElement(Walkthrough));
    assert.ok(screen.getByRole('dialog', { name: 'Editor walkthrough' }));
    click('button', 'Next');
    assert.ok(screen.getByText('Step 2 of 10'));
    assert.equal(screen.getByLabelText('Wall thickness (inches)').value, '4.5');
    tick(1300);
    tick(1300);
    assert.equal(screen.getByLabelText('Wall thickness (inches)').value, '6');
    assert.equal(document.querySelectorAll('.sampleEditor').length, 1);
    assert.ok(document.querySelector('.sampleDrawing line[stroke-width="24"]'));
    click('button', 'Pause walkthrough');
    assert.equal(pending.size, 0);
    click('button', 'Play walkthrough');
    tick(6500);
    assert.ok(screen.getByText('Step 3 of 10'));
    assert.equal(document.querySelectorAll('.sampleEditor').length, 1);
    click('button', 'Close dialog');
    assert.equal(pending.size, 0);
    assert.deepEqual({ ...localStorage }, saved);
  } finally {
    cleanup();
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
  }
});

test('reduced-motion visitors control sample playback and pricing keeps billing in the account menu', () => {
  const previousMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  try {
    const view = render(React.createElement(Walkthrough));
    assert.ok(screen.getByRole('button', { name: 'Play walkthrough' }));
    assert.equal(screen.queryByRole('button', { name: 'Pause walkthrough' }), null);
    click('button', 'Next');
    assert.ok(screen.getByText('Step 2 of 10'));
    view.unmount();
    render(React.createElement(Marketing, { page: 'pricing', trialOffer: true, account: { signedIn: true, user: { email: 'demo@example.test' } } }));
    assert.equal(screen.queryByRole('link', { name: 'View billing' }), null);
    assert.doesNotMatch(screen.getByRole('main').textContent, /free trial|no credit card needed/i);
    assert.equal(screen.queryByRole('link', { name: 'Start 3-day free trial' }), null);
    assert.ok(document.querySelector('.accountMenuLinks a[href="#/account/billing"]'));
  } finally {
    cleanup();
    window.matchMedia = previousMedia;
  }
});

test('guest landing opens the editor and exposes the same policy links in the mobile footer', () => {
  const view = render(React.createElement(Marketing, { page: 'home', trialOffer: true }));
  const hero = within(screen.getByRole('region', { name: /Edit your existing floor plan/ }));
  assert.equal(hero.getByRole('link', { name: 'Open editor' }).getAttribute('href'), '/#/editor');
  assert.ok(hero.getByText('No credit card needed', { exact: true }).classList.contains('trialNoCard'));
  assert.equal(hero.queryByText(/ends automatically/i), null);
  assert.equal(hero.getAllByRole('link').length, 1);
  const footer = within(screen.getByRole('navigation', { name: 'Footer' }));
  assert.deepEqual(footer.getAllByRole('link').map((link) => link.getAttribute('href')), [
    '/terms', '/privacy', '/refunds-and-cancellation', '/support', '/privacy#cookie-settings',
  ]);
  const mobileFooter = document.querySelector('.footerMenu');
  fireEvent.click(mobileFooter.querySelector('summary'));
  assert.deepEqual(within(mobileFooter).getAllByRole('link').map(link => link.getAttribute('href')),
    footer.getAllByRole('link').map(link => link.getAttribute('href')));
  fireEvent.keyDown(mobileFooter, { key: 'Escape' });
  assert.equal(mobileFooter.open, false);
  view.rerender(React.createElement(Marketing, { page: 'home', trialOffer: true, account: { signedIn: true } }));
  assert.doesNotMatch(screen.getByRole('main').textContent, /free trial|no credit card needed/i);
});

test('the PDF editing guide shows the video followed by three steps', () => {
  render(React.createElement(Marketing, { page: 'guide', trialOffer: true }));
  const main = screen.getByRole('main');
  const heading = within(main).getByRole('heading', { name: 'How to edit a floor plan PDF', level: 1 });
  assert.ok(heading.nextElementSibling.querySelector('video[controls]'));
  assert.deepEqual(within(main).getAllByRole('heading', { level: 2 }).map((item) => item.textContent), [
    'Upload the original drawing', 'Mark up the layout', 'Export a revised plan',
  ]);
  assert.ok(within(main).getByText(/up to 25 MB/));
  assert.equal(within(main).queryByRole('link', { name: 'Open editor' }), null);
  assert.deepEqual(within(main).getAllByRole('link').map((link) => link.getAttribute('href')), [
    '/measure-a-floor-plan-pdf', '/print-a-floor-plan-pdf-to-scale',
  ]);
});

test('each new guide has a public page and related navigation', async () => {
  const previous = window.location.href;
  try {
    for (const [path, name] of [
      ['/measure-a-floor-plan-pdf', 'How to measure a floor plan PDF'],
      ['/mark-up-a-floor-plan-for-a-remodel', 'How to mark up a floor plan for a remodel'],
      ['/print-a-floor-plan-pdf-to-scale', 'How to print a floor plan PDF to scale'],
    ]) {
      window.history.replaceState(null, '', path);
      const view = render(React.createElement(Root));
      await screen.findByRole('heading', { name, level: 1 });
      const related = within(screen.getByRole('navigation', { name: 'Related floor plan guides' }));
      assert.equal(related.getAllByRole('link').length, 3);
      assert.equal(screen.getByRole('link', { name: 'All floor plan guides' }).getAttribute('href'), '/floor-plan-guides');
      view.unmount();
    }
  } finally {
    cleanup();
    window.history.replaceState(null, '', previous);
  }
});

test('trial starts only after accepting terms, and expired access cannot download under the subscription', async () => {
  const old = window.location.href;
  const started = [];
  const account = { user: { id: 'test-trial-user' } };
  try {
    render(React.createElement(TrialPage, {
      offer: true, account, access: { data: { canStartTrial: true }, startTrial: async () => started.push(true) },
    }));
    const start = screen.getByRole('button', { name: 'Start free trial' });
    assert.ok(screen.getByRole('heading', { name: 'Try the editor free for 3 days', level: 1 }));
    assert.ok(screen.getByText('No credit card needed', { exact: true }).classList.contains('trialNoCard'));
    assert.equal(start.disabled, true);
    assert.equal(document.querySelector('input[autocomplete=cc-number]'), null);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(start);
    await waitFor(() => assert.equal(window.location.hash, '#/editor'));
    assert.equal(started.length, 1);
    assert.equal(fullEditorAccess({ paymentsRequired: true, trialEndsAt: new Date(Date.now() + 5_000).toISOString() }), true);
    const expired = { paymentsRequired: true, trialEndsAt: '2020-01-01T00:00:00Z', monthly: true, monthlyEndsAt: null };
    assert.equal(canOpenEditor(expired), false);
    assert.equal(canOpenEditor({ ...expired, projectIds: ['independently-paid-plan'] }), true);
    assert.equal(trialTimeLeft('2026-11-18T03:30:00Z', Date.parse('2026-11-16T00:00:00Z')), '2d 03:30:00');
    assert.equal(trialTimeLeft('2026-11-16T00:00:05Z', Date.parse('2026-11-16T00:00:00Z')), '00:00:05');
    assert.equal(trialTimeLeft('2026-11-16T00:00:00Z', Date.parse('2026-11-16T00:00:00Z')), '');
  } finally {
    cleanup();
    window.history.replaceState(null, '', old);
  }
});

test('expired trials link to each billing option and keep purchased plans accessible', () => {
  const account = { user: { id: 'expired-trial' } };
  const data = { trialEndsAt: '2020-01-01T00:00:00Z', paymentsRequired: true };
  const view = render(React.createElement(TrialPage, { account, access: { data }, offer: true }));
  assert.ok(screen.getByRole('heading', { name: 'Your free trial has ended' }));
  const options = within(screen.getByRole('navigation', { name: 'Choose a plan' }));
  assert.equal(options.getByRole('link', { name: /Single project.*\$10/i }).getAttribute('href'), '/?plan=project#/account/billing');
  assert.equal(options.getByRole('link', { name: /Monthly access.*\$19/i }).getAttribute('href'), '/?plan=monthly#/account/billing');
  assert.equal(screen.queryByRole('button', { name: /start free trial/i }), null);
  view.rerender(React.createElement(TrialPage, { account, access: { data: { ...data, projectCredits: 1 } }, offer: true }));
  assert.equal(screen.getByRole('link', { name: 'Open editor' }).getAttribute('href'), '#/editor');
});

test('trial availability distinguishes a failed check from an off switch and allows a signed-in signup check', () => {
  let retries = 0;
  const onCheckOffer = () => { retries += 1; };
  const account = { client: {} };
  const props = { account, access: {}, offer: false, offerError: true, onCheckOffer };
  const view = render(React.createElement(TrialPage, props));
  assert.match(screen.getByRole('alert').textContent, /Could not check trial availability/);
  click('button', 'Check again');
  assert.equal(retries, 1);
  view.rerender(React.createElement(TrialPage, { ...props, offerError: false }));
  assert.ok(screen.getByText('Free trials are currently unavailable.'));
  view.rerender(React.createElement(TrialPage, {
    ...props, account: { ...account, user: { id: 'test-trial-user' } },
    access: { data: { canStartTrial: true } },
  }));
  assert.ok(screen.getByRole('button', { name: 'Start free trial' }));
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
  assert.equal(document.querySelector('.billingMode'), null);
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

test('the desktop header shows the account name and keeps the menu available from Recent plans', () => {
  const user = { email: 'morgan@example.test', user_metadata: { planpatch_display_name: 'Morgan Lee' } };
  const onSignOut = () => { signedOut += 1; };
  let signedOut = 0;
  const account = { signedIn: true, user, onSignOut };
  const view = render(React.createElement(SiteHeader, { page: 'account', account }));
  const header = screen.getByRole('banner');
  const nav = within(header.querySelector('.siteHeaderActions > .siteNav'));
  assert.ok(nav.getByRole('link', { name: 'Pricing' }));
  const editorLink = nav.getByRole('link', { name: 'Open editor' });
  assert.equal(editorLink.querySelector('svg'), null);
  assert.equal(editorLink.classList.contains('button'), false);
  assert.equal(header.querySelector('.accountMenuName').textContent, 'Morgan Lee');

  view.rerender(React.createElement(SiteHeader, { page: 'recent', account }));
  const details = header.querySelector('.accountMenu');
  assert.equal(details.querySelector('summary').getAttribute('aria-label'), 'Account menu for Morgan Lee');
  assert.equal(details.querySelector('summary .accountAvatar').textContent, 'M');
  assert.equal(within(header).queryByRole('link', { name: 'Open editor' }), null);
  fireEvent.click(details.querySelector('summary'));
  assert.equal(within(header).getByRole('link', { name: 'Profile settings' }).getAttribute('href'), '#/account');
  assert.equal(within(header).getByRole('link', { name: 'Billing & payment methods' }).getAttribute('href'), '#/account/billing');
  assert.equal(within(header).queryByRole('link', { name: 'Saved plans' }), null);
  fireEvent.click(within(header).getByRole('button', { name: 'Sign out' }));
  assert.equal(signedOut, 1);
  assert.equal(details.open, false);
});

test('the sign-in path and legacy bookmark both open the account page', async () => {
  const previous = window.location.href;
  try {
    for (const path of ['/sign-in', '/#/sign-in']) {
      window.history.replaceState(null, '', path);
      const view = render(React.createElement(Root));
      await screen.findByRole('heading', { name: 'Sign in to editfloorplans.com', level: 1 });
      assert.ok(screen.getByText('Account sign-in is currently unavailable.'));
      assert.equal(screen.getByRole('link', { name: 'editfloorplans.com home' }).getAttribute('href'), '/');
      view.unmount();
    }
  } finally {
    cleanup();
    window.history.replaceState(null, '', previous);
  }
});

test('sign-up requires a name and 12-character password before showing the confirmation popup', async () => {
  const account = { client: {} };
  const requested = [];
  const onAuthenticate = async (...args) => {
    requested.push(args);
    return false;
  };
  render(React.createElement(SignInPage, { account, onAuthenticate, onGoogle: async () => {} }));
  assert.ok(screen.getByRole('button', { name: 'Continue with Google' }).querySelector('svg'));

  click('button', 'Create an account');
  const name = screen.getByLabelText('Name');
  const email = screen.getByLabelText('Email address');
  const password = screen.getByLabelText('Password');
  fireEvent.change(name, { target: { value: '  Morgan Lee  ' } });
  fireEvent.change(email, { target: { value: 'sam@example.test' } });
  assert.equal(password.autocomplete, 'new-password');
  assert.equal(password.minLength, 12);
  assert.ok(screen.getByText('Use at least 12 characters.'));
  fireEvent.change(password, { target: { value: 'tenletters' } });
  fireEvent.submit(password.closest('form'));
  assert.equal(screen.getByRole('alert').textContent, 'Use at least 12 characters.');
  assert.equal(requested.length, 0);

  fireEvent.change(password, { target: { value: 'test-password-2026' } });
  click('button', 'Create account');
  const confirmation = await screen.findByRole('dialog', { name: 'Check your email' });
  assert.ok(within(confirmation).getByText('sam@example.test'));
  assert.match(confirmation.textContent, /Open the link on any device/);
  assert.ok(screen.getByRole('heading', { name: 'Create your account' }).closest('main').hasAttribute('inert'));
  assert.equal(screen.getByLabelText('Password').value, '');
  click('button', 'Resend link');
  await within(confirmation).findByText('A new confirmation link was sent.');
  click('button', 'Back to sign in');
  assert.equal(screen.queryByRole('dialog'), null);

  click('button', 'Forgot password?');
  assert.equal(screen.queryByLabelText('Password'), null);
  click('button', 'Send reset link');
  await screen.findByText(/If that email is registered/);
  assert.deepEqual(requested, [
    ['create', 'sam@example.test', 'test-password-2026', 'Morgan Lee'],
    ['resend', 'sam@example.test', ''],
    ['forgot', 'sam@example.test', '', undefined],
  ]);
});

test('unknown pages and unknown editor links have a route back home', async () => {
  const previous = window.location.href;
  try {
    for (const path of ['/missing-page', '/#/editor/invalid']) {
      window.history.replaceState(null, '', path);
      const view = render(React.createElement(Root));
      await screen.findByRole('heading', { level: 1, name: 'Page not found' });
      assert.equal(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href'), '/');
      assert.equal(screen.getByRole('link', { name: 'Open the editor' }).getAttribute('href'), '/#/editor');
      view.unmount();
    }
  } finally {
    cleanup();
    window.history.replaceState(null, '', previous);
  }
});

test('the full editor sign-in page retries credentials and completes a valid sign-in', async () => {
  const account = { client: {} };
  let attempts = 0, completed = 0;
  const onAuthenticate = async (mode, email, password) => {
    assert.deepEqual([mode, email, password], ['signIn', 'sam@example.test', 'test-password-2026']);
    if (++attempts === 1) throw { code: 'invalid_credentials' };
    return true;
  };
  render(React.createElement(SignInPage, {
    account, onAuthenticate, onGoogle: async () => {},
    editorEntry: true, trialOffer: true, onAuthenticated: () => { completed += 1; },
  }));

  assert.ok(screen.getByRole('heading', { level: 1, name: 'Sign in to use the editor' }));
  assert.ok(screen.getByText('3-day free trial. No credit card needed.'));
  assert.equal(screen.queryByRole('dialog'), null);
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

test('monthly checkout requires its own agreement and only confirmed purchases offer a downloadable acknowledgment', async () => {
  const { MONTHLY_VERSION, MONTHLY_DISCLOSURE } = await import('../supabase/functions/planpatch-account/monthly-offer.js');
  const calls = [];
  const account = { user: { id: 'subscription-ui-test' } };
  const access = { data: { checkoutReady: true, billingAvailable: true, monthlyOfferVersion: MONTHLY_VERSION },
    checkout: async (...args) => { calls.push(args); } };
  const view = render(React.createElement(AccountPage, { billing: true, account, access }));
  const [policies, recurring] = screen.getAllByRole('checkbox');
  const monthly = screen.getByRole('button', { name: 'Start test subscription' });
  const project = screen.getByRole('button', { name: 'Buy a project credit' });
  assert.equal(recurring.checked, false);
  assert.equal(recurring.labels[0].textContent, MONTHLY_DISCLOSURE);
  assert.equal(monthly.disabled, true);
  fireEvent.click(policies);
  assert.equal(project.disabled, false);
  assert.equal(monthly.disabled, true);
  assert.equal(screen.queryByText('Save subscription confirmation'), null);
  fireEvent.click(recurring);
  fireEvent.click(monthly);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], { accepted: true, version: MONTHLY_VERSION });
  const confirmed = { offer_version: MONTHLY_VERSION, offer_text: MONTHLY_DISCLOSURE, amount_paid_cents: 1900,
    accepted_at: '2026-11-19T01:00:00Z', paid_at: '2026-11-19T01:01:00Z', first_period_end: '2026-12-19T01:01:00Z', invoice_id: 'in_test_confirmed' };
  view.rerender(React.createElement(AccountPage, { billing: true, account, access: {
    ...access, data: { ...access.data, monthly: true, monthlyConfirmation: confirmed },
  } }));
  const download = screen.getByRole('link', { name: 'Save subscription confirmation' });
  assert.match(download.download, /\.txt$/);
  const text = decodeURIComponent(download.href.split(',').slice(1).join(','));
  for (const item of [MONTHLY_DISCLOSURE, confirmed.invoice_id, '$19.00 USD', 'https://www.editfloorplans.com/#/account/billing']) {
    assert.ok(text.includes(item));
  }
  view.rerender(React.createElement(AccountPage, { billing: true, account: { user: { id: 'new-user' } }, access }));
  assert.ok(screen.getAllByRole('checkbox').every(box => !box.checked));
  assert.equal(screen.queryByRole('link', { name: 'Save subscription confirmation' }), null);
});

test('guest preview opens a pasted plan in memory and requires sign-up for tools, shortcuts and exports', async (t) => {
  const db = new IDBFactory();
  t.mock.method(db, 'open');
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = db;
  t.after(() => { globalThis.indexedDB = previous; });
  const key = 'blueprint-studio-current-v1';
  const original = localStorage.getItem(key);
  const requests = [];
  const previews = [];
  render(React.createElement(Editor, {
    previewOnly: true,
    onPreviewPlanChange: plan => previews.push(plan),
    onRequestEditing: plan => requests.push(plan),
  }));
  assert.ok(screen.getByRole('heading', { name: 'Upload or paste your floor plan' }));
  const image = new File(['test'], 'plan.png', { type: 'image/png' });
  fireEvent.paste(document.body, { clipboardData: { files: [image] } });
  await waitFor(() => assert.equal(previews.length, 1));
  assert.equal(svg().querySelector('image').getAttribute('href'), png);
  click('button', 'Pan');
  click('button', 'Zoom in');
  click('button', 'Select');
  assert.equal(requests.length, 0);
  click('button', 'Wall');
  fireEvent.keyDown(window, { key: 'w' });
  click('button', 'Export');
  assert.deepEqual(requests, [previews[0], previews[0], previews[0]]);
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed'), 'true');

  fireEvent.click(document.querySelector('.projectButton'));
  click('button', 'Open sample project');
  const wall = svg().querySelector('[data-element-id]');
  const start = { button: 0, pointerId: 2, clientX: 500, clientY: 140 };
  fireEvent.pointerDown(wall, start);
  fireEvent.pointerUp(svg(), start);
  assert.ok(screen.getByText('WALL'));
  assert.equal(requests.length, 3);
  const before = wall.outerHTML;
  fireEvent.pointerDown(wall, start);
  fireEvent.pointerMove(svg(), { ...start, clientX: 590 });
  fireEvent.pointerUp(svg(), start);
  fireEvent.keyDown(window, { key: 'Delete' });
  assert.equal(requests.length, 5);
  assert.equal(wall.outerHTML, before);
  assert.equal(count(), 20);
  cleanup();
  assert.equal(db.open.mock.callCount(), 0);
  assert.equal(localStorage.getItem(key), original);
});

test('a preview resumes with full access and requires an explicit credit action for single-project access', async () => {
  const preview = {
    id: 'preview-handoff', name: 'Kitchen preview', unitsPerInch: 4, elements: [],
    createdAt: Date.now(), updatedAt: Date.now(), background: png, showBackground: true,
  };
  let opened = 0;
  window.history.replaceState(null, '', '#/editor');
  render(React.createElement(AccountEditor, { owner: 'preview-monthly', previewPlan: preview, onPreviewPlanOpened: () => opened++ }));
  await screen.findByRole('button', { name: preview.name });
  assert.equal(svg().querySelector('image').getAttribute('href'), png);
  assert.equal(opened, 1);
  click('button', 'Wall');
  draw(100, 100, 400, 100);
  assert.equal(count(), 1);
  await waitSaved();
  cleanup();

  let writes = 0;
  const repository = { list: async () => [], save: async (project, record) => {
    writes++;
    assert.equal(project.background, preview.background);
    return { ...record, revision: 1 };
  } };
  window.history.replaceState(null, '', '#/editor');
  render(React.createElement(AccountEditor, {
    owner: 'preview-credit', repository, previewPlan: preview, onPreviewPlanOpened: () => opened++,
    projectAccess: { credits: 1, ids: [], refresh: () => {} },
  }));
  const confirmCredit = await screen.findByRole('button', { name: 'Use one project credit to edit this plan' });
  await waitFor(() => assert.equal(confirmCredit.disabled, false));
  assert.equal(writes, 0);
  assert.equal(opened, 1);
  fireEvent.click(confirmCredit);
  await screen.findByRole('main', { name: 'Drawing workspace' });
  assert.equal(writes, 1);
  assert.equal(opened, 2);
  assert.equal(svg().querySelector('image').getAttribute('href'), png);
});

test('mobile guest controls keep edits locked and ignore an import completed after leaving', async (t) => {
  const previous = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  t.after(() => { window.matchMedia = previous; });
  let requests = 0, previews = 0;
  const props = { previewOnly: true, onRequestEditing: () => requests++, onPreviewPlanChange: () => previews++ };
  const view = render(React.createElement(Editor, props));
  click('button', 'Select');
  click('button', 'Edit');
  click('button', 'Measure');
  assert.equal(requests, 2);
  assert.equal(screen.getByRole('button', { name: 'View' }).getAttribute('aria-pressed'), 'true');
  const file = { name: 'Delayed plan.pdf', size: 512 };
  let finishReading;
  file.arrayBuffer = () => new Promise(resolve => { finishReading = resolve; });
  fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [file] } });
  view.rerender(React.createElement(Editor, { ...props, active: false }));
  await act(async () => finishReading(new ArrayBuffer(4)));
  assert.equal(previews, 0);
  assert.equal(screen.queryByRole('dialog'), null);
});

test('the editor sign-up page uses the full account form and can return to the plan', () => {
  let returned = false;
  render(React.createElement(SignInPage, {
    initialMode: 'create', editorEntry: true, trialOffer: true, account: { client: {} },
    onBackToPreview(event) { event.preventDefault(); returned = true; },
  }));
  const main = screen.getByRole('main');
  assert.ok(within(main).getByRole('heading', { level: 1, name: 'Create your account' }));
  assert.equal(screen.queryByRole('dialog'), null);
  assert.doesNotMatch(main.textContent, /free trial|credit card needed/i);
  assert.ok(within(main).getByRole('button', { name: 'Continue with Google' }));
  assert.ok(within(main).getByRole('button', { name: 'Sign in' }));
  click('link', 'Back to preview');
  assert.equal(returned, true);
});
