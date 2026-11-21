import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { sampleProject } from './sample-project.js';

const tools = [['pan', 'Pan'], ['select', 'Select'], ['wall', 'Wall'], ['door', 'Door'], ['text', 'Text'], ['clean', 'Clean up']];
const activeTools = ['pan', 'select', 'wall', 'door', 'text', 'clean', 'window', 'download'];
const captions = [
  'Pan moves the view. The drawing itself stays in place.',
  'Select the wall, then change Wall thickness in Object properties.',
  'Choose Wall and draw between two points.',
  'Choose a door style and place it next to a wall.',
  'Type a note or known measurement with Text.',
  'Clean up covers an old detail before you redraw it.',
  'More tools contains windows, fixtures, lines, and rectangles.',
  'Export saves your revision as a PDF or PNG.',
];

function Fixture({ el, units }) {
  const width = el.widthInches * units;
  const height = el.heightInches * units;
  return (
    <g transform={`translate(${el.x} ${el.y}) rotate(${el.rotation || 0})`} fill="white" stroke="#535c5b" strokeWidth="4">
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={el.symbol === 'toilet' ? 25 : 5} />
      {el.symbol === 'bed' && <>
        <path d={`M${-width / 2} ${-height / 2 + 65}h${width}`} />
        <rect x={-width / 2 + 12} y={-height / 2 + 12} width={width / 2 - 20} height="40" rx="6" />
        <rect x="8" y={-height / 2 + 12} width={width / 2 - 20} height="40" rx="6" />
      </>}
      {el.symbol === 'shower' && <path d={`M${-width / 2} ${-height / 2}l${width} ${height}m0 ${-height}l${-width} ${height}`} />}
      {el.symbol === 'sink' && <ellipse rx={width * .3} ry={height * .3} />}
      {el.symbol === 'toilet' && <ellipse rx={width * .32} ry={height * .3} />}
      {el.symbol === 'counter' && <path d={`M0 ${-height / 2}v${height}`} />}
    </g>
  );
}

function DemoDoor({ x, y, width = 144, rotation = 0, accent = false }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <path d={`M0 0v${width}a${width} ${width} 0 0 0 ${width} ${-width}`} fill="white" stroke={accent ? '#a4431a' : '#535c5b'} strokeWidth="4" />
      <path d={`M0 0v${width}`} stroke={accent ? '#a4431a' : '#535c5b'} strokeWidth="7" />
    </g>
  );
}

