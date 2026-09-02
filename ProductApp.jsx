import React, { useEffect, useState } from 'react';
import { FAQS, FREE_TOOLS, PRODUCT_CONFIG, PRO_FEATURES } from './product.config.js';
import {
  activateSubscription,
  createAccount,
  createDeveloperAccount,
  getCurrentAccount,
  getSubscription,
  login,
  logout,
  removeSubscription,
  unlockDeveloperMode,
  updateAccount,
  updatePaymentMethod,
} from './productServices.js';

const ROUTES = new Set(['home', 'how', 'pricing', 'faq', 'login', 'signup', 'upgrade', 'checkout', 'app', 'account']);

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

function Icon({ name, size = 20, strokeWidth = 1.8 }) {
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
    unlock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M9 10V7a4 4 0 0 1 7-2.6"/></>,
    logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>,
    menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
    close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
    spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z"/></>,
    blueprint: <><path d="M5 3h14v18H5z"/><path d="M9 3v5h6V3"/><path d="M8 13h8"/><path d="M8 17h5"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2"/><path d="M3 12h18"/></>,
    house: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    notes: <><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  };
  return <svg {...props}>{paths[name] || paths.blueprint}</svg>;
}

function Brand({ light = false, onClick }) {
  return <button className={`brandButton ${light ? 'brandButtonLight' : ''}`} onClick={onClick} aria-label="Blueprint Studio home">
    <span className="brandSymbol"><Icon name="blueprint" size={18}/></span>
    <span>{PRODUCT_CONFIG.name}</span>
  </button>;
}

function SiteHeader({ account, route }) {
  const [open, setOpen] = useState(false);
  const tabs = [['home', 'Home'], ['how', 'How it works'], ['pricing', 'Pricing'], ['faq', 'FAQ']];
  const nav = (target) => { setOpen(false); go(target); };
  return <header className="siteHeader">
    <div className="siteHeaderInner">
      <Brand onClick={() => nav('home')}/>
      <nav className={`siteTabs ${open ? 'open' : ''}`}>
        {tabs.map(([key, label]) => <button key={key} className={route === key ? 'active' : ''} onClick={() => nav(key)}>{label}</button>)}
      </nav>
      <div className="siteActions">
        {account ? <>
          <button className="quietButton" onClick={() => go('account')}>Account</button>
          <button className="primaryButton small" onClick={() => go('app')}>Open Studio <Icon name="arrow" size={16}/></button>
        </> : <>
          <button className="quietButton" onClick={() => go('login')}>Log in</button>
          <button className="primaryButton small" onClick={() => go('signup')}>Create free account</button>
        </>}
      </div>
      <button className="mobileMenuButton" onClick={() => setOpen(v => !v)} aria-label="Toggle menu"><Icon name={open ? 'close' : 'menu'}/></button>
    </div>
  </header>;
}

function ProductPreview() {
  return <div className="productPreview">
    <div className="previewTopbar"><div><span className="previewLogo">B</span><b>Blueprint Studio</b></div><span>Kitchen Remodel</span><button>Export</button></div>
    <div className="previewBody">
      <aside><small>GET READY</small><button>Upload blueprint</button><small>DRAW</small><div className="miniTools"><span>Wall</span><span>Window</span><span>Door</span><span>Measure</span><span>Text</span><span>Fixture</span></div></aside>
      <div className="previewCanvas"><img src="/sample-blueprint.jpeg" alt="Blueprint being revised in Blueprint Studio"/><div className="editLine vertical"></div><div className="editLine horizontal"></div><div className="dimensionTag">9' 4&quot;</div></div>
    </div>
    <div className="previewCallout"><Icon name="ruler" size={18}/><div><b>Calibrate once</b><span>Keep edits tied to real measurements.</span></div></div>
  </div>;
}

function Hero({ account }) {
  return <section className="heroSection">
    <div className="heroCopy">
      <div className="eyebrow">Blueprint revisions for real jobs</div>
      <h1>Take the plan you already have. Make it match the job.</h1>
      <p>Blueprint Studio gives remodelers and contractors a focused way to clean up old floor plans, draw the changes, and create a clear updated plan without opening a full CAD program.</p>
      <div className="heroButtons"><button className="primaryButton" onClick={() => go(account ? 'app' : 'signup')}>Use the free workspace <Icon name="arrow"/></button><button className="secondaryButton" onClick={() => go('how')}>See the workflow</button></div>
      <div className="heroMeta"><span><Icon name="check" size={15}/> No card to start</span><span><Icon name="check" size={15}/> Free starter tools</span><span><Icon name="check" size={15}/> Pro when you need it</span></div>
    </div>
    <ProductPreview/>
  </section>;
}

