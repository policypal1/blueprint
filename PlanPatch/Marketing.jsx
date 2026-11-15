import React, { useState } from 'react';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';
import PlanIllustration from './PlanIllustration.jsx';
import { SAMPLE_NAME } from './sample-project.js';
export const PRICING = { project: 15, monthly: 29 };
const EditorLink = ({ children, href = '#/editor', className = '', primary = true }) => (
  <a href={href} className={`button ${primary ? 'primary' : ''} ${className}`}>
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
        <a href="#/" aria-label={`${PRODUCT_NAME} home`}>
          <Brand />
        </a>
        <EditorLink className="navCta" primary={false}>Open editor</EditorLink>
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
        ) : (
          <>
            <section className="hero">
              <div className="heroCopy">
                <h1>Update floor plans from the job site.</h1>
                <p>Add walls, doors, and fixtures to a plan you already have. Send the revision as a PDF.</p>
                <div className="heroActions">
                  <EditorLink href="#/editor/sample">Try a sample plan</EditorLink>
                </div>
                <p className="heroNote">Free during beta</p>
              </div>
              <div className="heroVisual">
                <div className="previewHeader">
                  <span>
                    <Icon name="folder" size={15} /> {SAMPLE_NAME}
                  </span>
                  <span className="previewSheet">{revised ? 'Revised plan' : 'Original plan'}</span>
                </div>
                <PlanIllustration revised={revised} />
                <div className="previewFooter">
                  <span>Bathroom layout</span>
                  <div className="segmented" role="group" aria-label="Plan comparison">
                    <button aria-pressed={!revised} onClick={() => setRevised(false)}>
                      Before
                    </button>
                    <button aria-pressed={revised} onClick={() => setRevised(true)}>
                      After
                    </button>
                  </div>
                </div>
              </div>
            </section>
            <section className="workflowSection" aria-label="How PlanPatch works">
              <div className="workflowGrid">
                {[
                  ['upload', 'Upload a plan', 'Start from a PDF or an image.'],
                  ['wall', 'Make your changes', 'Draw walls, place doors, and drop in fixtures.'],
                  ['download', 'Download a PDF', 'Send a copy of the revised plan.'],
                ].map(([icon, title, text]) => (
                  <article key={icon}>
                    <Icon name={icon} size={24} />
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className="closingCta">
              <div>
                <h2>Ready to revise your own plan?</h2>
              </div>
              <EditorLink>Open editor</EditorLink>
            </section>
          </>
        )}
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
