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

  const clearAll = () => {
    if (!project.background && project.elements.length === 0) return;
    if (!confirm('Clear the entire canvas? This removes the imported blueprint and every object. You can Undo immediately afterward.')) return;
    pushHistory();
    updateProject(p => ({ ...p, background: null, elements: [], unitsPerInch: 4 }));
    setSelectedId(null);
    setDraft(null);
    setCalibration(null);
    setTool('select');
    setStatus('Canvas cleared');
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

    if (['wall','dimension','line','rect','ellipse'].includes(tool)) {
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
    if (tool.startsWith('door-')) addElement({ type:'door', ...common, widthInches:36, doorStyle:tool.replace('door-','') });
    if (tool === 'window') addElement({ type:'window', ...common, widthInches:48 });
    if (tool === 'text') addElement({ type:'text', ...common, text:'Room label', fontSize:24 });
    if (tool === 'toilet') addElement({ type:'symbol', symbol:'toilet', ...common, widthInches:30, heightInches:30 });
    if (tool === 'sink') addElement({ type:'symbol', symbol:'sink', ...common, widthInches:36, heightInches:22 });
    if (tool === 'shower') addElement({ type:'symbol', symbol:'shower', ...common, widthInches:36, heightInches:60 });
    if (tool === 'tub') addElement({ type:'symbol', symbol:'tub', ...common, widthInches:60, heightInches:30 });
    if (tool === 'bed') addElement({ type:'symbol', symbol:'bed', ...common, widthInches:60, heightInches:80 });
    if (tool === 'wh') addElement({ type:'symbol', symbol:'wh', ...common, widthInches:24, heightInches:24 });
    if (tool === 'vanity') addElement({ type:'symbol', symbol:'vanity', ...common, widthInches:48, heightInches:22 });
    if (tool === 'washerdryer') addElement({ type:'symbol', symbol:'washerdryer', ...common, widthInches:54, heightInches:30 });
    if (tool === 'cabinet') addElement({ type:'symbol', symbol:'cabinet', ...common, widthInches:36, heightInches:24 });
    if (tool === 'fridge') addElement({ type:'symbol', symbol:'fridge', ...common, widthInches:36, heightInches:30 });
    if (tool === 'range') addElement({ type:'symbol', symbol:'range', ...common, widthInches:30, heightInches:30 });
    if (tool === 'sofa') addElement({ type:'symbol', symbol:'sofa', ...common, widthInches:84, heightInches:36 });
    if (tool === 'stairs') addElement({ type:'symbol', symbol:'stairs', ...common, widthInches:36, heightInches:96 });
  };

  const handlePointerMove = (e) => {
    const raw = clientToWorld(e);
    const angledPoint = snapPoint(angleSnap(draft?.a || raw, raw), project.elements, true);
    const freePoint = snapPoint(raw, project.elements, true);
    if (draft && ['wall','dimension','line'].includes(draft.type)) setDraft(d => ({ ...d, b: angledPoint }));
    if (draft && ['rect','ellipse'].includes(draft.type)) setDraft(d => ({ ...d, b: freePoint }));
    if (draft?.type === 'clean') setDraft(d => ({ ...d, b: raw }));
    if (calibration?.stage === 1) setCalibration(c => ({ ...c, b: raw }));

    if (drag?.kind === 'erase') {
      updateProject(p => ({ ...p, elements: p.elements.map(el => el.id === drag.id ? { ...el, points:[...el.points, raw] } : el) }));
    }
    if (drag?.kind === 'move' && selected) {
      const dx = raw.x - drag.start.x, dy = raw.y - drag.start.y;
      const base = drag.base;
      if (selected.type === 'wall' || selected.type === 'dimension' || selected.type === 'line') {
        updateElement(selected.id, { a:{x:base.a.x+dx,y:base.a.y+dy}, b:{x:base.b.x+dx,y:base.b.y+dy} });
      } else if (selected.type === 'clean' || selected.type === 'rect' || selected.type === 'ellipse') {
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
    if (draft?.type === 'line' && dist(draft.a, draft.b) > 3) addElement({ type:'line', a:draft.a, b:draft.b, strokeWidth:2 });
    if (draft?.type === 'rect') {
      const x = Math.min(draft.a.x, draft.b.x), y = Math.min(draft.a.y, draft.b.y);
      const width = Math.abs(draft.a.x - draft.b.x), height = Math.abs(draft.a.y - draft.b.y);
      if (width > 3 && height > 3) addElement({ type:'rect', x, y, width, height, strokeWidth:2 });
    }
    if (draft?.type === 'ellipse') {
      const x = (draft.a.x + draft.b.x) / 2, y = (draft.a.y + draft.b.y) / 2;
      const rx = Math.abs(draft.a.x - draft.b.x) / 2, ry = Math.abs(draft.a.y - draft.b.y) / 2;
      if (rx > 2 && ry > 2) addElement({ type:'ellipse', x, y, rx, ry, strokeWidth:2 });
    }
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
            <button className="wide primarySoft" onClick={()=>fileRef.current?.click()}>＋ Upload blueprint</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onChange={e=>handleImport(e.target.files?.[0])}/>
            <button className="wide ghost" onClick={useDemo}>Load sample plan</button>
            <button className="wide ghost" onClick={exportJson}>Backup project JSON</button>
            <button className="wide ghost" onClick={()=>backupRef.current?.click()}>Restore JSON backup</button>
            <input ref={backupRef} type="file" accept="application/json,.json" hidden onChange={e=>importJson(e.target.files?.[0])}/>
            <button className="wide danger clearAllButton" onClick={clearAll}>Clear all</button>
          </Section>
          <Section title="DRAW & ANNOTATE">
            <ToolButton tool={tool} id="select" setTool={setTool} icon="↖" label="Select" />
            <ToolButton tool={tool} id="pan" setTool={setTool} icon="✋" label="Pan" />
            <ToolButton tool={tool} id="wall" setTool={setTool} icon="━" label="Wall" />
            <ToolButton tool={tool} id="window" setTool={setTool} icon="▥" label="Window" />
            <ToolButton tool={tool} id="line" setTool={setTool} icon="╱" label="Line" />
            <ToolButton tool={tool} id="rect" setTool={setTool} icon="▭" label="Rectangle" />
            <ToolButton tool={tool} id="ellipse" setTool={setTool} icon="○" label="Ellipse" />
            <ToolButton tool={tool} id="dimension" setTool={setTool} icon="↔" label="Dimension" />
            <ToolButton tool={tool} id="text" setTool={setTool} icon="T" label="Text" />
          </Section>
          <Section title="DOORS">
            <ToolButton tool={tool} id="door-single-left" setTool={setTool} icon="◜" label="Single left" />
            <ToolButton tool={tool} id="door-single-right" setTool={setTool} icon="◝" label="Single right" />
            <ToolButton tool={tool} id="door-double" setTool={setTool} icon="◡" label="Double" />
            <ToolButton tool={tool} id="door-pocket" setTool={setTool} icon="⇥" label="Pocket" />
            <ToolButton tool={tool} id="door-sliding" setTool={setTool} icon="⇆" label="Sliding" />
            <ToolButton tool={tool} id="door-bifold" setTool={setTool} icon="⌁" label="Bifold" />
          </Section>
          <Section title="CLEAN UP">
            <ToolButton tool={tool} id="erase" setTool={setTool} icon="◌" label="Brush erase" />
            <ToolButton tool={tool} id="clean" setTool={setTool} icon="□" label="Clean area" />
            <ToolButton tool={tool} id="calibrate" setTool={setTool} icon="⌁" label="Calibrate scale" />
            {calibration?.stage === 2 && <button className="wide primary" onClick={finishCalibration}>Set real distance</button>}
          </Section>
          <Section title="FIXTURES & OBJECTS">
            <ToolButton tool={tool} id="toilet" setTool={setTool} icon="◉" label="Toilet" />
            <ToolButton tool={tool} id="sink" setTool={setTool} icon="◍" label="Sink" />
            <ToolButton tool={tool} id="shower" setTool={setTool} icon="▣" label="Shower" />
            <ToolButton tool={tool} id="tub" setTool={setTool} icon="▭" label="Bathtub" />
            <ToolButton tool={tool} id="vanity" setTool={setTool} icon="◇" label="Vanity" />
            <ToolButton tool={tool} id="bed" setTool={setTool} icon="▤" label="Bed" />
            <ToolButton tool={tool} id="wh" setTool={setTool} icon="WH" label="Water heater" />
            <ToolButton tool={tool} id="washerdryer" setTool={setTool} icon="WD" label="Washer / dryer" />
            <ToolButton tool={tool} id="cabinet" setTool={setTool} icon="□" label="Cabinet" />
            <ToolButton tool={tool} id="fridge" setTool={setTool} icon="F" label="Refrigerator" />
            <ToolButton tool={tool} id="range" setTool={setTool} icon="••" label="Range" />
            <ToolButton tool={tool} id="sofa" setTool={setTool} icon="▱" label="Sofa" />
            <ToolButton tool={tool} id="stairs" setTool={setTool} icon="≡" label="Stairs" />
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
  const outline = selected ? '#2563eb' : '#111';
  if (el.type === 'clean') return <rect {...common} x={el.x} y={el.y} width={el.width} height={el.height} fill="#fff" stroke={selected?'#2563eb':'none'} strokeWidth="3"/>;
  if (el.type === 'erase') {
    const d = el.points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ');
    return <path {...common} d={d} fill="none" stroke="#fff" strokeWidth={el.size||36} strokeLinecap="round" strokeLinejoin="round"/>;
  }
  if (el.type === 'wall') {
    return <g {...common}><line x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y} stroke={outline} strokeWidth={Math.max(3,(el.thicknessInches||4.5)*project.unitsPerInch)} strokeLinecap="square"/></g>;
  }
  if (el.type === 'line') return <line {...common} x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y} stroke={outline} strokeWidth={el.strokeWidth||2} strokeLinecap="round"/>;
  if (el.type === 'rect') return <rect {...common} x={el.x} y={el.y} width={el.width} height={el.height} fill="none" stroke={outline} strokeWidth={el.strokeWidth||2}/>;
  if (el.type === 'ellipse') return <ellipse {...common} cx={el.x} cy={el.y} rx={el.rx} ry={el.ry} fill="none" stroke={outline} strokeWidth={el.strokeWidth||2}/>;
  if (el.type === 'dimension') {
    const inches = dist(el.a,el.b)/project.unitsPerInch;
    return <g {...common} stroke={outline} fill="none"><line x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y} strokeWidth="2"/><line x1={el.a.x} y1={el.a.y-10} x2={el.a.x} y2={el.a.y+10} strokeWidth="2"/><line x1={el.b.x} y1={el.b.y-10} x2={el.b.x} y2={el.b.y+10} strokeWidth="2"/><text x={(el.a.x+el.b.x)/2} y={(el.a.y+el.b.y)/2-10} textAnchor="middle" fill={outline} stroke="none" fontWeight="700" fontSize="20">{inchesLabel(inches)}</text></g>;
  }
  if (el.type === 'door') return <DoorSymbol el={el} project={project} outline={outline} common={common}/>;
  if (el.type === 'window') {
    const width=(el.widthInches||48)*project.unitsPerInch;
    return <g {...common} transform={`translate(${el.x} ${el.y}) rotate(${el.rotation||0})`}>
      <rect x={-width/2} y="-13" width={width} height="26" fill="#fff" stroke={outline} strokeWidth="4"/>
      <rect x={-width/2+6} y="-7" width={Math.max(2,width-12)} height="14" fill="#eaf6ff" stroke={outline} strokeWidth="2"/>
      <line x1={-width/2+8} y1="0" x2={width/2-8} y2="0" stroke={outline} strokeWidth="2"/>
      <line x1={-width/2} y1="-18" x2={-width/2} y2="18" stroke={outline} strokeWidth="3"/>
      <line x1={width/2} y1="-18" x2={width/2} y2="18" stroke={outline} strokeWidth="3"/>
    </g>;
  }
  if (el.type === 'text') return <text {...common} x={el.x} y={el.y} transform={`rotate(${el.rotation||0} ${el.x} ${el.y})`} fontSize={el.fontSize||24} fill={outline} fontFamily="Arial, sans-serif">{el.text}</text>;
  if (el.type === 'symbol') return <Symbol el={el} selected={selected} common={common} project={project}/>;
  return null;
}