function ProblemJourney() {
  return <section className="journeySection">
    <div className="sectionIntro narrow"><span className="kicker">WHY PEOPLE USE IT</span><h2>Most remodels do not need a brand-new drawing. They need the old one fixed.</h2><p>A homeowner sends a scan. An estimator marks it up. The field condition changes. A wall moves. The problem is not “how do I become a CAD operator?” The problem is getting from outdated plan to usable plan quickly.</p></div>
    <div className="journeyFlow">
      <article><span className="stepNumber">01</span><div className="journeyIcon"><Icon name="notes"/></div><h3>You start with something messy</h3><p>A screenshot, PDF, old plan, or client sketch that is close to reality but not quite right.</p></article>
      <div className="journeyArrow"><Icon name="arrow"/></div>
      <article><span className="stepNumber">02</span><div className="journeyIcon"><Icon name="edit"/></div><h3>You make only the changes that matter</h3><p>Clean the old marks, set scale, redraw a wall, move an opening, add what the job actually needs.</p></article>
      <div className="journeyArrow"><Icon name="arrow"/></div>
      <article><span className="stepNumber">03</span><div className="journeyIcon"><Icon name="export"/></div><h3>You leave with something clear</h3><p>A revised plan that is easier to estimate from, explain to a client, or hand to the next person on the job.</p></article>
    </div>
  </section>;
}

function BeforeAfter() {
  return <section className="splitSection">
    <div className="splitCopy"><span className="kicker">THE DIFFERENCE</span><h2>Built around revision work, not drafting everything from zero.</h2><p>Traditional design tools are powerful because they handle enormous workflows. That is exactly why they can feel excessive when all you need is a clean revision.</p><ul><li><Icon name="check" size={16}/> Keep the original plan visible while you edit.</li><li><Icon name="check" size={16}/> Work directly on the drawing instead of managing layers and commands.</li><li><Icon name="check" size={16}/> Use real measurements when precision matters.</li><li><Icon name="check" size={16}/> Keep the interface focused on contractor use cases.</li></ul><button className="textLink" onClick={() => go('how')}>Walk through the full workflow <Icon name="arrow" size={16}/></button></div>
    <div className="comparisonPanel"><div><span>Without Blueprint Studio</span><b>Screenshot → markup → explanation → another markup → confusion</b></div><div className="comparisonDivider"></div><div className="better"><span>With Blueprint Studio</span><b>Upload → clean → revise → export</b></div></div>
  </section>;
}

function UseCases() {
  const cases = [
    ['briefcase', 'Estimate revisions', 'Turn the plan used during the walkthrough into a cleaner scope reference before pricing the job.'],
    ['house', 'Remodel layout changes', 'Show the wall, door, window, fixture, or room change without rebuilding the entire project in CAD.'],
    ['user', 'Client communication', 'Give the homeowner one updated visual instead of asking them to interpret notes across screenshots.'],
    ['layers', 'Field handoff', 'Keep a clear revised plan available for the people actually doing the work.'],
  ];
  return <section className="useCasesSection"><div className="sectionIntro"><span className="kicker">WHERE IT FITS</span><h2>A lightweight revision layer between the existing plan and the work.</h2></div><div className="useCaseGrid">{cases.map(([icon,title,text]) => <article key={title}><Icon name={icon}/><h3>{title}</h3><p>{text}</p></article>)}</div></section>;
}

