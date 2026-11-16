import React, { useEffect, useRef, useState } from 'react';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';
import PlanIllustration from './PlanIllustration.jsx';
export const PRICING = { project: 10, monthly: 19 };
const EditorLink = ({ children, href = '#/editor', className = '', primary = true }) => (
  <a href={href} className={`button ${primary ? 'primary' : ''} ${className}`}>
    {children}
    <Icon name="arrow" size={17} />
  </a>
);

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

function MobileMenu() {
  const menu = useRef(null);
  return (
    <details className="mobileMenu" ref={menu} onKeyDown={(event) => {
      if (event.key !== 'Escape') return;
      menu.current.open = false;
      menu.current.querySelector('summary').focus();
    }}>
      <summary aria-label="Menu"><Icon name="menu" size={24} /></summary>
      <nav aria-label="Main navigation">
        <a href="#how-it-works" onClick={(event) => {
          event.preventDefault();
          menu.current.open = false;
          document.getElementById('blueprint-demo-title')?.focus({ preventScroll: true });
          document.getElementById('how-it-works')?.scrollIntoView();
        }}>How it works</a>
        <a href="#/pricing">Pricing</a>
        <a href="#/editor">Edit your blueprint</a>
      </nav>
    </details>
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
            <EditorLink>Edit your blueprint</EditorLink>
          </div>
        </div>
      </section>
      <BlueprintDemo />
      <section className="workflowSection" aria-label="How PlanPatch works">
        <div className="workflowGrid">
          {[
            ['upload', 'Bring your plan', 'Paste an image or upload a PDF.'],
            ['wall', 'Make your changes', 'Draw walls, place doors, and drop in fixtures.'],
            ['download', 'Download a PDF', 'Send a copy of the revised plan.'],
          ].map(([icon, title, description]) => (
            <article key={icon}>
              <Icon name={icon} size={24} />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="homeSection projectPricing" aria-labelledby="project-pricing-title">
        <h2 id="project-pricing-title">Pay per project</h2>
        <p>Free during beta. No card required.</p>
        <p>After beta, pay <strong>${PRICING.project} per project</strong> with no subscription required, or choose <strong>${PRICING.monthly}/month</strong>.</p>
        <a className="detailsLink" href="#/pricing">See pricing</a>
      </section>
      <section className="homeSection planComparison" aria-labelledby="comparison-title">
        <h2 id="comparison-title">See what changed</h2>
        <p>The old wall and bed were cleared, then a new wall, door, and sink were added.</p>
        <div className="comparisonGrid">
          <figure>
            <img src="/planpatch-original.webp" alt="Original plan with a bed and the old partition wall" width="800" height="500" loading="lazy" />
            <figcaption>Original</figcaption>
          </figure>
          <figure>
            <img src="/planpatch-revised.webp" alt="Revised plan showing the new partition, door, and sink" width="800" height="500" loading="lazy" />
            <figcaption>Revised</figcaption>
          </figure>
        </div>
      </section>
      <aside className="stickyEdit" aria-label="Blueprint editor shortcut" aria-hidden={!showSticky} data-visible={showSticky}>
        <a className="button primary" href="#/editor" tabIndex={showSticky ? undefined : -1}>
          Edit your blueprint <Icon name="arrow" size={17} />
        </a>
      </aside>
    </>
  );
}

export default function Marketing({ page }) {
  const pricing = page === 'pricing';
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
        {pricing ? <EditorLink className="navCta" primary={false}>Open editor</EditorLink> : <MobileMenu />}
      </header>
      <main id="main-content" tabIndex="-1">
        {pricing ? (
          <>
            <section className="pricingIntro">
              <span className="eyebrow">STRAIGHTFORWARD PRICING</span>
              <h1>One job. Or the next ten.</h1>
              <p>
                A project when you need it. A monthly plan when you use it often.
                <br />
                The same simple editor either way.
              </p>
            </section>
            <div className="betaNote">
              <span className="statusDot" />
              <div>
                <strong>The editor is free during beta.</strong> These are our proposed launch
                prices. No payment or account is required today.
              </div>
            </div>
            <section className="pricingCards" aria-label="Proposed pricing plans">
              <article className="priceCard">
                <span className="eyebrow">FOR THE OCCASIONAL REVISION</span>
                <h2>Single project</h2>
                <div className="price">
                  ${PRICING.project}
                  <span>/ project</span>
                </div>
                <p>A simple option for a one-off remodeling job.</p>
                <ul>
                  <li>
                    <Icon name="check" />
                    One project, editable for 30 days
                  </li>
                  <li>
                    <Icon name="check" />
                    Every drawing and cleanup tool
                  </li>
                  <li>
                    <Icon name="check" />
                    PDF and PNG exports
                  </li>
                  <li>
                    <Icon name="check" />
                    Keep your downloaded files
                  </li>
                </ul>
                <EditorLink>Try the editor free</EditorLink>
                <small>Proposed one-time price. No auto-renewal.</small>
              </article>
              <article className="priceCard monthlyCard">
                <span className="eyebrow">FOR REGULAR PROJECT WORK</span>
                <h2>Monthly workspace</h2>
                <div className="price">
                  ${PRICING.monthly}
                  <span>/ month</span>
                </div>
                <p>For contractors with another plan on the desk.</p>
                <ul>
                  <li>
                    <Icon name="check" />
                    Multiple projects in one workspace
                  </li>
                  <li>
                    <Icon name="check" />
                    Every drawing and cleanup tool
                  </li>
                  <li>
                    <Icon name="check" />
                    PDF and PNG exports
                  </li>
                  <li>
                    <Icon name="check" />
                    Month to month, cancel anytime
                  </li>
                </ul>
                <EditorLink>Try the editor free</EditorLink>
                <small>Proposed subscription. Billing is not active.</small>
              </article>
            </section>
            <section className="pricingDetails">
              <h2>
                No credits to count.
                <br />
                No tools to unlock.
              </h2>
              <div>
                <p>
                  Both proposed plans include the full editor. Pick the option that fits how often
                  you work on a plan.
                </p>
                <p>
                  During beta, projects are saved in your current browser. Download a project backup
                  to keep a portable copy. Cloud storage and accounts are still to come.
                </p>
              </div>
            </section>
            <section className="faqSection">
              <h2>A few practical answers.</h2>
              <div className="faqList">
                <details>
                  <summary>Will I be charged during beta?</summary>
                  <p>
                    No. There is no checkout or payment collection. You can try the full editor for
                    free.
                  </p>
                </details>
                <details>
                  <summary>What happens to exported files?</summary>
                  <p>
                    PDFs, PNGs, and project backups you download are yours to keep. A backup can be
                    restored in the editor to continue working.
                  </p>
                </details>
                <details>
                  <summary>Can I work from a phone?</summary>
                  <p>
                    Yes. On a phone, tap Edit to draw a wall or place a door or fixture. Open View
                    to pan and zoom. Desktop puts the full tool panel next to the drawing.
                  </p>
                </details>
                <details>
                  <summary>Does this replace a professional construction drawing?</summary>
                  <p>
                    Use the editor to communicate proposed revisions. It does not verify structural
                    design, building requirements, or site measurements.
                  </p>
                </details>
              </div>
            </section>
          </>
        ) : <HomeContent />}
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
