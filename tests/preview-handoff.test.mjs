import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import useEditorPreview from '../useEditorPreview.js';

const dom = new JSDOM('', { url: 'https://example.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { renderHook, act, cleanup, waitFor } = await import('@testing-library/react');
const plan = { id: 'test', name: 'Kitchen plan', elements: [], unitsPerInch: 4 };
const user = { id: 'owner', email: 'morgan@example.test' };
const pendingTicket = () => sessionStorage.getItem('editfloorplans.preview-return');
const open = (initialProps = {}) => renderHook(
  ({ account, oauthOwner }) => useEditorPreview(account, false, oauthOwner), { initialProps },
);
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); sessionStorage.clear(); });
afterEach(cleanup);

test('email handoff survives sign-in and a billing redirect, and stays with that owner', async () => {
  let view = open();
  act(() => view.result.current.setGuestPlan(plan));
  assert.equal(pendingTicket(), null);
  await act(() => view.result.current.prepareSignIn('create', ' Morgan@Example.Test '));
  assert.equal(JSON.parse(pendingTicket()).target.email, user.email);
  view.unmount();
  view = open({ account: user });
  await waitFor(() => assert.equal(view.result.current.plan?.name, plan.name));
  assert.deepEqual(JSON.parse(pendingTicket()).target, { owner: user.id });
  view.unmount();
  view = open({ account: user });
  await waitFor(() => assert.equal(view.result.current.plan?.name, plan.name));
  view.rerender({ account: { ...user, id: 'different-owner' } });
  assert.equal(view.result.current.plan, null);
  assert.equal(pendingTicket(), null);
});

test('an email mismatch or unrelated Google sign-in cannot claim the guest plan', async () => {
  for (const mode of ['signIn', 'google']) {
    const view = open();
    act(() => view.result.current.setGuestPlan(plan));
    await act(() => view.result.current.prepareSignIn(mode, 'other@example.test'));
    view.rerender({ account: user });
    assert.equal(view.result.current.plan, null);
    assert.equal(pendingTicket(), null);
    view.unmount();
  }
  const view = open();
  act(() => view.result.current.setGuestPlan(plan));
  await act(() => view.result.current.prepareSignIn('google'));
  view.unmount();
  const callback = open({ account: user, oauthOwner: user.id });
  await waitFor(() => assert.equal(callback.result.current.plan?.id, plan.id));
  assert.deepEqual(JSON.parse(pendingTicket()).target, { owner: user.id });
});

test('canceling a sign-in keeps the preview in memory and disarms the account handoff', async () => {
  const view = open();
  act(() => view.result.current.setGuestPlan(plan));
  await act(() => view.result.current.prepareSignIn('signIn', user.email));
  act(() => view.result.current.cancelSignIn());
  assert.equal(view.result.current.plan, plan);
  assert.equal(pendingTicket(), null);
  view.rerender({ account: user });
  assert.equal(view.result.current.plan, null);
});

test('canceled asynchronous writes cannot replace a newer plan or leave its ticket armed', async () => {
  const view = open();
  act(() => view.result.current.setGuestPlan(plan));
  await act(async () => {
    const saving = view.result.current.prepareSignIn('create', user.email);
    view.result.current.setGuestPlan({ ...plan, id: 'new' });
    await assert.rejects(saving, /preview changed/i);
  });
  assert.equal(view.result.current.plan.id, 'new');
  assert.equal(pendingTicket(), null);
});

test('storage failure allows email in memory and requires a second Google attempt per drawing', async () => {
  globalThis.indexedDB = { open() { throw new Error('Storage unavailable'); } };
  const view = open();
  act(() => view.result.current.setGuestPlan(plan));
  await act(async () => {
    await assert.rejects(view.result.current.prepareSignIn('google'), { code: 'preview_redirect_unavailable' });
  });
  assert.ok(view.result.current.redirectWarning);
  assert.equal(pendingTicket(), null);
  act(() => view.result.current.cancelSignIn());
  await act(() => view.result.current.prepareSignIn('google'));
  act(() => view.result.current.setGuestPlan({ ...plan, id: 'next' }));
  await act(async () => {
    await assert.rejects(view.result.current.prepareSignIn('google'), { code: 'preview_redirect_unavailable' });
  });
  await act(() => view.result.current.prepareSignIn('signIn', user.email));
  view.rerender({ account: user });
  assert.equal(view.result.current.plan.id, 'next');
  assert.equal(pendingTicket(), null);
});