function DoorSymbol({el,project,outline,common}) {
  const w=(el.widthInches||36)*project.unitsPerInch;
  const style=el.doorStyle||'single-left';
  const transform=`translate(${el.x} ${el.y}) rotate(${el.rotation||0})`;
  const base={...common,transform,stroke:outline,fill:'none',strokeLinecap:'round',strokeLinejoin:'round'};
  if (style==='single-right') return <g {...base}><line x1="0" y1="0" x2="0" y2={w} strokeWidth="4"/><path d={`M ${w} 0 A ${w} ${w} 0 0 1 0 ${w}`} strokeWidth="2"/><line x1="0" y1="0" x2={w} y2="0" strokeWidth="2" strokeDasharray="8 8"/></g>;
  if (style==='double') { const h=w/2; return <g {...base}><line x1="0" y1="0" x2="0" y2={-h} strokeWidth="4"/><line x1={w} y1="0" x2={w} y2={-h} strokeWidth="4"/><path d={`M ${h} 0 A ${h} ${h} 0 0 0 0 ${-h}`} strokeWidth="2"/><path d={`M ${h} 0 A ${h} ${h} 0 0 1 ${w} ${-h}`} strokeWidth="2"/><line x1="0" y1="0" x2={w} y2="0" strokeWidth="2" strokeDasharray="8 8"/></g>; }
  if (style==='pocket') return <g {...base}><rect x="0" y="-8" width={w} height="16" strokeWidth="3"/><line x1={w*.5} y1="-18" x2={w*1.45} y2="-18" strokeWidth="4"/><line x1={w*.5} y1="18" x2={w*1.45} y2="18" strokeWidth="2" strokeDasharray="8 7"/><path d={`M ${w*.75} -2 L ${w*.95} -2 M ${w*.88} -9 L ${w*.95} -2 L ${w*.88} 5`} strokeWidth="2"/></g>;
  if (style==='sliding') return <g {...base}><rect x="0" y="-12" width={w*.58} height="24" strokeWidth="3"/><rect x={w*.42} y="-3" width={w*.58} height="24" strokeWidth="3"/><line x1={w*.15} y1="22" x2={w*.85} y2="22" strokeWidth="2"/><path d={`M ${w*.35} 17 L ${w*.25} 22 L ${w*.35} 27 M ${w*.65} 17 L ${w*.75} 22 L ${w*.65} 27`} strokeWidth="2"/></g>;
  if (style==='bifold') { const q=w/4; return <g {...base}><polyline points={`0,0 ${q},${-q*.8} ${q*2},0 ${q*3},${-q*.8} ${w},0`} strokeWidth="4"/><line x1="0" y1="0" x2={w} y2="0" strokeWidth="2" strokeDasharray="7 7"/></g>; }
  return <g {...base}><line x1="0" y1="0" x2="0" y2={-w} strokeWidth="4"/><path d={`M ${w} 0 A ${w} ${w} 0 0 0 0 ${-w}`} strokeWidth="2"/><line x1="0" y1="0" x2={w} y2="0" strokeWidth="2" strokeDasharray="8 8"/></g>;
}

