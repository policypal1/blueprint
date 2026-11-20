import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConsentAnalytics, PrivacyChoices } from './PrivacyChoices.jsx';
import AccountPage from './Account.jsx';
import { AuthHeader, ResetPasswordPage, SignInPage } from './Auth.jsx';
import { DEMO_HASH, SiteHeader } from './Marketing.jsx';
import PublicPage from './PublicPage.jsx';
import TrialPage, { ExpiredTrialPlans } from './Trial.jsx';
import useEditorPreview from './useEditorPreview.js';
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
const APP_ROUTE_HASHES = {
  recent: RECENT_HASH,
  workspace: WORKSPACE_HASH,
  sample: '#/editor/sample',
  account: '#/account',
  security: '#/account/security',
  billing: '#/account/billing',
  signIn: SIGN_IN_HASH,
  resetPassword: '#/reset-password',
  trial: '#/trial',
  demo: DEMO_HASH,
};
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
  const page = publicPageAt(window.location.pathname);
  if (!page || page === 'notFound') return 'notFound';
  const hash = window.location.hash;
  const match = Object.entries(APP_ROUTE_HASHES).find(([, routeHash]) => routeHash === hash);
  if (match) return match[0];
  return hash.startsWith('#/') ? publicPageAt(hash.slice(1)) || 'notFound' : page;
}
function isEditorRoute(route) {
  return ['recent', 'workspace', 'sample'].includes(route);
}
function editorSignInLocation() {
  return publicPageAt(window.location.pathname) === 'signIn'
    && new URLSearchParams(window.location.search).get('next') === 'editor';
}
function EditorAccess({ access, accountLoading }) {
  const loading = accountLoading || access.loading;
  let title, message, action;
  if (loading) {
    title = 'Checking editor access';
    message = 'Opening your workspace…';
  } else if (access.data?.deleting) {
    title = 'Account deletion in progress';
    message = 'Open security settings to finish deleting your account.';
    action = <a className="button primary" href="/#/account/security">Open security settings</a>;
  } else if (!access.data) {
    title = 'Couldn’t open the editor';
    message = 'You’re signed in. We couldn’t check your editor access.';
    action = (
      <>
        <button className="primary" onClick={access.refresh}>Check access again</button>
        <a className="button" href="/#/account">Account settings</a>
      </>
    );
  } else if (access.data.canStartTrial) {
    title = 'Try the editor free for 3 days';
    message = 'Edit and export your floor plan. No credit card needed.';
    action = <a className="button primary" href="/#/trial">Start free trial</a>;
  } else if (access.data.trialEndsAt) {
    return <ExpiredTrialPlans />;
  } else {
    title = 'Unlock the editor';
    message = 'Choose a $10 project credit or a $19 monthly plan to edit and download your plans.';
    action = <a className="button primary" href="/#/account/billing">View plans</a>;
  }

  return (
    <main className="accessPage" aria-labelledby="editor-access-title">
      <section className="accessCard">
        <h1 id="editor-access-title">{title}</h1>
        <p role={loading ? 'status' : undefined}>{message}</p>
        {action && <div className="accessActions">{action}</div>}
      </section>
    </main>
  );
}

