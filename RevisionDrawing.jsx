import React, { forwardRef } from 'react';

const ink = '#292e30';
const detail = '#61686a';
const fine = '#858b8d';
const paper = '#fff';

function HorizontalDimension({ left, right, y, label }) {
  return (
    <g fill="none" stroke={fine} strokeWidth="0.9">
      <path d={`M${left - 4} ${y}H${right + 4}M${left - 3} ${y + 4}l6 -8M${right - 3} ${y + 4}l6 -8`} />
      <text x={(left + right) / 2} y={y - 5} textAnchor="middle" stroke="none" fill={detail} fontSize="11">{label}</text>
    </g>
  );
}

function VerticalDimension({ top, bottom, label }) {
  return (
    <g fill="none" stroke={fine} strokeWidth="0.9">
      <path d={`M723 ${top - 4}V${bottom + 4}M719 ${top + 3}l8 -6M719 ${bottom + 3}l8 -6`} />
      <text transform={`translate(717 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle" stroke="none" fill={detail} fontSize="11">{label}</text>
    </g>
  );
}

function Window({ x, y, width, rotation = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`} fill={paper} stroke={detail} strokeWidth="1.2">
      <rect y="-6" width={width} height="12" />
      <path d={`M2 -2h${width - 4}M2 2h${width - 4}M${width / 2} -5v10`} fill="none" />
    </g>
  );
}

function Appliance({ x, label }) {
  return (
    <g transform={`translate(${x} 97)`} stroke={detail} fill="none">
      <rect width="54" height="55" rx="2.4" strokeWidth="1.5" />
      <path d="M2 9h50" strokeWidth="0.9" />
      <circle cx="45" cy="4.7" r="1.4" strokeWidth="0.9" />
      <path d="M6 4.7h9m3 0h3" strokeWidth="1" />
      <circle cx="27" cy="32" r="16.7" strokeWidth="1.2" />
      <text x="27" y="36.5" fill={detail} stroke="none" textAnchor="middle" fontSize="13" fontWeight="600">{label}</text>
    </g>
  );
}

function RoomName({ x, y, name, number }) {
  return (
    <g textAnchor="middle" fill={ink}>
      <text x={x} y={y} fontSize="15" fontWeight="600" letterSpacing="1.8">{name}</text>
      <rect x={x - 13.5} y={y + 7} width="27" height="14" fill={paper} stroke={fine} strokeWidth="0.8" />
      <text x={x} y={y + 17.6} fontSize="9" letterSpacing="1.1" fill={detail}>{number}</text>
    </g>
  );
}

// A 36-inch leaf at two drawing units per inch, matching the editor's swing convention.
function SwingDoor({ inward }) {
  return (
    <g transform={inward ? 'translate(457 293) scale(-1 -1)' : 'translate(242 293)'} fill="none">
      <rect x="0" y="-5" width="72" height="10" fill={paper} />
      <path d="M0 -5v10m72 -10v10" stroke={ink} strokeWidth="1.5" />
      <path d="M0 0h72" stroke={fine} strokeWidth="0.85" strokeDasharray="4 3" />
      <path d="M72 0A72 72 0 0 1 0 72" stroke={ink} strokeWidth="1.5" />
      <path d="M0 0v72" stroke={ink} strokeWidth="3.2" />
    </g>
  );
}

const stages = {
  original: { sheet: 'EXISTING PLAN', description: 'The existing laundry door opens into the hall.' },
  masked: { sheet: 'DOOR REMOVAL', description: 'The old door and swing have been removed, leaving the opening in the laundry wall.' },
  cleaned: { sheet: 'DOORWAY INFILL', description: 'The old door is removed and the laundry wall is continuous.' },
  revised: { sheet: 'REVISED PLAN', description: 'The relocated door opens into the laundry, leaving the hall clear.' },
};

