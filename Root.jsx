import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AccountPage from './Account.jsx';
import { ResetPasswordPage, SignInPage } from './Auth.jsx';
import { DEMO_HASH, SiteFooter, SiteHeader } from './Marketing.jsx';
import PublicPage from './PublicPage.jsx';
import TrialPage from './Trial.jsx';
import TrialStatus from './TrialStatus.jsx';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';
import { removeDeviceProjects } from './useProjectStore.js';
import { createProjectRepository } from './account-projects.js';
import { useAccount } from './useAccount.js';
import usePlanPatchAccount, { useTrialOffer } from './usePlanPatchAccount.js';
import { canOpenEditor, fullEditorAccess, timedAccessActive } from './access.js';
import { publicPageAt, publicPages } from './seo-pages.js';

const Editor = lazy(() => import('./App.jsx'));
const RECENT_HASH = '#/editor';
const WORKSPACE_HASH = '#/editor/workspace';
const SIGN_IN_HASH = '#/sign-in';
const EDITOR_SIGN_IN_URL = '/sign-in?next=editor';
const PAGE_TITLES = {
  recent: 'Recent plans',
  workspace: 'Editor',
  sample: 'Editor',
  account: 'Account',
  security: 'Sign-in & security',
  billing: 'Billing',
  signIn: 'Sign in',
  resetPassword: 'Reset password',
  trial: 'Free trial',
};

