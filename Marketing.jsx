import React, { useEffect, useRef, useState } from 'react';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';
import PlanIllustration, { DoorPlan } from './PlanIllustration.jsx';

export const PRICING = { project: 10, monthly: 19 };
export const DEMO_HASH = '#/how-it-works';

const plans = [
  { label: 'Single project', unit: 'project', amount: PRICING.project, icon: 'file' },
  { label: 'Monthly plan', unit: 'month', amount: PRICING.monthly, icon: 'folder' },
];

const faqs = [
  ['Do I need a subscription?', 'A single project has a one-time price. The monthly plan is optional.'],
  ['Can I use my existing blueprint?', 'Yes. Paste an image or upload a PDF, PNG, JPG, or WebP.'],
  ['What can I download?', 'You can export your revised plan as a PDF or PNG.'],
  ['Where are my plans saved?', 'Your plans are saved in the browser you use to edit them.'],
];

const EditorLink = ({ tabIndex }) => (
  <a href="#/editor" className="button primary" tabIndex={tabIndex}>
    Edit your blueprint <Icon name="arrow" size={17} />
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

function SiteNav({ page, mobile = false, onNavigate }) {
  return (
    <nav className="siteNav" aria-label="Main navigation" onClick={onNavigate}>
      <a href="#/pricing" aria-current={page === 'pricing' ? 'page' : undefined}>Pricing</a>
      {mobile
        ? <a href="#/editor" className="mobileEditorLink">Edit your blueprint</a>
        : <EditorLink />}
    </nav>
  );
}

function MobileMenu({ page }) {
  const menu = useRef(null);
  const closeMenu = () => { menu.current.open = false; };
  return (
    <details className="mobileMenu" ref={menu} onKeyDown={(event) => {
      if (event.key !== 'Escape') return;
      closeMenu();
      menu.current.querySelector('summary').focus();
    }}>
      <summary aria-label="Menu"><Icon name="menu" size={24} /></summary>
      <SiteNav page={page} mobile onNavigate={closeMenu} />
    </details>
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

function HomeContent() {
  const heroAction = useRef(null);
  const [showSticky, setShowSticky] = useState(false);

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
          <p>Paste a blueprint image or upload a PDF. Draw your changes right on top.</p>
          <div className="heroActions" ref={heroAction}>
            <EditorLink />
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
        <EditorLink tabIndex={showSticky ? undefined : -1} />
      </aside>
    </>
  );
}

function PricingContent() {
  return (
    <>
      <h1>Pricing</h1>
      <PriceOptions />
      <section className="faqSection" aria-labelledby="faq-title">
        <h2 id="faq-title">FAQs</h2>
        <div className="faqList">
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

export default function Marketing({ page }) {
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
      <header className="siteHeader">
        <a href="#/" aria-label={`${PRODUCT_NAME} home`}>
          <Brand />
        </a>
        <SiteNav page={page} />
        <MobileMenu page={page} />
      </header>
      <main id="main-content" className={pricing ? 'pricingPage' : undefined} tabIndex={-1}>
        {pricing ? <PricingContent /> : <HomeContent />}
      </main>
      <footer className="siteFooter">
        <a href="#/" aria-label={`${PRODUCT_NAME} home`}>
          <Brand />
        </a>
        <a href="#/pricing">Pricing</a>
        <a href="#/editor">Editor</a>
        <small>© {new Date().getFullYear()} {PRODUCT_NAME}</small>
      </footer>
    </div>
  );
}
