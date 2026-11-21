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
      <p>Start with a dimension printed on the original sheet or a distance you have checked at the property. The editor lets you record that value beside a proposed change.</p>
      <ol className="articleSteps">
        <li>
          <h2>Find a reliable dimension</h2>
          <p>Follow the two extension lines to see which faces the printed number refers to. For a doorway, the rough opening and the clear opening are different measurements. If the dimension you need is missing, check it on site or use a calibrated measuring tool on the original PDF and verify it against a second known span.</p>
        </li>
        <li>
          <h2>Mark it on the plan</h2>
          <p>Upload the PDF, choose the sheet, then choose <strong>Text</strong> and place the label beside the opening. In <strong>Properties</strong>, type the value, unit and what you measured, such as <strong>36 in clear opening</strong>. Use Line under More tools if you want a leader pointing to the opening.</p>
        </li>
        <li>
          <h2>Check the exported note</h2>
          <p>Download the revised PDF. Zoom in and check that both the value and the part of the drawing it refers to are easy to read. Verify critical clearances on site before ordering materials.</p>
        </li>
      </ol>
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
          <p>Open <strong>Clean up</strong> and choose the rectangle or brush eraser to clear old details. Draw a new wall with <strong>Wall</strong>, select a swing under <strong>Door</strong>, and add a short note with <strong>Text</strong>. Open <strong>More tools</strong> for windows and fixtures.</p>
        </li>
        <li>
          <h2>Move a doorway</h2>
          <p>Choose <strong>Door</strong>, then <strong>Move a doorway</strong>. On an uploaded plan, tap the old hinge, the opposite jamb, and the tip of the door leaf. If you added the door in the editor, tap that door to select it.</p>
          <p>Tap the new hinge, then tap along the wall in the direction of the opening. Check the swing in the preview and choose <strong>Apply move</strong>. One undo restores the old doorway. <a className="accountTextLink" href={publicPages.revisionDemo.path}>Try the doorway demo</a>.</p>
        </li>
        <li>
          <h2>Label and share the revision</h2>
          <p>Label anything a reviewer might miss, such as a doorway moving into a hallway. Export a PDF named for the room and revision, then send it alongside the original.</p>
        </li>
      </ol>
      <h2>Check permit requirements with your city or county</h2>
      <p>States adopt different building codes and amendments. Local permit checklists, zoning rules and professional seal requirements also depend on the property and scope of work. The editor helps communicate revisions. It does not check the design against those rules or provide a professional seal.</p>
      <p>Start with your local building department. State resources include <a className="accountTextLink" href="https://www.oregon.gov/bcd/lbdd/Pages/oregon-permits.aspx">Oregon permit guidance</a>, the <a className="accountTextLink" href="https://www.dgs.ca.gov/BSC">California Building Standards Commission</a> and the <a className="accountTextLink" href="https://sbcc.wa.gov/state-codes-regulations-guidelines/state-building-code">Washington State Building Code Council</a>.</p>
      <p>Plan submission rules depend on the project and local authority. For example, Austin asks for existing and proposed plans for certain changes to walls, doors, windows, or plumbing fixtures. Review the local checklist before submitting a revision. <a className="accountTextLink" href="https://www.austintexas.gov/development-services/residential-plan-review">Austin residential plan review</a></p>
    </>
  );
}

function PrintGuide() {
  return (
    <>
      <p>Use the original scale-marked PDF when a reviewer needs to take dimensions from paper. A revised PDF from the editor fits your selected sheet and is suitable for reviewing changes and reading written measurements.</p>
      <ol className="articleSteps">
        <li>
          <h2>Read the source sheet</h2>
          <p>Find the drawing scale and intended paper size in the title block. Check whether the detail you need has its own scale. A photo or a scan resized to fit a page may have lost its original scale.</p>
        </li>
        <li>
          <h2>Match the paper and print at actual size</h2>
          <p>Open the original PDF in your PDF viewer, select the intended paper size, and choose <strong>Actual size</strong> or <strong>100%</strong>. Check for clipping in print preview. <a className="accountTextLink" href="https://helpx.adobe.com/acrobat/desktop/print-documents/set-up-and-print-pdfs/page-size.html">Adobe’s PDF sizing instructions</a></p>
        </li>
        <li>
          <h2>Check a labeled span with a ruler</h2>
          <p>At ¼ inch = 1 foot, a 12-foot span should measure 3 inches on the printout. Check a second span in the other direction to catch a distorted scan.</p>
        </li>
      </ol>
      <p>To share a markup instead, choose <strong>Export</strong>, select Letter, Tabloid, or A3 under PDF print settings, and download the PDF. <a className="accountTextLink" href={publicPages.measureGuide.path}>How to add a verified measurement to a floor plan</a></p>
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
          <a className="button primary" href="/#/editor">Open editor</a>
          {showTrial && <p>3-day free trial · No credit card needed</p>}
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
