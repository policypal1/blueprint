import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React from 'react';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await mkdir(path.join(root, '.test-build'), { recursive: true });
await build({
  entryPoints: [path.join(root, 'PrivacyChoices.jsx')],
  outfile: path.join(root, '.test-build/privacy-choices.mjs'),
  bundle: true, platform: 'node', format: 'esm', packages: 'external',
});
const dom = new JSDOM('<body></body>', { url: 'https://blueprint.test/' });
for (const key of ['window','document','HTMLElement','Event','StorageEvent']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, act } = await import('@testing-library/react');
const { ConsentAnalytics, PrivacyChoices } = await import('../.test-build/privacy-choices.mjs');
const create = React.createElement;
const key = 'blueprint.analytics-choice.v1';
function mount(path = '/editor', banner = true) {
  return render(create(React.Fragment, null, create(ConsentAnalytics, { path }), create(PrivacyChoices, { banner })));
}
function queued(type) { return (window.vaq ?? []).filter(([name]) => name === type); }
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.head.replaceChildren();
  delete window.va;
  delete window.vaq;
  delete navigator.globalPrivacyControl;
});

test('blocks analytics before choice, persists decline, and allows later opt-in and withdrawal', () => {
  const visitors = mount();
  assert.equal(document.querySelectorAll('script').length, 0);
  assert.equal(queued('pageview').length, 0);
  fireEvent.click(screen.getByRole('button', { name:'Decline analytics' }));
  assert.equal(window.localStorage.getItem(key), 'decline');
  assert.equal(screen.queryByRole('button', { name:'Accept analytics' }), null);
  assert.equal(document.querySelectorAll('script').length, 0);
  visitors.unmount();

  const settings = mount('/privacy', false);
  fireEvent.click(screen.getByRole('button', { name:'Accept analytics' }));
  assert.equal(window.localStorage.getItem(key), 'accept');
  assert.equal(document.querySelectorAll('script').length, 1);
  assert.deepEqual(queued('pageview').at(-1)[1], { route:'/privacy', path:'/privacy' });
  const beforeSend = queued('beforeSend').at(-1)[1];
  const safe = 'https://blueprint.test/privacy';
  const event = { type:'pageview', url:safe + '?code=private#account' };
  assert.equal(beforeSend(event).url, safe);
  assert.equal(beforeSend({ ...event, url:'https://outside.example/private' }), null);
  fireEvent.click(screen.getByRole('button', { name:'Decline analytics' }));
  assert.equal(beforeSend(event), null);
  settings.unmount();
  mount('/how-to-edit-a-floor-plan-pdf');
  assert.equal(queued('pageview').length, 1);
});

test('an invalid stored preference defaults to no tracking; another tab can revoke consent', () => {
  window.localStorage.setItem(key, 'invalid');
  mount();
  assert.equal(document.querySelectorAll('script').length, 0);
  fireEvent.click(screen.getByRole('button', { name:'Accept analytics' }));
  const beforeSend = queued('beforeSend').at(-1)[1];
  act(() => {
    window.localStorage.setItem(key, 'decline');
    window.dispatchEvent(new StorageEvent('storage', { key, newValue:'decline' }));
  });
  assert.equal(beforeSend({ type:'pageview', url:window.location.href }), null);
  assert.equal(screen.queryByRole('button', { name:'Accept analytics' }), null);
});

test('Global Privacy Control overrides an earlier opt-in and keeps analytics off', () => {
  Object.defineProperty(navigator, 'globalPrivacyControl', { value:true, configurable:true });
  window.localStorage.setItem(key, 'accept');
  mount('/privacy', false);
  assert.match(screen.getByRole('status').textContent, /Global Privacy Control/);
  assert.equal(screen.queryByRole('button', { name:'Accept analytics' }), null);
  assert.equal(document.querySelectorAll('script').length, 0);
});

test('declining remains effective for this tab if browser storage writes are blocked', () => {
  window.localStorage.setItem(key, 'accept');
  const prototype = Object.getPrototypeOf(window.localStorage);
  const originalSet = prototype.setItem;
  try {
    prototype.setItem = () => { throw new Error('write blocked'); };
    mount('/privacy', false);
    const beforeSend = queued('beforeSend').at(-1)[1];
    fireEvent.click(screen.getByRole('button', { name:'Decline analytics' }));
    assert.match(screen.getByRole('status').textContent, /is off/);
    assert.equal(window.localStorage.getItem(key), null);
    assert.equal(beforeSend({ type:'pageview', url:window.location.href }), null);
  } finally {
    prototype.setItem = originalSet;
    act(() => window.dispatchEvent(new StorageEvent('storage', { key:null })));
  }
});
