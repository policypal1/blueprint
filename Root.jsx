import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AccountPage from './Account.jsx';
import { ResetPasswordPage, SignInPage } from './Auth.jsx';
import Marketing, { DEMO_HASH, SiteHeader } from './Marketing.jsx';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';
import { hasOpenedPlan } from './useProjectStore.js';
import { createProjectRepository } from './account-projects.js';
import { useAccount } from './useAccount.js';
import usePlanPatchAccount from './usePlanPatchAccount.js';

const Editor = lazy(() => import('./App.jsx'));
const RECENT_HASH = '#/editor';
const WORKSPACE_HASH = '#/editor/workspace';
const SIGN_IN_HASH = '#/sign-in';
const PAGE_TITLES = {
  recent: 'Recent plans',
  workspace: 'Editor',
  sample: 'Editor',
  pricing: 'Pricing',
  account: 'Account',
  security: 'Sign-in & security',
  billing: 'Billing',
  signIn: 'Sign in',
  resetPassword: 'Reset password',
};

function readRoute() {
  const hash = window.location.hash;
  if (hash === WORKSPACE_HASH) return 'workspace';
  if (hash === '#/editor/sample') return 'sample';
  if (hash.startsWith(RECENT_HASH) || (!hash && hasOpenedPlan())) return 'recent';
  if (hash === '#/account') return 'account';
  if (hash === '#/account/security') return 'security';
  if (hash === '#/account/billing') return 'billing';
  if (hash === SIGN_IN_HASH) return 'signIn';
  if (hash === '#/reset-password') return 'resetPassword';
  if (hash === DEMO_HASH) return 'demo';
  return hash.startsWith('#/pricing') ? 'pricing' : 'home';
}
function isEditorRoute(route) {
  return ['recent', 'workspace', 'sample'].includes(route);
}
function EditorAccess({ account, access, onSignIn }) {
  if (account.loading || (account.user && access.loading)) {
    return <main className="accessPage" role="status">Checking editor access…</main>;
  }

  let title, message, action;
  if (!account.user) {
    title = 'Sign in to open the editor';
    message = account.client
      ? 'Use your PlanPatch account to open and manage your saved plans.'
      : 'Account sign-in is currently unavailable.';
    action = account.client && <button className="primary" onClick={onSignIn}>Sign in</button>;
  } else if (access.data?.deleting) {
    title = 'Account deletion in progress';
    message = 'Open security settings to finish deleting your account.';
    action = <a className="button primary" href="#/account/security">Open security settings</a>;
  } else if (!access.data) {
    title = 'Editor access could not be checked';
    message = access.error || 'Try checking your account again.';
    action = <button className="primary" onClick={access.refresh}>Try again</button>;
  } else {
    title = 'Unlock the editor';
    message = 'Use a $10 sandbox credit for one saved project or start a $19 monthly test subscription.';
    action = <a className="button primary" href="#/account/billing">View sandbox plans</a>;
  }

  return (
    <main className="accessPage">
      <h1>{title}</h1>
      <p>{message}</p>
      {action}
    </main>
  );
}

