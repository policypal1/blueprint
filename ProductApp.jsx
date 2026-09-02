import React, { useEffect, useState } from 'react';
import { PLAN_FEATURES, PRODUCT_CONFIG } from './product.config.js';
import {
  activateSubscription,
  createAccount,
  createTestAccount,
  getCurrentAccount,
  getSubscription,
  login,
  logout,
  removeSubscription,
  updateAccount,
  updatePaymentMethod,
} from './productServices.js';

const ROUTES = new Set(['home', 'login', 'signup', 'pricing', 'checkout', 'app', 'account']);

function routeFromHash() {
  const value = window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  return ROUTES.has(value) ? value : 'home';
}

function go(route) {
  window.location.hash = `#${route}`;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function useRoute() {
  const [route, setRoute] = useState(routeFromHash);
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function Icon({ name, size = 20, strokeWidth = 1.9 }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
    ruler: <><path d="M4 18 18 4l2 2L6 20z"/><path d="m10 12 2 2"/><path d="m13 9 2 2"/></>,
    edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
    export: <><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>,
    menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
    close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
    spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z"/></>,
    blueprint: <><path d="M5 3h14v18H5z"/><path d="M9 3v5h6V3"/><path d="M8 13h8"/><path d="M8 17h5"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>,
  };
  return <svg {...props}>{paths[name] || paths.blueprint}</svg>;
}

function Brand({ light = false, onClick }) {
  return <button className={`launchBrand ${light ? 'launchBrandLight' : ''}`} onClick={onClick} aria-label="Blueprint Studio home">
    <span className="launchBrandMark"><Icon name="blueprint" size={18}/></span>
    <span>{PRODUCT_CONFIG.name}</span>
  </button>;
}

function MarketingHeader({ account, route }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = (target) => { setMobileOpen(false); if (target.startsWith('section:')) { go('home'); setTimeout(() => document.getElementById(target.slice(8))?.scrollIntoView({ behavior: 'smooth' }), 60); } else go(target); };
  return <header className="launchNav">
    <div className="launchNavInner">
      <Brand onClick={() => nav('home')} />
      <nav className={`launchNavLinks ${mobileOpen ? 'isOpen' : ''}`}>
        <button onClick={() => nav('section:how')}>How it works</button>
        <button onClick={() => nav('pricing')} className={route === 'pricing' ? 'active' : ''}>Pricing</button>
        <button onClick={() => nav('section:faq')}>FAQ</button>
      </nav>
      <div className="launchNavActions">
        {account ? <>
          <button className="launchTextButton" onClick={() => go('account')}>Account</button>
          <button className="launchPrimaryButton launchSmall" onClick={() => go(getSubscription(account.id) ? 'app' : 'checkout')}>Open Studio <Icon name="arrow" size={16}/></button>
        </> : <>
          <button className="launchTextButton" onClick={() => go('login')}>Log in</button>
          <button className="launchPrimaryButton launchSmall" onClick={() => go('signup')}>Start free trial <Icon name="arrow" size={16}/></button>
        </>}
      </div>
      <button className="launchMobileMenu" onClick={() => setMobileOpen(v => !v)} aria-label="Toggle navigation"><Icon name={mobileOpen ? 'close' : 'menu'}/></button>
    </div>
  </header>;
}

function Hero({ account }) {
  return <section className="launchHero">
    <div className="launchHeroCopy">
      <div className="launchEyebrow"><span><Icon name="spark" size={14}/></span> Built for remodelers and contractors</div>
      <h1>Blueprint edits without the CAD overhead.</h1>
      <p>Upload an existing floor plan, make clean revisions with real measurements, and export a client-ready plan in minutes.</p>
      <div className="launchHeroActions">
        <button className="launchPrimaryButton" onClick={() => go(account ? (getSubscription(account.id) ? 'app' : 'checkout') : 'signup')}>Start {PRODUCT_CONFIG.trialDays}-day free trial <Icon name="arrow"/></button>
        <button className="launchSecondaryButton" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>See how it works</button>
      </div>
      <div className="launchTrustRow"><span><Icon name="check" size={15}/> No CAD experience needed</span><span><Icon name="check" size={15}/> Export PDF & PNG</span><span><Icon name="check" size={15}/> Cancel anytime</span></div>
    </div>
    <ProductPreview />
  </section>;
}

function ProductPreview() {
  return <div className="launchPreviewWrap" aria-label="Blueprint Studio product preview">
    <div className="launchPreviewChrome">
      <div className="launchPreviewTop"><div className="launchPreviewBrand"><span>B</span> Blueprint Studio</div><div className="launchPreviewProject">Bathroom Remodel <span>⌄</span></div><div className="launchPreviewActions"><span>Undo</span><b>Export</b></div></div>
      <div className="launchPreviewBody">
        <div className="launchPreviewSidebar">
          <small>FILE</small><div className="launchPreviewUpload">+ Upload blueprint</div>
          <small>DRAW & ANNOTATE</small>
          <div className="launchPreviewTools"><span>↖ Select</span><span>━ Wall</span><span>▥ Window</span><span>╱ Line</span><span>↔ Measure</span><span>T Text</span></div>
        </div>
        <div className="launchPreviewCanvas"><img src="/sample-blueprint.jpeg" alt="Sample floor plan"/><div className="launchPreviewEdit one"></div><div className="launchPreviewEdit two"></div><div className="launchMeasureTag">8' 6&quot;</div></div>
      </div>
    </div>
    <div className="launchPreviewBadge"><Icon name="ruler" size={18}/><div><strong>Real measurements</strong><small>Calibrate once, edit to scale.</small></div></div>
  </div>;
}

function FeatureStrip() {
  const items = [
    { icon: 'upload', title: 'Bring your existing plan', text: 'Upload PNG, JPG, WebP, or the first page of a PDF.' },
    { icon: 'ruler', title: 'Calibrate exact scale', text: 'Set a known distance once and keep measurements consistent.' },
    { icon: 'edit', title: 'Make the revision', text: 'Add walls, doors, windows, fixtures, labels, and cleanups.' },
    { icon: 'export', title: 'Send a clean deliverable', text: 'Export a high-resolution PNG or 11 × 17 PDF.' },
  ];
  return <section className="launchFeatureStrip">{items.map(item => <article key={item.title}><span><Icon name={item.icon}/></span><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</section>;
}

function HowItWorks() {
  const steps = [
    ['01', 'Upload the blueprint', 'Start from the plan your client, estimator, or field team already has.'],
    ['02', 'Set the scale', 'Click two known points and enter the real distance so every edit stays meaningful.'],
    ['03', 'Edit what changed', 'Draw walls, openings, fixtures, dimensions, and annotations directly over the plan.'],
    ['04', 'Export and send', 'Create a clean PNG or 11 × 17 PDF for estimates, approvals, and project handoff.'],
  ];
  return <section className="launchSection" id="how"><div className="launchSectionHead"><span className="launchKicker">HOW IT WORKS</span><h2>From old plan to updated plan in four steps.</h2><p>No layers panel. No command line. No CAD training curve.</p></div><div className="launchSteps">{steps.map(([n, title, text]) => <article key={n}><span>{n}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>;
}

function PricingCard({ compact = false, onStart }) {
  const monthly = PRODUCT_CONFIG.pricing.monthly;
  const annualMonthly = Math.round(PRODUCT_CONFIG.pricing.annual / 12);
  return <article className={`launchPricingCard ${compact ? 'compact' : ''}`}>
    <div className="launchPlanHead"><div><span className="launchKicker">BLUEPRINT STUDIO PRO</span><h3>Everything you need to revise plans faster.</h3></div><span className="launchPopular">Most popular</span></div>
    <div className="launchPrice"><strong>${monthly}</strong><span>/ month</span></div>
    <p className="launchAnnualHint">or ${PRODUCT_CONFIG.pricing.annual}/year <b>(${annualMonthly}/mo)</b></p>
    <ul>{PLAN_FEATURES.map(feature => <li key={feature}><span><Icon name="check" size={16}/></span>{feature}</li>)}</ul>
    <button className="launchPrimaryButton launchFull" onClick={onStart}>Start {PRODUCT_CONFIG.trialDays}-day free trial <Icon name="arrow" size={18}/></button>
    <small className="launchFinePrint">Cancel anytime. Billing begins after the trial.</small>
  </article>;
}

function PricingSection({ account }) {
  return <section className="launchSection launchPricingSection" id="pricing"><div className="launchSectionHead"><span className="launchKicker">SIMPLE PRICING</span><h2>One plan. The full editor.</h2><p>Built for contractors who need revised plans without adding another complicated design tool.</p></div><PricingCard onStart={() => go(account ? (getSubscription(account.id) ? 'app' : 'checkout') : 'signup')} /></section>;
}

const FAQS = [
  ['What files can I upload?', 'Blueprint Studio accepts PNG, JPG, WebP, and PDF files. PDF import uses the first page as the editable background.'],
  ['Do I need CAD experience?', 'No. The editor is designed around direct manipulation: upload, calibrate, draw, place objects, and export.'],
  ['Can I work with real measurements?', 'Yes. Use Set blueprint scale, click two points with a known real-world distance, and enter that distance. Wall measurements will then use that calibration.'],
  ['What can I add to a plan?', 'Walls, lines, rectangles, text, doors, windows, measurements, bathrooms fixtures, appliances, counters, beds, and other common plan objects.'],
  ['Where are my projects saved?', 'In this frontend build, projects are saved locally in the browser on the current device. When you connect the backend, project sync can be moved to your database without changing the editor workflow.'],
  ['Can I cancel anytime?', 'Yes. The pricing UI is built around a cancel-anytime subscription. Your production billing rules will be controlled by the payment backend you connect.'],
];

function FAQ() {
  return <section className="launchSection launchFaq" id="faq"><div className="launchSectionHead"><span className="launchKicker">FAQ</span><h2>Questions before you start.</h2></div><div className="launchFaqList">{FAQS.map(([q, a]) => <details key={q}><summary>{q}<span><Icon name="chevron" size={18}/></span></summary><p>{a}</p></details>)}</div></section>;
}

function CTA({ account }) {
  return <section className="launchCta"><div><span className="launchKicker">READY TO EDIT FASTER?</span><h2>Turn the plan you already have into the plan the job actually needs.</h2></div><button className="launchPrimaryButton launchOnDark" onClick={() => go(account ? (getSubscription(account.id) ? 'app' : 'checkout') : 'signup')}>Start free trial <Icon name="arrow"/></button></section>;
}

function Footer() {
  return <footer className="launchFooter"><Brand onClick={() => go('home')}/><p>Blueprint editing for remodeling and construction teams.</p><div><button onClick={() => go('pricing')}>Pricing</button><button onClick={() => { go('home'); setTimeout(() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }), 60); }}>Support</button></div><small>© {new Date().getFullYear()} Blueprint Studio</small></footer>;
}

function HomePage({ account, route }) {
  return <div className="launchSite"><MarketingHeader account={account} route={route}/><main><Hero account={account}/><FeatureStrip/><HowItWorks/><PricingSection account={account}/><FAQ/><CTA account={account}/></main><Footer/></div>;
}

function PricingPage({ account, route }) {
  return <div className="launchSite"><MarketingHeader account={account} route={route}/><main className="launchStandalone"><PricingSection account={account}/><FAQ/></main><Footer/></div>;
}

function AuthLayout({ mode, onComplete, onBypass }) {
  const isSignup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bypassOpen, setBypassOpen] = useState(false);
  const [bypass, setBypass] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const account = isSignup ? await createAccount({ name, email, password }) : await login({ email, password });
      onComplete(account);
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const submitBypass = (e) => {
    e.preventDefault();
    if (bypass.trim() !== PRODUCT_CONFIG.testBypassCode) { setError('Incorrect testing bypass code.'); return; }
    setError('');
    onBypass(createTestAccount());
  };

  return <div className="launchAuthPage">
    <div className="launchAuthBrand"><Brand light onClick={() => go('home')}/><button onClick={() => go('home')}>Back to site</button></div>
    <div className="launchAuthGrid">
      <section className="launchAuthPitch"><div className="launchEyebrow dark"><span><Icon name="spark" size={14}/></span> Blueprint Studio</div><h1>{isSignup ? 'Start editing plans faster.' : 'Welcome back.'}</h1><p>{isSignup ? `Create your account, start a ${PRODUCT_CONFIG.trialDays}-day trial, and open the full editor.` : 'Sign in to get back to your projects and billing.'}</p><div className="launchAuthBullets">{PLAN_FEATURES.slice(0, 4).map(item => <span key={item}><Icon name="check" size={16}/>{item}</span>)}</div></section>
      <section className="launchAuthCard">
        <div className="launchAuthCardHead"><span className="launchKicker">{isSignup ? 'CREATE ACCOUNT' : 'SIGN IN'}</span><h2>{isSignup ? 'Create your Blueprint Studio account' : 'Sign in to Blueprint Studio'}</h2></div>
        <form onSubmit={submit} className="launchForm">
          {isSignup && <label><span>Full name</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Your name"/></label>}
          <label><span>Email address</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com"/></label>
          <label><span>Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isSignup ? '8+ characters' : 'Your password'}/></label>
          {error && <div className="launchFormError">{error}</div>}
          <button className="launchPrimaryButton launchFull" disabled={loading}>{loading ? 'Working…' : isSignup ? 'Create account' : 'Log in'} {!loading && <Icon name="arrow" size={17}/>}</button>
        </form>
        <p className="launchAuthSwitch">{isSignup ? 'Already have an account?' : 'New to Blueprint Studio?'} <button onClick={() => go(isSignup ? 'login' : 'signup')}>{isSignup ? 'Log in' : 'Create account'}</button></p>
        <div className="launchTestPanel">
          <button className="launchTestToggle" onClick={() => setBypassOpen(v => !v)}><span>Testing bypass</span><span>{bypassOpen ? '−' : '+'}</span></button>
          {bypassOpen && <form onSubmit={submitBypass}><p>Temporary testing access. Remove this before production.</p><div><input value={bypass} onChange={e => setBypass(e.target.value)} inputMode="numeric" placeholder="Bypass code"/><button>Unlock test account</button></div></form>}
        </div>
      </section>
    </div>
  </div>;
}

function CheckoutPage({ account, onActivated, onBypass }) {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [cardholder, setCardholder] = useState(account?.name || '');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bypass, setBypass] = useState('');
  const annualSavings = PRODUCT_CONFIG.pricing.monthly * 12 - PRODUCT_CONFIG.pricing.annual;
  const price = billingCycle === 'annual' ? PRODUCT_CONFIG.pricing.annual : PRODUCT_CONFIG.pricing.monthly;

  useEffect(() => { if (!account) go('signup'); }, [account]);
  if (!account) return null;

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{3,4}$/.test(cvc.replace(/\D/g, ''))) { setError('Enter a valid CVC.'); return; }
    setLoading(true);
    try {
      const subscription = activateSubscription({ accountId: account.id, billingCycle, cardNumber, expiry, cardholder });
      setCardNumber(''); setCvc('');
      onActivated(subscription);
    } catch (err) {
      setError(err?.message || 'Could not start the trial.');
    } finally {
      setLoading(false);
    }
  };

  const useBypass = () => {
    if (bypass.trim() !== PRODUCT_CONFIG.testBypassCode) { setError('Incorrect testing bypass code.'); return; }
    const subscription = activateSubscription({ accountId: account.id, billingCycle: 'monthly', testBypass: true });
    onBypass(subscription);
  };

  return <div className="launchCheckoutPage">
    <header className="launchCheckoutHeader"><Brand light onClick={() => go('home')}/><button onClick={() => go('account')}><Icon name="user" size={17}/> {account.name}</button></header>
    <main className="launchCheckoutGrid">
      <section className="launchCheckoutFormWrap">
        <div className="launchCheckoutIntro"><span className="launchKicker">START YOUR TRIAL</span><h1>Unlock the full Blueprint Studio editor.</h1><p>Your {PRODUCT_CONFIG.trialDays}-day trial starts today. This frontend is ready for Stripe Elements or Checkout when you connect the payment backend.</p></div>
        <div className="launchBillingToggle"><button className={billingCycle === 'monthly' ? 'active' : ''} onClick={() => setBillingCycle('monthly')}><span>Monthly</span><b>${PRODUCT_CONFIG.pricing.monthly}/mo</b></button><button className={billingCycle === 'annual' ? 'active' : ''} onClick={() => setBillingCycle('annual')}><span>Annual <em>Save ${annualSavings}</em></span><b>${PRODUCT_CONFIG.pricing.annual}/yr</b></button></div>
        <form className="launchForm launchPaymentForm" onSubmit={submit}>
          <div className="launchPaymentHeading"><Icon name="card"/><div><strong>Payment method</strong><span>No charge until the trial ends.</span></div></div>
          <label><span>Name on card</span><input value={cardholder} onChange={e => setCardholder(e.target.value)} autoComplete="cc-name"/></label>
          <label><span>Card number</span><div className="launchInputWithIcon"><Icon name="card" size={18}/><input value={cardNumber} onChange={e => setCardNumber(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))} inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242"/></div></label>
          <div className="launchFormRow"><label><span>Expiration</span><input value={expiry} onChange={e => setExpiry(e.target.value.slice(0, 5))} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY"/></label><label><span>CVC</span><input type="password" value={cvc} onChange={e => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="cc-csc" placeholder="123"/></label></div>
          {error && <div className="launchFormError">{error}</div>}
          <button className="launchPrimaryButton launchFull" disabled={loading}>{loading ? 'Starting trial…' : `Start ${PRODUCT_CONFIG.trialDays}-day free trial`} {!loading && <Icon name="arrow" size={18}/>}</button>
          <small className="launchSecureNote"><Icon name="lock" size={14}/> Demo frontend stores only card brand/last four/expiry. Do not collect real cards until Stripe is connected.</small>
        </form>
        <div className="launchBypassCard"><div><span className="launchKicker">TESTING</span><strong>Skip payment while you wire the backend</strong><p>Enter the temporary bypass code to unlock the editor immediately.</p></div><div className="launchBypassInline"><input value={bypass} onChange={e => setBypass(e.target.value)} inputMode="numeric" placeholder="Bypass code"/><button onClick={useBypass}>Unlock</button></div></div>
      </section>
      <aside className="launchOrderSummary"><span className="launchKicker">ORDER SUMMARY</span><h2>Blueprint Studio Pro</h2><div className="launchSummaryPrice"><strong>${price}</strong><span>{billingCycle === 'annual' ? '/ year' : '/ month'}</span></div><p>{PRODUCT_CONFIG.trialDays} days free, then billed {billingCycle === 'annual' ? 'annually' : 'monthly'}.</p><ul>{PLAN_FEATURES.map(feature => <li key={feature}><Icon name="check" size={15}/>{feature}</li>)}</ul><div className="launchDueToday"><span>Due today</span><strong>$0</strong></div></aside>
    </main>
  </div>;
}

