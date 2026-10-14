import React, { Suspense, lazy, useEffect, useState } from 'react';
import Marketing from './Marketing.jsx';
import { Brand } from './ui.jsx';
const Editor = lazy(() => import('./App.jsx'));
function readRoute() {
  const hash = window.location.hash;
  return hash.startsWith('#/editor') ? 'editor' : hash.startsWith('#/pricing') ? 'pricing' : 'home';
}
export default function Root() {
  const [route, setRoute] = useState(readRoute);
  const [visitedEditor, setVisitedEditor] = useState(() => readRoute() === 'editor');
  useEffect(() => {
    const navigate = () => {
      const next = readRoute();
      setRoute(next);
      if (next === 'editor') setVisitedEditor(true);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    document.title =
      route === 'editor'
        ? 'Workspace · Blueprint Studio'
        : route === 'pricing'
          ? 'Simple pricing · Blueprint Studio'
          : 'Blueprint Studio · Update the plan';
  }, [route]);
  return (
    <>
      <div hidden={route === 'editor'}>{route !== 'editor' && <Marketing page={route} />}</div>
      {visitedEditor && (
        <div className="editorRoot" hidden={route !== 'editor'}>
          <Suspense
            fallback={
              <div className="loadingScreen">
                <Brand />
                <p>Opening your workspace…</p>
              </div>
            }
          >
            <Editor />
          </Suspense>
        </div>
      )}
    </>
  );
}