function Symbol({el,selected,common,project}) {
  const stroke = selected ? '#2563eb' : '#111';
  const w=(el.widthInches||24)*project.unitsPerInch,h=(el.heightInches||24)*project.unitsPerInch;
  const transform=`translate(${el.x} ${el.y}) rotate(${el.rotation||0})`;
  if (el.symbol==='toilet') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><ellipse cx="0" cy="5" rx={w*.28} ry={h*.34}/><rect x={-w*.28} y={-h*.44} width={w*.56} height={h*.22} rx="4"/><ellipse cx="0" cy="5" rx={w*.13} ry={h*.18} fill="#f1f3f5"/></g>;
  if (el.symbol==='sink') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h} rx="6"/><ellipse cx="0" cy="0" rx={w*.28} ry={h*.27}/><circle cx="0" cy="0" r="4" fill={stroke}/></g>;
  if (el.symbol==='shower') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h}/><line x1={-w/2} y1={-h/2} x2={w/2} y2={h/2}/><circle cx={w*.28} cy={-h*.28} r="5" fill={stroke}/></g>;
  if (el.symbol==='bed') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h}/><rect x={-w*.42} y={-h*.42} width={w*.36} height={h*.18} rx="8"/><rect x={w*.06} y={-h*.42} width={w*.36} height={h*.18} rx="8"/><rect x={-w*.43} y={-h*.14} width={w*.86} height={h*.54} fill="#f2f2f2"/></g>;
  if (el.symbol==='wh') return <g {...common} transform={transform}><circle r={Math.min(w,h)/2} fill="#fff" stroke={stroke} strokeWidth="3"/><text textAnchor="middle" dominantBaseline="middle" fontWeight="700" fontSize="24" fill={stroke}>WH</text></g>;
  if (el.symbol==='tub') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h} rx={Math.min(18,h*.22)}/><rect x={-w*.42} y={-h*.34} width={w*.84} height={h*.68} rx={Math.min(16,h*.25)} fill="#f6fbff"/><circle cx={w*.31} cy="0" r="4" fill={stroke}/></g>;
  if (el.symbol==='vanity') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h}/><ellipse cx="0" cy="0" rx={w*.22} ry={h*.28}/><circle cx="0" cy={-h*.30} r="4" fill={stroke}/><line x1={-w*.38} y1={h*.28} x2={w*.38} y2={h*.28}/></g>;
  if (el.symbol==='washerdryer') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h}/><line x1="0" y1={-h/2} x2="0" y2={h/2}/><circle cx={-w*.25} cy="0" r={Math.min(w*.16,h*.3)} fill="#f3f5f7"/><circle cx={w*.25} cy="0" r={Math.min(w*.16,h*.3)} fill="#f3f5f7"/></g>;
  if (el.symbol==='cabinet') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h}/><line x1={-w/2} y1={-h/2} x2={w/2} y2={h/2}/><line x1={w/2} y1={-h/2} x2={-w/2} y2={h/2}/></g>;
  if (el.symbol==='fridge') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h} rx="4"/><line x1="0" y1={-h/2} x2="0" y2={h/2}/><line x1={-w*.08} y1={-h*.22} x2={-w*.08} y2={h*.22} strokeWidth="2"/><line x1={w*.08} y1={-h*.22} x2={w*.08} y2={h*.22} strokeWidth="2"/></g>;
  if (el.symbol==='range') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h}/>{[[-.24,-.22],[.24,-.22],[-.24,.22],[.24,.22]].map(([x,y],i)=><circle key={i} cx={w*x} cy={h*y} r={Math.min(w,h)*.12}/>)}</g>;
  if (el.symbol==='sofa') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h*.34} width={w} height={h*.68} rx="10"/><rect x={-w*.42} y={-h*.20} width={w*.84} height={h*.40} rx="7" fill="#f3f5f7"/><line x1="0" y1={-h*.20} x2="0" y2={h*.20}/></g>;
  if (el.symbol==='stairs') return <g {...common} transform={transform} stroke={stroke} fill="#fff" strokeWidth="3"><rect x={-w/2} y={-h/2} width={w} height={h}/>{Array.from({length:8},(_,i)=><line key={i} x1={-w/2} y1={-h/2+(i+1)*h/9} x2={w/2} y2={-h/2+(i+1)*h/9} strokeWidth="2"/>)}<path d={`M 0 ${h*.30} L 0 ${-h*.28} M ${-w*.10} ${-h*.16} L 0 ${-h*.28} L ${w*.10} ${-h*.16}`} strokeWidth="3"/></g>;
  return null;
}