function AccountPage({ account, subscription, onAccountChange, onSignOut, onSubscriptionChange }) {
  const [name, setName] = useState(account?.name || '');
  const [email, setEmail] = useState(account?.email || '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentCardholder, setPaymentCardholder] = useState(account?.name || '');
  const [paymentNumber, setPaymentNumber] = useState('');
  const [paymentExpiry, setPaymentExpiry] = useState('');
  const [paymentCvc, setPaymentCvc] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [billingMessage, setBillingMessage] = useState('');

  useEffect(() => { if (!account) go('login'); }, [account]);
  if (!account) return null;

  const save = async (e) => {
    e.preventDefault(); setError(''); setMessage('');
    try {
      const next = await updateAccount({ name, email, password });
      setPassword(''); onAccountChange(next); setMessage('Account updated.');
    } catch (err) { setError(err?.message || 'Could not update account.'); }
  };

  const savePayment = (e) => {
    e.preventDefault();
    setPaymentError(''); setBillingMessage('');
    if (!/^\d{3,4}$/.test(paymentCvc.replace(/\D/g, ''))) { setPaymentError('Enter a valid CVC.'); return; }
    try {
      const next = updatePaymentMethod({ accountId: account.id, cardNumber: paymentNumber, expiry: paymentExpiry, cardholder: paymentCardholder });
      setPaymentNumber(''); setPaymentCvc(''); setPaymentOpen(false); onSubscriptionChange(next); setBillingMessage('Payment method updated.');
    } catch (err) { setPaymentError(err?.message || 'Could not update payment method.'); }
  };

  const cancel = () => {
    if (!subscription) return;
    if (!window.confirm('Cancel this local test subscription?')) return;
    removeSubscription(account.id); onSubscriptionChange(null); setBillingMessage('Subscription canceled in this frontend build.');
  };

  return <div className="launchAccountPage">
    <header className="launchAccountHeader"><Brand light onClick={() => go('home')}/><div><button onClick={() => go(subscription ? 'app' : 'checkout')}>Open Studio</button><button onClick={onSignOut}><Icon name="logout" size={17}/> Sign out</button></div></header>
    <main className="launchAccountMain"><div className="launchAccountIntro"><span className="launchKicker">ACCOUNT</span><h1>Manage your Blueprint Studio account.</h1><p>Profile, plan, and payment details in one place.</p></div>
      <div className="launchAccountGrid">
        <section className="launchSettingsCard"><div className="launchSettingsHead"><span><Icon name="user"/></span><div><h2>Profile</h2><p>Update your account information.</p></div></div><form className="launchForm" onSubmit={save}><label><span>Full name</span><input value={name} onChange={e => setName(e.target.value)}/></label><label><span>Email address</span><input type="email" value={email} onChange={e => setEmail(e.target.value)}/></label><label><span>New password <em>optional</em></span><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep current password"/></label>{error && <div className="launchFormError">{error}</div>}{message && <div className="launchFormSuccess">{message}</div>}<button className="launchPrimaryButton">Save changes</button></form></section>
        <section className="launchSettingsCard"><div className="launchSettingsHead"><span><Icon name="card"/></span><div><h2>Plan & billing</h2><p>Your current access and payment method.</p></div></div>{subscription ? <div className="launchBillingDetails"><div className="launchPlanStatus"><div><span>Blueprint Studio Pro</span><strong>{subscription.status === 'test_access' ? 'Testing access' : 'Trial active'}</strong></div><b>${subscription.billingCycle === 'annual' ? PRODUCT_CONFIG.pricing.annual : PRODUCT_CONFIG.pricing.monthly}<small>/{subscription.billingCycle === 'annual' ? 'yr' : 'mo'}</small></b></div><div className="launchPaymentMethod"><span><Icon name="card"/></span><div><strong>{subscription.paymentMethod?.brand} •••• {subscription.paymentMethod?.last4}</strong><small>{subscription.paymentMethod?.expiry && subscription.paymentMethod.expiry !== '—' ? `Expires ${subscription.paymentMethod.expiry}` : 'Testing bypass'}</small></div></div>{subscription.trialEndsAt && !subscription.testBypass && <p className="launchTrialDate">Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.</p>}<div className="launchBillingActions"><button className="launchBillingButton" onClick={() => setPaymentOpen(v => !v)}>{paymentOpen ? 'Close payment editor' : 'Update payment method'}</button><button className="launchDangerLink" onClick={cancel}>Cancel subscription</button></div>{billingMessage && <div className="launchFormSuccess launchBillingMessage">{billingMessage}</div>}{paymentOpen && <form className="launchForm launchInlinePaymentEditor" onSubmit={savePayment}><label><span>Name on card</span><input value={paymentCardholder} onChange={e => setPaymentCardholder(e.target.value)}/></label><label><span>Card number</span><input value={paymentNumber} onChange={e => setPaymentNumber(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))} inputMode="numeric" placeholder="4242 4242 4242 4242"/></label><div className="launchFormRow"><label><span>Expiration</span><input value={paymentExpiry} onChange={e => setPaymentExpiry(e.target.value.slice(0, 5))} placeholder="MM/YY"/></label><label><span>CVC</span><input type="password" value={paymentCvc} onChange={e => setPaymentCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="123"/></label></div>{paymentError && <div className="launchFormError">{paymentError}</div>}<button className="launchPrimaryButton">Save payment method</button></form>}</div> : <div className="launchNoPlan"><h3>No active plan</h3><p>Start your free trial to unlock the editor.</p><button className="launchPrimaryButton" onClick={() => go('checkout')}>Start free trial</button></div>}</section>
      </div>
    </main>
  </div>;
}

function editorSvg(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const editorIconMap = {
  select: editorSvg('<path d="m5 3 6.5 16 2.3-6.2 6.2-2.3L5 3Z"/>'),
  pan: editorSvg('<path d="M8 11V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v6-2a1.5 1.5 0 0 1 3 0v3c0 5-3 8-8 8h-1c-3 0-5-2-7-5l-2-3a1.6 1.6 0 0 1 2.5-2L8 13"/>'),
  wall: editorSvg('<path d="M3 8h18v8H3z"/><path d="M7 8v8M17 8v8"/>'),
  window: editorSvg('<rect x="4" y="6" width="16" height="12"/><path d="M8 6v12M16 6v12M4 12h16"/>'),
  line: editorSvg('<path d="M5 19 19 5"/><circle cx="5" cy="19" r="1.5"/><circle cx="19" cy="5" r="1.5"/>'),
  rectangle: editorSvg('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
  measure: editorSvg('<path d="M4 16 16 4l4 4L8 20z"/><path d="m10 10 2 2m1-5 2 2"/>'),
  text: editorSvg('<path d="M5 5h14M12 5v14M8 19h8"/>'),
  door: editorSvg('<path d="M5 20V5h10v15"/><path d="M15 20h4"/><circle cx="12" cy="13" r=".7" fill="currentColor"/>'),
  erase: editorSvg('<path d="m7 17-3-3 9-9 6 6-9 9H7Z"/><path d="m11 7 6 6M10 20h10"/>'),
  clean: editorSvg('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="m8 12 3 3 5-6"/>'),
  scale: editorSvg('<path d="M4 18 18 4l2 2L6 20z"/><path d="m10 12 2 2m1-5 2 2"/>'),
  toilet: editorSvg('<ellipse cx="12" cy="14" rx="5" ry="6"/><rect x="8" y="4" width="8" height="4" rx="1"/><ellipse cx="12" cy="14" rx="2.2" ry="3"/>'),
  sink: editorSvg('<rect x="5" y="7" width="14" height="10" rx="3"/><ellipse cx="12" cy="12" rx="4" ry="2.5"/><path d="M12 7V4"/>'),
  shower: editorSvg('<rect x="5" y="5" width="14" height="14"/><path d="m5 5 14 14M16 8h.01"/>'),
  tub: editorSvg('<rect x="4" y="7" width="16" height="10" rx="4"/><path d="M8 7V5h3"/><circle cx="17" cy="12" r=".7" fill="currentColor"/>'),
  object: editorSvg('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
};

function iconKeyForLabel(label) {
  const value = label.trim().toLowerCase();
  if (value.startsWith('select')) return 'select';
  if (value.startsWith('pan')) return 'pan';
  if (value.startsWith('wall')) return 'wall';
  if (value.startsWith('window')) return 'window';
  if (value.startsWith('line')) return 'line';
  if (value.startsWith('rectangle')) return 'rectangle';
  if (value.startsWith('measure')) return 'measure';
  if (value === 'text') return 'text';
  if (value.includes('door') || ['single left','single right','double','pocket','sliding','bifold'].some(x => value.startsWith(x))) return 'door';
  if (value.includes('erase')) return 'erase';
  if (value.includes('clean area')) return 'clean';
  if (value.includes('blueprint scale')) return 'scale';
  if (value.startsWith('toilet')) return 'toilet';
  if (value.startsWith('sink')) return 'sink';
  if (value.startsWith('shower')) return 'shower';
  if (value.startsWith('bathtub')) return 'tub';
  return 'object';
}

function useEditorPolish(active) {
  useEffect(() => {
    if (!active) return undefined;
    const apply = () => {
      document.querySelectorAll('.tool').forEach(button => {
        const icon = button.querySelector('.toolIcon');
        const label = button.querySelector('span:last-child')?.textContent || button.textContent || '';
        if (!icon || icon.dataset.launchPolished === label) return;
        icon.innerHTML = editorIconMap[iconKeyForLabel(label)] || editorIconMap.object;
        icon.dataset.launchPolished = label;
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active]);
}

function EditorShell({ EditorComponent, account, onSignOut }) {
  const [menu, setMenu] = useState(false);
  sessionStorage.setItem('blueprint-studio-unlocked', 'yes');
  useEditorPolish(true);
  return <div className="launchEditorShell"><EditorComponent/><div className="launchEditorAccount"><button className="launchEditorAccountButton" onClick={() => setMenu(v => !v)}><span>{account.name.slice(0, 1).toUpperCase()}</span><div><strong>{account.name}</strong><small>Pro</small></div><Icon name="chevron" size={16}/></button>{menu && <div className="launchEditorAccountMenu"><button onClick={() => go('account')}><Icon name="user" size={17}/> Account & billing</button><button onClick={() => go('home')}><Icon name="blueprint" size={17}/> Product site</button><div></div><button onClick={onSignOut}><Icon name="logout" size={17}/> Sign out</button></div>}</div></div>;
}

export default function ProductApp({ EditorComponent }) {
  const route = useRoute();
  const [account, setAccount] = useState(() => getCurrentAccount());
  const [subscription, setSubscription] = useState(() => account ? getSubscription(account.id) : null);

  useEffect(() => {
    const current = getCurrentAccount();
    setAccount(current);
    setSubscription(current ? getSubscription(current.id) : null);
  }, [route]);

  const signOut = () => { logout(); setAccount(null); setSubscription(null); go('home'); };
  const enterAfterAuth = (next) => { setAccount(next); const sub = getSubscription(next.id); setSubscription(sub); go(sub ? 'app' : 'checkout'); };
  const enterAfterSignup = (next) => { setAccount(next); setSubscription(null); go('checkout'); };
  const enterTest = (next) => { setAccount(next); setSubscription(getSubscription(next.id)); go('app'); };

  if (route === 'app') {
    if (!account) { queueMicrotask(() => go('login')); return null; }
    if (!subscription) { queueMicrotask(() => go('checkout')); return null; }
    return <EditorShell EditorComponent={EditorComponent} account={account} onSignOut={signOut}/>;
  }

  if (route === 'login') return <AuthLayout mode="login" onComplete={enterAfterAuth} onBypass={enterTest}/>;
  if (route === 'signup') return <AuthLayout mode="signup" onComplete={enterAfterSignup} onBypass={enterTest}/>;
  if (route === 'checkout') return <CheckoutPage account={account} onActivated={(sub) => { setSubscription(sub); go('app'); }} onBypass={(sub) => { setSubscription(sub); go('app'); }}/>;
  if (route === 'account') return <AccountPage account={account} subscription={subscription} onAccountChange={setAccount} onSignOut={signOut} onSubscriptionChange={setSubscription}/>;
  if (route === 'pricing') return <PricingPage account={account} route={route}/>;
  return <HomePage account={account} route={route}/>;
}