function FreeVsProPreview({ account }) {
  return <section className="accessSection">
    <div className="sectionIntro"><span className="kicker">START FREE</span><h2>Get into the software first. Upgrade when the starter tools stop being enough.</h2><p>No fake “7-day trial” countdown. A free account opens the workspace immediately.</p></div>
    <div className="accessGrid">
      <article className="freeCard"><div className="planLabel">FREE WORKSPACE</div><h3>$0</h3><p>Enough to test the real editing experience on your own blueprint.</p><ul>{FREE_TOOLS.map(x => <li key={x}><Icon name="check" size={15}/>{x}</li>)}</ul><button className="secondaryButton full" onClick={() => go(account ? 'app' : 'signup')}>{account ? 'Open free workspace' : 'Create free account'}</button></article>
      <article className="proCard"><div className="planTop"><span className="planLabel">PRO</span><span className="launchBadge">Launch price</span></div><div className="priceLine"><s>${PRODUCT_CONFIG.pricing.regularMonthly}</s><strong>${PRODUCT_CONFIG.pricing.launchMonthly}</strong><span>/mo</span></div><p>Unlock the complete revision toolkit and exports.</p><ul>{PRO_FEATURES.map(x => <li key={x}><Icon name="check" size={15}/>{x}</li>)}</ul><button className="primaryButton full" onClick={() => go(account ? 'upgrade' : 'signup')}>Unlock Pro <Icon name="arrow" size={17}/></button></article>
    </div>
  </section>;
}

function FinalCTA({ account }) {
  return <section className="finalCta"><div><span className="kicker light">OPEN THE SOFTWARE</span><h2>Use your own blueprint before deciding whether Pro is worth it.</h2><p>Create an account, open the free workspace, and see whether it fits the way you actually work.</p></div><button className="primaryButton inverted" onClick={() => go(account ? 'app' : 'signup')}>{account ? 'Open Blueprint Studio' : 'Create free account'} <Icon name="arrow"/></button></section>;
}

function Footer() {
  return <footer className="siteFooter"><div><Brand onClick={() => go('home')}/><p>Focused blueprint revision software for remodeling and construction work.</p></div><div className="footerLinks"><button onClick={() => go('how')}>How it works</button><button onClick={() => go('pricing')}>Pricing</button><button onClick={() => go('faq')}>FAQ</button><button onClick={() => go('login')}>Log in</button></div><small>© {new Date().getFullYear()} Blueprint Studio</small></footer>;
}

function PageShell({ account, route, children }) {
  return <div className="marketingSite"><SiteHeader account={account} route={route}/><main>{children}</main><Footer/></div>;
}

function HomePage({ account, route }) {
  return <PageShell account={account} route={route}><Hero account={account}/><ProblemJourney/><BeforeAfter/><UseCases/><FreeVsProPreview account={account}/><FinalCTA account={account}/></PageShell>;
}

function HowPage({ account, route }) {
  const steps = [
    ['01', 'Upload what you already have', 'Drop in the PNG, JPG, WebP, or PDF you received from the homeowner, estimator, architect, or previous contractor.', 'upload'],
    ['02', 'Clean the old drawing', 'Use brush erase or clean area to remove marks, walls, notes, or background clutter that no longer represent the job.', 'edit'],
    ['03', 'Set the real scale', 'Choose two known points, enter the real distance, and make the blueprint useful for measurement-aware revisions.', 'ruler'],
    ['04', 'Draw the revision', 'Use walls, windows, doors, annotations, measurements, fixtures, and objects to represent what is changing.', 'blueprint'],
    ['05', 'Review the plan in context', 'Move, resize, rotate, and adjust objects while the original plan stays visible underneath your work.', 'layers'],
    ['06', 'Export the updated version', 'Pro users can produce a high-resolution PNG or 11 × 17 PDF for the client, estimate, or project team.', 'export'],
  ];
  return <PageShell account={account} route={route}><section className="pageHero"><span className="kicker">HOW IT WORKS</span><h1>A revision workflow that follows the way the job actually happens.</h1><p>You are not starting from a blank canvas. Blueprint Studio assumes you already have a plan and need to turn it into a more useful version.</p></section><section className="workflowList">{steps.map(([n,title,text,icon]) => <article key={n}><span className="workflowNumber">{n}</span><div className="workflowIcon"><Icon name={icon}/></div><div><h2>{title}</h2><p>{text}</p></div></article>)}</section><section className="howNote"><div><span className="kicker">FREE WORKSPACE</span><h2>You can test the core revision loop without paying.</h2><p>Free accounts can upload a blueprint, clean it up, set scale, and use walls, windows, and doors. Pro is for the full toolkit and exports.</p></div><button className="primaryButton" onClick={() => go(account ? 'app' : 'signup')}>Open the workspace <Icon name="arrow"/></button></section></PageShell>;
}

