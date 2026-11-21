import { beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { persistProjects, readProjects, useProjectStore } from '../useProjectStore.js';

const dom = new JSDOM('', { url: 'https://blueprint.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, renderHook, waitFor } = await import('@testing-library/react');
const project = (id) => ({ id, name: id, unitsPerInch: 4, elements: [], createdAt: 1, updatedAt: 2 });
const owner = 'remodeler';

async function openTabs(count = 2) {
  const open = () => renderHook(() => useProjectStore(() => project('blank'), null, false, owner));
  const tabs = Array.from({ length: count }, open);
  await waitFor(() => assert.ok(tabs.every(tab => tab.result.current.hydrated)));
  return tabs;
}

async function save(tab, change) {
  let result;
  await act(async () => {
    change(tab.result.current);
    result = await tab.result.current.flush();
  });
  return result;
}

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); });
afterEach(cleanup);

test('independent tabs can create and edit different local plans without replacing either drawing', async () => {
  const [first, second] = await openTabs();
  assert.ok(await save(first, store => store.addLocalProject(project('Laundry'))));
  assert.ok(await save(second, store => store.addLocalProject(project('Kitchen'))));
  assert.ok(await save(first, store => store.setProject(p => ({ ...p, name: 'Laundry revision' }))));
  const saved = await readProjects(owner);
  assert.deepEqual(saved.map(p => p.name).sort(), ['Kitchen', 'Laundry revision']);
});

test('a stale editor cannot overwrite or resurrect a plan changed or deleted in another tab', async () => {
  await persistProjects([project('A'), project('B')], owner);
  const [first, staleA, staleB] = await openTabs(3);
  assert.ok(await save(first, store => store.setProjects(plans => plans
    .filter(p => p.id !== 'A')
    .map(p => ({ ...p, name: 'Latest B' })))));
  for (const [id, tab] of [['A', staleA], ['B', staleB]]) {
    assert.equal(await save(tab, store => store.setProjects(plans => plans.map(p =>
      p.id === id ? { ...p, name: 'Other edit' } : p))), false);
    assert.match(tab.result.current.saveStatus, /changed in another tab/);
  }
  const saved = await readProjects(owner);
  assert.deepEqual(saved.map(p => p.name), ['Latest B']);
});
