import React from 'react';
const box = (w, h, rx = 3) => <rect x={-w/2} y={-h/2} width={w} height={h} rx={rx} />;
const seat = (w,h) => <>{box(w,h,8)}<rect x={-w*.38} y={-h*.22} width={w*.76} height={h*.6} rx="5" fill="#f5f5f5" /><line x1={-w*.38} y1={-h*.22} x2={w*.38} y2={-h*.22}/></>;
export const EXTRA_FIXTURES = [
  { id:'sofa', label:'Couch', width:78, height:34, draw:(w,h)=><>{seat(w,h)}<line x1={-w/6} y1={-h*.22} x2={-w/6} y2={h*.38}/><line x1={w/6} y1={-h*.22} x2={w/6} y2={h*.38}/></> },
  { id:'armchair', label:'Armchair', width:32, height:32, draw:seat },
  { id:'dining-table', label:'Dining table', width:72, height:40, draw:(w,h)=><><rect x={-w*.4} y={-h*.32} width={w*.8} height={h*.64} rx="8"/>{[-.27,0,.27].flatMap(x=>[-1,1].map(y=><rect key={`${x}:${y}`} x={w*x-w*.07} y={y>0?h*.34:-h*.5} width={w*.14} height={h*.16} rx="3"/>))}</> },
  { id:'coffee-table', label:'Coffee table', width:42, height:24, draw:(w,h)=>box(w,h,10) },
  { id:'desk', label:'Desk', width:48, height:24, draw:(w,h)=><>{box(w,h)}<line x1={w*.22} y1={-h/2} x2={w*.22} y2={h/2}/><rect x={-w*.22} y={-h*.32} width={w*.3} height={h*.36} rx="2"/></> },
  { id:'wardrobe', label:'Wardrobe', width:60, height:24, draw:(w,h)=><>{box(w,h)}<line x1="0" y1={-h/2} x2="0" y2={h/2}/><line x1={-w*.1} y1="0" x2={w*.1} y2="0"/></> },
  { id:'fridge', label:'Refrigerator', width:36, height:30, draw:(w,h)=><>{box(w,h)}<line x1={-w/2} y1={-h*.15} x2={w/2} y2={-h*.15}/><line x1={w*.32} y1={h*.05} x2={w*.32} y2={h*.3}/></> },
  { id:'dishwasher', label:'Dishwasher', width:24, height:24, draw:(w,h)=><>{box(w,h)}<line x1={-w*.38} y1={-h*.3} x2={w*.38} y2={-h*.3}/><circle cx={w*.3} cy={-h*.4} r={w*.035}/></> },
  { id:'cabinet', label:'Cabinet', width:36, height:24, draw:(w,h)=><>{box(w,h)}<path d={`M ${-w/2} ${-h/2} L ${w/2} ${h/2} M ${w/2} ${-h/2} L ${-w/2} ${h/2}`}/></> },
  { id:'stairs', label:'Stairs', width:36, height:96, draw:(w,h)=><>{box(w,h)}{Array.from({length:9},(_,i)=><line key={i} x1={-w/2} x2={w/2} y1={-h/2+(i+1)*h/10} y2={-h/2+(i+1)*h/10}/>)}<path d={`M 0 ${h*.3} V ${-h*.3} m ${-w*.14} ${h*.1} l ${w*.14} ${-h*.1} l ${w*.14} ${h*.1}`} /></> },
];