function PricingPage({ account, route }) {
  return <PageShell account={account} route={route}><section className="pageHero compact"><span className="kicker">PRICING</span><h1>Use the starter tools for free. Pay when you need the complete editor.</h1><p>Simple monthly pricing. No trial timer and no card required to test the core workflow.</p></section><section className="pricingPageGrid"><article className="pricingPageCard free"><span className="planLabel">FREE</span><div className="pricingAmount"><strong>$0</strong><span>/month</span></div><p>For trying Blueprint Studio on real plans and handling basic revisions.</p><ul>{FREE_TOOLS.map(x => <li key={x}><Icon name="check" size={15}/>{x}</li>)}</ul><button className="secondaryButton full" onClick={() => go(account ? 'app' : 'signup')}>Use Blueprint Studio free</button></article><article className="pricingPageCard pro"><div className="planTop"><span className="planLabel">PRO</span><span className="launchBadge">Special launch price</span></div><div className="pricingAmount special"><s>${PRODUCT_CONFIG.pricing.regularMonthly}</s><strong>${PRODUCT_CONFIG.pricing.launchMonthly}</strong><span>/month</span></div><p>For contractors who need the full revision set and client-ready exports.</p><ul>{PRO_FEATURES.map(x => <li key={x}><Icon name="check" size={15}/>{x}</li>)}</ul><button className="primaryButton full" onClick={() => go(account ? 'upgrade' : 'signup')}>Get Pro for ${PRODUCT_CONFIG.pricing.launchMonthly}/mo <Icon name="arrow" size={17}/></button><small>Month to month. Cancel anytime once production billing is connected.</small></article></section></PageShell>;
}

function FAQPage({ account, route }) {
  return <PageShell account={account} route={route}><section className="pageHero compact"><span className="kicker">FAQ</span><h1>Questions about access, editing, and billing.</h1><p>The frontend is structured so the public product experience is ready now while authentication, cloud storage, and billing can be swapped to your production backend later.</p></section><section className="faqPageList">{FAQS.map(([q,a]) => <details key={q}><summary>{q}<Icon name="chevron" size={18}/></summary><p>{a}</p></details>)}</section></PageShell>;
}

function DeveloperPanel({ onUnlock, compact = false }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (code.trim() !== PRODUCT_CONFIG.testBypassCode) { setError('Incorrect developer code.'); return; }
    setError('');
    onUnlock();
  };
  return <div className={`developerPanel ${compact ? 'compact' : ''}`}><button className="developerToggle" onClick={() => setOpen(v => !v)}><span><Icon name="unlock" size={15}/> Developer mode</span><span>{open ? '−' : '+'}</span></button>{open && <form onSubmit={submit}><p>Testing only. Enter the temporary override code to unlock Pro.</p><div className="developerInput"><input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" placeholder="Developer code"/><button>Unlock</button></div>{error && <span className="inlineError">{error}</span>}</form>}</div>;
}

function AuthPage({ mode, onComplete, onDeveloper }) {
  const signup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const account = signup ? await createAccount({ name, email, password }) : await login({ email, password });
      onComplete(account);
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return <div className="authPage"><header className="authTop"><Brand light onClick={() => go('home')}/><button onClick={() => go('home')}>Back to site</button></header><main className="authCenter"><section className="authCard"><div className="authHeading"><span className="kicker">{signup ? 'CREATE ACCOUNT' : 'LOG IN'}</span><h1>{signup ? 'Open your free workspace.' : 'Welcome back.'}</h1><p>{signup ? 'No card. No trial timer. Create an account and go straight into Blueprint Studio.' : 'Sign in to continue to your Blueprint Studio workspace.'}</p></div><form className="formStack" onSubmit={submit}>{signup && <label><span>Full name</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Your name"/></label>}<label><span>Email address</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com"/></label><label><span>Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? '8+ characters' : 'Your password'}/></label>{error && <div className="formError">{error}</div>}<button className="primaryButton full" disabled={loading}>{loading ? 'Working…' : signup ? 'Create account' : 'Log in'} {!loading && <Icon name="arrow" size={17}/>}</button></form><p className="authSwitch">{signup ? 'Already have an account?' : 'Need an account?'} <button onClick={() => go(signup ? 'login' : 'signup')}>{signup ? 'Log in' : 'Create one free'}</button></p><DeveloperPanel onUnlock={onDeveloper}/></section></main></div>;
}