// An isolated sample scene. Playback never opens, saves or changes a visitor's project.
export default function SampleEditorPreview({ step, playing }) {
  const project = useMemo(() => sampleProject('walkthrough-preview'), []);
  const root = useRef(null);
  const [cursor, setCursor] = useState({ left: 24, top: 62 });
  const [phase, setPhase] = useState(0);
  useEffect(() => { setPhase(0); }, [step]);
  useEffect(() => {
    if (!playing || phase >= 2) return;
    const timer = window.setTimeout(() => setPhase((value) => value + 1), 1300);
    return () => window.clearTimeout(timer);
  }, [step, playing, phase]);

  const changedWall = step > 1 || (step === 1 && phase === 2);
  const addedWall = step > 2 || (step === 2 && phase > 0);
  const addedDoor = step > 3 || (step === 3 && phase > 0);
  const addedText = step > 4 || (step === 4 && phase > 0);
  const cleaned = step > 5 || (step === 5 && phase === 2);
  const addedWindow = step > 6 || (step === 6 && phase > 0);
  const chosenWall = step === 1 && phase > 0;
  const active = activeTools[step];
  const showProperties = [1, 2, 3, 4, 7].includes(step);
  useEffect(() => {
    const targets = [
      ['.sampleDrawing', '.sampleDrawing'],
      ['[data-demo-target="wall"]', '[data-demo-target="thickness"] input'],
      ['[data-demo-target="new-wall"]', '[data-demo-target="new-wall"]'],
      ['[data-demo-target="new-door"]', '[data-demo-target="new-door"]'],
      ['[data-demo-target="new-label"]', '[data-demo-target="new-label"]'],
      ['[data-demo-target="cleanup"]', '[data-demo-target="cleanup"]'],
      ['[data-demo-target="new-window"]', '[data-demo-target="new-window"]'],
      ['.sampleAction', '.sampleSuccess'],
    ];
    const selector = phase === 0
      ? `[data-demo-tool="${step === 6 ? 'tools' : active}"]`
      : targets[step][phase - 1];
    const locate = () => {
      const element = root.current?.querySelector(selector);
      if (!element) return;
      const target = element.getBoundingClientRect();
      const frame = root.current.getBoundingClientRect();
      setCursor({ left: target.left - frame.left + target.width / 2 + (step === 0 && phase === 2 ? 50 : 0),
        top: target.top - frame.top + target.height / 2 });
    };
    locate();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(locate);
    if (root.current) observer?.observe(root.current);
    return () => observer?.disconnect();
  }, [step, phase, active]);

  return (
    <div className="sampleEditor" data-step={step} ref={root}>
      <div className="sampleEditorBar"><span><Icon name="file" size={16} /> Oak St. Remodel</span><span>Sample plan</span></div>
      <div className="sampleToolbar" aria-hidden="true">
        {tools.map(([id, label]) => <span key={id} data-demo-tool={id} data-active={active === id}><Icon name={id} size={16} />{label}</span>)}
        <span data-demo-tool="tools" data-active={step === 6}><Icon name="more" size={16} />More tools</span>
        <span data-demo-tool="download" data-active={step === 7}><Icon name="download" size={16} />Export</span>
      </div>
      <div className="sampleEditorBody">
        <svg className="sampleDrawing" viewBox="180 -10 1250 1060" role="img" aria-label={captions[step]}>
          <g className="samplePlan" style={{ transform: step === 0 && phase > 0 ? 'translate(65px, -28px)' : 'translate(0, 0)' }}>
            <rect x="300" y="140" width="1000" height="720" fill="#fff" />
            {project.elements.filter((el) => el.type === 'wall').map((el, index) => <g key={el.id}>
              {index === 4 && chosenWall && <line x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y} stroke="#a4431a" strokeOpacity=".25" strokeWidth="44" />}
              <line x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y}
                data-demo-target={index === 4 ? 'wall' : undefined}
                stroke={index === 4 && chosenWall ? '#a4431a' : '#252a2b'}
                strokeWidth={index === 4 && changedWall ? 24 : 18} strokeLinecap="square" />
            </g>)}
            {project.elements.filter((el) => el.type === 'symbol' && !(cleaned && el.symbol === 'bed')).map((el) => <Fixture key={el.id} el={el} units={project.unitsPerInch} />)}
            {project.elements.filter((el) => el.type === 'door').map((el) => <DemoDoor key={el.id} x={el.x} y={el.y} width={el.widthInches * 4} rotation={el.rotation} />)}
            {project.elements.filter((el) => el.type === 'window').map((el) => <g key={el.id} fill="white" stroke="#535c5b" strokeWidth="3">
              <rect x={el.x - el.widthInches * 2} y={el.y - 12} width={el.widthInches * 4} height="24" />
              <path d={`M${el.x - el.widthInches * 2} ${el.y}h${el.widthInches * 4}`} />
            </g>)}
            {project.elements.filter((el) => el.type === 'text').map((el) => <text key={el.id} x={el.x} y={el.y} fontSize="22" fill="#555b5b">{el.text}</text>)}
            <g fill="none" stroke="#747b79" strokeWidth="3">
              <path d="M300 65h1000M300 50v30m1000-30v30" />
              <text x="800" y="45" textAnchor="middle" fill="#555b5b" stroke="none" fontSize="25">20′ 10″</text>
            </g>
            {addedWall && <line data-demo-target="new-wall" x1="300" y1="730" x2={step === 2 && phase === 1 ? 455 : 620} y2="730" stroke="#a4431a" strokeWidth="18" strokeLinecap="square" />}
            {addedDoor && <g data-demo-target="new-door"><DemoDoor x="620" y="730" width={144} accent /></g>}
            {addedText && <text data-demo-target="new-label" x="370" y="800" fontSize="26" fill="#a4431a">36 in clear opening</text>}
            {step === 5 && <rect data-demo-target="cleanup" x="455" y="160" width="270" height="355" rx="6" fill={cleaned ? '#fff' : '#f8e6d7'} fillOpacity={cleaned ? 1 : .35} stroke="#a4431a" strokeWidth="3" strokeDasharray="10 8" />}
            {addedWindow && <g data-demo-target="new-window" fill="white" stroke="#a4431a" strokeWidth="4"><rect x="288" y="400" width="24" height="192" /><path d="M300 400v192" /></g>}
          </g>
        </svg>
        {showProperties && <aside className="sampleProperties" aria-label="Sample object properties">
          <strong>{step === 7 ? 'Export plan' : 'Object properties'}</strong>
          {[1, 2].includes(step) && <>
            <span className="sampleObjectType">WALL</span>
            <label data-demo-target="thickness" data-highlight={chosenWall}>Wall thickness (px)<input readOnly tabIndex={-1} value={changedWall && step === 1 ? '24' : '18'} /></label>
          </>}
          {step === 3 && <><span className="sampleObjectType">DOOR</span><label>Door type<input readOnly tabIndex={-1} value="Single swing" /></label><label>Drawing width (px)<input readOnly tabIndex={-1} value="144" /></label></>}
          {step === 4 && <><span className="sampleObjectType">TEXT</span><label>Label<input readOnly tabIndex={-1} value="36 in clear opening" /></label></>}
          {step === 7 && <><span className="sampleAction" data-highlight={phase > 0}><Icon name="download" size={16} /> Download PDF</span><span className="sampleAction">PNG image</span>{phase === 2 && <p className="sampleSuccess"><Icon name="check" size={16} /> Revision ready</p>}</>}
        </aside>}
      </div>
      <div className="sampleEditorStatus"><span>{captions[step]}</span><span>Demonstration</span></div>
      <div className="sampleDemoCursor" data-click={phase > 0 && playing} style={cursor} aria-hidden="true">
        <svg viewBox="0 0 30 38"><path d="M2 2l10 31 5-12 12-5Z" fill="#a4431a" stroke="white" strokeWidth="2" /></svg>
      </div>
    </div>
  );
}
