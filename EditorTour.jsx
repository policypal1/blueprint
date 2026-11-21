import React, { useEffect, useLayoutEffect, useState } from 'react';

const steps = [
  { target: 'wall', title: 'Choose Wall' },
  { target: 'canvas', title: 'Draw a new wall', text: 'Drag from Start to End. On a phone, tap each point.' },
  { target: 'text', title: 'Choose Text' },
  { target: 'canvas', title: 'Place your note', text: 'Tap the highlighted point.' },
  { target: 'canvas', title: 'Edit your text', text: 'Name the room “Living room”.' },
  { target: 'window', title: 'Choose Window' },
  { target: 'canvas', title: 'Add a window', text: 'Tap the highlighted wall. The window snaps into place.' },
  { target: 'sofa', title: 'Choose Couch' },
  { target: 'canvas', title: 'Place your couch', text: 'Tap the highlighted point.' },
  { target: 'canvas', title: 'Tutorial complete' },
];
export const tourBaseline = project => ({ step: 0, ids: project.elements.map(el => el.id) });
export function TourMarks({ step }) {
  const positions = { 3: [800,450], 6: [300,700], 8: [780,740] };
  const point = positions[step];
  if (step !== 1 && !point) return null;
  const marker = (x,y,label) => <g><circle cx={x} cy={y} r="21" fill="#fff" stroke="#e46b27" strokeWidth="5" /><circle cx={x} cy={y} r="6" fill="#e46b27"/><rect x={x-42} y={y+29} width="84" height="29" rx="7" fill="#fff"/><text x={x} y={y+49} textAnchor="middle" fill="#a94316" fontSize="18" fontWeight="700">{label}</text></g>;
  return <g data-editor-only data-tour-marks aria-hidden="true" pointerEvents="none">
    {step === 1 ? <><line x1="300" y1="590" x2="940" y2="590" stroke="#e46b27" strokeWidth="7" strokeDasharray="13 10"/>{marker(300,590,'Start')}{marker(940,590,'End')}</> : marker(...point,'Here')}
  </g>;
}

export default function EditorTour({ step, tool, project, baseline, onStep, onClose, onEditLabel, onOpenPlan }) {
  const [rect, setRect] = useState(null);
  const current = steps[step];
  const additions = project.elements.filter(el => !baseline.ids?.includes(el.id));
  const label = additions.find(el => el.type === 'text');
  useEffect(() => {
    if (step === 0 && tool === 'wall') onStep(1);
    if (step === 1 && additions.some(el => el.type === 'wall')) onStep(2);
    if (step === 2 && tool === 'text') onStep(3);
    if (step === 3 && label) onStep(4);
    if (step === 5 && tool === 'window') onStep(6);
    if (step === 6 && additions.some(el => el.type === 'window')) onStep(7);
    if (step === 7 && tool === 'sofa') onStep(8);
    if (step === 8 && additions.some(el => el.type === 'symbol' && el.symbol === 'sofa')) onStep(9);
  }, [step, tool, project.elements]);
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
      setRect({ left: Math.max(0,b.left-5), top: Math.max(0,b.top-5), width: b.width+10, height:b.height+10 });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(document.body);
    const mutations = new window.MutationObserver(measure);
    mutations.observe(document.body, { childList:true, subtree:true });
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); mutations.disconnect(); window.removeEventListener('resize', measure); };
  }, [step, current.target]);
  return <div className="editorTour" role="region" aria-label="Guided sample edit">
    {rect && <div className="tourSpotlight" style={rect} />}
    <section className={`tourCard ${current.target === 'canvas' ? 'tourCanvasCard' : 'tourToolCard'}`} aria-live="polite">
      <span className="tourProgress">{Math.min(step+1,9)} of 9</span>
      <h2>{current.title}</h2>{current.text && <p>{current.text}</p>}
      {step === 4 && label && <form onSubmit={event => { event.preventDefault(); if(label.text.trim().toLowerCase() === 'living room') onStep(5); }}>
        <label className="field"><span>Room name</span><input aria-label="Room name" value={label.text} onChange={event => onEditLabel(label.id,event.target.value)} maxLength={100} /></label>
        <button className="primary" disabled={label.text.trim().toLowerCase() !== 'living room'}>Continue</button>
      </form>}
      {step === 9 ? <><button className="primary" onClick={onOpenPlan}>Open your own plan</button><button className="tourSkip" onClick={onClose}>Keep exploring</button></> : <button className="tourSkip" onClick={onClose}>Skip guide and explore</button>}
    </section>
  </div>;
}