function UpgradePage({ account, onActivated, onDeveloper }) {
  const [cardholder, setCardholder] = useState(account?.name || '');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { if (!account) go('signup'); }, [account]);
  if (!account) return null;

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{3,4}$/.test(cvc.replace(/\D/g, ''))) { setError('Enter a valid CVC.'); return; }
    try {
      const sub = activateSubscription({ accountId: account.id, cardNumber, expiry, cardholder });
      onActivated(sub);
    } catch (err) { setError(err?.message || 'Could not activate Pro.'); }
  };

  return <div className="upgradePage"><header className="darkHeader"><Brand light onClick={() => go('home')}/><div><button onClick={() => go('app')}>Back to Studio</button><button onClick={() => go('account')}>{account.name}</button></div></header><main className="upgradeGrid"><section className="upgradeMain"><span className="kicker lightBlue">BLUEPRINT STUDIO PRO</span><h1>Unlock the rest of the editor.</h1><p>The free workspace stays available. Pro adds the full drawing, annotation, fixture, and export toolkit.</p><div className="upgradePrice"><s>${PRODUCT_CONFIG.pricing.regularMonthly}</s><strong>${PRODUCT_CONFIG.pricing.launchMonthly}</strong><span>/month launch price</span></div><form className="paymentBox" onSubmit={submit}><div className="paymentHeading"><Icon name="card"/><div><b>Payment method</b><span>Frontend placeholder for your future Stripe connection.</span></div></div><label><span>Name on card</span><input value={cardholder} onChange={e => setCardholder(e.target.value)} autoComplete="cc-name"/></label><label><span>Card number</span><input value={cardNumber} onChange={e => setCardNumber(e.target.value.replace(/[^\d ]/g, '').slice(0, 23))} inputMode="numeric" placeholder="4242 4242 4242 4242"/></label><div className="formRow"><label><span>Expiration</span><input value={expiry} onChange={e => setExpiry(e.target.value.slice(0,5))} placeholder="MM/YY"/></label><label><span>CVC</span><input type="password" value={cvc} onChange={e => setCvc(e.target.value.replace(/\D/g, '').slice(0,4))} placeholder="123"/></label></div>{error && <div className="formError">{error}</div>}<button className="primaryButton full">Activate Pro for ${PRODUCT_CONFIG.pricing.launchMonthly}/mo <Icon name="arrow" size={17}/></button><small><Icon name="lock" size={13}/> Demo UI stores only safe card display metadata. Connect Stripe before collecting real payment data.</small></form><DeveloperPanel compact onUnlock={onDeveloper}/></section><aside className="upgradeSummary"><span className="planLabel">WHAT UNLOCKS</span><ul>{PRO_FEATURES.map(x => <li key={x}><Icon name="check" size={15}/>{x}</li>)}</ul><div className="summaryNote"><b>Your free access does not disappear.</b><p>If Pro is canceled, the account simply returns to the starter tool set.</p></div></aside></main></div>;
}