export default function Root() {
  const account = useAccount();
  const owner = account.user?.id;
  const access = usePlanPatchAccount(account.client, owner);
  const preview = useEditorPreview(account.user, account.loading, account.oauthReturnOwner);
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
  // Count hash-based screens using fixed paths so sign-in tokens and project data stay out of pageviews.
  const analyticsPath = publicPages[route]?.path ?? APP_ROUTE_HASHES[route]?.slice(1);
  const [visitedEditor, setVisitedEditor] = useState(() => isEditorRoute(route));
  const [signInDialog, setSignInDialog] = useState(false);
  const signInTarget = useRef('#/account');
  const showEditor = isEditorRoute(route);
  const policy = access.data;
  const requireSignIn = Boolean(import.meta.env?.PROD || account.enabled);
  const guestPreview = requireSignIn && !owner && !account.loading;
  const editorSignIn = route === 'signIn' && editorSignInLocation();
  const fullAccess = fullEditorAccess(policy);
  const editorAllowed = guestPreview || !requireSignIn || Boolean(owner && canOpenEditor(policy));
  const showRecentPlans = route === 'recent' && !guestPreview;
  const projectAccess = policy?.paymentsRequired && !fullAccess
    ? { credits: policy.projectCredits, ids: policy.projectIds, refresh: access.refresh }
    : null;
  const showAccount = ['account', 'security', 'billing'].includes(route);
  const showAuthPage = route === 'signIn' || route === 'resetPassword';
  const showTrial = route === 'trial';

  function requestEditorSignUp() {
    signInTarget.current = RECENT_HASH;
    setSignInDialog('create');
  }

  function openSignIn(mode = 'create') {
    if (showTrial) {
      signInTarget.current = '#/trial';
      setSignInDialog(mode);
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
    onAuthenticate: async (mode, email, password, displayName) => {
      if (showEditor && mode !== 'forgot') await preview.prepareSignIn(mode, email);
      try {
        return await account.authenticate(mode, email, password, {
          beforeLeaving: beforeLeaving.current,
          returnTo: editorSignIn ? RECENT_HASH : signInTarget.current,
          displayName,
        });
      } catch (error) {
        if (showEditor) preview.cancelSignIn();
        throw error;
      }
    },
    onGoogle: async () => {
      if (showEditor) await preview.prepareSignIn('google');
      try {
        return await account.signInWithGoogle(beforeLeaving.current,
          editorSignIn ? RECENT_HASH : signInTarget.current, showEditor && Boolean(preview.plan));
      } catch (error) {
        if (showEditor) preview.cancelSignIn();
        throw error;
      }
    },
    onAuthenticated: finishSignIn,
  };
  const accountNav = account.enabled ? {
    signedIn: Boolean(owner),
    user: account.user,
    onSignOut: signOut,
    busy: account.busy || account.loading,
  } : null;
  useEffect(() => {
    if (publicPageAt(window.location.pathname) && window.location.hash === WORKSPACE_HASH) {
      window.history.replaceState(window.history.state, '', RECENT_HASH);
    } else {
      const legacyPage = publicPageAt(window.location.pathname)
        && window.location.hash.startsWith('#/') && publicPageAt(window.location.hash.slice(1));
      if (legacyPage && legacyPage !== 'home') {
        window.history.replaceState(window.history.state, '', publicPages[legacyPage].path + window.location.search);
      }
    }
    const navigate = () => {
      const next = readRoute();
      setRoute(next);
      if (isEditorRoute(next)) setVisitedEditor(true);
      else setSignInDialog(false);
      const cookieSettings = next === 'privacy' && window.location.hash === '#cookie-settings';
      if (next !== 'demo' && !cookieSettings) window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', navigate);
    window.addEventListener('popstate', navigate);
    return () => {
      window.removeEventListener('hashchange', navigate);
      window.removeEventListener('popstate', navigate);
    };
  }, []);
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
      {import.meta.env?.PROD && <ConsentAnalytics path={analyticsPath} />}
      {account.error && (!showAuthPage || route === 'resetPassword') && (
        <div className="accountAlert" role="alert">
          <span>{account.error}</span>
          <button aria-label="Dismiss sign-in notice" onClick={account.clearError}><Icon name="close" /></button>
        </div>
      )}
      {!showEditor && !showAccount && !showAuthPage && !showTrial && (
        <PublicPage page={route} account={accountNav} trialOffer={trialOffer && !account.loading && !owner} />
      )}
      {showTrial && (
        <>
          <SiteHeader page={route} account={accountNav} />
          <TrialPage account={account} access={access} offer={trialOffer}
            offerChecking={trialStatus.checking} offerError={trialStatus.error}
            onCheckOffer={trialStatus.refresh} onSignIn={openSignIn} />
        </>
      )}
      {showAuthPage && (
        <>
          <AuthHeader />
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
      {owner && preview.plan && preview.redirectWarning && (showEditor || showAccount || showTrial) && (
        <p role="status" className="accountAlert">{preview.redirectWarning}</p>
      )}
      {showEditor && !editorAllowed && (
        <>
          <SiteHeader page={route} account={accountNav} />
          {preview.plan && policy?.canStartTrial && !policy.deleting && !account.loading ? (
            <TrialPage account={account} access={access} offer={trialOffer}
              offerChecking={trialStatus.checking} offerError={trialStatus.error}
              onCheckOffer={trialStatus.refresh} onSignIn={openSignIn} />
          ) : <EditorAccess access={access} accountLoading={account.loading} />}
        </>
      )}
      {(showEditor || visitedEditor) && editorAllowed && (
        <div className="editorRoot" hidden={!showEditor} inert={signInDialog ? '' : undefined}>
          {showRecentPlans && <SiteHeader page={route} account={accountNav} />}
          {showRecentPlans && !policy?.monthly && timedAccessActive(policy?.trialEndsAt) && (
            <TrialStatus expiresAt={policy.trialEndsAt} />
          )}
          <div className="editorSurface">
            <Suspense
              fallback={
                <div className="loadingScreen">
                  {route === 'recent' && <Brand />}
                  <p>Opening your workspace…</p>
                </div>
              }
            >
              {account.loading || preview.restoring ? (
                <div className="loadingScreen" role="status">Opening your workspace…</div>
              ) : <Editor
                key={owner || 'guest'}
                active={showEditor && !signInDialog}
                guestPreview={guestPreview}
                previewPlan={preview.plan}
                onGuestPlanChange={preview.setGuestPlan}
                onPreviewPlanOpened={preview.clear}
                onRequestSignUp={requestEditorSignUp}
                repository={repository}
                projectAccess={projectAccess}
                lockedProjectIds={policy?.lockedProjectIds}
                owner={owner}
                showMobileTip={!guestPreview}
                showFirstUseGuide={!guestPreview}
                canDownload={policy?.paymentsRequired ? access.canDownload : undefined}
                authBusy={account.busy}
                onRegisterSave={registerSave}
                showRecent={showRecentPlans}
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
      {route !== 'privacy' && <PrivacyChoices banner />}
      {signInDialog && (showTrial || (showEditor && guestPreview)) && (
        <SignInPage {...signInProps} initialMode={signInDialog} editorEntry={showEditor}
          trialOffer={trialOffer} previewWarning={showEditor ? preview.redirectWarning : ''}
          onClose={() => {
            if (showEditor) preview.cancelSignIn();
            setSignInDialog(false);
          }} />
      )}
    </>
  );
}
