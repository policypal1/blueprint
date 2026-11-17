import React from 'react';
import { Icon } from './ui.jsx';
import { publicPages } from './seo-pages.js';

const guides = [
  { id: 'guide', heading: 'How to edit a floor plan PDF', summary: 'Watch the editor in use, then follow the steps from upload to export.' },
  ...['measureGuide', 'remodelGuide', 'printGuide'].map((id) => ({
    id, heading: publicPages[id].heading, summary: publicPages[id].description,
  })),
];

function MeasureGuide() {
  return (
    <>
      <p>Pick a distance you can verify on the drawing or at the property. A long labeled span gives you more room to place the two calibration points precisely.</p>
      <ol className="articleSteps">
        <li>
          <h2>Open the floor plan sheet</h2>
          <p>Upload the PDF and choose the sheet with the dimension you know. Zoom in until you can distinguish both ends of its dimension line.</p>
        </li>
        <li>
          <h2>Set the scale</h2>
          <p>Choose <strong>Set scale</strong>, select the two ends, and press <strong>Set real distance</strong>. Enter the known distance, such as <strong>10 ft</strong> or <strong>120 inches</strong>. A number entered without a unit is read as inches.</p>
        </li>
        <li>
          <h2>Measure a new span</h2>
          <p>In <strong>Measure</strong>, choose <strong>Distance</strong> and drag between two points for a reading. To leave a label on the drawing, use <strong>Dimension</strong> under More tools and drag across the span.</p>
        </li>
      </ol>
      <p>Check a second labeled span, preferably across the other direction. A stretched scan can disagree even after you set a scale. Use field measurements for decisions that depend on exact clearance or fit.</p>
    </>
  );
}

function RemodelGuide() {
  return (
    <>
      <p>Start with the existing floor plan so the people reviewing your remodel can tell what moves and what stays.</p>
      <ol className="articleSteps">
        <li>
          <h2>Keep a copy of the existing drawing</h2>
          <p>Open the floor plan sheet for the floor you want to change. Save the original PDF alongside your revision so you can send both to a contractor or designer.</p>
        </li>
        <li>
          <h2>Mark the proposed layout</h2>
          <p>Use <strong>Clean up</strong> to cover old details on the imported drawing. Draw a new wall with <strong>Wall</strong>, select a swing under <strong>Door</strong>, and add a short note with <strong>Text</strong>. Open <strong>More tools</strong> for windows and fixtures.</p>
        </li>
        <li>
          <h2>Label and share the revision</h2>
          <p>Label anything a reviewer might miss, such as a doorway moving into a hallway. Export a PDF named for the room and revision, then send it alongside the original.</p>
        </li>
      </ol>
      <h2>Check permit requirements with your city or county</h2>
      <p>Plan submission rules depend on the project and local authority. For example, Austin asks for existing and proposed plans for certain changes to walls, doors, windows, or plumbing fixtures. Review the local checklist before submitting a revision. <a className="accountTextLink" href="https://www.austintexas.gov/development-services/residential-plan-review">Austin residential plan review</a></p>
    </>
  );
}

function PrintGuide() {
  return (
    <>
      <p>A page can look right on screen while printing at a different scale. Set the scale in the editor, match the paper to the export, and check one dimension on the printout.</p>
      <ol className="articleSteps">
        <li>
          <h2>Calibrate a known distance</h2>
          <p>Use <strong>Set scale</strong> to match two points on the drawing to a known distance. <a className="accountTextLink" href={publicPages.measureGuide.path}>Follow the calibration steps</a>.</p>
        </li>
        <li>
          <h2>Choose a sheet and drawing scale</h2>
          <p>In <strong>Export</strong>, open the PDF print settings and select Letter, Tabloid, or A3. Choose a fixed scale such as <strong>¼ inch = 1 foot</strong>. If the drawing is too large for your sheet, choose a larger sheet or a smaller scale. Use <strong>Fit to page</strong> for a reference copy.</p>
        </li>
        <li>
          <h2>Print at actual size</h2>
          <p>Select the same paper size in your PDF viewer. Choose <strong>Actual size</strong> or <strong>100%</strong> to preserve the exported dimensions. Check the print preview for clipped edges. <a className="accountTextLink" href="https://helpx.adobe.com/acrobat/desktop/print-documents/set-up-and-print-pdfs/page-size.html">Adobe’s PDF sizing instructions</a></p>
        </li>
      </ol>
      <p>Use a ruler on a known span from the drawing. At ¼ inch = 1 foot, a 12-foot span should measure 3 inches on paper.</p>
    </>
  );
}

const articleBodies = { measureGuide: MeasureGuide, remodelGuide: RemodelGuide, printGuide: PrintGuide };

export default function FloorPlanGuides({ page, showTrial }) {
  if (page === 'guides') {
    return (
      <main className="resourcePage">
        <h1>Floor plan editing guides</h1>
        <ul className="resourceList">
          {guides.map(({ id, heading, summary }) => (
            <li key={id}>
              <a href={publicPages[id].path}>
                <span><strong>{heading}</strong><span>{summary}</span></span>
                <Icon name="arrow" size={18} />
              </a>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const Body = articleBodies[page];
  return (
    <main className="resourcePage">
      <a className="accountTextLink resourceBack" href={publicPages.guides.path}>All floor plan guides</a>
      <article className="resourceArticle">
        <h1>{publicPages[page].heading}</h1>
        <Body />
        <div className="resourceAction">
          <a className="button primary" href={showTrial ? '/#/trial' : '/#/editor'}>
            {showTrial ? 'Start 3-day free trial' : 'Edit your blueprint'} <Icon name="arrow" size={17} />
          </a>
          {showTrial && <p>No credit card needed.</p>}
        </div>
      </article>
      <nav className="relatedGuides" aria-label="Related floor plan guides">
        <h2>Related guides</h2>
        <ul>
          {guides.filter(({ id }) => id !== page).map(({ id, heading }) => (
            <li key={id}><a className="accountTextLink" href={publicPages[id].path}>{heading}</a></li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
