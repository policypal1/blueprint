import React, { useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const DB_NAME = 'blueprint-studio-db';
const DB_STORE = 'app';
const CURRENT_KEY = 'blueprint-studio-current-v1';
const W = 1600;
const H = 1000;
const GRID = 20;

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const fmt = (n) => Number.isFinite(n) ? n.toFixed(2) : '0.00';

function inchesLabel(inches) {
  if (!Number.isFinite(inches)) return '';
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  let feet = Math.floor(abs / 12);
  let inch = Math.round((abs - feet * 12) * 4) / 4;
  if (inch >= 12) { feet += 1; inch = 0; }
  const inchText = Number.isInteger(inch) ? `${inch}` : `${inch}`;
  return `${sign}${feet}' ${inchText}\"`;
}

function emptyProject(name = 'Untitled Plan') {
  return {
    id: uid(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    unitsPerInch: 4,
    background: null,
    backgroundOpacity: 0.92,
    showBackground: true,
    elements: [],
  };
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadProjects() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get('projects');
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function saveProjects(list) {
  const db = await openDB();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(list, 'projects');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function fitRasterToWorkspace(source) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H);
  const scale = Math.min(W / source.width, H / source.height);
  const dw = source.width * scale, dh = source.height * scale;
  ctx.drawImage(source, (W-dw)/2, (H-dh)/2, dw, dh);
  return canvas.toDataURL('image/webp', 0.96);
}

function snapPoint(point, elements, grid = true) {
  let p = { ...point };
  let best = null;
  let bestD = 14;
  for (const el of elements) {
    if (el.type !== 'wall' && el.type !== 'dimension') continue;
    for (const candidate of [el.a, el.b]) {
      const d = dist(p, candidate);
      if (d < bestD) { best = candidate; bestD = d; }
    }
  }
  if (best) return { ...best, snapped: true };
  if (grid) {
    p.x = Math.round(p.x / GRID) * GRID;
    p.y = Math.round(p.y / GRID) * GRID;
  }
  return p;
}

function angleSnap(a, b, stepDeg = 15) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return b;
  const angle = Math.atan2(dy, dx);
  const step = stepDeg * Math.PI / 180;
  const snapped = Math.round(angle / step) * step;
  return { x: a.x + Math.cos(snapped) * len, y: a.y + Math.sin(snapped) * len };
}

function App() {
  const svgRef = useRef(null);
  const fileRef = useRef(null);
  const backupRef = useRef(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(() => emptyProject('Johnson Remodel'));
  const [hydrated, setHydrated] = useState(false);
  const [tool, setTool] = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [zoom, setZoom] = useState(0.75);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);
  const [status, setStatus] = useState('Ready');
  const [calibration, setCalibration] = useState(null);
  const [projectMenu, setProjectMenu] = useState(false);

  const selected = project.elements.find(e => e.id === selectedId) || null;

  useEffect(() => {
    let alive = true;
    loadProjects().then((list) => {
      if (!alive) return;
      const current = localStorage.getItem(CURRENT_KEY);
      const loaded = list.find(p => p.id === current) || list[0];
      if (list.length) { setProjects(list); setProject(loaded); }
      setHydrated(true);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(async () => {
      const next = [...projects.filter(p => p.id !== project.id), { ...project, updatedAt: Date.now() }]
        .sort((a, b) => b.updatedAt - a.updatedAt);
      try {
        await saveProjects(next);
        setProjects(next);
        localStorage.setItem(CURRENT_KEY, project.id);
        setStatus('Saved locally');
      } catch (err) {
        console.error(err);
        setStatus('Save failed — export a JSON backup');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [project, hydrated]); // project list intentionally read from current render

  const pushHistory = () => {
    setHistory(h => [...h.slice(-49), JSON.stringify(project)]);
    setFuture([]);
  };

  const updateProject = (fn) => setProject(p => ({ ...fn(p), updatedAt: Date.now() }));

  const addElement = (el) => {
    pushHistory();
    updateProject(p => ({ ...p, elements: [...p.elements, { id: uid(), ...el }] }));
  };

  const updateElement = (id, patch) => {
    updateProject(p => ({ ...p, elements: p.elements.map(e => e.id === id ? { ...e, ...patch } : e) }));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    updateProject(p => ({ ...p, elements: p.elements.filter(e => e.id !== selectedId) }));
    setSelectedId(null);
  };

  const undo = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setFuture(f => [JSON.stringify(project), ...f].slice(0, 50));
    setHistory(h => h.slice(0, -1));
    setProject(JSON.parse(previous));
    setSelectedId(null);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory(h => [...h, JSON.stringify(project)].slice(-50));
    setFuture(f => f.slice(1));
    setProject(JSON.parse(next));
    setSelectedId(null);
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) deleteSelected();
      if (e.key === 'Escape') { setDraft(null); setSelectedId(null); setCalibration(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const clientToWorld = (evt) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const x = (evt.clientX - rect.left) / rect.width * W;
    const y = (evt.clientY - rect.top) / rect.height * H;
    return { x, y };
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    const raw = clientToWorld(e);
    const point = snapPoint(raw, project.elements, true);

    if (tool === 'pan') {
      setDrag({ kind: 'pan', start: { x: e.clientX, y: e.clientY }, pan });
      return;
    }

    if (tool === 'select') {
      setSelectedId(null);
      setDrag({ kind: 'marquee', start: point });
      return;
    }

    if (['wall','dimension'].includes(tool)) {
      setDraft({ type: tool, a: point, b: point });
      return;
    }

    if (tool === 'clean') {
      setDraft({ type: 'clean', a: raw, b: raw });
      return;
    }

    if (tool === 'erase') {
      pushHistory();
      const path = [{ ...raw }];
      const id = uid();
      updateProject(p => ({ ...p, elements: [...p.elements, { id, type:'erase', points:path, size:36 }] }));
      setDrag({ kind:'erase', id });
      return;
    }

    if (tool === 'calibrate') {
      if (!calibration) setCalibration({ a: raw, b: raw, stage: 1 });
      else if (calibration.stage === 1) setCalibration({ ...calibration, b: raw, stage: 2 });
      return;
    }

    const common = { x: point.x, y: point.y, rotation: 0 };
    if (tool === 'door') addElement({ type:'door', ...common, widthInches:36 });
    if (tool === 'window') addElement({ type:'window', ...common, widthInches:48 });
    if (tool === 'text') addElement({ type:'text', ...common, text:'Room label', fontSize:24 });
    if (tool === 'toilet') addElement({ type:'symbol', symbol:'toilet', ...common, widthInches:30, heightInches:30 });
    if (tool === 'sink') addElement({ type:'symbol', symbol:'sink', ...common, widthInches:36, heightInches:22 });
    if (tool === 'shower') addElement({ type:'symbol', symbol:'shower', ...common, widthInches:36, heightInches:60 });
    if (tool === 'bed') addElement({ type:'symbol', symbol:'bed', ...common, widthInches:60, heightInches:80 });
    if (tool === 'wh') addElement({ type:'symbol', symbol:'wh', ...common, widthInches:24, heightInches:24 });
  };

  const handlePointerMove = (e) => {
    const raw = clientToWorld(e);
    const point = snapPoint(angleSnap(draft?.a || raw, raw), project.elements, true);
    if (draft && ['wall','dimension'].includes(draft.type)) setDraft(d => ({ ...d, b: point }));
    if (draft?.type === 'clean') setDraft(d => ({ ...d, b: raw }));
    if (calibration?.stage === 1) setCalibration(c => ({ ...c, b: raw }));

    if (drag?.kind === 'erase') {
      updateProject(p => ({ ...p, elements: p.elements.map(el => el.id === drag.id ? { ...el, points:[...el.points, raw] } : el) }));
    }
    if (drag?.kind === 'move' && selected) {
      const dx = raw.x - drag.start.x, dy = raw.y - drag.start.y;
      const base = drag.base;
      if (selected.type === 'wall' || selected.type === 'dimension') {
        updateElement(selected.id, { a:{x:base.a.x+dx,y:base.a.y+dy}, b:{x:base.b.x+dx,y:base.b.y+dy} });
      } else if (selected.type === 'clean') {
        updateElement(selected.id, { x:base.x+dx, y:base.y+dy });
      } else if (selected.type === 'erase') {
        updateElement(selected.id, { points:base.points.map(p => ({x:p.x+dx,y:p.y+dy})) });
      } else {
        updateElement(selected.id, { x:base.x+dx, y:base.y+dy });
      }
    }
    if (drag?.kind === 'pan') {
      setPan({ x: drag.pan.x + (e.clientX - drag.start.x), y: drag.pan.y + (e.clientY - drag.start.y) });
    }
  };

  const handlePointerUp = () => {
    if (draft?.type === 'wall' && dist(draft.a, draft.b) > 3) addElement({ type:'wall', a:draft.a, b:draft.b, thicknessInches:4.5 });
    if (draft?.type === 'dimension' && dist(draft.a, draft.b) > 3) addElement({ type:'dimension', a:draft.a, b:draft.b, offset:0 });
    if (draft?.type === 'clean') {
      const x = Math.min(draft.a.x, draft.b.x), y = Math.min(draft.a.y, draft.b.y);
      const width = Math.abs(draft.a.x - draft.b.x), height = Math.abs(draft.a.y - draft.b.y);
      if (width > 3 && height > 3) addElement({ type:'clean', x,y,width,height });
    }
    setDraft(null);
    setDrag(null);
  };

  const startMove = (e, el) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelectedId(el.id);
    const p = clientToWorld(e);
    pushHistory();
    setDrag({ kind:'move', start:p, base:JSON.parse(JSON.stringify(el)) });
  };

  async function handleImport(file) {
    if (!file) return;
    try {
      setStatus('Importing…');
      let dataUrl;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        dataUrl = fitRasterToWorkspace(canvas);
      } else {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload=resolve; img.onerror=reject; img.src=objectUrl; });
        dataUrl = fitRasterToWorkspace(img);
        URL.revokeObjectURL(objectUrl);
      }
      pushHistory();
      updateProject(p => ({ ...p, background: dataUrl }));
      setStatus('Blueprint imported');
    } catch (err) {
      console.error(err);
      setStatus('Import failed');
      alert('Could not import that file. Try a PNG, JPG, or a normal PDF.');
    }
  }

  const useDemo = async () => {
    const blob = await fetch('/sample-blueprint.jpeg').then(r => r.blob());
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=objectUrl;});
    const dataUrl = fitRasterToWorkspace(img);
    URL.revokeObjectURL(objectUrl);
    pushHistory();
    updateProject(p => ({ ...p, background:dataUrl }));
  };

  const finishCalibration = () => {
    if (!calibration || calibration.stage !== 2) return;
    const raw = prompt('Enter the real distance in inches between the two points. Example: 120 for 10 feet.');
    const inches = Number(raw);
    const units = dist(calibration.a, calibration.b);
    if (!(inches > 0) || !(units > 0)) return;
    pushHistory();
    updateProject(p => ({ ...p, unitsPerInch: units / inches }));
    setCalibration(null);
    setTool('select');
    setStatus(`Calibrated: ${fmt(units / inches)} canvas units per inch`);
  };

  const exportRaster = async (kind = 'png') => {
    const svg = svgRef.current;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type:'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload=resolve; img.onerror=reject; img.src=url; });
    const canvas = document.createElement('canvas');
    canvas.width = 2200; canvas.height = Math.round(2200 * H / W);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    URL.revokeObjectURL(url);
    const png = canvas.toDataURL('image/png', 1);
    if (kind === 'pdf') {
      const pdf = new jsPDF({ orientation:'landscape', unit:'in', format:[17,11] });
      const margin = 0.25;
      pdf.addImage(png,'PNG',margin,margin,16.5,10.5);
      pdf.save(`${project.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase() || 'blueprint'}.pdf`);
    } else {
      const a = document.createElement('a');
      a.href = png;
      a.download = `${project.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase() || 'blueprint'}.png`;
      a.click();
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${project.name}.blueprint.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };

  const importJson = async (file) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.elements) || typeof parsed.name !== 'string') throw new Error('Invalid project file');
      const restored = { ...parsed, id: uid(), name: `${parsed.name} (restored)`, updatedAt: Date.now() };
      setProject(restored); setSelectedId(null); setHistory([]); setFuture([]);
      setStatus('Backup restored');
    } catch (err) {
      console.error(err);
      alert('That does not look like a Blueprint Studio project backup.');
    }
  };

  const createProject = () => {
    const name = prompt('Project name?', 'New Project');
    if (!name) return;
    const p = emptyProject(name);
    setProject(p); setSelectedId(null); setHistory([]); setFuture([]); setProjectMenu(false);
  };

  const chooseProject = (p) => { setProject(p); setSelectedId(null); setHistory([]); setFuture([]); setProjectMenu(false); };

  const deleteProject = (id) => {
    if (!confirm('Delete this project from this browser?')) return;
    const next = projects.filter(p => p.id !== id);
    setProjects(next); saveProjects(next).catch(console.error);
    if (project.id === id) setProject(next[0] || emptyProject());
  };

  const applyExactLength = (value) => {
    if (!selected || selected.type !== 'wall') return;
    const inches = Number(value);
    if (!(inches > 0)) return;
    pushHistory();
    const a = selected.a, b = selected.b;
    const angle = Math.atan2(b.y-a.y,b.x-a.x);
    const units = inches * project.unitsPerInch;
    updateElement(selected.id,{ b:{x:a.x+Math.cos(angle)*units,y:a.y+Math.sin(angle)*units} });
  };

  const wallLengthInches = selected?.type === 'wall' ? dist(selected.a,selected.b) / project.unitsPerInch : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brandMark">B</span><span>Blueprint Studio</span></div>
        <div className="projectTitleWrap">
          <button className="projectButton" onClick={()=>setProjectMenu(v=>!v)}>{project.name} <span>▾</span></button>
          {projectMenu && <div className="projectMenu">
            <button onClick={createProject}>＋ New project</button>
            {projects.map(p => <div className="projectRow" key={p.id}><button onClick={()=>chooseProject(p)}>{p.name}</button><button className="dangerMini" onClick={()=>deleteProject(p.id)}>×</button></div>)}
          </div>}
        </div>
        <div className="status">{status}</div>
        <div className="headerActions">
          <button onClick={undo} disabled={!history.length}>↶ Undo</button>
          <button onClick={redo} disabled={!future.length}>↷ Redo</button>
          <button onClick={()=>exportRaster('png')}>PNG</button>
          <button className="primary" onClick={()=>exportRaster('pdf')}>Export PDF</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar leftbar">
          <Section title="FILE">
            <button className="wide" onClick={()=>fileRef.current?.click()}>Upload blueprint</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onChange={e=>handleImport(e.target.files?.[0])}/>
            <button className="wide ghost" onClick={useDemo}>Load sample plan</button>
            <button className="wide ghost" onClick={exportJson}>Backup project JSON</button>
            <button className="wide ghost" onClick={()=>backupRef.current?.click()}>Restore JSON backup</button>
            <input ref={backupRef} type="file" accept="application/json,.json" hidden onChange={e=>importJson(e.target.files?.[0])}/>
          </Section>
          <Section title="DRAW">
            <ToolButton tool={tool} id="select" setTool={setTool} icon="↖" label="Select" />
            <ToolButton tool={tool} id="pan" setTool={setTool} icon="✋" label="Pan" />
            <ToolButton tool={tool} id="wall" setTool={setTool} icon="━" label="Wall" />
            <ToolButton tool={tool} id="door" setTool={setTool} icon="◜" label="Door" />
            <ToolButton tool={tool} id="window" setTool={setTool} icon="▭" label="Window" />
            <ToolButton tool={tool} id="dimension" setTool={setTool} icon="↔" label="Dimension" />
            <ToolButton tool={tool} id="text" setTool={setTool} icon="T" label="Text" />
          </Section>
          <Section title="CLEAN UP">
            <ToolButton tool={tool} id="erase" setTool={setTool} icon="◌" label="Brush erase" />
            <ToolButton tool={tool} id="clean" setTool={setTool} icon="□" label="Clean area" />
            <ToolButton tool={tool} id="calibrate" setTool={setTool} icon="⌁" label="Calibrate scale" />
            {calibration?.stage === 2 && <button className="wide primary" onClick={finishCalibration}>Set real distance</button>}
          </Section>
          <Section title="SYMBOLS">
            <ToolButton tool={tool} id="toilet" setTool={setTool} icon="◉" label="Toilet" />
            <ToolButton tool={tool} id="sink" setTool={setTool} icon="◍" label="Sink" />
            <ToolButton tool={tool} id="shower" setTool={setTool} icon="▣" label="Shower" />
            <ToolButton tool={tool} id="bed" setTool={setTool} icon="▤" label="Bed" />
            <ToolButton tool={tool} id="wh" setTool={setTool} icon="WH" label="Water heater" />
          </Section>
        </aside>

        <main className="canvasArea">
          <div className="canvasChrome" style={{ transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
            <svg ref={svgRef} className="planCanvas" viewBox={`0 0 ${W} ${H}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
              <defs>
                <pattern id="smallGrid" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e8ebf0" strokeWidth="1"/></pattern>
                <pattern id="grid" width={GRID*5} height={GRID*5} patternUnits="userSpaceOnUse"><rect width={GRID*5} height={GRID*5} fill="url(#smallGrid)"/><path d={`M ${GRID*5} 0 L 0 0 0 ${GRID*5}`} fill="none" stroke="#d7dce4" strokeWidth="1.5"/></pattern>
              </defs>
              <rect width={W} height={H} fill="#fff"/>
              <rect width={W} height={H} fill="url(#grid)"/>
              {project.background && project.showBackground && <image href={project.background} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid meet" opacity={project.backgroundOpacity}/>}              
              {project.elements.filter(e=>e.type==='clean' || e.type==='erase').map(el => <Element key={el.id} el={el} project={project} selected={selectedId===el.id} onDown={startMove}/>) }
              {project.elements.filter(e=>e.type!=='clean' && e.type!=='erase').map(el => <Element key={el.id} el={el} project={project} selected={selectedId===el.id} onDown={startMove}/>) }
              {draft && <Draft draft={draft} project={project}/>} 
              {calibration && <g pointerEvents="none"><line x1={calibration.a.x} y1={calibration.a.y} x2={calibration.b.x} y2={calibration.b.y} stroke="#e5484d" strokeWidth="4" strokeDasharray="10 8"/><circle cx={calibration.a.x} cy={calibration.a.y} r="7" fill="#e5484d"/><circle cx={calibration.b.x} cy={calibration.b.y} r="7" fill="#e5484d"/></g>}
            </svg>
          </div>
          <div className="zoomBox">
            <button onClick={()=>setZoom(z=>clamp(z-0.1,0.25,2))}>−</button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>clamp(z+0.1,0.25,2))}>＋</button><button onClick={()=>{setZoom(0.75);setPan({x:0,y:0})}}>Fit</button>
          </div>
        </main>

        <aside className="sidebar properties">
          <h3>Properties</h3>
          {!selected && <div className="emptyState">Select an object to edit it.</div>}
          {selected && <Properties selected={selected} project={project} updateElement={updateElement} deleteSelected={deleteSelected} wallLengthInches={wallLengthInches} applyExactLength={applyExactLength}/>}          
          <hr/>
          <h3>Blueprint</h3>
          <label className="field"><span>Background opacity</span><input type="range" min="0" max="1" step="0.05" value={project.backgroundOpacity} onChange={e=>updateProject(p=>({...p,backgroundOpacity:Number(e.target.value)}))}/></label>
          <label className="check"><input type="checkbox" checked={project.showBackground} onChange={e=>updateProject(p=>({...p,showBackground:e.target.checked}))}/> Show imported blueprint</label>
          <div className="metric"><span>Scale</span><strong>{fmt(project.unitsPerInch)} units/in</strong></div>
          <div className="hint">Use <b>Calibrate scale</b>, click two known points, then enter their real distance in inches.</div>
        </aside>
      </div>
    </div>
  );
}

function Section({title,children}) { return <div className="section"><div className="sectionTitle">{title}</div><div className="sectionBody">{children}</div></div>; }
function ToolButton({tool,id,setTool,icon,label}) { return <button className={`tool ${tool===id?'active':''}`} onClick={()=>setTool(id)}><span className="toolIcon">{icon}</span><span>{label}</span></button>; }

function Element({el,project,selected,onDown}) {
  const common = { onPointerDown:(e)=>onDown(e,el), style:{cursor:'pointer'} };
  const outline = selected ? '#ff7a00' : '#111';
  if (el.type === 'clean') return <rect {...common} x={el.x} y={el.y} width={el.width} height={el.height} fill="#fff" stroke={selected?'#ff7a00':'none'} strokeWidth="3"/>;
  if (el.type === 'erase') {
    const d = el.points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ');
    return <path {...common} d={d} fill="none" stroke="#fff" strokeWidth={el.size||36} strokeLinecap="round" strokeLinejoin="round"/>;
  }
  if (el.type === 'wall') {
    const inches = dist(el.a,el.b)/project.unitsPerInch;
    return <g {...common}><line x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y} stroke={outline} strokeWidth={Math.max(3,(el.thicknessInches||4.5)*project.unitsPerInch)} strokeLinecap="square"/><text x={(el.a.x+el.b.x)/2} y={(el.a.y+el.b.y)/2-16} textAnchor="middle" fontSize="20" fill="#111" paintOrder="stroke" stroke="#fff" strokeWidth="6">{inchesLabel(inches)}</text></g>;
  }
  if (el.type === 'dimension') {
    const inches = dist(el.a,el.b)/project.unitsPerInch;
    return <g {...common} stroke={outline} fill="none"><line x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y} strokeWidth="2"/><line x1={el.a.x} y1={el.a.y-10} x2={el.a.x} y2={el.a.y+10} strokeWidth="2"/><line x1={el.b.x} y1={el.b.y-10} x2={el.b.x} y2={el.b.y+10} strokeWidth="2"/><text x={(el.a.x+el.b.x)/2} y={(el.a.y+el.b.y)/2-10} textAnchor="middle" fill={outline} stroke="none" fontWeight="700" fontSize="20">{inchesLabel(inches)}</text></g>;
  }
  if (el.type === 'door') { const width=(el.widthInches||36)*project.unitsPerInch; return <g {...common} transform={`translate(${el.x} ${el.y}) rotate(${el.rotation||0})`} stroke={outline} fill="none"><line x1="0" y1="0" x2={width} y2="0" strokeWidth="8"/><path d={`M 0 0 A ${width} ${width} 0 0 1 ${width} ${-width}`} strokeWidth="2"/><line x1="0" y1="0" x2={width} y2={-width} strokeWidth="3"/></g>; }
  if (el.type === 'window') { const width=(el.widthInches||48)*project.unitsPerInch; return <g {...common} transform={`translate(${el.x} ${el.y}) rotate(${el.rotation||0})`} stroke={outline}><line x1={-width/2} y1="-6" x2={width/2} y2="-6" strokeWidth="3"/><line x1={-width/2} y1="6" x2={width/2} y2="6" strokeWidth="3"/><rect x={-width/2} y="-10" width={width} height="20" fill="#fff" fillOpacity="0.65" strokeWidth="2"/></g>; }
  if (el.type === 'text') return <text {...common} x={el.x} y={el.y} transform={`rotate(${el.rotation||0} ${el.x} ${el.y})`} fontSize={el.fontSize||24} fill={outline} fontFamily="Arial, sans-serif">{el.text}</text>;
  if (el.type === 'symbol') return <Symbol el={el} selected={selected} common={common} project={project}/>;
  return null;
}

function Symbol({el,selected,common,project}) {
  const stroke = selected ? '#ff7a00' : '#111';
  const w=(el.widthInches||24)*project.unitsPerInch,h=(el.heightInches||24)*project.unitsPerInch;
  const transform=`translate(${el.x} ${el.y}) rotate(${el.rotation||0})`;
  if (el.symbol==='toilet') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><ellipse cx="0" cy="5" rx={w*.28} ry={h*.34}/><rect x={-w*.28} y={-h*.44} width={w*.56} height={h*.22} rx="4"/><ellipse cx="0" cy="5" rx={w*.13} ry={h*.18} fill="#f1f3f5"/></g>;
  if (el.symbol==='sink') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h} rx="6"/><ellipse cx="0" cy="0" rx={w*.28} ry={h*.27}/><circle cx="0" cy="0" r="4" fill={stroke}/></g>;
  if (el.symbol==='shower') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h}/><line x1={-w/2} y1={-h/2} x2={w/2} y2={h/2}/><circle cx={w*.28} cy={-h*.28} r="5" fill={stroke}/></g>;
  if (el.symbol==='bed') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h}/><rect x={-w*.42} y={-h*.42} width={w*.36} height={h*.18} rx="8"/><rect x={w*.06} y={-h*.42} width={w*.36} height={h*.18} rx="8"/><rect x={-w*.43} y={-h*.14} width={w*.86} height={h*.54} fill="#f2f2f2"/></g>;
  if (el.symbol==='wh') return <g {...common} transform={transform}><circle r={Math.min(w,h)/2} fill="#fff" stroke={stroke} strokeWidth="3"/><text textAnchor="middle" dominantBaseline="middle" fontWeight="700" fontSize="24" fill={stroke}>WH</text></g>;
  return null;
}

function Draft({draft,project}) {
  if (draft.type === 'wall') return <g><line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke="#ff7a00" strokeWidth={Math.max(3,4.5*project.unitsPerInch)} strokeDasharray="14 10"/><text x={(draft.a.x+draft.b.x)/2} y={(draft.a.y+draft.b.y)/2-16} textAnchor="middle" fontSize="20" fill="#ff7a00" fontWeight="700">{inchesLabel(dist(draft.a,draft.b)/project.unitsPerInch)}</text></g>;
  if (draft.type === 'dimension') return <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke="#ff7a00" strokeWidth="3" strokeDasharray="10 8"/>;
  if (draft.type === 'clean') return <rect x={Math.min(draft.a.x,draft.b.x)} y={Math.min(draft.a.y,draft.b.y)} width={Math.abs(draft.a.x-draft.b.x)} height={Math.abs(draft.a.y-draft.b.y)} fill="#fff" fillOpacity="0.8" stroke="#ff7a00" strokeWidth="3" strokeDasharray="10 8"/>;
  return null;
}

function Properties({selected,project,updateElement,deleteSelected,wallLengthInches,applyExactLength}) {
  const set = (key,val)=>updateElement(selected.id,{[key]:val});
  return <div className="propStack">
    <div className="badge">{selected.type.toUpperCase()}</div>
    {selected.type === 'wall' && <>
      <label className="field"><span>Exact length (inches)</span><input key={selected.id+fmt(wallLengthInches)} defaultValue={Math.round(wallLengthInches*100)/100} onBlur={e=>applyExactLength(e.target.value)}/></label>
      <label className="field"><span>Wall thickness (inches)</span><input type="number" step="0.5" value={selected.thicknessInches||4.5} onChange={e=>set('thicknessInches',Number(e.target.value))}/></label>
      <div className="metric"><span>Displayed</span><strong>{inchesLabel(wallLengthInches)}</strong></div>
    </>}
    {['door','window'].includes(selected.type) && <>
      <label className="field"><span>Width (inches)</span><input type="number" value={selected.widthInches||(selected.type==='door'?36:48)} onChange={e=>set('widthInches',Number(e.target.value))}/></label>
      <label className="field"><span>Rotation</span><input type="number" value={selected.rotation||0} onChange={e=>set('rotation',Number(e.target.value))}/></label>
    </>}
    {selected.type === 'text' && <>
      <label className="field"><span>Text</span><input value={selected.text||''} onChange={e=>set('text',e.target.value)}/></label>
      <label className="field"><span>Font size</span><input type="number" value={selected.fontSize||24} onChange={e=>set('fontSize',Number(e.target.value))}/></label>
      <label className="field"><span>Rotation</span><input type="number" value={selected.rotation||0} onChange={e=>set('rotation',Number(e.target.value))}/></label>
    </>}
    {selected.type === 'symbol' && <>
      <label className="field"><span>Width (inches)</span><input type="number" value={selected.widthInches||24} onChange={e=>set('widthInches',Number(e.target.value))}/></label>
      <label className="field"><span>Height (inches)</span><input type="number" value={selected.heightInches||24} onChange={e=>set('heightInches',Number(e.target.value))}/></label>
      <label className="field"><span>Rotation</span><input type="number" value={selected.rotation||0} onChange={e=>set('rotation',Number(e.target.value))}/></label>
    </>}
    {selected.type === 'erase' && <label className="field"><span>Eraser size</span><input type="number" value={selected.size||36} onChange={e=>set('size',Number(e.target.value))}/></label>}
    <button className="wide danger" onClick={deleteSelected}>Delete selected</button>
  </div>;
}

export default App;
