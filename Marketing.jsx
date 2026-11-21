import React, { useEffect, useRef, useState } from 'react';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';
import AccountMenu from './AccountMenu.jsx';
import PlanIllustration from './PlanIllustration.jsx';
import RevisionDemo from './RevisionDemo.jsx';
import { BEFORE_IMAGE, AFTER_IMAGE } from './comparison-images.js';
import './conversion.css';
import { POLICY_LINKS } from './Policies.jsx';
import { publicPages } from './seo-pages.js';

export const PRICING = { project: 9, monthly: 19 };
export const DEMO_HASH = '#/how-it-works';

const plans = [
  { label: 'Single project', unit: 'once', amount: PRICING.project,
    description: 'One original floor plan. Edit it and export as many times as you need.' },
  { label: 'Monthly access', unit: 'per month', amount: PRICING.monthly,
    description: 'Doing more than one? $19/month covers unlimited projects.' },
];

const faqs = [
  ['Is this a CAD program?', 'No. This is a simple editor for marking up an existing floor plan. Upload a PDF or image, erase what changes, add walls, doors or notes, and export. No AutoCAD experience needed.'],
  ['Can I try it before paying?', 'Yes. Upload and edit for free, or try the sample plan without an account. Pay when you need a clean PDF or PNG download. Drafts stay in this browser.'],
  ['Do I need a subscription?', 'A $9 project credit is a one-time purchase for a single original blueprint. The $19 USD monthly plan covers unlimited projects while active.'],
  ['Can I use my existing blueprint?', 'Yes. Upload a PDF, PNG, JPG or WebP up to 25 MB. Choose the sheet you want when a PDF has more than one page.'],
  ['What can I download?', 'Export your revised plan as a PDF or PNG with a project credit or active monthly access. Eligible accounts with an active 72-hour trial can also download.'],
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
      <p className="hint">This recording shows an earlier toolbar. In the current editor, choose Text to add a note or a known measurement.</p>
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
    <div className="priceOptions">
      {plans.map(({ label, unit, amount, description }, index) => (
        <article className={`priceCard${index === 0 ? ' priceCardFeatured' : ''}`} key={unit}>
          {compact ? <h3>{label}</h3> : <h2>{label}</h2>}
          <p className="price"><strong>${amount}</strong><span>USD {unit}</span></p>
          <p className="priceDetail">{description}</p>
          <a className={`button pricePurchase${index === 0 ? ' primary' : ''}`}
            href={compact ? publicPages.pricing.path : `/?plan=${index === 0 ? 'project' : 'monthly'}#/account/billing`}
            aria-label={compact ? `See ${label.toLowerCase()} pricing` : undefined}>
            {compact ? 'See pricing' : index === 0 ? 'Buy single project' : 'Get monthly access'}
          </a>
          {!compact && <p className="priceNote">{index === 0
            ? '* One-time payment. 7-day money-back guarantee on your first project purchase.'
            : 'Renews monthly until you cancel in Billing.'}</p>}
        </article>
      ))}
    </div>
  );
}

function WorkflowComparison() {
  const oldWay = [
    'Email the plan to a drafter and wait',
    'Redraw it from scratch in CAD',
    'Screenshot it and scribble in a PDF app',
    'Explain the change on the phone',
  ];
  const withBlueprint = [
    'Upload the plan you already have',
    'Erase and draw only what changes',
    'Export a clean revised PDF or PNG',
    'Send the revision when you’re ready',
  ];
  return (
    <section className="homeSection workflowComparison" aria-labelledby="workflow-comparison-title">
      <h2 id="workflow-comparison-title">A simpler way to revise a floor plan</h2>
      <div className="workflowComparisonGrid">
        <div className="workflowCard workflowCardOld">
          <h3>The old way</h3>
          <ul>{oldWay.map((text) => <li key={text}><Icon name="close" size={23} /><span>{text}</span></li>)}</ul>
        </div>
        <div className="workflowCard workflowCardBlueprint">
          <h3>With editfloorplans.com</h3>
          <ul>{withBlueprint.map((text) => <li key={text}><Icon name="check" size={23} /><span>{text}</span></li>)}</ul>
        </div>
      </div>
    </section>
  );
}

