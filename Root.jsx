import React, { Suspense, lazy, useEffect, useState } from 'react';
import Marketing, { DEMO_HASH, SiteHeader } from './Marketing.jsx';
import { Brand, PRODUCT_NAME } from './ui.jsx';
import { hasOpenedPlan } from './useProjectStore.js';

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
      {!showEditor && <Marketing page={route} />}
      {visitedEditor && (
        <div className="editorRoot" hidden={!showEditor}>
          {showEditor && <SiteHeader page={route} />}
          <div className="editorSurface">
            <Suspense
              fallback={
                <div className="loadingScreen">
                  <Brand />
                  <p>Opening your workspace…</p>
                </div>
              }
            >
              <Editor
                active={showEditor}
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
              />
            </Suspense>
          </div>
        </div>
      )}
    </>
  );
}
