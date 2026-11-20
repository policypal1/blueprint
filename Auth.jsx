import React, { useEffect, useId, useRef, useState } from 'react';
import { Brand, Modal, PRODUCT_NAME } from './ui.jsx';
import { authErrorText, MAX_DISPLAY_NAME_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_HINT } from './useAccount.js';

const AUTH_MODES = {
  signIn: { title: `Sign in to ${PRODUCT_NAME}`, submit: 'Sign in', error: 'Could not sign in. Try again.' },
  create: { title: 'Create your account', submit: 'Create account', error: 'Could not create an account. Try again.' },
  forgot: { title: 'Reset your password', submit: 'Send reset link', error: 'Could not request a reset link. Try again.' },
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.24 5.48-4.76 7.18l7.73 6C44.42 38.03 46.98 31.87 46.98 24.55z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.75-2.99-.75-4.59s.27-3.14.75-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.55 10.78l7.98-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function AuthHeader() {
  return (
    <header className="siteHeader authHeader">
      <a href="/" aria-label={`${PRODUCT_NAME} home`}><Brand /></a>
    </header>
  );
}

function AuthLayout({ title, onClose, inert, children }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [title]);

  if (onClose) return <Modal title={title} onClose={onClose} className="authDialog">{children}</Modal>;
  return (
    <main className="authPage" inert={inert ? '' : undefined}>
      <section className="accountCard authCard" aria-labelledby="auth-title">
        <h1 id="auth-title" ref={heading} tabIndex={-1}>{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function SignInPage({
  account, onAuthenticate, onGoogle, onAuthenticated, onClose, initialMode = 'signIn',
  editorEntry = false, trialOffer = false, previewWarning = '', onBackToPreview,
}) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showResend, setShowResend] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [pending, setPending] = useState('');
  const passwordHint = useId();
  const copy = AUTH_MODES[mode];
  const creating = mode === 'create';
  const credentialForm = mode === 'signIn' || creating;
  const waiting = account.loading || Boolean(pending);
  const title = editorEntry && mode === 'signIn' ? 'Sign in to use the editor' : copy.title;

  function selectMode(next) {
    setMode(next);
    setPassword('');
    setError('');
    setNotice('');
    setShowResend(false);
    setConfirmationEmail('');
    account.clearError?.();
    if (!onClose) window.scrollTo(0, 0);
  }

  async function submit(event) {
    event.preventDefault();
    if (waiting) return;
    const displayName = name.trim();
    const address = email.trim();
    if (creating && !displayName) {
      setError('Enter your name.');
      return;
    }
    if (creating && password.length < MIN_PASSWORD_LENGTH) {
      setError(PASSWORD_HINT);
      return;
    }
    setPending('email');
    setError('');
    setNotice('');
    setShowResend(false);
    account.clearError?.();
    try {
      if (await onAuthenticate(mode, address, password, creating ? displayName : undefined)) {
        onAuthenticated();
        return;
      }
      setPassword('');
      if (mode === 'forgot') {
        setNotice('If that email is registered, a reset link will arrive shortly. Open it in this browser.');
      } else if (creating) {
        setConfirmationEmail(address);
      } else {
        setError(copy.error);
      }
    } catch (problem) {
      setError(authErrorText(problem, copy.error));
      setShowResend(problem?.code === 'email_not_confirmed');
    } finally {
      setPending('');
    }
  }

  async function resendConfirmation() {
    const address = confirmationEmail || email.trim();
    if (waiting || !address) return;
    setPending('resend');
    setError('');
    setNotice('');
    try {
      await onAuthenticate('resend', address, '');
      setConfirmationEmail(address);
      setNotice('A new confirmation link was sent.');
    } catch (problem) {
      setError(authErrorText(problem, 'Couldn’t resend the link. Try again in a moment.'));
    } finally {
      setPending('');
    }
  }

  async function startGoogle() {
    if (waiting) return;
    setPending('google');
    setError('');
    setNotice('');
    account.clearError?.();
    try {
      await onGoogle();
    } catch (problem) {
      setError(authErrorText(problem, 'Could not open Google sign-in. Try again.'));
      setPending('');
    }
  }

  const continueToSignIn = () => { if (!waiting) selectMode('signIn'); };
  const confirmation = confirmationEmail && (
    <Modal title="Check your email" onClose={continueToSignIn} className="authConfirmation">
      <p>We sent a confirmation link to <strong>{confirmationEmail}</strong>.</p>
      <p>Open the link on any device. Then sign in with the email and password you chose.</p>
      {notice && <p role="status">{notice}</p>}
      {error && <p className="accountError" role="alert">{error}</p>}
      <div className="authConfirmationActions">
        <button type="button" disabled={waiting} onClick={resendConfirmation}>
          {pending === 'resend' ? 'Sending…' : 'Resend link'}
        </button>
        <button type="button" className="primary" data-dialog-focus disabled={waiting} onClick={continueToSignIn}>Back to sign in</button>
      </div>
    </Modal>
  );
  if (onClose && confirmation) return confirmation;

  return (<>
    <AuthLayout title={title} inert={Boolean(confirmation)} onClose={onClose && (() => { if (!pending) onClose(); })}>
      {account.loading || account.client ? (
        <>
          {previewWarning && !error && <p role="status">{previewWarning}</p>}
          {mode === 'signIn' && account.emailConfirmed && (
            <p className="authConfirmed" role="status">Email confirmed. You can now sign in on any device.</p>
          )}
          {account.error && <p className="accountError" role="alert">{account.error}</p>}
          {credentialForm && (
            <>
              <button className="googleSignIn" type="button" onClick={startGoogle} disabled={waiting}>
                <GoogleMark />
                {pending === 'google' ? 'Opening Google…' : 'Continue with Google'}
              </button>
              <div className="authDivider"><span>or use email</span></div>
            </>
          )}
          <form className="profileSettings authForm" method="post" aria-busy={account.loading || undefined} onSubmit={submit}>
            {creating && (
              <label>
                Name
                <input type="text" name="name" autoComplete="name" required maxLength={MAX_DISPLAY_NAME_LENGTH}
                  value={name} disabled={waiting} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            <label>
              Email address
              <input type="email" name="email" autoComplete="username" required data-dialog-focus
                value={email} disabled={waiting} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {credentialForm && (
              <div className="authPassword">
                <label>
                  Password
                  <input type="password" name="password" required
                    minLength={creating ? MIN_PASSWORD_LENGTH : undefined}
                    aria-describedby={creating ? passwordHint : undefined}
                    autoComplete={creating ? 'new-password' : 'current-password'}
                    value={password} disabled={waiting}
                    onChange={(event) => setPassword(event.target.value)} />
                </label>
                {creating && <span className="authPasswordHint" id={passwordHint}>{PASSWORD_HINT}</span>}
              </div>
            )}
            {mode === 'signIn' && (
              <button className="authTextButton authForgot" type="button" disabled={waiting}
                onClick={() => selectMode('forgot')}>Forgot password?</button>
            )}
            {!confirmation && error && <p className="accountError" role="alert">{error}</p>}
            {!confirmation && notice && <p role="status">{notice}</p>}
            <button className="primary authSubmit" type="submit" disabled={waiting}>
              {pending === 'email' ? 'Please wait…' : copy.submit}
            </button>
          </form>
          {showResend && (
            <button className="authTextButton" type="button" disabled={waiting}
              onClick={resendConfirmation}>{pending === 'resend' ? 'Sending…' : 'Resend confirmation'}</button>
          )}
          <div className="authAlternate">
            {creating && editorEntry && <span>Already have an account?</span>}
            {mode === 'signIn' && (
              <span>{trialOffer && editorEntry ? '3-day free trial. No credit card needed.' : `New to ${PRODUCT_NAME}?`}</span>
            )}
            <button className="authTextButton" type="button" disabled={waiting}
              onClick={() => selectMode(mode === 'signIn' ? 'create' : 'signIn')}>
              {mode === 'signIn' ? 'Create an account' : creating && editorEntry ? 'Sign in' : 'Back to sign in'}
            </button>
          </div>
          {creating && (
            <p className="authPolicyLinks">
              <a className="accountTextLink" href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
              <a className="accountTextLink" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            </p>
          )}
        </>
      ) : <p>Account sign-in is currently unavailable.</p>}
      {onBackToPreview && (
        <a className="accountTextLink" href="/#/editor" onClick={onBackToPreview}>Back to preview</a>
      )}
    </AuthLayout>
    {confirmation}
  </>);
}

export function ResetPasswordPage({ account }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    try {
      if (password !== form.get('confirmPassword')) {
        setError('The passwords don’t match.');
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(PASSWORD_HINT);
        return;
      }
      await account.completePasswordReset(password);
      setSaved(true);
    } catch (problem) {
      setError(authErrorText(problem, 'Could not update your password. Request a new reset link if needed.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      {account.loading ? <p role="status">Opening your reset link…</p> : saved ? (
        <>
          <p role="status">Your password was updated.</p>
          <a className="button primary" href="#/account">Open account</a>
        </>
      ) : account.recovering ? (
        <form className="profileSettings authForm" method="post" onSubmit={submit}>
          <label>New password
            <input type="password" name="password" minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password" disabled={pending} required />
          </label>
          <label>Confirm new password
            <input type="password" name="confirmPassword" minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password" disabled={pending} required />
          </label>
          <p>{PASSWORD_HINT}</p>
          {error && <p role="alert" className="accountError">{error}</p>}
          <button className="primary authSubmit" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Update password'}
          </button>
        </form>
      ) : (
        <p>Open a password reset link in the browser where you requested it.{' '}
          <a className="accountTextLink" href={account.user ? '#/account/security' : '#/sign-in'}>
            {account.user ? 'Open security settings' : 'Back to sign in'}
          </a>
        </p>
      )}
    </AuthLayout>
  );
}