function HomeContent({ showTrial, showVideo }) {
  return (
    <>
      <section className="hero" aria-labelledby="blueprint-hero-title">
        <div className="heroBlueprint" aria-hidden="true"><PlanIllustration /></div>
        <div className="heroCopy">
          <h1 id="blueprint-hero-title">Edit your <span className="heroEmphasis">existing floor plan</span>.</h1>
          <p>Upload a PDF or photo of your floor plan. Make changes and export. No CAD needed.</p>
          <div className="heroActions">
            <EditorLink />
            <div><a href="/#/editor/sample" className="detailsLink">Try the editor with a sample plan</a></div>
          </div>
        </div>
      </section>
      <section className="homeBeforeAfter" aria-label="Before and after floor plan">
        <div className="comparisonPair">
          <figure><figcaption>Before</figcaption><img src={BEFORE_IMAGE} alt="Original primary bedroom, bathroom and walk-in closet" width="1426" height="892" /></figure>
          <figure><figcaption>After <span className="changeKey">Changes highlighted</span></figcaption><div className="comparisonAfter"><img src={AFTER_IMAGE} alt="Revised plan with a living room, divided bedroom, moved entrance, added windows and rearranged fixtures" width="1594" height="996" /><svg viewBox="0 0 1594 996" aria-hidden="true"><g fill="#ed7a261a" stroke="#ed7a26" strokeWidth="7" strokeLinejoin="round"><rect x="275" y="249" width="150" height="148" rx="12" /><rect x="281" y="425" width="665" height="146" rx="12" /><rect x="305" y="630" width="164" height="221" rx="12" /><rect x="450" y="837" width="412" height="41" rx="12" /><rect x="1170" y="480" width="112" height="75" rx="12" /><rect x="900" y="641" width="55" height="144" rx="12" /></g></svg></div></figure>
        </div>
        <a className="button primary comparisonCta" href="/#/editor/sample">Try the editor</a>
      </section>
      {showVideo && <BlueprintDemo />}
      <section className="homeSection audienceSection" aria-labelledby="audience-title">
        <h2 id="audience-title">Who this is for</h2>
        <div className="audienceGrid">
          <article><span className="audienceIcon"><Icon name="wall" size={25} /></span><h3>Remodel contractors</h3><p>Move a doorway before your next client meeting.</p></article>
          <article><span className="audienceIcon"><Icon name="door" size={25} /></span><h3>Builders &amp; trades</h3><p>Mark a wall change and send the revision to your crew.</p></article>
          <article><span className="audienceIcon"><Icon name="file" size={25} /></span><h3>Homeowners &amp; designers</h3><p>Sketch a layout idea on the plan you already have.</p></article>
        </div>
      </section>
      <WorkflowComparison />
      <section className="homeSection homePricing" aria-labelledby="project-pricing-title">
        <div className="priceSectionHeading">
          <h2 id="project-pricing-title">One project or monthly access</h2>
        </div>
        <PriceOptions compact />
      </section>
      <Faqs showTrial={showTrial} mobileHome />
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
          <p>Draw or mask walls, add doors and fixtures, and label the changes. <a className="accountTextLink" href={publicPages.measureGuide.path}>Add a verified measurement as a text label</a>.</p>
        </li>
        <li>
          <h2>Export a revised plan</h2>
          <p>Download a PDF or PNG for review. <a className="accountTextLink" href={publicPages.printGuide.path}>Check the print scale on an original PDF</a>.</p>
        </li>
      </ol>
    </>
  );
}

function Faqs({ showTrial, mobileHome = false }) {
  const headingId = mobileHome ? 'home-faq-title' : 'faq-title';
  return (
    <section className={mobileHome ? "faqSection mobileHomeFaq" : "faqSection"} aria-labelledby={headingId}>
      <h2 id={headingId} tabIndex={-1}>FAQs</h2>
      <div className="faqList">
        {showTrial && (
          <details>
            <summary>What happens when the free trial ends?<Icon name="chevron" size={20} /></summary>
            <p>The trial ends automatically after 72 hours without charging you. Your saved drafts stay in this browser, and you can keep editing. Choose “Unlock to download” when you’re ready for a clean export.</p>
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
  );
}

function PricingContent({ showTrial }) {
  return (
    <>
      <h1>Project plans</h1>
      <PriceOptions />
      <p className="guaranteeLine">Try your first project risk-free. Request a refund within 7 days of your first project purchase. <a href="/refunds-and-cancellation">See guarantee details</a>.</p>
      <Faqs showTrial={showTrial} />
    </>
  );
}

function FooterLinks() {
  return (
    <>
      <a href={publicPages.guides.path}>Floor plan guides</a>
      {Object.entries(POLICY_LINKS).map(([page, label]) => (
        <a key={page} href={publicPages[page].path}>{label}</a>
      ))}
      <a href="/privacy#cookie-settings">Cookie settings</a>
    </>
  );
}

export function SiteFooter({ home = false }) {
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
          <nav aria-label="Site links">
            <a href={home ? '#home-faq-title' : '/pricing#faq-title'}
              onClick={(event) => { event.currentTarget.closest('details').open = false; }}>FAQs</a>
            <FooterLinks />
          </nav>
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
      <SiteFooter home={home} />
    </div>
  );
}
