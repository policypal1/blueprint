import React, { useState } from 'react';
import { Brand, Icon } from './ui.jsx';
import PlanIllustration from './PlanIllustration.jsx';
export const PRICING = { project: 15, monthly: 29 };
const EditorLink = ({ children = 'Access blueprint editor', className = '' }) => (
  <a href="#/editor" className={`button primary ${className}`}>
    {children}
    <Icon name="arrow" size={17} />
  </a>
);
export default function Marketing({ page }) {
  const [revised, setRevised] = useState(true);
  const pricing = page === 'pricing';
  return (
    <div className="marketing">
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
        <a href="#/" aria-label="Blueprint Studio home">
          <Brand />
        </a>
        <nav aria-label="Main navigation">
          <a href="#/" aria-current={!pricing ? 'page' : undefined}>
            Overview
          </a>
          <a href="#/pricing" aria-current={pricing ? 'page' : undefined}>
            Pricing
          </a>
        </nav>
        <EditorLink className="navCta">Open editor</EditorLink>
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
                    The website works on small screens, but drawing is best on a laptop or larger
                    tablet. Open Tools or Properties to access the side panels on a smaller screen.
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
        ) : (
          <>
            <section className="hero">
              <div className="heroCopy">
                <span className="eyebrow">
                  <span className="statusDot" /> BUILT FOR THE NEXT REVISION
                </span>
                <h1>
                  Update the plan.
                  <br />
                  <span>Get on with the job.</span>
                </h1>
                <p>
                  Make clear changes to an existing floor plan. Clean up old details, draw the new
                  layout, and export a copy to share.
                </p>
                <div className="heroActions">
                  <EditorLink />
                  <a className="quietLink" href="#/pricing">
                    See pricing <Icon name="arrow" size={16} />
                  </a>
                </div>
                <p className="heroNote">Free during beta. No account or card needed.</p>
                <div className="formatRow">
                  <span>PDF</span>
                  <span>PNG</span>
                  <span>JPG</span>
                  <span>WEBP</span>
                  <small>Start with a file you already have.</small>
                </div>
              </div>
              <div className="heroVisual">
                <div className="previewHeader">
                  <span>
                    <Icon name="folder" size={15} /> Primary suite revision
                  </span>
                  <span className="previewSheet">SHEET 01</span>
                </div>
                <div className="previewTools">
                  <span>
                    <Icon name="select" size={15} /> Select
                  </span>
                  <span>
                    <Icon name="wall" size={15} /> Wall
                  </span>
                  <span className="chosen">
                    <Icon name="shower" size={15} /> Fixtures
                  </span>
                  <span>
                    <Icon name="measure" size={15} /> Measure
                  </span>
                </div>
                <PlanIllustration revised={revised} />
                <div className="previewFooter">
                  <span>Explore a sample revision</span>
                  <div className="segmented" aria-label="Plan comparison">
                    <button aria-pressed={!revised} onClick={() => setRevised(false)}>
                      Before
                    </button>
                    <button aria-pressed={revised} onClick={() => setRevised(true)}>
                      After
                    </button>
                  </div>
                </div>
                <div className="visualCaption">
                  <span className="smallRule" /> The plan you have, with the changes you need.
                </div>
              </div>
            </section>
            <div className="audienceStrip">
              <span>MADE FOR EVERYDAY PLAN CHANGES</span>
              <span>Remodelers</span>
              <span>Small contractors</span>
              <span>Renovation teams</span>
            </div>
            <section className="workflowSection">
              <div className="sectionHeading">
                <span className="eyebrow">A SHORT PATH FROM PLAN TO REVISION</span>
                <h2>Open it. Change it. Share it.</h2>
                <p>A focused set of tools for the work in front of you.</p>
              </div>
              <div className="workflowGrid">
                {[
                  [
                    '01',
                    'upload',
                    'Bring your existing plan',
                    'Upload a PDF or image. Choose the right page, then set scale from a measurement you know.',
                  ],
                  [
                    '02',
                    'wall',
                    'Make the changes clear',
                    'Erase old details. Draw walls, position doors, and add fixtures and dimensions.',
                  ],
                  [
                    '03',
                    'download',
                    'Send a clean revision',
                    'Download a PDF or PNG for discussion. Keep a project backup so you can come back to it.',
                  ],
                ].map(([number, icon, title, text]) => (
                  <article key={number}>
                    <div className="stepTop">
                      <span>{number}</span>
                      <Icon name={icon} size={24} />
                    </div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className="closingCta">
              <div>
                <span className="eyebrow">LESS SETUP. MORE PROGRESS.</span>
                <h2>Have a plan that needs a change?</h2>
                <p>Bring it in and try a revision. Your original file stays untouched.</p>
              </div>
              <EditorLink>Open the free editor</EditorLink>
            </section>
          </>
        )}
      </main>
      <footer className="siteFooter">
        <a href="#/" aria-label="Blueprint Studio home">
          <Brand />
        </a>
        <span>A simpler space for plan revisions.</span>
        <a href="#/pricing">Pricing</a>
        <a href="#/editor">Editor</a>
        <small>© {new Date().getFullYear()} Blueprint Studio</small>
      </footer>
    </div>
  );
}