function Draft({draft,project}) {
  if (draft.type === 'wall') return <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke="#111" strokeOpacity="0.72" strokeWidth={Math.max(3,4.5*project.unitsPerInch)} strokeLinecap="square"/>;
  if (draft.type === 'dimension') return <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke="#2563eb" strokeWidth="3" strokeDasharray="10 8"/>;
  if (draft.type === 'line') return <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke="#2563eb" strokeWidth="2"/>;
  if (draft.type === 'rect') return <rect x={Math.min(draft.a.x,draft.b.x)} y={Math.min(draft.a.y,draft.b.y)} width={Math.abs(draft.a.x-draft.b.x)} height={Math.abs(draft.a.y-draft.b.y)} fill="none" stroke="#2563eb" strokeWidth="2"/>;
  if (draft.type === 'ellipse') return <ellipse cx={(draft.a.x+draft.b.x)/2} cy={(draft.a.y+draft.b.y)/2} rx={Math.abs(draft.a.x-draft.b.x)/2} ry={Math.abs(draft.a.y-draft.b.y)/2} fill="none" stroke="#2563eb" strokeWidth="2"/>;
  if (draft.type === 'clean') return <rect x={Math.min(draft.a.x,draft.b.x)} y={Math.min(draft.a.y,draft.b.y)} width={Math.abs(draft.a.x-draft.b.x)} height={Math.abs(draft.a.y-draft.b.y)} fill="#fff" fillOpacity="0.8" stroke="#2563eb" strokeWidth="3" strokeDasharray="10 8"/>;
  return null;
}

