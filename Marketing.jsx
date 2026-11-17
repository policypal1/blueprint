import React, { useEffect, useRef, useState } from 'react';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';
import AccountMenu from './AccountMenu.jsx';
import PlanIllustration, { DoorPlan } from './PlanIllustration.jsx';
import { POLICY_LINKS } from './Policies.jsx';

export const PRICING = { project: 10, monthly: 19 };
export const DEMO_HASH = '#/how-it-works';

const plans = [
  { label: 'Single project', unit: 'project', amount: PRICING.project, icon: 'file' },
  { label: 'Monthly plan', unit: 'month', amount: PRICING.monthly, icon: 'folder' },
];

const faqs = [
  ['Do I need a subscription?', 'A $10 project credit is a one-time purchase for a single original blueprint. The $19 USD monthly plan covers multiple projects.'],
  ['Can I use my existing blueprint?', 'Yes. Paste an image or upload a PDF, PNG, JPG, or WebP.'],
  ['What can I download?', 'You can export your revised plan as a PDF or PNG.'],
  ['Where are my plans saved?', 'New drafts stay in this browser. Plans unlocked with a project credit are saved to your account.'],
];

const EditorLink = ({ tabIndex, trial = false }) => (
  <a href={trial ? '#/trial' : '#/editor'} className="button primary" tabIndex={tabIndex}>
    {trial ? 'Start 3-day free trial' : 'Edit your blueprint'} <Icon name="arrow" size={17} />
  </a>
);

function scrollToDemo() {
  document.getElementById('blueprint-demo-title')?.focus({ preventScroll: true });
  document.getElementById('how-it-works')?.scrollIntoView?.();
}

function BlueprintDemo() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia?.('(max-width: 800px)').matches ?? false,
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
    <section id="how-it-works" className="blueprintDemo" aria-labelledby="blueprint-demo-title">
      <h2 id="blueprint-demo-title" tabIndex={-1}>How it works</h2>
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

function SiteNav({ page, account, mobile = false, onNavigate }) {
  return (
    <nav className="siteNav" aria-label="Main navigation" onClick={onNavigate}>
      <a href="#/pricing" aria-current={page === 'pricing' ? 'page' : undefined}>Pricing</a>
      {account && !account.signedIn && (
        <a href="#/sign-in" aria-current={page === 'signIn' ? 'page' : undefined}>Sign in</a>
      )}
      {mobile
        ? <a href="#/editor" className="mobileEditorLink">Edit your blueprint</a>
        : <EditorLink />}
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
      <SiteNav page={page} account={account} mobile onNavigate={closeMenu} />
    </details>
  );
}

export function SiteHeader({ page, account }) {
  const workspace = ['recent', 'workspace', 'sample'].includes(page);
  return (
    <header className={`siteHeader${workspace ? ' workspaceHeader' : ''}`}>
      <a href="#/" aria-label={`${PRODUCT_NAME} home`}>
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
      {plans.map(({ label, unit, amount, icon }) => (
        <article className="priceCard" key={unit}>
          <span className="priceIcon"><Icon name={icon} size={22} /></span>
          <div>
            {!compact && <h2>{label}</h2>}
            <p className="price"><strong>${amount}</strong><span> per {unit}</span></p>
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
          <h1 id="blueprint-hero-title">Edit your <span className="heroEmphasis">current blueprint</span>.</h1>
          <p>{showTrial
            ? 'Upload a floor plan, draw your changes, and share a revised PDF.'
            : 'Paste a blueprint image or upload a PDF. Draw your changes right on top.'}</p>
          <div className="heroActions" ref={heroAction}>
            <EditorLink trial={showTrial} />
            {showTrial && <p className="trialQualifier">No credit card needed</p>}
          </div>
        </div>
      </section>
      <BlueprintDemo />
      <section className="homeSection" aria-labelledby="project-pricing-title">
        <div className="priceSectionHeading">
          <h2 id="project-pricing-title">Pay per project</h2>
          <a className="detailsLink" href="#/pricing">See pricing <Icon name="arrow" size={17} /></a>
        </div>
        <PriceOptions compact />
      </section>
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
      <aside className="stickyEdit" aria-label="Blueprint editor shortcut" aria-hidden={!showSticky} data-visible={showSticky}>
        <EditorLink trial={showTrial} tabIndex={showSticky ? undefined : -1} />
      </aside>
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
          <p className="trialQualifier">No credit card needed</p>
        </div>
      )}
      <PriceOptions />
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
      <a href="#/" aria-label={`${PRODUCT_NAME} home`}><Brand /></a>
      <nav aria-label="Footer">
        {Object.entries(POLICY_LINKS).map(([page, label]) => (
          <a key={page} href={`#/${page}`}>{label}</a>
        ))}
      </nav>
      <small>© {new Date().getFullYear()} {PRODUCT_NAME}</small>
    </footer>
  );
}

export default function Marketing({ page, account, trialOffer = false }) {
  const pricing = page === 'pricing';

  useEffect(() => {
    if (page === 'demo') scrollToDemo();
  }, [page]);

  return (
    <div className={pricing ? 'marketing' : 'marketing marketingHome'}>
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
      <main id="main-content" className={pricing ? 'pricingPage' : undefined} tabIndex={-1}>
        {pricing
          ? <PricingContent trialOffer={trialOffer} signedIn={account?.signedIn} />
          : <HomeContent trialOffer={trialOffer} signedIn={account?.signedIn} />}
      </main>
      <SiteFooter />
    </div>
  );
}
