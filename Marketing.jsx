import React, { useEffect, useRef, useState } from 'react';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';
import AccountMenu from './AccountMenu.jsx';
import PlanIllustration, { DoorPlan } from './PlanIllustration.jsx';
import { POLICY_LINKS } from './Policies.jsx';
import { publicPages } from './seo-pages.js';

export const PRICING = { project: 10, monthly: 19 };
export const DEMO_HASH = '#/how-it-works';

const plans = [
  { label: 'Single project', unit: 'once', amount: PRICING.project, icon: 'file',
    description: 'Make revisions to one original blueprint. Your credit stays with that project.' },
  { label: 'Monthly access', unit: 'per month', amount: PRICING.monthly, icon: 'folder',
    description: 'Edit multiple projects. Renews monthly until you cancel in Billing.' },
];

const faqs = [
  ['Do I need a subscription?', 'A $10 project credit is a one-time purchase for a single original blueprint. The $19 USD monthly plan covers multiple projects.'],
  ['Can I use my existing blueprint?', 'Yes. Upload a PDF, PNG, JPG or WebP up to 25 MB. Choose the sheet you want when a PDF has more than one page.'],
  ['What can I download?', 'Export your revised plan as a PDF or PNG while you have editing access.'],
  ['Where are my plans saved?', 'New drafts stay in this browser. Plans unlocked with a project credit are saved to your account.'],
];

const EditorLink = ({ tabIndex, trial = false }) => (
  <a href={trial ? '/#/trial' : '/#/editor'} className="button primary" tabIndex={tabIndex}>
    {trial ? 'Start 3-day free trial' : 'Edit your blueprint'} <Icon name="arrow" size={17} />
  </a>
);

function scrollToDemo() {
  document.getElementById('blueprint-demo-title')?.focus({ preventScroll: true });
  document.getElementById('how-it-works')?.scrollIntoView?.();
}

function BlueprintDemo({ heading = 'How it works' }) {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 800px)').matches),
  );
  const videoRef = useRef(null);

  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 800px)');
    const update = () => setMobile(query.matches);
    query?.addEventListener('change', update);
    return () => query?.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!window.IntersectionObserver) return;
    const video = videoRef.current;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let inView = false;
    let pausedByUser = false;

    const syncPlayback = () => {
      if (!inView || document.hidden) {
        if (!video.paused) video.pause();
      } else if (!pausedByUser && !motion?.matches) {
        void video.play().catch(() => {});
      }
    };
    const onPause = () => {
      if (inView && !document.hidden) pausedByUser = true;
    };
    const onPlay = () => { pausedByUser = false; };
    const onMotionChange = () => {
      if (motion.matches) {
        if (!video.paused) video.pause();
      } else {
        syncPlayback();
      }
    };
    const observer = new window.IntersectionObserver(([entry]) => {
      inView = entry.intersectionRatio >= 0.5;
      syncPlayback();
    }, { threshold: 0.5 });
    observer.observe(video);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    document.addEventListener('visibilitychange', syncPlayback);
    motion?.addEventListener('change', onMotionChange);
    return () => {
      observer.disconnect();
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      document.removeEventListener('visibilitychange', syncPlayback);
      motion?.removeEventListener('change', onMotionChange);
      if (!video.paused) video.pause();
    };
  }, [mobile]);

  return (
    <section id="how-it-works" className="blueprintDemo"
      aria-labelledby={heading ? 'blueprint-demo-title' : 'guide-title'}>
      {heading && <h2 id="blueprint-demo-title" tabIndex={-1}>{heading}</h2>}
      <video
        key={String(mobile)}
        ref={videoRef}
        src={mobile ? '/planpatch-demo-mobile.mp4' : '/planpatch-demo.mp4'}
        poster={mobile ? '/planpatch-demo-mobile-poster.webp' : '/planpatch-demo-poster.webp'}
        aria-label={`${mobile ? 'Uploading' : 'Pasting'} a blueprint image, clearing an old wall and bed, adding a wall, door and fixture, and downloading a PDF`}
        muted
        playsInline
        controls
        loop
        preload="none"
      />
    </section>
  );
}