function readRoute() {
  const hash = window.location.hash;
  if (hash === WORKSPACE_HASH) return 'workspace';
  if (hash === '#/editor/sample') return 'sample';
  if (hash.startsWith(RECENT_HASH)) return 'recent';
  if (hash === '#/account') return 'account';
  if (hash === '#/account/security') return 'security';
  if (hash === '#/account/billing') return 'billing';
  if (hash === SIGN_IN_HASH) return 'signIn';
  if (hash === '#/reset-password') return 'resetPassword';
  if (hash === '#/trial') return 'trial';
  if (hash === DEMO_HASH) return 'demo';
  return (hash.startsWith('#/') && publicPageAt(hash.slice(1)))
    || publicPageAt(window.location.pathname) || 'home';
}
function isEditorRoute(route) {
  return ['recent', 'workspace', 'sample'].includes(route);
}
function editorSignInLocation() {
  return publicPageAt(window.location.pathname) === 'signIn'
    && new URLSearchParams(window.location.search).get('next') === 'editor';
}
function EditorAccess({ account, access, offer }) {
  if (account.loading || (account.user && access.loading)) {
    return <main className="accessPage" role="status">Checking editor access…</main>;
  }

  let title, message, action;
  if (access.data?.deleting) {
    title = 'Account deletion in progress';
    message = 'Open security settings to finish deleting your account.';
    action = <a className="button primary" href="#/account/security">Open security settings</a>;
  } else if (!access.data) {
    title = 'Editor access could not be checked';
    message = access.error || 'Try checking your account again.';
    action = <button className="primary" onClick={access.refresh}>Try again</button>;
  } else if (offer && access.data.canStartTrial) {
    title = 'Try the editor free for 3 days';
    message = 'Edit and export your blueprint. No credit card needed.';
    action = <a className="button primary" href="#/trial">Start free trial</a>;
  } else {
    title = access.data.trialEndsAt ? 'Your free trial has ended' : 'Unlock the editor';
    message = 'Choose a $10 project credit or a $19 monthly plan to edit and download your plans.';
    action = <a className="button primary" href="#/account/billing">View plans</a>;
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
  const trialStatus = useTrialOffer();
  const trialOffer = trialStatus.available;
  const priorOwner = useRef(owner);
  const priorFullAccess = useRef(false);
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
  const editorNeedsSignIn = showEditor && requireSignIn && !owner;
  const editorSignIn = editorNeedsSignIn || (route === 'signIn' && editorSignInLocation());
  const fullAccess = fullEditorAccess(policy);
  const editorAllowed = !requireSignIn || Boolean(owner && canOpenEditor(policy));
  const projectAccess = policy?.paymentsRequired && !fullAccess
    ? { credits: policy.projectCredits, ids: policy.projectIds, refresh: access.refresh }
    : null;
  const showAccount = ['account', 'security', 'billing'].includes(route);
  const showAuthPage = route === 'signIn' || route === 'resetPassword' || editorNeedsSignIn;
  const showTrial = route === 'trial';

  function openSignIn() {
    if (showTrial) {
      signInTarget.current = '#/trial';
      setSignInDialog(true);
      return;
    }
    signInTarget.current = showAccount ? window.location.hash : '#/account';
    window.location.hash = SIGN_IN_HASH;
  }

  const finishSignIn = useCallback(() => {
    if (readRoute() === 'signIn') {
      const target = editorSignInLocation() ? RECENT_HASH : signInTarget.current;
      window.history.replaceState(window.history.state, '', `/${target}`);
      window.dispatchEvent(new Event('hashchange'));
    }
    setSignInDialog(false);
    signInTarget.current = '#/account';
  }, []);

  const signOut = () => account.signOut(beforeLeaving.current);
  const finishDeletion = async () => {
    await Promise.resolve(beforeLeaving.current?.()).catch(() => {});
    await removeDeviceProjects(owner).catch(() => {});
    await account.signOut();
    window.location.hash = '#/';
  };
  const signInProps = {
    account,
    onAuthenticate: (mode, email, password) =>
      account.authenticate(mode, email, password, beforeLeaving.current, editorSignIn ? RECENT_HASH : signInTarget.current),
    onGoogle: () => account.signInWithGoogle(beforeLeaving.current, editorSignIn ? RECENT_HASH : signInTarget.current),
    onAuthenticated: finishSignIn,
  };
  const accountNav = account.enabled ? {
    signedIn: Boolean(owner),
    user: account.user,
    onSignOut: signOut,
    busy: account.busy || account.loading,
  } : null;
  useEffect(() => {
    if (window.location.hash === WORKSPACE_HASH) {
      window.history.replaceState(window.history.state, '', RECENT_HASH);
    } else {
      const legacyPage = window.location.hash.startsWith('#/') && publicPageAt(window.location.hash.slice(1));
      if (legacyPage && legacyPage !== 'home') {
        window.history.replaceState(window.history.state, '', publicPages[legacyPage].path + window.location.search);
      }
    }
    const navigate = () => {
      const next = readRoute();
      setRoute(next);
      if (isEditorRoute(next)) setVisitedEditor(true);
      else setSignInDialog(false);
      if (next !== 'demo') window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', navigate);
    window.addEventListener('popstate', navigate);
    return () => {
      window.removeEventListener('hashchange', navigate);
      window.removeEventListener('popstate', navigate);
    };
  }, []);
  useEffect(() => {
    if (editorNeedsSignIn && !account.loading) {
      window.history.replaceState(window.history.state, '', EDITOR_SIGN_IN_URL);
      setRoute('signIn');
      window.scrollTo(0, 0);
    }
  }, [editorNeedsSignIn, account.loading]);
  useEffect(() => {
    const lostAccount = priorOwner.current && priorOwner.current !== owner;
    if (lostAccount && window.location.hash === WORKSPACE_HASH) {
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
    const accessEnded = priorFullAccess.current && !fullAccess;
    priorFullAccess.current = fullAccess;
    if (route === 'workspace' && accessEnded) {
      window.location.hash = RECENT_HASH;
    }
  }, [route, fullAccess]);
  useEffect(() => {
    const title = PAGE_TITLES[route];
    document.title = publicPages[route]?.title
      ?? (title ? `${title} · ${PRODUCT_NAME}` : publicPages.home.title);
  }, [route]);
  return (
    <>
      {account.error && (
        <div className="accountAlert" role="alert">
          <span>{account.error}</span>
          <button aria-label="Dismiss sign-in notice" onClick={account.clearError}><Icon name="close" /></button>
        </div>
      )}
      {!showEditor && !showAccount && !showAuthPage && !showTrial && (
        <PublicPage page={route} account={accountNav} trialOffer={trialOffer} />
      )}
      {showTrial && (
        <>
          <SiteHeader page={route} account={accountNav} />
          <TrialPage account={account} access={access} offer={trialOffer}
            offerChecking={trialStatus.checking} offerError={trialStatus.error}
            onCheckOffer={trialStatus.refresh} onSignIn={openSignIn} />
          <SiteFooter />
        </>
      )}
      {showAuthPage && (
        <>
          <SiteHeader page={route === 'resetPassword' ? route : 'signIn'} account={accountNav} />
          {route === 'resetPassword' ? <ResetPasswordPage account={account} /> : (
            <SignInPage {...signInProps} editorEntry={editorSignIn} trialOffer={trialOffer} />
          )}
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
      {((showEditor && !editorNeedsSignIn) || (visitedEditor && editorAllowed)) && (
        <div className="editorRoot" hidden={!showEditor}>
          {showEditor && <SiteHeader page={route} account={accountNav} />}
          {showEditor && editorAllowed && !policy?.monthly && timedAccessActive(policy?.trialEndsAt) && (
            <TrialStatus expiresAt={policy.trialEndsAt} />
          )}
          {!editorAllowed ? <EditorAccess account={account} access={access} offer={trialOffer} /> : (
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
                lockedProjectIds={policy?.lockedProjectIds}
                owner={owner}
                showMobileTip
                canDownload={policy?.paymentsRequired ? access.canDownload : undefined}
                authBusy={account.busy}
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
      {signInDialog && showTrial && (
        <SignInPage {...signInProps} initialMode="create" onClose={() => setSignInDialog(false)} />
      )}
    </>
  );
}
