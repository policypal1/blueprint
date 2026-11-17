import React, { useState } from 'react';
import { Icon, Modal } from './ui.jsx';

function walkthroughSteps(compact) {
  return [
    {
      title: 'Move around your plan',
      icon: 'pan',
      text: compact
        ? 'In View, drag to move the plan and pinch to zoom. Use Select to tap an object you added.'
        : 'Use Pan to drag the plan and the zoom controls to move in closer. Choose Select to edit an object you added.',
    },
    {
      title: 'Make a change',
      icon: 'wall',
      text: compact
        ? 'Tap Edit, then Wall. Tap the start and end of the wall. Use Door, Clean up, or Text to make other changes.'
        : 'Choose Wall and drag from one end of the new wall to the other. Use Door, Clean up, or Text to make other changes.',
    },
    {
      title: 'Measure and export',
      icon: 'measure',
      text: 'Use Set scale with two points a known distance apart before you measure. Choose Export to download your revised plan as a PDF or PNG.',
    },
  ];
}

export default function EditorGuide({ compact, initialMode, onClose }) {
  const [walking, setWalking] = useState(initialMode === 'walkthrough');
  const [step, setStep] = useState(0);
  const steps = walkthroughSteps(compact);

  if (walking) {
    const current = steps[step];
    const last = step === steps.length - 1;
    return (
      <Modal title={current.title} onClose={onClose} className="editorGuide">
        <div className="guideStepIntro">
          <span className="guideStepIcon"><Icon name={current.icon} size={25} /></span>
          <p>Step {step + 1} of {steps.length}</p>
        </div>
        <p>{current.text}</p>
        <div className="modalActions">
          <button type="button" onClick={step ? () => setStep(step - 1) : onClose}>
            {step ? 'Back' : 'Skip'}
          </button>
          <button type="button" className="primary" data-dialog-focus
            onClick={last ? onClose : () => setStep(step + 1)}>
            {last ? 'Start editing' : 'Next'}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Editor guide" onClose={onClose} className="editorGuide">
      <ol className="helpSteps">
        {steps.map(({ title, text }) => <li key={title}><b>{title}</b><p>{text}</p></li>)}
        <li>
          <b>Find more tools</b>
          <p>Open {compact ? 'Edit → More' : 'More tools'} for windows, lines, rectangles, fixtures, printed dimensions, and the eraser brush.</p>
        </li>
        <li>
          <b>Return to your plans</b>
          <p>Use Back to plans to switch drawings or open your account and billing.</p>
        </li>
      </ol>
      {!compact && (
        <details className="guideShortcuts">
          <summary>Keyboard shortcuts</summary>
          <div className="shortcutGrid">
            <span>V · Select</span>
            <span>H · Pan</span>
            <span>W · Wall</span>
            <span>M · Measure</span>
            <span>R · Rotate selected object</span>
            <span>Esc · Cancel</span>
            <span>Ctrl/Cmd + Z · Undo</span>
            <span>Ctrl/Cmd + C/V · Copy and paste</span>
          </div>
        </details>
      )}
      <div className="modalActions">
        <button type="button" data-dialog-focus onClick={() => setWalking(true)}>Replay walkthrough</button>
      </div>
    </Modal>
  );
}