function SiteNav({ page, account, onNavigate }) {
  return (
    <nav className="siteNav" aria-label="Main navigation" onClick={onNavigate}>
      <a href={publicPages.pricing.path} aria-current={page === 'pricing' ? 'page' : undefined}>Pricing</a>
      {account && !account.signedIn && (
        <a href={publicPages.signIn.path} aria-current={page === 'signIn' ? 'page' : undefined}>Sign in</a>
      )}
      <a href="/#/editor" className="navEditorLink">Edit your blueprint <Icon name="arrow" size={16} /></a>
    </nav>
  );
}

function MobileMenu({ page, account }) {
  const menu = useRef(null);
  const closeMenu = () => { menu.current.open = false; };
  return (
    <details className="mobileMenu" ref={menu} onKeyDown={(event) => {
      if (event.key !== 'Escape') return;
      closeMenu();
      menu.current.querySelector('summary').focus();
    }}>
      <summary aria-label="Menu"><Icon name="menu" size={24} /></summary>
      <SiteNav page={page} account={account} onNavigate={closeMenu} />
    </details>
  );
}

export function SiteHeader({ page, account }) {
  const workspace = ['recent', 'workspace', 'sample'].includes(page);
  return (
    <header className={`siteHeader${workspace ? ' workspaceHeader' : ''}`}>
      <a href="/" aria-label={`${PRODUCT_NAME} home`}>
        <Brand />
      </a>
      <div className="siteHeaderActions">
        {!workspace && (
          <>
            <SiteNav page={page} account={account} />
            <MobileMenu page={page} account={account} />
          </>
        )}
        {account?.signedIn && (
          <AccountMenu user={account.user} page={page} busy={account.busy} onSignOut={account.onSignOut} />
        )}
      </div>
    </header>
  );
}

