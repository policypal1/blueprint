import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange, indexedDB } from 'fake-indexeddb';

const base = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await fs.mkdir(path.join(base, '.test-build'), { recursive: true });
// Unit/component environment only: PDF decoding and rasterization are platform mocks.
// This deliberately does not pretend to replace real-device PDF/browser acceptance tests.
const testBuild = {
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
};
await build(testBuild);
// Exercise production access gates with controllable account and billing responses.
await build({
  ...testBuild,
  entryPoints: { gatedRoot: path.join(base, 'Root.jsx') },
  plugins: [...testBuild.plugins, {
    name: 'editor-access-fixtures',
    setup(b) {
      b.onResolve({ filter: /^\.\/use(Account|PlanPatchAccount)\.js$/ }, (args) => {
        if (args.importer !== path.join(base, 'Root.jsx')) return;
        return { path: args.path, namespace: 'access-fixture' };
      });
      b.onLoad({ filter: /.*/, namespace: 'access-fixture' }, ({ path: module }) => ({
        resolveDir: base,
        contents: module === './useAccount.js'
          ? `export { accountReturnTarget } from './useAccount.js';
             export const useAccount = () => globalThis.__editorAccess.account;`
          : `export const useTrialOffer = () => ({ available: true });
             export default () => globalThis.__editorAccess.access;`,
      }));
    },
  }],
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
  async decode() {}
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

test('permanent owner access survives expired trials and monthly periods and removes purchase prompts', () => {
  const data = { ownerAccess: true, paymentsRequired: true, monthly: false,
    trialEndsAt: '2000-01-01T00:00:00Z', monthlyEndsAt: '2000-01-01T00:00:00Z' };
  assert.equal(fullEditorAccess(data), true);
  assert.equal(canOpenEditor(data), true);
  assert.equal(fullEditorAccess({ ...data, ownerAccess: false }), false);
  assert.equal(fullEditorAccess({ ...data, deleting: true }), false);
  render(React.createElement(AccountPage, { billing: true, account: { user: { id: 'owner' } }, access: { data } }));
  assert.ok(screen.getByRole('heading', { name: 'Owner access' }));
  assert.ok(screen.getByText('No payment required. Your access does not expire.'));
  assert.equal(screen.queryByRole('checkbox'), null);
  assert.equal(screen.queryByRole('button', { name: /payment|credit|subscription/i }), null);
  assert.equal(screen.getByRole('link', { name: 'Open editor' }).getAttribute('href'), '#/editor');
});

test('live billing uses live consent and keeps purchases disabled during Stripe review', async () => {
  const { LIVE_MONTHLY_VERSION, MONTHLY_PRICE, MONTHLY_AGREEMENT, MONTHLY_CANCELLATION } = await import('../supabase/functions/planpatch-account/monthly-offer.js');
  const calls = [];
  const account = { user: { id: 'live-billing-ui' } };
  let rechecks = 0;
  const access = { data: { billingMode: 'live', checkoutReady: false, activationPending: true, canStartTrial: true,
    billingAvailable: true, monthlyOfferVersion: LIVE_MONTHLY_VERSION }, refresh: async () => { rechecks++; }, checkout: async (...args) => calls.push(args) };
  const view = render(React.createElement(AccountPage, { account, access: { ...access, data: null, loading: true }, billing: true }));
  assert.equal(screen.queryByRole('link', { name: 'Open test billing portal' }), null);
  assert.equal(screen.queryByRole('button', { name: 'Continue to test payment' }), null);
  view.rerender(React.createElement(AccountPage, { account, access, billing: true }));
  assert.equal(screen.queryByText('Payments are awaiting Stripe activation.'), null);
  assert.equal(screen.queryByText('Live billing'), null);
  assert.equal(screen.queryByText('Billing support', { exact: true }), null);
  assert.equal(screen.queryByRole('button', { name: 'Refresh access' }), null);
  assert.equal(screen.getByRole('button', { name: 'Buy a project credit' }).disabled, true);
  assert.equal(screen.queryByRole('link', { name: 'Open test billing portal' }), null);
  assert.ok(screen.getByText('Checkout is temporarily unavailable.'));
  assert.equal(screen.getByRole('link', { name: /Try 3 days free/ }).getAttribute('href'), '/#/trial');
  click('button', 'Check again');
  await screen.findByText('Checkout is still unavailable. Please try again later.');
  assert.equal(rechecks, 1);
  access.data.checkoutReady = true;
  view.rerender(React.createElement(AccountPage, { account, access, billing: true }));
  const [terms] = screen.getAllByRole('checkbox');
  assert.equal(screen.getAllByRole('checkbox').length, 1);
  assert.equal(screen.queryByText('$19/month until canceled. Cancel anytime in Billing.'), null);
  assert.equal(screen.queryByText('Billing details'), null);
  assert.ok(screen.getByRole('link', { name: 'Terms of Service' }));
  assert.equal(terms.checked, false);
  fireEvent.click(terms);
  click('button', 'Subscribe for $19/month');
  await waitFor(() => assert.equal(calls.length, 1));
  assert.deepEqual(calls[0][2], { accepted: true, version: LIVE_MONTHLY_VERSION });
});

test('billing keeps the selected order through sign-in and shows checkout failures beside the order', async () => {
  const { accountReturnTarget } = await import('../useAccount.js');
  const previous = window.location.href;
  const { LIVE_MONTHLY_VERSION } = await import('../supabase/functions/planpatch-account/monthly-offer.js');
  const access = {
    data: { billingMode: 'live', checkoutReady: true, monthlyOfferVersion: LIVE_MONTHLY_VERSION },
    checkout: async () => { throw new Error('Could not open Stripe. Try again.'); },
  };
  try {
    for (const [plan, title] of [['project', 'Single project'], ['monthly', 'Monthly access']]) {
      const target = accountReturnTarget('#/account/billing', `?plan=${plan}&tracking=test`);
      assert.equal(target, `?plan=${plan}#/account/billing`);
      // The callback validates the stored target again after email or Google authentication.
      assert.equal(accountReturnTarget(target), target);
      window.history.replaceState(null, '', '/' + target);
      const view = render(React.createElement(AccountPage, { billing: true, account: { user: null, client: {} } }));
      assert.ok(screen.getByRole('button', { name: 'Continue to sign in' }));
      assert.ok(screen.getByText(/review your order/));
      view.rerender(React.createElement(AccountPage, { billing: true, account: { user: { id: 'buyer' } }, access }));
      const order = within(screen.getByRole('region', { name: 'Your order' }));
      assert.deepEqual(order.getAllByRole('heading', { level: 3 }).map(el => el.textContent), [title]);
      for (const agreement of order.getAllByRole('checkbox')) fireEvent.click(agreement);
      fireEvent.click(order.getByRole('button', { name: plan === 'project' ? 'Buy a project credit' : 'Subscribe for $19/month' }));
      assert.equal((await order.findByRole('alert')).textContent, 'Could not open Stripe. Try again.');
      assert.equal(order.getByRole('link', { name: 'View both plans' }).getAttribute('href'), '/#/account/billing');
      view.unmount();
    }
    assert.equal(accountReturnTarget('#/account/billing', '?plan=unknown'), '#/account/billing');
    assert.equal(accountReturnTarget('https://unexpected.example/'), '#/account');
  } finally {
    window.history.replaceState(null, '', previous);
  }
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

test('the standalone demo cues its first tool once when it comes into view', () => {
  const original = window.IntersectionObserver;
  let notify, target;
  let disconnected = false;
  window.IntersectionObserver = class {
    constructor(callback) { notify = callback; }
    observe(node) { target = node; }
    disconnect() { disconnected = true; }
  };
  try {
    render(React.createElement(Marketing, { page: 'revisionDemo' }));
    const demo = within(screen.getByRole('region', { name: 'Try the floor plan demo' }));
    assert.equal(target, demo.getByText('Start here'));
    notify([{ intersectionRatio: 0 }]);
    assert.equal(target.classList.contains('revisionCueSeen'), false);
    notify([{ intersectionRatio: 1 }]);
    assert.ok(disconnected && target.classList.contains('revisionCueSeen'));
    fireEvent.click(demo.getByRole('button', { name: 'Choose Clean up' }));
    fireEvent.click(demo.getByRole('button', { name: 'Back' }));
    assert.equal(demo.getByText('Start here').classList.contains('revisionCueSeen'), false);
  } finally {
    if (original) window.IntersectionObserver = original;
    else delete window.IntersectionObserver;
  }
});

test('landing and pricing explain the product and lead to the editor', async () => {
  render(React.createElement(Marketing, { page: 'home' }));
  const hero = screen.getByRole('region', { name: /Edit your existing floor plan/ });
  assert.ok(within(hero).getByRole('heading', { name: /Edit your existing floor plan/ }));
  assert.ok(within(hero).getByText('Upload a PDF or photo of your floor plan. Make changes and export. No CAD needed.'));
  assert.equal(within(hero).getByRole('link', { name: 'Try the editor with a sample plan' }).getAttribute('href'), '/#/editor/sample');
  assert.equal(
    within(hero).getByRole('link', { name: 'Open editor' }).getAttribute('href'),
    '/#/editor',
  );
  assert.equal(document.querySelector('.stickyEdit'), null);
  assert.equal(screen.queryByText('Bring your plan'), null);
  const pricing = screen.getByRole('heading', { name: 'One project or monthly access' });
  const demo = screen.getByRole('region', { name: 'Before and after floor plan' });
  assert.equal(hero.nextElementSibling, demo);
  assert.equal(within(demo).getAllByRole('img').length, 2);
  assert.equal(screen.queryByText('Watch the editor video'), null);
  assert.equal(document.querySelector('video'), null);
  const comparison = screen.getByRole('region', { name: 'A simpler way to revise a floor plan' });
  assert.equal(demo.nextElementSibling.getAttribute('aria-labelledby'), 'audience-title');
  assert.equal(comparison.nextElementSibling, pricing.closest('section'));
  assert.equal(within(comparison).getAllByRole('listitem').length, 8);
  assert.equal(screen.getByRole('link', { name: 'See single project pricing' }).getAttribute('href'), '/pricing');
  assert.equal(screen.getByRole('link', { name: 'See monthly access pricing' }).getAttribute('href'), '/pricing');
  assert.equal(within(demo).getByRole('link', { name: 'Try the editor' }).getAttribute('href'), '/#/editor/sample');
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
  assert.ok(screen.getByRole('heading', { name: 'Project plans', level: 1 }));
  assert.ok(screen.getByText('$9'));
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
  assert.ok(screen.getByRole('heading', { name: 'Upload or paste your floor plan' }));
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
  const thickness = screen.getByLabelText('Wall thickness (px)');
  fireEvent.change(thickness, { target: { value: '32' } });
  fireEvent.blur(thickness);
  assert.equal(svg().querySelector('line[stroke="#000"]').getAttribute('stroke-width'), '32');
  click('button', 'Undo');
  assert.equal(svg().querySelector('line[stroke="#000"]').getAttribute('stroke-width'), '18');
  // A contractor can mark a known dimension directly. It persists as text.
  click('button', 'More tools');
  assert.equal(screen.queryByRole('button', { name: 'Dimension', exact: true }), null);
  click('button', 'Close dialog');
  click('button', 'Text');
  tap(200, 150);
  const label = screen.getByRole('textbox', { name: 'Text' });
  fireEvent.change(label, { target: { value: '36 in clear opening' } });
  fireEvent.blur(label);
  assert.equal(count(), 2);
  assert.ok(svg().textContent.includes('36 in clear opening'));
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
  const exportedSvg = new dom.window.DOMParser().parseFromString(await svgBlob.text(), 'image/svg+xml');
  assert.equal(exportedSvg.documentElement.localName, 'svg', 'The export rasterizer needs well-formed SVG.');
  assert.ok(!(await svgBlob.text()).includes('data-editor-only'));
  assert.ok((await svgBlob.text()).includes('@font-face'));
  assert.ok(exportedSvg.documentElement.textContent.includes('36 in clear opening'));
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
    assert.equal(screen.queryByRole('button', { name: 'Measure' }), null);
    click('button', 'Text');
    tap(420, 300);
    click('button', 'Properties');
    const text = screen.getByRole('textbox', { name: 'Text' });
    fireEvent.change(text, { target: { value: '900 mm' } });
    fireEvent.blur(text);
    click('button', 'Close dialog');
    assert.ok(svg().textContent.includes('900 mm'));

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
  assert.equal(screen.getByLabelText('Wall thickness (px)').value, '30');
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
  fireEvent.change(screen.getByLabelText('Wall thickness (px)'), { target: { value: '24' } });
  fireEvent.blur(screen.getByLabelText('Wall thickness (px)'));
  click('button', 'Wall'); draw(200, 400, 600, 400); click('button', 'Select');
  const walls = svg().querySelectorAll('line[stroke="#777777"]');
  assert.equal(walls.length, 2);
  assert.equal(walls[1].getAttribute('stroke-width'), '24');
  select(walls[1], 400);
  fireEvent.change(screen.getByLabelText('Wall color'), { target: { value: '#222222' } });
  fireEvent.change(screen.getByLabelText('Wall thickness (px)'), { target: { value: '8' } });
  fireEvent.blur(screen.getByLabelText('Wall thickness (px)'));
  click('button', 'Match another wall');
  select(first, 200);
  await waitFor(() => assert.equal(screen.getByLabelText('Wall color').value, '#777777'));
  assert.equal(screen.getByLabelText('Wall thickness (px)').value, '24');
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
    assert.ok(screen.getByText('Step 1 of 8'));
    click('button', 'Try Pan');
    assert.equal(screen.queryByRole('dialog', walkthrough), null);
    assert.equal(screen.getByRole('button', { name: 'Pan', exact: true }).getAttribute('aria-pressed'), 'true');
    click('button', 'Resume walkthrough');
    assert.ok(screen.getByText('Step 1 of 8'));
    for (let step = 2; step <= 8; step++) {
      click('button', 'Next');
      assert.ok(screen.getByText(`Step ${step} of 8`));
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
    assert.ok(screen.getByText('Step 1 of 8'));
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
  const fixtures = ['Toilet', 'Sink', 'Shower', 'Bathtub', 'Bed', 'Water heater', 'Washer / dryer', 'Counter', 'Stove', 'Couch', 'Armchair', 'Dining table', 'Coffee table', 'Desk', 'Wardrobe', 'Refrigerator', 'Dishwasher', 'Cabinet', 'Stairs'];
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

test('legacy dimension annotations still render after reopening, without measurement tools', async () => {
  render(React.createElement(Editor));
  await waitSaved();
  fireEvent.click(document.querySelector('.projectButton'));
  click('button', 'Open sample project');
  const legacyLabel = `20' 10"`;
  assert.ok(svg().textContent.includes(legacyLabel));
  assert.equal(screen.queryByRole('button', { name: 'Distance' }), null);
  fireEvent.keyDown(window, { key: 'm' });
  assert.equal(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed'), 'true');
  click('button', 'Plan settings');
  assert.equal(screen.queryByRole('button', { name: /set.*scale/i }), null);
  fireEvent.click(screen.getByText('Project actions'));
  click('button', 'Advanced JSON import');
  const trace = { units: 'pixels', imageWidth: 3200, imageHeight: 2000,
    elements: [{ type: 'wall', x1: 100, y1: 100, x2: 600, y2: 100, thickness: 12 }] };
  fireEvent.change(screen.getByRole('textbox'), { target: { value: JSON.stringify(trace) } });
  const replace = screen.getByRole('checkbox', { name: /Replace current editable drawing/ });
  if (replace.checked) fireEvent.click(replace);
  click('button', 'Import editable plan');
  assert.ok(svg().textContent.includes(legacyLabel));
  assert.ok(svg().querySelector('line[stroke-width="6"]'));
  click('button', 'Plan settings');
  click('button', 'Close dialog');
  click('button', 'Export');
  fireEvent.click(screen.getByText('PDF print settings'));
  assert.ok(screen.getByLabelText('PDF sheet'));
  assert.equal(screen.queryByLabelText('PDF scale'), null);
  click('button', 'Close dialog');
  await waitSaved();
  cleanup();
  render(React.createElement(Editor));
  await waitSaved();
  assert.ok(svg().textContent.includes(legacyLabel));
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
    await screen.findByRole('heading', { name: 'Project plans', level: 1 });
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
    assert.ok(screen.getByText('Step 2 of 8'));
    assert.equal(screen.getByLabelText('Wall thickness (px)').value, '18');
    tick(1300);
    tick(1300);
    assert.equal(screen.getByLabelText('Wall thickness (px)').value, '24');
    assert.equal(document.querySelectorAll('.sampleEditor').length, 1);
    assert.ok(document.querySelector('.sampleDrawing line[stroke-width="24"]'));
    click('button', 'Pause walkthrough');
    assert.equal(pending.size, 0);
    click('button', 'Play walkthrough');
    tick(6500);
    assert.ok(screen.getByText('Step 3 of 8'));
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
    assert.ok(screen.getByText('Step 2 of 8'));
    view.unmount();
    render(React.createElement(Marketing, { page: 'pricing', trialOffer: true, account: { signedIn: true, user: { email: 'demo@example.test' } } }));
    assert.equal(screen.queryByRole('link', { name: 'View billing' }), null);
    const pricing = within(screen.getByRole('main'));
    assert.equal(pricing.queryByRole('link', { name: 'Open editor' }), null);
    assert.doesNotMatch(screen.getByRole('main').textContent, /No credit card needed/i);
    assert.ok(pricing.getAllByRole('article')[0].classList.contains('priceCardFeatured'));
    assert.match(pricing.getByText(/Try your first project risk-free/).textContent, /7 days/);
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
  assert.equal(hero.queryByText(/free trial|No credit card needed/i), null);
  assert.equal(hero.queryByText(/ends automatically/i), null);
  assert.equal(hero.getByRole('link', { name: 'Try the editor with a sample plan' }).getAttribute('href'), '/#/editor/sample');
  const footer = within(screen.getByRole('navigation', { name: 'Footer' }));
  assert.deepEqual(footer.getAllByRole('link').map((link) => link.getAttribute('href')), [
    '/floor-plan-guides', '/terms', '/privacy', '/refunds-and-cancellation', '/support', '/privacy#cookie-settings',
  ]);
  const mobileFooter = document.querySelector('.footerMenu');
  fireEvent.click(mobileFooter.querySelector('summary'));
  assert.deepEqual(within(mobileFooter).getAllByRole('link').map(link => link.getAttribute('href')),
    ['#home-faq-title', ...footer.getAllByRole('link').map(link => link.getAttribute('href'))]);
  fireEvent.keyDown(mobileFooter, { key: 'Escape' });
  assert.equal(mobileFooter.open, false);
  view.rerender(React.createElement(Marketing, { page: 'home', trialOffer: true, account: { signedIn: true } }));
  assert.equal(hero.queryByText(/free trial|No credit card needed/i), null);
  assert.ok(screen.getByRole('heading', { name: 'FAQs' }));
  assert.ok(screen.getByText('What happens when the free trial ends?'));
  view.rerender(React.createElement(Marketing, { page: 'home', trialOffer: false }));
  assert.doesNotMatch(screen.getByRole('main').textContent, /free trial|no credit card needed/i);
});

test('following the mobile FAQ fragment preserves the browser scroll position', async (t) => {
  window.history.replaceState(null, '', '/');
  render(React.createElement(Root));
  const heading = await screen.findByRole('heading', { name: 'FAQs' });
  const scroll = t.mock.method(window, 'scrollTo', () => {});
  await act(async () => {
    window.history.pushState(null, '', '#' + heading.id);
    window.dispatchEvent(new window.Event('hashchange'));
  });
  assert.equal(scroll.mock.callCount(), 0);
  window.history.replaceState(null, '', '/');
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
    '/demo', '/measure-a-floor-plan-pdf', '/print-a-floor-plan-pdf-to-scale',
  ]);
});

test('the original how-it-works link still opens the video and links to the interactive demo', async () => {
  const previous = window.location.href;
  try {
    window.history.replaceState(null, '', '/#/how-it-works');
    render(React.createElement(Root));
    const section = await screen.findByRole('region', { name: 'How it works' });
    assert.equal(section.querySelector('video').getAttribute('src'), '/planpatch-demo.mp4');
    assert.equal(within(section).getByRole('link', { name: 'Try a guided edit' }).getAttribute('href'), '/demo');
  } finally {
    cleanup();
    window.history.replaceState(null, '', previous);
  }
});

test('a guest can revise the sample doorway, compare drawings, choose Export and go back without opening project storage', async (t) => {
  const previous = window.location.href;
  const dbOpen = t.mock.method(globalThis.indexedDB, 'open');
  const saved = { ...localStorage };
  t.after(() => { window.history.replaceState(null, '', previous); });
  window.history.replaceState(null, '', '/demo');
  render(React.createElement(Root));
  const tour = within(await screen.findByRole('region', { name: 'Try the floor plan demo' }));
  const toolbar = within(tour.getByRole('group', { name: 'Demo editor tools' }));
  const canvas = within(document.querySelector('.revisionCanvas'));
  const press = (scope, name) => fireEvent.click(scope.getByRole('button', { name, exact: true }));
  const stage = (label, sheet) => assert.ok(within(tour.getByRole('img', { name: label })).getByText(sheet));

  stage(/existing laundry door opens into the hall/, 'EXISTING PLAN');
  assert.ok(toolbar.getByRole('button', { name: 'Choose Door' }).disabled);
  assert.ok(toolbar.getByText('Start here'));
  press(toolbar, 'Choose Clean up');
  assert.equal(document.activeElement, canvas.getByRole('button', { name: 'Cover old swing' }));
  assert.ok(canvas.getByRole('button', { name: 'Cover old swing' }));
  press(canvas, 'Cover old swing');
  stage(/leaving the opening/, 'DOOR REMOVAL');
  press(toolbar, 'Choose Wall');
  press(canvas, 'Set wall start');
  press(canvas, 'Finish wall');
  stage(/the laundry wall is continuous/, 'DOORWAY INFILL');
  press(toolbar, 'Choose Door');
  press(canvas, 'Place new door');
  stage(/relocated door opens into the laundry/, 'REVISED PLAN');
  const compare = within(tour.getByRole('group', { name: 'Compare drawings' }));
  press(compare, 'Original');
  stage(/existing laundry door opens into the hall/, 'EXISTING PLAN');
  assert.equal(tour.queryByRole('img', { name: /relocated door/ }), null);
  press(compare, 'Revised');
  stage(/relocated door opens into the laundry/, 'REVISED PLAN');

  press(tour, 'Back');
  stage(/the laundry wall is continuous/, 'DOORWAY INFILL');
  press(canvas, 'Place new door');
  press(toolbar, 'Choose Export');
  const ownPlan = tour.getByRole('link', { name: 'Edit my own plan' });
  assert.equal(ownPlan.getAttribute('href'), '/#/editor');
  assert.equal(document.activeElement, ownPlan);
  assert.equal(tour.queryByRole('button', { name: /download.*pdf/i }), null);
  assert.deepEqual(tour.getAllByRole('link'), [ownPlan]);

  assert.equal(tour.queryByRole('button', { name: 'Restart' }), null);
  assert.equal(tour.queryByText('Laundry remodel.pdf'), null);
  assert.equal(document.querySelector('.revisionProgress'), null);
  for (let i = 0; i < 8; i++) press(tour, 'Back');
  stage(/existing laundry door opens into the hall/, 'EXISTING PLAN');
  assert.ok(tour.getByRole('button', { name: 'Back' }).disabled);
  assert.equal(tour.queryByRole('group', { name: 'Compare drawings' }), null);
  assert.equal(dbOpen.mock.callCount(), 0);
  assert.deepEqual({ ...localStorage }, saved);
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
      if (path === '/mark-up-a-floor-plan-for-a-remodel') {
        assert.ok(screen.getByRole('heading', { name: 'Move a doorway' }));
        assert.equal(screen.getByRole('link', { name: 'Try the doorway demo' }).getAttribute('href'), '/demo');
      }
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
  assert.ok(screen.getByRole('heading', { name: 'Your trial ended. Your work is saved.' }));
  const options = within(screen.getByRole('navigation', { name: 'Choose a plan' }));
  assert.equal(options.getByRole('link', { name: /Export this project.*\$9/i }).getAttribute('href'), '/?plan=project#/account/billing');
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

  assert.ok(screen.getByRole('heading', { level: 1, name: 'Sign in to download your plan' }));
  assert.ok(screen.getByText('Keep your edits. Unlock a clean download.'));
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

test('monthly checkout records the terms agreement and only confirmed purchases offer a downloadable acknowledgment', async () => {
  const { MONTHLY_VERSION, MONTHLY_AGREEMENT } = await import('../supabase/functions/planpatch-account/monthly-offer.js');
  const calls = [];
  const account = { user: { id: 'subscription-ui-test' } };
  const access = { data: { checkoutReady: true, billingAvailable: true, monthlyOfferVersion: MONTHLY_VERSION },
    checkout: async (...args) => { calls.push(args); } };
  const view = render(React.createElement(AccountPage, { billing: true, account, access }));
  const [policies] = screen.getAllByRole('checkbox');
  const monthly = screen.getByRole('button', { name: 'Continue to test payment' });
  const project = screen.getByRole('button', { name: 'Buy a project credit' });
  assert.equal(screen.getAllByRole('checkbox').length, 1);
  assert.equal(policies.checked, false);
  assert.equal(policies.labels[0].textContent, MONTHLY_AGREEMENT);
  assert.equal(monthly.disabled, true);
  fireEvent.click(policies);
  assert.equal(project.disabled, false);
  assert.equal(monthly.disabled, false);
  assert.equal(screen.queryByText('Save subscription confirmation'), null);
  fireEvent.click(monthly);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], { accepted: true, version: MONTHLY_VERSION });
  // An older paid order always prints the disclosure accepted at the time of purchase.
  const confirmed = { offer_version: 'monthly-usd19-2026-11-19', offer_text: 'I authorize the original monthly offer.', amount_paid_cents: 1900,
    accepted_at: '2026-11-19T01:00:00Z', paid_at: '2026-11-19T01:01:00Z', first_period_end: '2026-12-19T01:01:00Z', invoice_id: 'in_test_confirmed' };
  view.rerender(React.createElement(AccountPage, { billing: true, account, access: {
    ...access, data: { ...access.data, monthly: true, monthlyConfirmation: confirmed },
  } }));
  const download = screen.getByRole('link', { name: 'Save subscription confirmation' });
  assert.match(download.download, /\.txt$/);
  const text = decodeURIComponent(download.href.split(',').slice(1).join(','));
  for (const item of [confirmed.offer_version, confirmed.offer_text, confirmed.invoice_id, '$19.00 USD', 'https://www.editfloorplans.com/#/account/billing']) {
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
  assert.equal(requests, 0);
  click('button', 'Door');
  click('button', 'Text');
  assert.equal(requests, 2);
  click('button', 'View');
  assert.equal(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed'), 'true');
  const file = { name: 'Delayed plan.pdf', size: 512 };
  let finishReading;
  file.arrayBuffer = () => new Promise(resolve => { finishReading = resolve; });
  fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [file] } });
  view.rerender(React.createElement(Editor, { ...props, active: false }));
  await act(async () => finishReading(new ArrayBuffer(4)));
  assert.equal(previews, 0);
  assert.equal(screen.queryByRole('dialog'), null);
});

for (const compact of [false, true]) {
  test(`the ${compact ? 'mobile' : 'desktop'} blank preview opens a sample beside Upload and hands it to the edit gate`, (t) => {
    const previous = window.matchMedia;
    window.matchMedia = () => ({ matches: compact, addEventListener() {}, removeEventListener() {} });
    t.after(() => { window.matchMedia = previous; });
    const previews = [], editRequests = [];
    render(React.createElement(Editor, {
      previewOnly: true,
      onPreviewPlanChange: plan => previews.push(plan),
      onRequestEditing: plan => editRequests.push(plan),
    }));
    const canvas = screen.getByRole('main', { name: 'Drawing workspace' });
    assert.ok(within(canvas).getByRole('button', { name: 'Upload', exact: true }));
    fireEvent.click(within(canvas).getByRole('button', { name: 'Try a sample plan' }));
    assert.equal(previews.length, 1);
    assert.equal(count(), previews[0].elements.length);
    assert.ok(svg().querySelector('[data-element-id]'));
    assert.equal(screen.queryByRole('button', { name: 'Try a sample plan' }), null);
    click('button', 'Zoom in');
    assert.equal(editRequests.length, 0);
    if (compact) click('button', 'Edit');
    click('button', compact ? 'Door' : 'Wall');
    assert.deepEqual(editRequests, [previews[0]]);
  });
}

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


test('guests and expired accounts can edit freely and reach the paywall only at export', async () => {
  const { default: GatedRoot } = await import('../.test-build/gatedRoot.mjs');
  const previous = window.location.href;
  const previousKeyRange = globalThis.IDBKeyRange;
  globalThis.IDBKeyRange = IDBKeyRange;
  try {
    for (const state of ['guest', 'expired']) {
      globalThis.indexedDB = new IDBFactory();
      const guest = state === 'guest';
      globalThis.__editorAccess = {
        account: { enabled: true, ...(guest ? { client: {} } : { user: { id: state, email: state + '@example.test' } }) },
        access: { canDownload: async () => false, data: guest ? null : { paymentsRequired: true, trialEndsAt: '2020-01-01T00:00:00Z' } },
      };
      localStorage.removeItem('editfloorplans-sample-guide:' + state);
      window.history.replaceState(null, '', '/#/editor');
      render(React.createElement(GatedRoot));
      await screen.findByRole('region', { name: 'Guided sample edit' });
      click('button', 'Skip guide and explore');
      const canvas = svg();
      const before = count();
      click('button', 'Wall');
      draw(400, 700, 700, 700);
      assert.ok(count() > before);
      assert.equal(screen.queryByRole('dialog'), null);
      click('button', 'Export');
      const dialog = await screen.findByRole('dialog');
      assert.ok(canvas.closest('.editorRoot').hasAttribute('inert'));
      if (guest) assert.ok(within(dialog).getByRole('button', { name: 'Create account' }));
      else assert.ok(within(dialog).getByRole('link', { name: /Export this project/ }));
      assert.ok(count() > before);
      cleanup(); sessionStorage.clear();
    }
  } finally {
    cleanup(); window.history.replaceState(null, '', previous);
    globalThis.IDBKeyRange = previousKeyRange; delete globalThis.__editorAccess;
  }
});

test('an unavailable raster cannot corrupt the project archive, and the same image can be retried', async (t) => {
  const owner = 'low-memory-import';
  render(React.createElement(Editor, { owner }));
  await waitSaved();
  const input = document.querySelector('input[type=file]');
  const file = new File(['scanned plan'], 'scan.png', { type: 'image/png' });
  const encode = t.mock.method(HTMLCanvasElement.prototype, 'toDataURL', () => 'data:,');
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByRole('dialog', { name: 'Could not import this file' });
  click('button', 'Continue');
  assert.equal(svg().querySelector('image'), null);
  await waitFor(() => assert.equal(document.querySelector('.projectButton').disabled, false));
  encode.mock.restore();
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => assert.equal(svg().querySelector('image')?.getAttribute('href'), png));
  await waitSaved();
  cleanup();
  render(React.createElement(Editor, { owner }));
  await waitSaved();
  assert.equal(svg().querySelector('image')?.getAttribute('href'), png);
});

test('an unreadable PDF releases its loading worker and leaves the editor ready for another upload', async (t) => {
  const failure = new Error('Invalid PDF structure');
  const destroy = t.mock.fn(async () => {});
  t.mock.method(globalThis, '__pdfDocument', () => ({ promise: Promise.reject(failure), destroy }));
  render(React.createElement(Editor, { owner: 'unreadable-pdf' }));
  await waitSaved();
  fireEvent.change(document.querySelector('input[type=file]'), { target: {
    files: [{ name: 'broken.pdf', size: 5, arrayBuffer: async () => new ArrayBuffer(5) }],
  } });
  await screen.findByRole('dialog', { name: 'Could not import this file' });
  click('button', 'Continue');
  await waitFor(() => assert.equal(destroy.mock.callCount(), 1));
  assert.equal(count(), 0);
  assert.equal(document.querySelector('.projectButton').disabled, false);
});

test('guided doorway move previews an imported swing, saves once, and undoes cleanup and placement together', async () => {
  const app = render(React.createElement(Editor));
  await waitSaved();
  await newProject('Guided doorway on original');
  fireEvent.change(document.querySelector('input[type=file]'), {
    target: { files: [new File(['floor plan'], 'doorway.png', { type: 'image/png' })] },
  });
  await waitFor(() => assert.ok(svg().querySelector('image')));
  const controls = () => within(screen.getByRole('region', { name: 'Move a doorway' }));
  const start = () => { click('button', 'Door'); click('button', 'Move a doorway'); };
  const mark = () => {
    start();
    tap(200, 200);
    tap(290, 200);
    tap(200, 110);
    tap(500, 400);
    tap(500, 510);
  };
  mark();
  assert.equal(count(), 0);
  assert.ok(svg().querySelector('mask path'));
  assert.ok(svg().querySelector('g[transform="translate(500 400) rotate(90)"]'));
  assert.ok(screen.getByRole('button', { name: 'Export' }).disabled);
  fireEvent.click(controls().getByText('Back'));
  assert.equal(svg().querySelector('mask'), null);
  tap(610, 400);
  fireEvent.click(controls().getByText('Cancel'));
  assert.equal(count(), 0);
  assert.equal(svg().querySelector('mask'), null);
  mark();
  fireEvent.change(controls().getByRole('combobox'), { target: { value: 'door-single-right' } });
  fireEvent.click(controls().getByText('Swap hinge'));
  fireEvent.click(controls().getByText('Apply move'));
  assert.equal(count(), 2);
  const door = () => svg().querySelector('g[transform="translate(500 490) rotate(270)"]');
  assert.ok(door());
  assert.equal(door().querySelector('line').getAttribute('y2'), '90');
  click('button', 'Undo');
  assert.equal(count(), 0);
  assert.equal(svg().querySelector('mask'), null);
  assert.equal(door(), null);
  click('button', 'Redo');
  assert.ok(door());
  assert.ok(svg().querySelector('mask path'));
  await waitSaved();
  app.unmount();
  render(React.createElement(Editor));
  await waitSaved();
  assert.ok(door());
  assert.ok(svg().querySelector('mask path'));
});

test('phone doorway move preserves an editable door and existing wall and ignores interrupted taps', async (t) => {
  const previous = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  t.after(() => { window.matchMedia = previous; });
  render(React.createElement(Editor));
  await waitSaved();
  await newProject('Guided doorway on wall');
  click('button', 'Edit');
  tap(200, 200); tap(900, 200);
  click('button', 'Door'); click('button', 'Double');
  tap(250, 200);
  const original = svg().querySelector('g[data-element-id][transform]');
  const id = original.getAttribute('data-element-id');
  const before = original.getAttribute('transform');
  click('button', 'Door'); click('button', 'Move a doorway');
  const controls = within(screen.getByRole('region', { name: 'Move a doorway' }));
  draw(250, 200, 310, 290);
  assert.ok(controls.getByText(/Tap the old hinge/));
  const touch = { button: 0, clientX: 250, clientY: 200, pointerId: 1, pointerType: 'touch' };
  fireEvent.pointerDown(original.querySelector('rect'), touch);
  fireEvent.pointerUp(svg(), touch);
  assert.ok(controls.getByText('Tap the new hinge location.'));
  fireEvent.pointerDown(svg(), touch);
  fireEvent.pointerCancel(svg(), touch);
  assert.ok(controls.getByText('Tap the new hinge location.'));
  tap(600, 205); tap(750, 205);
  assert.equal(controls.getByRole('combobox').value, 'door-double');
  fireEvent.click(controls.getByText('Apply move'));
  assert.equal(count(), 2);
  const door = () => svg().querySelector('g[data-element-id="' + id + '"]');
  assert.equal(door().getAttribute('transform'), 'translate(600 200) rotate(0)');
  click('button', 'Undo');
  assert.equal(door().getAttribute('transform'), before);
});

for (const compact of [false, true]) test(`first-time ${compact ? 'mobile' : 'desktop'} guide teaches wall, text, window and couch without export`, async (t) => {
  const previousMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: compact, addEventListener() {}, removeEventListener() {} });
  t.after(() => { window.matchMedia = previousMedia; });
  const owner = 'tutorial-new-visitor-' + compact;
  localStorage.removeItem('editfloorplans-sample-guide:' + owner);
  function TutorialEditor() {
    const [showUpload, setShowUpload] = React.useState(false);
    return React.createElement(Editor, {
      owner, freeEditing: true, showUpload, watermarkPreview: true,
      onOpenUpload: () => setShowUpload(true),
      onOpenWorkspace: () => setShowUpload(false),
    });
  }
  render(React.createElement(TutorialEditor));
  await screen.findByRole('heading', {name:'Choose Wall'});
  assert.ok(svg().querySelector('[data-preview-watermark]'));
  click('button','Wall');
  await screen.findByRole('heading',{name:'Draw a new wall'});
  assert.ok(svg().querySelector('[data-tour-marks]'));
  if(compact) { tap(300,590); tap(940,590); } else draw(300,590,940,590);
  await screen.findByRole('heading',{name:'Choose Text'});
  click('button','Text'); tap(800,450);
  await screen.findByRole('heading',{name:'Edit your text'});
  fireEvent.change(screen.getByRole('textbox',{name:'Room name'}),{target:{value:'Living room'}});
  click('button','Continue');
  await screen.findByRole('heading',{name:'Choose Window'});
  click('button','Window'); tap(300,700);
  await screen.findByRole('heading',{name:'Choose Couch'});
  click('button','Couch'); tap(780,740);
  await screen.findByRole('heading',{name:'Tutorial complete'});
  assert.ok(screen.getByRole('button',{name:'Open your own plan'}));
  assert.equal(screen.queryByRole('dialog',{name:'Export plan'}),null);
  assert.ok([...svg().querySelectorAll('text')].some(el=>el.textContent==='Living room'));
  click('button','Open your own plan');
  await screen.findByRole('heading',{name:'Open your own plan'});
  assert.equal(svg(),null);
  const input = document.querySelector('input[type=file]');
  fireEvent.change(input,{target:{files:[new File(['scanned plan'],'my-plan.png',{type:'image/png'})]}});
  await waitFor(() => assert.ok(svg()?.querySelector('image')));
  assert.equal(count(),0);
  await waitSaved(); cleanup();
  render(React.createElement(Editor,{owner,freeEditing:true}));
  await waitSaved();
  assert.equal(screen.queryByRole('region',{name:'Guided sample edit'}),null);
});
