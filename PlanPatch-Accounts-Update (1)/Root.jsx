import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Marketing, { DEMO_HASH, SiteHeader } from './Marketing.jsx';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';
import { hasOpenedPlan } from './useProjectStore.js';
import { createProjectRepository } from './account-projects.js';
import { useAccount } from './useAccount.js';

const Editor = lazy(() => import('./App.jsx'));
const RECENT_HASH = '#/editor';
const WORKSPACE_HASH = '#/editor/workspace';

function readRoute() {
  const hash = window.location.hash;
  if (hash === WORKSPACE_HASH) return 'workspace';
  if (hash === '#/editor/sample') return 'sample';
  if (hash.startsWith(RECENT_HASH) || (!hash && hasOpenedPlan())) return 'recent';
  if (hash === DEMO_HASH) return 'demo';
  return hash.startsWith('#/pricing') ? 'pricing' : 'home';
}
function isEditorRoute(route) {
  return ['recent', 'workspace', 'sample'].includes(route);
}
export default function Root() {
  const account = useAccount();
  const owner = account.user?.id;
  const priorOwner = useRef(owner);
  const beforeLeaving = useRef(null);
  const registerSave = useCallback((save) => { beforeLeaving.current = save; }, []);
  const signIn = () => account.signIn(beforeLeaving.current);
  const accountNav = account.client ? {
    signedIn: Boolean(owner),
    busy: account.busy || account.loading,
    onAction: owner ? () => account.signOut(beforeLeaving.current) : signIn,
  } : null;
  const repository = useMemo(() => owner && account.client
    ? createProjectRepository(account.client, owner) : null, [account.client, owner]);
  const [route, setRoute] = useState(() => {
    const initial = readRoute();
    return initial === 'workspace' ? 'recent' : initial;
  });
  const [visitedEditor, setVisitedEditor] = useState(() => isEditorRoute(route));
  const showEditor = isEditorRoute(route);
  useEffect(() => {
    if (window.location.hash === WORKSPACE_HASH || (!window.location.hash && hasOpenedPlan())) {
      window.history.replaceState(window.history.state, '', RECENT_HASH);
    }
    const navigate = () => {
      const next = readRoute();
      setRoute(next);
      if (isEditorRoute(next)) setVisitedEditor(true);
      if (next !== 'demo') window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    const lostAccount = priorOwner.current && priorOwner.current !== owner;
    if ((lostAccount && window.location.hash === WORKSPACE_HASH) || (owner && !window.location.hash)) {
      window.location.hash = RECENT_HASH;
      setRoute('recent');
      setVisitedEditor(true);
    }
    priorOwner.current = owner;
  }, [owner]);
  useEffect(() => {
    document.title =
      route === 'recent'
        ? `Recent plans · ${PRODUCT_NAME}`
        : showEditor
        ? `Editor · ${PRODUCT_NAME}`
        : route === 'pricing'
          ? `Pricing · ${PRODUCT_NAME}`
          : `${PRODUCT_NAME} · Edit your current blueprint`;
  }, [route, showEditor]);
  return (
    <>
      {account.error && (
        <div className="accountAlert" role="alert">
          <span>{account.error}</span>
          <button aria-label="Dismiss sign-in notice" onClick={account.clearError}><Icon name="close" /></button>
        </div>
      )}
      {!showEditor && <Marketing page={route} account={accountNav} />}
      {visitedEditor && (
        <div className="editorRoot" hidden={!showEditor}>
          {showEditor && <SiteHeader page={route} account={accountNav} />}
          <div className="editorSurface">
            <Suspense
              fallback={
                <div className="loadingScreen">
                  <Brand />
                  <p>Opening your workspace…</p>
                </div>
              }
            >
              {account.loading ? (
                <div className="loadingScreen" role="status">Opening your workspace…</div>
              ) : <Editor
                key={owner || 'guest'}
                active={showEditor}
                repository={repository}
                accountsEnabled={Boolean(account.client)}
                authBusy={account.busy}
                onSignIn={signIn}
                onRegisterSave={registerSave}
                showRecent={route === 'recent'}
                sampleRequested={route === 'sample'}
                onOpenWorkspace={() => {
                  if (window.location.hash !== WORKSPACE_HASH) window.location.hash = WORKSPACE_HASH;
                  setRoute('workspace');
                }}
                onSampleOpened={() => {
                  window.history.replaceState(window.history.state, '', WORKSPACE_HASH);
                  setRoute('workspace');
                }}
              />}
            </Suspense>
          </div>
        </div>
      )}
    </>
  );
}