function AccountPage({ account, subscription, onAccountChange, onSubscriptionChange, onSignOut }) {
  const [name, setName] = useState(account?.name || '');
  const [email, setEmail] = useState(account?.email || '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cardholder, setCardholder] = useState(account?.name || '');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [billingMessage, setBillingMessage] = useState('');

  useEffect(() => { if (!account) go('login'); }, [account]);
  if (!account) return null;

  const saveProfile = async (e) => {
    e.preventDefault(); setMessage(''); setError('');
    try { const next = await updateAccount({ name, email, password }); onAccountChange(next); setPassword(''); setMessage('Account updated.'); }
    catch (err) { setError(err?.message || 'Could not update account.'); }
  };

  const savePayment = (e) => {
    e.preventDefault(); setBillingMessage('');
    if (!/^\d{3,4}$/.test(cvc.replace(/\D/g, ''))) { setBillingMessage('Enter a valid CVC.'); return; }
    try { const next = updatePaymentMethod({ accountId: account.id, cardNumber, expiry, cardholder }); onSubscriptionChange(next); setPaymentOpen(false); setCardNumber(''); setCvc(''); setBillingMessage('Payment method updated.'); }
    catch (err) { setBillingMessage(err?.message || 'Could not update payment method.'); }
  };

  const cancel = () => {
    if (!subscription || !window.confirm('Return this account to the free workspace?')) return;
    removeSubscription(account.id); onSubscriptionChange(null); setBillingMessage('Pro access removed. Free workspace is still active.');
  };

  return <div className="accountPage"><header className="darkHeader"><Brand light onClick={() => go('home')}/><div><button onClick={() => go('app')}>Open Studio</button><button onClick={onSignOut}><Icon name="logout" size={16}/> Sign out</button></div></header><main className="accountMain"><div className="accountIntro"><span className="kicker lightBlue">ACCOUNT</span><h1>Profile and access.</h1><p>Your account always has the free workspace. Pro controls the additional tools.</p></div><div className="accountGrid"><section className="settingsCard"><div className="settingsHead"><Icon name="user"/><div><h2>Profile</h2><p>Frontend account details.</p></div></div><form className="formStack" onSubmit={saveProfile}><label><span>Full name</span><input value={name} onChange={e => setName(e.target.value)}/></label><label><span>Email address</span><input type="email" value={email} onChange={e => setEmail(e.target.value)}/></label><label><span>New password <em>optional</em></span><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep current password"/></label>{error && <div className="formError">{error}</div>}{message && <div className="formSuccess">{message}</div>}<button className="primaryButton">Save changes</button></form></section><section className="settingsCard"><div className="settingsHead"><Icon name="card"/><div><h2>Plan & billing</h2><p>{subscription ? 'Pro is active on this account.' : 'This account is using the free workspace.'}</p></div></div>{subscription ? <div className="billingStack"><div className="planStatus"><div><span>Blueprint Studio Pro</span><b>{subscription.status === 'developer_access' ? 'Developer access' : 'Active'}</b></div><strong>${PRODUCT_CONFIG.pricing.launchMonthly}<small>/mo</small></strong></div><div className="paymentMethod"><Icon name="card"/><div><b>{subscription.paymentMethod?.brand} •••• {subscription.paymentMethod?.last4}</b><span>{subscription.paymentMethod?.expiry === '—' ? 'Developer override' : `Expires ${subscription.paymentMethod?.expiry}`}</span></div></div><div className="billingButtons"><button onClick={() => setPaymentOpen(v => !v)}>{paymentOpen ? 'Close payment editor' : 'Update payment method'}</button><button className="dangerText" onClick={cancel}>Cancel Pro</button></div>{paymentOpen && <form className="formStack inlinePayment" onSubmit={savePayment}><label><span>Name on card</span><input value={cardholder} onChange={e => setCardholder(e.target.value)}/></label><label><span>Card number</span><input value={cardNumber} onChange={e => setCardNumber(e.target.value.replace(/[^\d ]/g, '').slice(0,23))} placeholder="4242 4242 4242 4242"/></label><div className="formRow"><label><span>Expiration</span><input value={expiry} onChange={e => setExpiry(e.target.value.slice(0,5))} placeholder="MM/YY"/></label><label><span>CVC</span><input type="password" value={cvc} onChange={e => setCvc(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="123"/></label></div><button className="primaryButton">Save payment method</button></form>}{billingMessage && <div className={billingMessage.startsWith('Enter') || billingMessage.startsWith('Could') ? 'formError' : 'formSuccess'}>{billingMessage}</div>}</div> : <div className="freeStatus"><div className="freeStatusIcon"><Icon name="unlock"/></div><h3>Free workspace active</h3><p>You can use blueprint upload, scale, cleanup tools, walls, windows, and doors.</p><button className="primaryButton" onClick={() => go('upgrade')}>Unlock Pro for ${PRODUCT_CONFIG.pricing.launchMonthly}/mo</button></div>}</section></div></main></div>;
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

function normalizeLabel(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function iconKeyForLabel(label) {
  const v = normalizeLabel(label);
  if (v.startsWith('select')) return 'select'; if (v.startsWith('pan')) return 'pan'; if (v.startsWith('wall')) return 'wall'; if (v.startsWith('window')) return 'window'; if (v.startsWith('line')) return 'line'; if (v.startsWith('rectangle')) return 'rectangle'; if (v.startsWith('measure')) return 'measure'; if (v === 'text') return 'text';
  if (['single left','single right','double','pocket','sliding','bifold'].some(x => v.startsWith(x)) || v.includes('door')) return 'door';
  if (v.includes('brush erase')) return 'erase'; if (v.includes('clean area')) return 'clean'; if (v.includes('blueprint scale')) return 'scale'; if (v.startsWith('toilet')) return 'toilet'; if (v.startsWith('sink')) return 'sink'; if (v.startsWith('shower')) return 'shower'; if (v.startsWith('bathtub')) return 'tub'; return 'object';
}

function isFreeToolLabel(label) {
  const v = normalizeLabel(label);
  return v.startsWith('select') || v.startsWith('pan') || v.startsWith('wall') || v.startsWith('window') || ['single left','single right','double','pocket','sliding','bifold'].some(x => v.startsWith(x)) || v.includes('brush erase') || v.includes('clean area') || v.includes('blueprint scale');
}

function useEditorIntegration(active, isPro, onUpgrade) {
  useEffect(() => {
    if (!active) return undefined;
    const apply = () => {
      document.querySelectorAll('.tool').forEach(button => {
        const icon = button.querySelector('.toolIcon');
        let label = button.dataset.productLabel || '';
        if (!label) {
          const labelNode = Array.from(button.children).find(node => node.tagName === 'SPAN' && !node.classList.contains('toolIcon') && !node.classList.contains('productLockBadge'));
          label = labelNode?.textContent || button.textContent || '';
          button.dataset.productLabel = label;
        }
        if (icon && icon.dataset.productIcon !== label) {
          icon.innerHTML = editorIconMap[iconKeyForLabel(label)] || editorIconMap.object;
          icon.dataset.productIcon = label;
        }
        const locked = !isPro && !isFreeToolLabel(label);
        button.classList.toggle('productLockedTool', locked);
        if (locked) {
          button.dataset.proLocked = 'true';
          button.setAttribute('aria-disabled', 'true');
          if (!button.querySelector('.productLockBadge')) {
            const badge = document.createElement('span'); badge.className = 'productLockBadge'; badge.textContent = 'PRO'; button.appendChild(badge);
          }
        } else {
          delete button.dataset.proLocked; button.removeAttribute('aria-disabled'); button.querySelector('.productLockBadge')?.remove();
        }
      });
      const exportButton = document.querySelector('.exportButton');
      if (exportButton) {
        exportButton.classList.toggle('productLockedExport', !isPro);
        if (!isPro) { exportButton.dataset.proLocked = 'true'; exportButton.setAttribute('aria-disabled', 'true'); }
        else { delete exportButton.dataset.proLocked; exportButton.removeAttribute('aria-disabled'); }
      }
    };
    const intercept = (e) => {
      const target = e.target.closest?.('[data-pro-locked="true"]');
      if (!target) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); onUpgrade();
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', intercept, true);
    return () => { observer.disconnect(); document.removeEventListener('click', intercept, true); };
  }, [active, isPro, onUpgrade]);
}

function UpgradeModal({ onClose, onUpgrade }) {
  return <div className="upgradeModalBackdrop" onMouseDown={onClose}><div className="upgradeModal" onMouseDown={e => e.stopPropagation()}><button className="modalClose" onClick={onClose}><Icon name="close"/></button><div className="modalLock"><Icon name="lock"/></div><span className="kicker">PRO TOOL</span><h2>This tool is part of Blueprint Studio Pro.</h2><p>Your free workspace includes upload, scale, cleanup tools, walls, windows, and doors. Upgrade to unlock the rest of the editor and exports.</p><div className="modalPrice"><s>${PRODUCT_CONFIG.pricing.regularMonthly}</s><strong>${PRODUCT_CONFIG.pricing.launchMonthly}</strong><span>/month</span></div><button className="primaryButton full" onClick={onUpgrade}>Unlock Pro <Icon name="arrow" size={17}/></button><button className="modalSecondary" onClick={onClose}>Keep using free tools</button></div></div>;
}

function EditorShell({ EditorComponent, account, subscription, onSignOut, onDeveloperUnlocked }) {
  const [menu, setMenu] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [developerCode, setDeveloperCode] = useState('');
  const [developerError, setDeveloperError] = useState('');
  const isPro = Boolean(subscription);

  sessionStorage.setItem('blueprint-studio-unlocked', 'yes');
  useEditorIntegration(true, isPro, () => setUpgradeOpen(true));

  const developerUnlock = () => {
    if (developerCode.trim() !== PRODUCT_CONFIG.testBypassCode) { setDeveloperError('Incorrect code.'); return; }
    const sub = unlockDeveloperMode(account.id); setDeveloperError(''); setDeveloperOpen(false); setMenu(false); onDeveloperUnlocked(sub);
  };

  return <div className={`editorProductShell ${isPro ? 'isPro' : 'isFree'}`}><EditorComponent/><div className="accessBadge"><Icon name={isPro ? 'unlock' : 'lock'} size={14}/><span>{isPro ? (subscription?.status === 'developer_access' ? 'Developer Pro' : 'Pro') : 'Free workspace'}</span>{!isPro && <button onClick={() => go('upgrade')}>Upgrade</button>}</div><div className="editorAccount"><button className="editorAccountButton" onClick={() => setMenu(v => !v)}><span>{account.name.slice(0,1).toUpperCase()}</span><div><b>{account.name}</b><small>{isPro ? 'Pro access' : 'Free access'}</small></div><Icon name="chevron" size={15}/></button>{menu && <div className="editorAccountMenu"><button onClick={() => go('account')}><Icon name="user" size={16}/> Account</button><button onClick={() => go('home')}><Icon name="blueprint" size={16}/> Product site</button>{!isPro && <button onClick={() => go('upgrade')}><Icon name="unlock" size={16}/> Upgrade to Pro</button>}<button onClick={() => setDeveloperOpen(v => !v)}><Icon name="unlock" size={16}/> Developer unlock</button>{developerOpen && <div className="editorDeveloper"><input value={developerCode} onChange={e => setDeveloperCode(e.target.value)} inputMode="numeric" placeholder="Code"/><button onClick={developerUnlock}>Unlock</button>{developerError && <span>{developerError}</span>}</div>}<div className="menuDivider"></div><button onClick={onSignOut}><Icon name="logout" size={16}/> Sign out</button></div>}</div>{upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} onUpgrade={() => go('upgrade')}/>}</div>;
}

export default function ProductApp({ EditorComponent }) {
  const route = useRoute();
  const [account, setAccount] = useState(() => getCurrentAccount());
  const [subscription, setSubscription] = useState(() => account ? getSubscription(account.id) : null);
  const effectiveRoute = route === 'checkout' ? 'upgrade' : route;

  useEffect(() => {
    const current = getCurrentAccount();
    setAccount(current);
    setSubscription(current ? getSubscription(current.id) : null);
  }, [effectiveRoute]);

  useEffect(() => {
    const marketing = effectiveRoute !== 'app';
    document.documentElement.classList.toggle('productMarketingMode', marketing);
    document.body.classList.toggle('productMarketingMode', marketing);
    document.documentElement.classList.toggle('productEditorMode', !marketing);
    document.body.classList.toggle('productEditorMode', !marketing);
    return () => {
      document.documentElement.classList.remove('productMarketingMode', 'productEditorMode');
      document.body.classList.remove('productMarketingMode', 'productEditorMode');
    };
  }, [effectiveRoute]);

  const signOut = () => { logout(); setAccount(null); setSubscription(null); go('home'); };
  const afterAuth = (next) => { setAccount(next); setSubscription(getSubscription(next.id)); go('app'); };
  const developerLogin = () => { const next = createDeveloperAccount(); setAccount(next); setSubscription(getSubscription(next.id)); go('app'); };
  const developerForAccount = () => {
    if (!account) return developerLogin();
    const sub = unlockDeveloperMode(account.id); setSubscription(sub); go('app');
  };

  if (effectiveRoute === 'app') {
    if (!account) { queueMicrotask(() => go('signup')); return null; }
    return <EditorShell EditorComponent={EditorComponent} account={account} subscription={subscription} onSignOut={signOut} onDeveloperUnlocked={setSubscription}/>;
  }
  if (effectiveRoute === 'login') return <AuthPage mode="login" onComplete={afterAuth} onDeveloper={developerLogin}/>;
  if (effectiveRoute === 'signup') return <AuthPage mode="signup" onComplete={afterAuth} onDeveloper={developerLogin}/>;
  if (effectiveRoute === 'upgrade') return <UpgradePage account={account} onActivated={(sub) => { setSubscription(sub); go('app'); }} onDeveloper={() => { developerForAccount(); }}/>;
  if (effectiveRoute === 'account') return <AccountPage account={account} subscription={subscription} onAccountChange={setAccount} onSubscriptionChange={setSubscription} onSignOut={signOut}/>;
  if (effectiveRoute === 'how') return <HowPage account={account} route={effectiveRoute}/>;
  if (effectiveRoute === 'pricing') return <PricingPage account={account} route={effectiveRoute}/>;
  if (effectiveRoute === 'faq') return <FAQPage account={account} route={effectiveRoute}/>;
  return <HomePage account={account} route="home"/>;
}