function PriceOptions({ compact = false }) {
  return (
    <div className={compact ? 'priceOptions compactPrices' : 'priceOptions'}>
      {plans.map(({ label, unit, amount, icon, description }) => (
        <article className="priceCard" key={unit}>
          <span className="priceIcon"><Icon name={icon} size={22} /></span>
          <div>
            {compact ? <p className="compactPriceLabel">{label}</p> : <h2>{label}</h2>}
            <p className="price"><strong>${amount}</strong><span> USD {unit}</span></p>
            {!compact && <p className="priceDetail">{description}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}

function HomeContent({ trialOffer, signedIn }) {
  const heroAction = useRef(null);
  const [showSticky, setShowSticky] = useState(false);
  const showTrial = trialOffer && !signedIn;

  useEffect(() => {
    if (!window.IntersectionObserver) return;
    const observer = new window.IntersectionObserver(([entry]) => {
      setShowSticky(entry.boundingClientRect.bottom <= 0);
    });
    observer.observe(heroAction.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <section className="hero" aria-labelledby="blueprint-hero-title">
        <div className="heroBlueprint" aria-hidden="true"><PlanIllustration /></div>
        <div className="heroCopy">
          <h1 id="blueprint-hero-title">Edit your <span className="heroEmphasis">existing floor plan</span>.</h1>
          <p>Upload a PDF or image, mark up walls, doors and fixtures, and export a revised plan.</p>
          <div className="heroActions" ref={heroAction}>
            <EditorLink trial={showTrial} />
            {showTrial && <p className="trialQualifier"><strong className="trialNoCard">No credit card needed</strong></p>}
          </div>
        </div>
      </section>
      <BlueprintDemo />
      <section className="homeSection" aria-labelledby="comparison-title">
        <h2 id="comparison-title">See what changed</h2>
        <p className="comparisonIntro">Close the old doorway, move the entry, and add a window.</p>
        <div className="comparisonGrid">
          <figure>
            <figcaption><strong>Original</strong><span>Swing door</span></figcaption>
            <DoorPlan />
          </figure>
          <figure>
            <figcaption><strong>Revised</strong><span>New entry and window</span></figcaption>
            <DoorPlan revised />
          </figure>
        </div>
      </section>
      <section className="homeSection" aria-labelledby="project-pricing-title">
        <div className="priceSectionHeading">
          <h2 id="project-pricing-title">One project or monthly access</h2>
          <a className="detailsLink" href={publicPages.pricing.path}>See pricing <Icon name="arrow" size={17} /></a>
        </div>
        <PriceOptions compact />
      </section>
      <aside className="stickyEdit" aria-label="Blueprint editor shortcut" aria-hidden={!showSticky} data-visible={showSticky}>
        <EditorLink trial={showTrial} tabIndex={showSticky ? undefined : -1} />
      </aside>
    </>
  );
}

function GuideContent() {
  return (
    <>
      <h1 className="guideTitle" id="guide-title">How to edit a floor plan PDF</h1>
      <BlueprintDemo heading={null} />
      <ol className="guideSteps">
        <li>
          <h2>Upload the original drawing</h2>
          <p>Use a PDF, PNG, JPG or WebP up to 25 MB. For a multi-page PDF, pick the floor plan sheet you want to edit.</p>
        </li>
        <li>
          <h2>Mark up the layout</h2>
          <p>Draw or mask walls, add doors and fixtures, and label the changes. <a className="accountTextLink" href={publicPages.measureGuide.path}>Set the scale before measuring</a>.</p>
        </li>
        <li>
          <h2>Export a revised plan</h2>
          <p>Download a PDF or PNG for review. <a className="accountTextLink" href={publicPages.printGuide.path}>Print a scaled PDF at actual size</a>.</p>
        </li>
      </ol>
    </>
  );
}

function PricingContent({ trialOffer, signedIn }) {
  return (
    <>
      <h1>Pricing</h1>
      {trialOffer && !signedIn && (
        <div className="pricingTrial">
          <EditorLink trial />
          <p className="trialQualifier"><strong className="trialNoCard">No credit card needed</strong>. Ends automatically.</p>
        </div>
      )}
      <PriceOptions />
      {signedIn && <div className="pricingAccount"><a className="button primary" href="/#/account/billing">View billing</a></div>}
      <section className="faqSection" aria-labelledby="faq-title">
        <h2 id="faq-title">FAQs</h2>
        <div className="faqList">
          {trialOffer && (
            <details>
              <summary>What happens when the free trial ends?<Icon name="chevron" size={20} /></summary>
              <p>The trial ends automatically after 72 hours. Choose a plan if you want to keep editing and downloading your work.</p>
            </details>
          )}
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}<Icon name="chevron" size={20} /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <a href="/" aria-label={`${PRODUCT_NAME} home`}><Brand /></a>
      <nav aria-label="Footer">
        <a href={publicPages.guide.path}>How it works</a>
        <a href={publicPages.guides.path}>Floor plan guides</a>
        <a href={publicPages.pricing.path}>Pricing</a>
        {Object.entries(POLICY_LINKS).map(([page, label]) => (
          <a key={page} href={publicPages[page].path}>{label}</a>
        ))}
        <a href="/privacy#cookie-settings">Cookie settings</a>
      </nav>
      <small>© {new Date().getFullYear()} {PRODUCT_NAME}</small>
    </footer>
  );
}

export default function Marketing({ page, account, trialOffer = false }) {
  const pricing = page === 'pricing';
  const guide = page === 'guide';

  useEffect(() => {
    if (page === 'demo') scrollToDemo();
  }, [page]);

  return (
    <div className={pricing || guide ? 'marketing' : 'marketing marketingHome'}>
      <a
        className="skipLink"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById('main-content');
          main?.focus();
          main?.scrollIntoView({ block: 'start' });
        }}
      >
        Skip to content
      </a>
      <SiteHeader page={page} account={account} />
      <main id="main-content" className={pricing ? 'pricingPage' : guide ? 'guidePage' : undefined} tabIndex={-1}>
        {pricing && <PricingContent trialOffer={trialOffer} signedIn={account?.signedIn} />}
        {guide && <GuideContent />}
        {!guide && !pricing && <HomeContent trialOffer={trialOffer} signedIn={account?.signedIn} />}
      </main>
      <SiteFooter />
    </div>
  );
}
