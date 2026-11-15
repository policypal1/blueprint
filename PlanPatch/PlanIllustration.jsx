import React from 'react';
export default function PlanIllustration({ revised = true, id = 'preview' }) {
  return (
    <svg
      className="planIllustration"
      viewBox="0 0 800 500"
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>
        {revised
          ? 'Illustrative revised primary suite with an updated shower and vanity'
          : 'Illustrative original primary suite with a bathtub'}
      </title>
      <defs>
        <pattern id={`${id}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0v20" fill="none" stroke="#e9e9e3" strokeWidth=".5" />
        </pattern>
      </defs>
      <rect width="800" height="500" fill="#fcfcf9" />
      <rect width="800" height="500" fill={`url(#${id}-grid)`} />
      <g
        transform="translate(110 65)"
        fill="none"
        stroke="#303b3a"
        strokeWidth="5"
        strokeLinecap="square"
      >
        <path d="M0 0h580v360H0V0Zm350 0v142m0 66v152m0-142h230" />
        <g strokeWidth="1.4">
          <path d="M-22 0H-32m10 360H-32m5-360v360M0-22v-10m580 10v-10M0-27h580" />
          <path d="m-30 3 6-6m-6 360 6 6M-3-30l6 6m574-6 6 6" />
        </g>
        <g fill="#fcfcf9" strokeWidth="1.5">
          <path d="M114-5h110V5H114Zm12 5h85M435-5h72V5h-72Zm6 5h61" />
          <rect x="75" y="55" width="166" height="180" rx="2" />
          <rect x="83" y="63" width="68" height="40" rx="5" />
          <rect x="165" y="63" width="68" height="40" rx="5" />
          <rect x="83" y="114" width="150" height="113" fill="#eeefea" />
          <path d="M84 132h148" />
          <rect x="40" y="64" width="25" height="40" />
          <rect x="251" y="64" width="25" height="40" />
          <path d="M350 142v65h65a65 65 0 0 0-65-65M135 360h75v-75a75 75 0 0 0-75 75" />
          <path d="M389 306h154v33H389Zm8 10h138m-70-10v33" />
        </g>
        <g
          stroke={revised ? '#b8522e' : '#67736d'}
          strokeWidth="1.8"
          fill={revised ? '#fbf0e6' : '#eff0eb'}
        >
          {revised ? (
            <>
              <rect x="457" y="21" width="100" height="100" />
              <path d="m457 21 100 100m-100 0 100-100" />
              <circle cx="530" cy="45" r="3" fill="#b8522e" />
              <rect x="370" y="59" width="55" height="85" />
              <ellipse cx="397" cy="97" rx="16" ry="23" />
            </>
          ) : (
            <>
              <rect x="395" y="21" width="162" height="72" rx="9" />
              <rect x="405" y="31" width="140" height="52" rx="15" />
              <rect x="370" y="125" width="55" height="60" />
              <ellipse cx="397" cy="155" rx="17" ry="18" />
            </>
          )}
          <rect x="519" y="145" width="35" height="16" rx="2" />
          <ellipse cx="536" cy="180" rx="16" ry="23" />
        </g>
      </g>
      <g
        fontFamily="Inter, Arial, sans-serif"
        fontSize="10"
        fill="#68736e"
        textAnchor="middle"
        letterSpacing="1.1"
      >
        <text x="269" y="333">
          PRIMARY BEDROOM
        </text>
        <text x="583" y="270">
          BATHROOM
        </text>
        <text x="580" y="353">
          WALK-IN CLOSET
        </text>
        <text x="399" y="30">
          EXISTING FLOOR PLAN · PROPOSED REVISION
        </text>
        <text x="67" y="250" transform="rotate(-90 67 250)">
          15′ 0″
        </text>
        <text x="400" y="49">
          24′ 2″
        </text>
      </g>
      {revised && (
        <g>
          <rect x="477" y="437" width="220" height="30" rx="4" fill="#f8e7dc" />
          <circle cx="493" cy="452" r="3" fill="#b8522e" />
          <text x="505" y="456" fontFamily="Inter, Arial, sans-serif" fontSize="10" fill="#874324">
            Revised shower &amp; vanity layout
          </text>
        </g>
      )}
      <text x="111" y="464" fontFamily="Inter, Arial, sans-serif" fontSize="9" fill="#949d96">
        ILLUSTRATIVE PLAN · NOT FOR CONSTRUCTION
      </text>
    </svg>
  );
}
