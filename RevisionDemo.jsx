import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import RevisionDrawing from './RevisionDrawing.jsx';

const tools = [
  { name: 'Clean up', icon: 'clean', frame: 0 },
  { name: 'Wall', icon: 'wall', frame: 2 },
  { name: 'Door', icon: 'door', frame: 5 },
  { name: 'Export', icon: 'download', frame: 7 },
];

const frames = [
  { tool: 0, stage: 'original', instruction: 'Start with Clean up to erase the old door.' },
  { tool: 0, stage: 'original', instruction: 'Select the old door swing.', action: 'Cover old swing', point: [268, 322] },
  { tool: 1, stage: 'masked', instruction: 'Choose Wall to close the opening.' },
  { tool: 1, stage: 'masked', instruction: 'Select the left end of the gap.', action: 'Set wall start', point: [242, 293] },
  { tool: 1, stage: 'masked', instruction: 'Select the right end to finish the wall.', action: 'Finish wall', point: [314, 293] },
  { tool: 2, stage: 'cleaned', instruction: 'Choose Door to place the new entry.' },
  { tool: 2, stage: 'cleaned', instruction: 'Select the new doorway location.', action: 'Place new door', point: [421, 293] },
  { tool: 3, stage: 'revised', instruction: 'Choose Export to finish.' },
  { tool: 3, stage: 'revised', instruction: 'Your revised plan is ready.' },
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

export default function RevisionDemo({ embedded = false }) {
  const [index, setIndex] = useState(0);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const player = useRef(null);
  const keyboardStep = useRef(false);
  const frame = frames[index];
  const last = index === LAST;
  const review = frame.stage === 'revised';
  const Heading = embedded ? 'h2' : 'h1';

  useEffect(() => {
    if (!keyboardStep.current) return;
    keyboardStep.current = false;
    player.current?.querySelector('[data-next-action="true"]')?.focus({ preventScroll: true });
  }, [index]);

  function go(to, event) {
    keyboardStep.current = event.detail === 0;
    setIndex(to);
    setCompareOriginal(false);
  }

  return (
    <section id="doorway-demo" className="revisionDemo" data-embedded={embedded} aria-labelledby="revision-title">
      <Heading id="revision-title" tabIndex={-1} className="revisionTitle">Try the floor plan demo</Heading>
      <div className="revisionPlayer" ref={player}>
        <div className="revisionInstruction" aria-live="polite" aria-atomic="true">
          <strong>{frame.instruction}</strong>
        </div>
        <div className="revisionBody">
          <div className="revisionTools" role="group" aria-label="Demo editor tools">
            {tools.map(({ name, icon, frame: start }, position) => {
              const prompt = index === start;
              return (
                <button key={name} type="button" disabled={!prompt} data-current={position === frame.tool}
                  data-next-action={prompt} aria-label={`Choose ${name}`} onClick={(event) => go(index + 1, event)}>
                  <Icon name={icon} size={18} /><span>{name}</span>
                  {index === 0 && prompt && <span className="revisionToolCue" aria-hidden="true">Start here</span>}
                </button>
              );
            })}
          </div>
          <div className="revisionCanvas">
            <div className="revisionSheet">
              <RevisionDrawing stage={review && compareOriginal ? 'original' : frame.stage} />
              <EditGuide frame={frame} />
              {frame.point && (
                <button key={index} type="button" className="revisionHotspot" aria-label={frame.action} data-next-action="true"
                  style={{ left: `${frame.point[0] / 8}%`, top: `${frame.point[1] / 5}%` }} onClick={(event) => go(index + 1, event)}>
                  <span className="revisionHotspotRing" /><span className="revisionHotspotTag" aria-hidden="true">Here</span>
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="revisionFooter">
          <button type="button" className="revisionBack" onClick={(event) => go(index - 1, event)} disabled={index === 0}>
            <Icon name="back" size={15} /> Back
          </button>
          {review && <div className="revisionToggle" role="group" aria-label="Compare drawings">
            <button type="button" aria-pressed={compareOriginal} onClick={() => setCompareOriginal(true)}>Original</button>
            <button type="button" aria-pressed={!compareOriginal} onClick={() => setCompareOriginal(false)}>Revised</button>
          </div>}
          {last && <a className="button primary revisionOwnPlan" href="/#/editor" data-next-action="true">Edit my own plan</a>}
        </div>
      </div>
    </section>
  );
}
