import React, { useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { ConsentAnalytics } from './PrivacyChoices.jsx';
import RevisionDrawing from './RevisionDrawing.jsx';
import { downloadRevisionPdf } from './revision-export.js';

const tools = [
  { name: 'Clean up', icon: 'clean', frame: 0 },
  { name: 'Wall', icon: 'wall', frame: 2 },
  { name: 'Door', icon: 'door', frame: 5 },
  { name: 'Export', icon: 'download', frame: 7 },
];

const frames = [
  { tool: 0, stage: 'original', title: 'Clear the old swing', text: 'Start with Clean up. Its Rectangle tool covers marks printed on the original plan.', action: 'Choose Clean up' },
  { tool: 0, stage: 'original', title: 'Cover the printed door', text: 'The rectangle is sized for this sample. Select the old swing in the hallway to cover it.', action: 'Cover old swing', point: [268, 322], tag: 'Old swing' },
  { tool: 1, stage: 'masked', title: 'Close the opening', text: 'The swing is gone. Choose Wall to fill the gap where the doorway used to be.', action: 'Choose Wall' },
  { tool: 1, stage: 'masked', title: 'Start the wall', text: 'Mark the left edge of the opening. This is where the replacement wall begins.', action: 'Set wall start', point: [242, 293], tag: 'Start here' },
  { tool: 1, stage: 'masked', title: 'Finish the wall', text: 'Mark the opposite edge to connect the wall across the old opening.', action: 'Finish wall', point: [314, 293], tag: 'End here' },
  { tool: 2, stage: 'cleaned', title: 'Move the doorway', text: 'Choose Door. The sample uses a 36-inch swing door that opens into the laundry room.', action: 'Choose Door' },
  { tool: 2, stage: 'cleaned', title: 'Place the new door', text: 'Select the marked spot farther along the same wall. The new swing will leave the hallway clear.', action: 'Place new door', point: [421, 293], tag: 'New doorway' },
  { tool: 3, stage: 'revised', title: 'Check the change', text: 'Switch between the two plans to check the door swing. Choose Export when the revision is ready.', action: 'Choose Export' },
  { tool: 3, stage: 'revised', title: 'Your revised floor plan', text: 'The door now opens into the laundry. Download the sample PDF for client review, or try a revision on your own drawing.', action: 'Download sample PDF' },
];

const LAST = frames.length - 1;

function EditGuide({ frame }) {
  if (!frame.point) return null;
  let mark;
  if (frame.tool === 0) {
    mark = <rect x="237" y="290" width="82" height="80" rx="3" />;
  } else if (frame.tool === 1) {
    mark = <><path d="M242 293H314" />{frame.point[0] === 314 && <circle cx="242" cy="293" r="5" />}</>;
  } else {
    mark = <path d="M385 293H457V221A72 72 0 0 0 385 293Z" />;
  }
  return <svg className="revisionMark" viewBox="0 0 800 500" aria-hidden="true">{mark}</svg>;
}

export default function RevisionDemo() {
  const [index, setIndex] = useState(0);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [downloadState, setDownloadState] = useState('idle');
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const drawing = useRef(null);
  const downloading = useRef(false);
  const frame = frames[index];
  const last = index === LAST;
  const review = frame.stage === 'revised';
  const chapter = frame.tool;
  const heading = useRef(null);

  function go(to) {
    setIndex(to);
    setCompareOriginal(false);
    setDownloadState('idle');
    // A canvas target can disappear after use. Keep keyboard navigation inside the tour.
    heading.current?.focus({ preventScroll: true });
  }

  async function download() {
    if (downloading.current) return;
    downloading.current = true;
    setDownloadState('busy');
    try {
      await downloadRevisionPdf(drawing.current);
      setDownloadState('done');
      setHasDownloaded(true);
    } catch {
      setDownloadState('error');
    } finally {
      downloading.current = false;
    }
  }

  const advance = () => last ? download() : go(index + 1);
  const busy = downloadState === 'busy';

  return (
    <section className="revisionDemo" aria-labelledby="revision-title">
      {import.meta.env?.PROD && <ConsentAnalytics path={hasDownloaded ? '/demo/sample-downloaded' : '/demo'} />}
      <header className="revisionIntro">
        <div className="revisionKicker"><Icon name="select" size={16} /> Interactive demo</div>
        <h1 id="revision-title">Move a laundry doorway.</h1>
        <p>The existing door swings into the hall. Move it along the wall and give the homeowner a revised plan.</p>
      </header>

      <div className="revisionPlayer" aria-label="Guided floor plan editor">
        <div className="revisionFileBar">
          <div className="revisionFile"><Icon name="file" size={19} /><strong>Laundry remodel.pdf</strong><span>Sample plan</span></div>
          <button type="button" className="revisionRestart" disabled={index === 0 || busy} onClick={() => go(0)}>
            <Icon name="undo" size={16} />Restart
          </button>
        </div>
        <div className="revisionBody">
          <div className="revisionWorkspace">
            <div className="revisionTools" role="group" aria-label="Demo editor tools">
              {tools.map(({ name, icon, frame: start }, position) => (
                <button key={name} type="button" disabled={position > chapter || busy || (position === chapter && index !== start)}
                  data-current={position === chapter} data-prompt={index === start}
                  aria-label={`Choose ${name}`}
                  onClick={() => position === chapter ? advance() : go(start)}>
                  <Icon name={icon} size={17} /><span>{name}</span>
                </button>
              ))}
            </div>
            <div className="revisionCanvas">
              <div className="revisionSheet">
                <div aria-hidden={review && compareOriginal ? true : undefined}>
                  <RevisionDrawing stage={frame.stage} ref={drawing} />
                </div>
                {review && compareOriginal && <div className="revisionOriginal"><RevisionDrawing stage="original" /></div>}
                <EditGuide frame={frame} />
                {frame.point && (
                  <button key={index} type="button" className="revisionHotspot" aria-label={frame.action}
                    style={{ left: `${frame.point[0] / 8}%`, top: `${frame.point[1] / 5}%` }} onClick={advance}>
                    <span className="revisionHotspotRing" /><span className="revisionHotspotTag">{frame.tag}</span>
                  </button>
                )}
              </div>
            </div>
            <div className="revisionSheetBar">
              <span><Icon name="file" size={14} /> {review && !compareOriginal ? 'Revised drawing' : frame.stage === 'original' || compareOriginal ? 'Original drawing' : 'Revision in progress'}</span>
              {review && <div className="revisionToggle" role="group" aria-label="Compare drawings">
                <button type="button" aria-pressed={compareOriginal} onClick={() => setCompareOriginal(true)}>Original</button>
                <button type="button" aria-pressed={!compareOriginal} onClick={() => setCompareOriginal(false)}>Revised</button>
              </div>}
            </div>
          </div>
          <aside className="revisionGuide" aria-label="Demo instructions">
            <div className="revisionProgress">
              <span>Step {chapter + 1} of 4</span>
              <div aria-hidden="true">{tools.map(({ name }, position) => <i key={name} data-on={position <= chapter} />)}</div>
            </div>
            <div aria-live="polite" aria-atomic="true">
              <h2 ref={heading} tabIndex={-1}>{frame.title}</h2>
              <p>{frame.text}</p>
            </div>
            <div className="revisionGuideActions">
              <button type="button" className="revisionPrimary" onClick={advance} disabled={busy}>
                <Icon name={last ? 'download' : frame.point ? 'select' : tools[chapter].icon} size={17} />
                {busy ? 'Preparing PDF…' : frame.action}
              </button>
              {last && <a className="revisionOwnPlan" href="/#/editor">Edit my own plan</a>}
              {index > 0 && <button type="button" className="revisionBack" onClick={() => go(index - 1)} disabled={busy}>
                <Icon name="back" size={15} /> Back
              </button>}
            </div>
            {downloadState === 'done' && <p className="revisionStatus" role="status">Your sample PDF is ready to save.</p>}
            {downloadState === 'error' && <p className="revisionStatus" role="alert">The PDF couldn’t be prepared. Try the download again.</p>}
          </aside>
        </div>
      </div>
      {last && <div className="revisionFeedback"><span>What change did your last client ask for?</span>
        <a href="mailto:support@editfloorplans.com?subject=My%20last%20floor%20plan%20revision">Tell us about it</a>
      </div>}
    </section>
  );
}