export default function Root() {
  const account = useAccount();
  const owner = account.user?.id;
  const access = usePlanPatchAccount(account.client, owner);
  const priorOwner = useRef(owner);
  const beforeLeaving = useRef(null);
  const registerSave = useCallback((save) => { beforeLeaving.current = save; }, []);
  const repository = useMemo(() => owner && account.client
    ? createProjectRepository(account.client, owner) : null, [account.client, owner]);
  const [route, setRoute] = useState(() => {
    const initial = readRoute();
    return initial === 'workspace' ? 'recent' : initial;
  });
  const [visitedEditor, setVisitedEditor] = useState(() => isEditorRoute(route));
  const [signInDialog, setSignInDialog] = useState(false);
  const signInTarget = useRef('#/account');
  const showEditor = isEditorRoute(route);
  const policy = access.data;
  const requireSignIn = Boolean(import.meta.env?.PROD || account.enabled);
  const editorAllowed = !requireSignIn || Boolean(owner && policy && !policy.deleting && (
    !policy.paymentsRequired || policy.monthly || policy.projectCredits > 0 || policy.projectIds?.length
  ));
  const projectAccess = policy?.paymentsRequired && !policy.monthly
    ? { credits: policy.projectCredits, ids: policy.projectIds, refresh: access.refresh }
    : null;
  const showAccount = ['account', 'security', 'billing'].includes(route);
  const showAuthPage = route === 'signIn' || route === 'resetPassword';

  function openSignIn() {
    if (showEditor) {
      signInTarget.current = route === 'workspace' ? WORKSPACE_HASH : RECENT_HASH;
      setSignInDialog(true);
      return;
    }
    signInTarget.current = showAccount ? window.location.hash : '#/account';
    window.location.hash = SIGN_IN_HASH;
  }

  const finishSignIn = useCallback(() => {
    if (window.location.hash === SIGN_IN_HASH) {
      window.history.replaceState(window.history.state, '', signInTarget.current);
      window.dispatchEvent(new Event('hashchange'));
    }
    setSignInDialog(false);
    signInTarget.current = '#/account';
  }, []);

  const signOut = () => account.signOut(beforeLeaving.current);
  const finishDeletion = async () => {
    await account.signOut();
    window.location.hash = '#/';
  };
  const signInProps = {
    account,
    onAuthenticate: (mode, email, password) => account.authenticate(mode, email, password, beforeLeaving.current),
    onGoogle: () => account.signInWithGoogle(beforeLeaving.current, signInTarget.current),
    onAuthenticated: finishSignIn,
  };
  const accountNav = account.enabled ? {
    signedIn: Boolean(owner),
    user: account.user,
    onSignOut: signOut,
    busy: account.busy || account.loading,
  } : null;
  useEffect(() => {
    if (window.location.hash === WORKSPACE_HASH || (!window.location.hash && hasOpenedPlan())) {
      window.history.replaceState(window.history.state, '', RECENT_HASH);
    }
    const navigate = () => {
      const next = readRoute();
      setRoute(next);
      if (isEditorRoute(next)) setVisitedEditor(true);
      else setSignInDialog(false);
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
    if (owner && (route === 'signIn' || signInDialog)) finishSignIn();
  }, [owner, route, signInDialog, finishSignIn]);
  useEffect(() => {
    const title = PAGE_TITLES[route];
    document.title = title
      ? `${title} · ${PRODUCT_NAME}`
      : `${PRODUCT_NAME} · Edit your current blueprint`;
  }, [route]);
  return (
    <>
      {account.error && (
        <div className="accountAlert" role="alert">
          <span>{account.error}</span>
          <button aria-label="Dismiss sign-in notice" onClick={account.clearError}><Icon name="close" /></button>
        </div>
      )}
      {!showEditor && !showAccount && !showAuthPage && <Marketing page={route} account={accountNav} />}
      {showAuthPage && (
        <>
          <SiteHeader page={route} account={accountNav} />
          {route === 'signIn' ? <SignInPage {...signInProps} /> : <ResetPasswordPage account={account} />}
        </>
      )}
      {showAccount && (
        <>
          <SiteHeader page={route} account={accountNav} />
          <AccountPage billing={route === 'billing'} security={route === 'security'}
            account={account} access={access} onSignIn={openSignIn}
            onSignOut={signOut} onDeleted={finishDeletion} />
        </>
      )}
      {(showEditor || (visitedEditor && editorAllowed)) && (
        <div className="editorRoot" hidden={!showEditor}>
          {showEditor && <SiteHeader page={route} account={accountNav} />}
          {!editorAllowed ? <EditorAccess account={account} access={access} onSignIn={openSignIn} /> : (
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
                projectAccess={projectAccess}
                accountsEnabled={Boolean(account.client)}
                authBusy={account.busy}
                onSignIn={openSignIn}
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
          )}
        </div>
      )}
      {signInDialog && showEditor && (
        <SignInPage {...signInProps} onClose={() => setSignInDialog(false)} />
      )}
    </>
  );
}