function symbolLabel(symbol) {
  return ({toilet:'Toilet',sink:'Sink',shower:'Shower',tub:'Bathtub',bed:'Bed',wh:'Water heater',vanity:'Vanity',washerdryer:'Washer / dryer',cabinet:'Cabinet',fridge:'Refrigerator',range:'Range',sofa:'Sofa',stairs:'Stairs'})[symbol] || 'Object';
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
      {selected.type==='door' && <label className="field"><span>Door type</span><select value={selected.doorStyle||'single-left'} onChange={e=>set('doorStyle',e.target.value)}><option value="single-left">Single left</option><option value="single-right">Single right</option><option value="double">Double</option><option value="pocket">Pocket</option><option value="sliding">Sliding</option><option value="bifold">Bifold</option></select></label>}
      <label className="field"><span>Width (inches)</span><input type="number" min="6" value={selected.widthInches||(selected.type==='door'?36:48)} onChange={e=>set('widthInches',Math.max(6,Number(e.target.value)||6))}/></label>
      <label className="field"><span>Rotation (degrees)</span><input type="number" value={selected.rotation||0} onChange={e=>set('rotation',Number(e.target.value)||0)}/></label>
      <div className="quickActions"><button onClick={()=>set('rotation',(selected.rotation||0)-90)}>↶ 90°</button><button onClick={()=>set('rotation',(selected.rotation||0)+90)}>↷ 90°</button></div>
    </>}
    {selected.type === 'text' && <>
      <label className="field"><span>Text</span><input value={selected.text||''} onChange={e=>set('text',e.target.value)}/></label>
      <label className="field"><span>Font size</span><input type="number" value={selected.fontSize||24} onChange={e=>set('fontSize',Number(e.target.value))}/></label>
      <label className="field"><span>Rotation</span><input type="number" value={selected.rotation||0} onChange={e=>set('rotation',Number(e.target.value))}/></label>
    </>}
    {selected.type === 'symbol' && <>
      <div className="objectName">{symbolLabel(selected.symbol)}</div>
      <div className="sizeGrid"><label className="field"><span>Width (in)</span><input type="number" min="4" value={selected.widthInches||24} onChange={e=>set('widthInches',Math.max(4,Number(e.target.value)||4))}/></label><label className="field"><span>Height (in)</span><input type="number" min="4" value={selected.heightInches||24} onChange={e=>set('heightInches',Math.max(4,Number(e.target.value)||4))}/></label></div>
      <label className="field"><span>Rotation (degrees)</span><input type="number" value={selected.rotation||0} onChange={e=>set('rotation',Number(e.target.value)||0)}/></label>
      <div className="quickActions"><button onClick={()=>set('rotation',(selected.rotation||0)-90)}>↶ 90°</button><button onClick={()=>set('rotation',(selected.rotation||0)+90)}>↷ 90°</button></div>
      <div className="quickActions"><button onClick={()=>updateElement(selected.id,{widthInches:Math.max(4,(selected.widthInches||24)*.9),heightInches:Math.max(4,(selected.heightInches||24)*.9)})}>− Smaller</button><button onClick={()=>updateElement(selected.id,{widthInches:(selected.widthInches||24)*1.1,heightInches:(selected.heightInches||24)*1.1})}>＋ Larger</button></div>
      <div className="hint compactHint">Select any placed fixture to resize it here. Width and height are saved with the object.</div>
    </>}
    {['line','rect','ellipse'].includes(selected.type) && <label className="field"><span>Line weight</span><input type="number" min="1" max="20" value={selected.strokeWidth||2} onChange={e=>set('strokeWidth',Math.max(1,Number(e.target.value)||1))}/></label>}
    {selected.type === 'erase' && <label className="field"><span>Eraser size</span><input type="number" value={selected.size||36} onChange={e=>set('size',Number(e.target.value))}/></label>}
    <button className="wide danger" onClick={deleteSelected}>Delete selected</button>
  </div>;
}

export default App;
