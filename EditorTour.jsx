import React, { useEffect, useLayoutEffect, useState } from 'react';

const steps = [
  { target: 'wall', title: 'Choose Wall', text: 'Try a real edit on this sample. Click Wall in the toolbar.' },
  { target: 'canvas', title: 'Draw a new wall', text: 'Drag across an open area of the bedroom. On a phone, tap the first end, then the second.' },
  { target: 'text', title: 'Choose Text', text: 'Now add a note for your client or crew. Click Text.' },
  { target: 'canvas', title: 'Place your note', text: 'Click an open area of the plan to add a label. You can change its wording in Properties.' },
  { target: 'export', title: 'Your first revision is ready', text: 'Click Export to see download options. Editing is free; a clean download starts at $10. You can also skip and keep practicing.' },
];

export default function EditorTour({ step, tool, project, baseline, onStep, onClose }) {
  const [rect, setRect] = useState(null);
  const current = steps[step];
  useEffect(() => {
    if (step === 0 && tool === 'wall') onStep(1);
    if (step === 1 && project.elements.filter(e => e.type === 'wall').length > baseline.walls) onStep(2);
    if (step === 2 && tool === 'text') onStep(3);
    if (step === 3 && project.elements.filter(e => e.type === 'text').length > baseline.texts) onStep(4);
  }, [step, tool, project.elements, baseline.walls, baseline.texts]);
  useEffect(() => {
    const escape = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  useLayoutEffect(() => {
    const measure = () => {
      const target = [...document.querySelectorAll(`[data-tour="${current.target}"]`)]
        .find(el => el.getBoundingClientRect().width > 0);
      if (!target) { setRect(null); return; }
      const b = target.getBoundingClientRect();
      setRect({ left: Math.max(0, b.left - 5), top: Math.max(0, b.top - 5), width: b.width + 10, height: b.height + 10 });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(document.body);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [step, current.target]);
  return <div className="editorTour" role="region" aria-label="Guided sample edit">
    {rect && <div className="tourSpotlight" style={rect} />}
    <section className={`tourCard ${current.target === 'canvas' ? 'tourCanvasCard' : ''}`} aria-live="polite">
      <div className="tourHeading"><span>Try the editor · {step + 1} of {steps.length}</span><button onClick={onClose} aria-label="Close guided edit">×</button></div>
      <h2>{current.title}</h2><p>{current.text}</p>
      <button className="tourSkip" onClick={onClose}>Skip guide and explore</button>
    </section>
  </div>;
}
