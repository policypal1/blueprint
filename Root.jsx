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
import { accountReturnTarget, useAccount } from './useAccount.js';
import usePlanPatchAccount, { useTrialOffer } from './usePlanPatchAccount.js';
import { canOpenEditor, fullEditorAccess, timedAccessActive } from './access.js';
import { publicPageAt, publicPages } from './seo-pages.js';

const Editor = lazy(() => import('./App.jsx'));
const RECENT_HASH = '#/editor';
const WORKSPACE_HASH = '#/editor/workspace';
const SIGN_IN_HASH = '#/sign-in';
const ACCESS_HASH = '#/editor/access';
const EDITOR_SIGN_UP = '/sign-in?next=editor&mode=create';
const APP_ROUTE_HASHES = {
  recent: RECENT_HASH,
  workspace: WORKSPACE_HASH,
  sample: '#/editor/sample',
  editorAccess: ACCESS_HASH,
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
  editorAccess: 'Editing access',
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
  return ['recent', 'workspace', 'sample', 'editorAccess'].includes(route);
}
function editorAuthDestination() {
  const params = new URLSearchParams(window.location.search);
  if (publicPageAt(window.location.pathname) !== 'signIn' || params.get('next') !== 'editor') return null;
  return params.get('mode') === 'create' ? ACCESS_HASH : RECENT_HASH;
}
function navigateTo(url, replace = false) {
  window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', url);
  window.dispatchEvent(new Event('popstate'));
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
  } else {
    return <ExpiredTrialPlans expired={Boolean(access.data.trialEndsAt)} />;
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
  const editOrigin = useRef(null);
  const showEditor = isEditorRoute(route);
  const policy = access.data;
  const requireSignIn = Boolean(import.meta.env?.PROD || account.enabled);
  const editingAllowed = !requireSignIn || Boolean(owner && canOpenEditor(policy));
  const editorAvailable = !requireSignIn || (!account.loading && (!owner || (policy && !policy.deleting)));
  const previewOnly = editorAvailable && !editingAllowed;
  const viewingAccess = route === 'editorAccess' && Boolean(owner);
  const editorReturn = route === 'signIn' ? editorAuthDestination() : null;
  const editorSignIn = Boolean(editorReturn);
  const editorDialog = previewOnly && (viewingAccess || editorSignIn);
  const showWorkspace = editorAvailable && (showEditor || editorDialog);
  const fullAccess = fullEditorAccess(policy);
  const createFromEditor = editorReturn === ACCESS_HASH;
  const showRecentPlans = route === 'recent' && !previewOnly;
  const projectAccess = editingAllowed && policy?.paymentsRequired && !fullAccess
    ? { credits: policy.projectCredits, ids: policy.projectIds, refresh: access.refresh }
    : null;
  const showAccount = ['account', 'security', 'billing'].includes(route);
  const showAuthPage = route === 'signIn' || route === 'resetPassword';
  const showTrial = route === 'trial';

  async function requestEditing() {
    const location = window.location.href;
    const trigger = document.activeElement;
    const ready = await preview.prepareNavigation();
    if (ready && window.location.href === location) {
      editOrigin.current = { location, trigger };
      navigateTo(owner ? `/${ACCESS_HASH}` : EDITOR_SIGN_UP);
    }
  }

  function closeEditorDialog() {
    if (editorSignIn) preview.cancelSignIn();
    if (editOrigin.current) window.history.back();
    else navigateTo(`/${RECENT_HASH}`, true);
  }

  function backToPreview(event) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    closeEditorDialog();
  }

  function chooseBillingPlan(event) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo(event.currentTarget.href);
  }

  useEffect(() => {
    const origin = editOrigin.current;
    if (editorDialog || !origin) return;
    if (window.location.href === origin.location && showWorkspace && origin.trigger?.isConnected) {
      origin.trigger.focus({ preventScroll: true });
    }
    if (showWorkspace || showAccount) editOrigin.current = null;
  }, [editorDialog, showWorkspace, showAccount]);

  function openSignIn(mode = 'create') {
    if (showTrial) {
      signInTarget.current = '#/trial';
      setSignInDialog(mode);
      return;
    }
    signInTarget.current = showAccount ? accountReturnTarget(window.location.hash, window.location.search) : '#/account';
    window.location.hash = SIGN_IN_HASH;
  }

  const finishSignIn = useCallback(() => {
    if (readRoute() === 'signIn') {
      const target = editorAuthDestination() || signInTarget.current;
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
  const authReturn = editorReturn || signInTarget.current;
  const signInProps = {
    account,
    onAuthenticate: async (mode, email, password, displayName) => {
      if (editorSignIn && mode !== 'forgot') await preview.prepareSignIn(mode, email);
      try {
        return await account.authenticate(mode, email, password, {
          beforeLeaving: beforeLeaving.current,
          returnTo: authReturn,
          displayName,
        });
      } catch (error) {
        if (editorSignIn) preview.cancelSignIn();
        throw error;
      }
    },
    onGoogle: async () => {
      if (editorSignIn) await preview.prepareSignIn('google');
      try {
        return await account.signInWithGoogle(beforeLeaving.current,
          authReturn, editorSignIn && Boolean(preview.plan));
      } catch (error) {
        if (editorSignIn) preview.cancelSignIn();
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
    if (viewingAccess && !account.loading && editingAllowed) {
      navigateTo(`/${RECENT_HASH}`, true);
    }
  }, [viewingAccess, account.loading, editingAllowed]);
  useEffect(() => {
    if (createFromEditor) {
      document.title = `Create an account · ${PRODUCT_NAME}`;
      return;
    }
    const title = PAGE_TITLES[route];
    document.title = publicPages[route]?.title
      ?? (title ? `${title} · ${PRODUCT_NAME}` : publicPages.home.title);
  }, [route, createFromEditor]);
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
        <PublicPage page={route} account={accountNav} trialOffer={trialOffer} />
      )}
      {showTrial && (
        <>
          <SiteHeader page={route} account={accountNav} />
          <TrialPage account={account} access={access} offer={trialOffer}
            offerChecking={trialStatus.checking} offerError={trialStatus.error}
            onCheckOffer={trialStatus.refresh} onSignIn={openSignIn} />
        </>
      )}
      {showAuthPage && !editorDialog && (
        <>
          <AuthHeader />
          {route === 'resetPassword' ? <ResetPasswordPage account={account} /> : (
            <SignInPage key={createFromEditor ? 'editor-create' : 'sign-in'} {...signInProps}
              initialMode={createFromEditor ? 'create' : 'signIn'} editorEntry={editorSignIn}
              trialOffer={trialOffer} previewWarning={editorSignIn ? preview.redirectWarning : ''}
              onBackToPreview={editorSignIn ? backToPreview : undefined} />
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
      {owner && preview.plan && preview.redirectWarning && !editorDialog && (showEditor || showAccount || showTrial) && (
        <p role="status" className="accountAlert">{preview.redirectWarning}</p>
      )}
      {showEditor && !showWorkspace && (
        <>
          <SiteHeader page={route} account={accountNav} />
          <EditorAccess access={access} accountLoading={account.loading} />
        </>
      )}
      {(showWorkspace || visitedEditor) && editorAvailable && (
        <div className="editorRoot" hidden={!showWorkspace} inert={editorDialog ? '' : undefined} aria-hidden={editorDialog || undefined}>
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
                key={`${owner || 'guest'}:${previewOnly ? 'preview' : 'edit'}`}
                active={showWorkspace && !editorDialog}
                previewOnly={previewOnly}
                previewPlan={preview.plan}
                onPreviewPlanChange={preview.setPlan}
                onPreviewPlanOpened={preview.clear}
                onRequestEditing={requestEditing}
                repository={previewOnly ? null : repository}
                projectAccess={projectAccess}
                lockedProjectIds={policy?.lockedProjectIds}
                owner={owner}
                showMobileTip={!previewOnly}
                showFirstUseGuide={!previewOnly}
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
      {editorDialog && (
        <div className="editorAccessOverlay">
          {editorSignIn ? (
            <SignInPage {...signInProps} initialMode={createFromEditor ? 'create' : 'signIn'}
              editorEntry trialOffer={trialOffer} previewWarning={preview.redirectWarning}
              onClose={closeEditorDialog} />
          ) : policy.canStartTrial ? (
            <TrialPage account={account} access={access} offer={trialOffer}
              onClose={closeEditorDialog} />
          ) : (
            <ExpiredTrialPlans expired={Boolean(policy.trialEndsAt)} onClose={closeEditorDialog}
              onChoose={chooseBillingPlan} previewWarning={preview.redirectWarning} />
          )}
        </div>
      )}
      {route !== 'privacy' && !editorDialog && <PrivacyChoices banner />}
      {signInDialog && showTrial && (
        <SignInPage {...signInProps} initialMode={signInDialog} trialOffer={trialOffer}
          onClose={() => setSignInDialog(false)} />
      )}
    </>
  );
}