const RevisionDrawing = forwardRef(function RevisionDrawing({ stage = 'original', ...svgProps }, ref) {
  const state = stages[stage] || stages.original;
  return (
    <svg {...svgProps} ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img"
      aria-label={`Laundry and hall floor plan. ${state.description}`} fontFamily="Arial, Helvetica, sans-serif">
      <title>{`Laundry and hall. ${state.description}`}</title>
      <rect width="800" height="500" fill={paper} />

      <g fill="none" stroke={fine} strokeWidth="0.75">
        <path d="M112 79V23M480 79V48M688 79V23M700 89h31M700 293h31M700 389h31" />
      </g>
      <HorizontalDimension left={112} right={688} y={33} label="24′–0″" />
      <HorizontalDimension left={112} right={480} y={59} label="15′–4″" />
      <HorizontalDimension left={480} right={688} y={59} label="8′–8″" />
      <VerticalDimension top={89} bottom={293} label="8′–6″" />
      <VerticalDimension top={293} bottom={389} label="4′–0″" />

      {/* Cabinetry and plumbing are drawn lighter than cut walls. */}
      <Appliance x={123} label="W" />
      <Appliance x={182} label="D" />
      <g fill="none" stroke={detail} strokeWidth="1.25">
        <rect x="242" y="95" width="119" height="48" />
        <path d="M242 139h119M298 95v44" strokeWidth="0.7" />
        <rect x="306" y="102" width="45" height="31" rx="3.5" />
        <rect x="309" y="105" width="39" height="25" rx="3" strokeWidth="0.7" />
        <circle cx="329" cy="116" r="1.7" />
        <path d="M329 100v8h3" strokeWidth="1.5" />
        <rect x="486" y="95" width="196" height="38" />
        <path d="M486 129h196m-148 -34v34m49 -34v34m49 -34v34" strokeWidth="0.9" />
        <path d="M486 97l48 30 49 -30 49 30 50 -30" stroke={fine} strokeDasharray="3 3" strokeWidth="0.65" />
      </g>
      <text x="584" y="151" fill={detail} textAnchor="middle" fontSize="8" letterSpacing="1">BUILT-IN BENCH</text>

      <g fill="none" stroke={ink} strokeLinejoin="miter">
        <path d="M112 293V89h576v300H92" strokeWidth="11.5" />
        <path d="M480 89v204M92 293h474m72 0h50" strokeWidth="9" />
      </g>
      {/* The hall continues to the left beyond the limit of this plan detail. */}
      <g fill="none" stroke={detail} strokeWidth="1">
        <path d="M92 288.5H77m15 9H77m15 85.75H77m15 11.5H77" />
        <path d="M79 282l-4 8 6 -2 -5 13m3 75 -4 8 6 -2 -5 15" />
      </g>
      <Window x={239} y={89} width={98} />
      <Window x={535} y={89} width={84} />
      <Window x={688} y={172} width={71} rotation={90} />

      <RoomName x={292} y={213} name="LAUNDRY" number="102" />
      <RoomName x={584} y={224} name="MUDROOM" number="103" />
      <RoomName x={460} y={337} name="HALL" number="101" />
      {stage === 'masked' && <rect x="242" y="288" width="72" height="10" fill={paper} />}
      {(stage === 'original' || stage === 'revised') && <SwingDoor inward={stage === 'revised'} />}

      <path d="M65 420h670" fill="none" stroke={ink} strokeWidth="1.1" />
      <g fill={ink}>
        <text x="66" y="450" fontSize="18" fontWeight="600">Laundry &amp; hall</text>
        <text x="67" y="467" fontSize="9" letterSpacing="1.7" fill={detail}>{state.sheet}</text>
        <g transform="translate(496 451)" fontSize="8.5" textAnchor="middle">
          <path d="M0 0h96v4H0z" fill={paper} stroke={ink} strokeWidth="0.9" />
          <path d="M0 0h24v4H0zm48 0h24v4H48z" />
          <text y="16">0</text><text x="48" y="16">2′</text><text x="96" y="16">4′</text>
        </g>
        <path d="M627 433v37" stroke={fine} strokeWidth="0.8" />
        <text x="734" y="448" textAnchor="end" fontSize="19" fontWeight="600">A2.1</text>
        <text x="734" y="465" textAnchor="end" fontSize="8" letterSpacing="1.3" fill={detail}>PLAN DETAIL</text>
      </g>
    </svg>
  );
});

export default RevisionDrawing;
