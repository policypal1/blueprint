import React, { useEffect, useState } from 'react';
import { Icon, Modal } from './ui.jsx';
import SampleEditorPreview from './SampleEditorPreview.jsx';

function walkthroughSteps(compact) {
  return [
    {
      title: 'Move around your plan', icon: 'pan', action: 'pan', label: 'Try Pan',
      text: compact
        ? 'In View, drag to move the drawing and pinch to zoom. Tap Fit in the zoom bar to see the whole sheet again.'
        : 'Use Pan to drag the drawing. Use the zoom controls to move in closer or choose Fit to see the whole sheet.',
    },
    {
      title: 'Select and edit an object', icon: 'select', action: 'select', label: 'Try Select',
      text: compact
        ? 'Open View, choose Select, and tap a wall you added. Tap Properties to change Exact wall length or Wall thickness (inches). Watch the sample change from 4.5 to 6 inches.'
        : 'Choose Select and click a wall you added. In Object properties, change Exact wall length or Wall thickness (inches). Watch the sample change from 4.5 to 6 inches.',
    },
    {
      title: 'Draw a wall', icon: 'wall', action: 'wall', label: 'Try Wall',
      text: compact
        ? 'Choose Edit, then Wall. Tap one end, then tap the other end. Use Cancel to clear the first point.'
        : 'Choose Wall and drag from one end to the other. Hold Shift while drawing when you need a free angle. Select the wall to enter an exact length.',
    },
    {
      title: 'Place a door', icon: 'door', action: 'doors', label: 'Choose a door',
      text: 'Choose Door and pick a swing or opening style. Set it on the plan near a wall. Select the door to adjust its width, type, or rotation.',
    },
    {
      title: 'Add a label', icon: 'text', action: 'text', label: 'Try Text',
      text: 'Choose Text, place a label on the plan, and enter a note. Use it to describe a change, such as where an opening should move.',
    },
    {
      title: 'Clean up a drawing', icon: 'clean', action: 'cleanup', label: 'Open Clean up',
      text: 'Choose Rectangle for a larger patch or Brush eraser for smaller areas. The brush removes editable objects it touches and clears the imported drawing beneath it. Undo restores the last pass.',
    },
    {
      title: 'Find windows and fixtures', icon: 'more', action: 'tools', label: 'Open More tools',
      text: `Open ${compact ? 'Edit → More' : 'More tools'} to add windows, fixtures, lines, rectangles, or dimension labels. Select an object after placing it to adjust its properties.`,
    },
    {
      title: 'Set the scale', icon: 'calibrate', action: 'calibrate', label: 'Try Set scale',
      text: 'Choose two points a known distance apart, then choose Set real distance. Enter the measurement with units, such as 10 ft. Check another known span before relying on the scale.',
    },
    {
      title: 'Measure a distance', icon: 'measure', action: 'measure', label: 'Try Distance',
      text: 'After setting the scale, choose Distance and drag between two points. To leave a measurement on the drawing, choose Dimension under More tools.',
    },
    {
      title: 'Export your plan', icon: 'download', action: 'export', label: 'Open Export',
      text: 'Choose Download PDF or PNG image. Use PDF print settings for a fixed scale. Back to plans takes you to your drawings, account, and billing.',
    },
  ];
}

export default function EditorGuide({ compact, mode, step, onStep, onReplay, onTry, onClose, onReference, inEditor, startHref, startLabel }) {
  const steps = walkthroughSteps(compact);
  const [playing, setPlaying] = useState(() => typeof window !== 'undefined'
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const motionChanged = () => { if (query.matches) setPlaying(false); };
    const visibilityChanged = () => setVisible(!document.hidden);
    query?.addEventListener('change', motionChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      query?.removeEventListener('change', motionChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);
  useEffect(() => {
    if (mode !== 'walkthrough' || !playing || !visible) return;
    const timer = window.setTimeout(() => {
      if (step === steps.length - 1) setPlaying(false);
      else onStep(step + 1);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [mode, step, playing, visible, onStep, steps.length]);
  if (mode === 'walkthrough') {
    const current = steps[step];
    const last = step === steps.length - 1;
    const actions = (
      <div className="modalActions">
        <button type="button" onClick={step ? () => onStep(step - 1) : onClose}>{step ? 'Back' : 'Skip'}</button>
        <button type="button" onClick={() => {
          if (!playing && last) onStep(0);
          setPlaying(!playing);
        }}>{playing ? 'Pause walkthrough' : last ? 'Play again' : 'Play walkthrough'}</button>
        {onTry && <button type="button" onClick={() => onTry(current.action)}>{current.label}</button>}
        {onReference && <button type="button" onClick={onReference}>Tool reference</button>}
        <button type="button" className="primary" data-dialog-focus onClick={last ? onClose : () => onStep(step + 1)}>
          {last ? 'Finish' : 'Next'}
        </button>
      </div>
    );
    return (
      <Modal title="Editor walkthrough" onClose={onClose} className={`editorGuide sampleWalkthrough${inEditor ? ' inEditorWalkthrough' : ''}`} footer={actions}>
        <p className="sampleIntro">Follow a sample plan from first edit to export. Your own drawings stay unchanged.</p>
        <SampleEditorPreview key={`preview-${step}`} step={step} playing={playing && visible} />
        <div key={`instructions-${step}`} className="walkthroughStep" aria-live="polite">
          <div className="guideStepIntro">
            <span className="guideStepIcon"><Icon name={current.icon} size={24} /></span>
            <p>Step {step + 1} of {steps.length}</p>
          </div>
          <h3>{current.title}</h3>
          <p>{current.text}</p>
        </div>
        {last && startHref && <a className="button primary sampleStart" href={startHref}>{startLabel}</a>}
      </Modal>
    );
  }

  return (
    <Modal title="Editor guide" onClose={onClose} className="editorGuide" footer={(
      <div className="modalActions">
        <button type="button" className="primary" data-dialog-focus onClick={onReplay}>Replay walkthrough</button>
      </div>
    )}>
      <ol className="helpSteps">
        {steps.map(({ title, text }) => <li key={title}><b>{title}</b><p>{text}</p></li>)}
      </ol>
      {!compact && (
        <details className="guideShortcuts">
          <summary>Keyboard shortcuts</summary>
          <div className="shortcutGrid">
            <span>V · Select</span>
            <span>H · Pan</span>
            <span>W · Wall</span>
            <span>M · Distance</span>
            <span>E · Brush eraser</span>
            <span>R · Rotate selected object</span>
            <span>Esc · Cancel</span>
            <span>Ctrl/Cmd + Z · Undo</span>
            <span>Ctrl/Cmd + C/V · Copy and paste</span>
          </div>
        </details>
      )}
    </Modal>
  );
}
