import React, { useEffect, useRef, useState } from 'react';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';
import AccountMenu from './AccountMenu.jsx';
import PlanIllustration from './PlanIllustration.jsx';
import RevisionDemo from './RevisionDemo.jsx';
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

const EditorLink = ({ tabIndex }) => (
  <a href="/#/editor" className="button primary" tabIndex={tabIndex}>Open editor</a>
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
      <a href={publicPages.revisionDemo.path} className="detailsLink">Try a guided edit <Icon name="arrow" size={16} /></a>
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
      <a href="/#/editor" className="navEditorLink">Open editor</a>
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
      {plans.map(({ label, unit, amount, icon, description }, index) => (
        <article className="priceCard" key={unit}>
          <span className="priceIcon"><Icon name={icon} size={22} /></span>
          <div>
            {compact ? <p className="compactPriceLabel">{label}</p> : <h2>{label}</h2>}
            <p className="price"><strong>${amount}</strong><span> USD {unit}</span></p>
          </div>
          {!compact && <p className="priceDetail">{description}</p>}
          {!compact && <a className="button primary pricePurchase" href={`/?plan=${index === 0 ? 'project' : 'monthly'}#/account/billing`}>
            {index === 0 ? 'Buy single project' : 'Get monthly access'}
          </a>}
        </article>
      ))}
    </div>
  );
}

function TrialQualifier() {
  return (
    <p className="trialQualifier">
      <Icon name="card" size={16} /> <span>3-day free trial for new accounts · <strong className="trialNoCard">No credit card needed</strong></span>
    </p>
  );
}

function HomeContent({ showTrial, showVideo }) {
  return (
    <>
      <section className="hero" aria-labelledby="blueprint-hero-title">
        <div className="heroBlueprint" aria-hidden="true"><PlanIllustration /></div>
        <div className="heroCopy">
          <h1 id="blueprint-hero-title">Edit your <span className="heroEmphasis">existing floor plan</span>.</h1>
          <p>Mark up walls and doors on your existing PDF or image. Export the revised plan for your client.</p>
          <div className="heroActions">
            <EditorLink />
            {showTrial && <TrialQualifier />}
            <div><a href="#doorway-demo" className="detailsLink demoScrollLink" onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              document.getElementById('revision-title')?.focus({ preventScroll: true });
              document.getElementById('doorway-demo')?.scrollIntoView?.({ block: 'start' });
            }}>Try the demo below <Icon name="chevron" size={18} /></a></div>
          </div>
        </div>
      </section>
      <RevisionDemo embedded videoHref={showVideo ? undefined : DEMO_HASH} />
      {showVideo && <BlueprintDemo />}
      <section className="homeSection" aria-labelledby="project-pricing-title">
        <div className="priceSectionHeading">
          <h2 id="project-pricing-title">One project or monthly access</h2>
          <a className="detailsLink" href={publicPages.pricing.path}>See pricing <Icon name="arrow" size={17} /></a>
        </div>
        <PriceOptions compact />
      </section>
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

function PricingContent({ showTrial }) {
  return (
    <>
      <h1>Pricing</h1>
      {showTrial && (
        <div className="pricingTrial">
          <EditorLink />
          <TrialQualifier />
        </div>
      )}
      <PriceOptions />
      <section className="faqSection" aria-labelledby="faq-title">
        <h2 id="faq-title">FAQs</h2>
        <div className="faqList">
          {showTrial && (
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

function FooterLinks() {
  return (
    <>
      {Object.entries(POLICY_LINKS).map(([page, label]) => (
        <a key={page} href={publicPages[page].path}>{label}</a>
      ))}
      <a href="/privacy#cookie-settings">Cookie settings</a>
    </>
  );
}

export function SiteFooter() {
  const copyright = `© ${new Date().getFullYear()} ${PRODUCT_NAME}`;
  return (
    <footer className="siteFooter">
      <a href="/" aria-label={`${PRODUCT_NAME} home`}><Brand /></a>
      <nav className="footerDesktop" aria-label="Footer"><FooterLinks /></nav>
      <small className="footerDesktop">{copyright}</small>
      <details className="footerMenu" onKeyDown={(event) => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary').focus();
      }} onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}>
        <summary>Site links <Icon name="chevron" size={16} /></summary>
        <div className="footerMenuPanel">
          <nav aria-label="Site links"><FooterLinks /></nav>
          <small>{copyright}</small>
        </div>
      </details>
    </footer>
  );
}

export default function Marketing({ page, account, trialOffer: showTrial = false }) {
  const pricing = page === 'pricing';
  const guide = page === 'guide';
  const home = page === 'home' || page === 'demo';

  useEffect(() => {
    if (page === 'demo') scrollToDemo();
  }, [page]);

  return (
    <div className={home ? 'marketing marketingHome' : 'marketing'}>
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
        {pricing && <PricingContent showTrial={showTrial} />}
        {guide && <GuideContent />}
        {page === 'revisionDemo' && <RevisionDemo />}
        {home && <HomeContent showTrial={showTrial} showVideo={page === 'demo'} />}
      </main>
      <SiteFooter />
    </div>
  );
}
