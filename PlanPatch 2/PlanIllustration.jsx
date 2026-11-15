import React from 'react';

export default function PlanIllustration() {
  return (
    <svg className="planIllustration" viewBox="0 0 800 500" aria-hidden="true">
      <rect width="800" height="500" fill="#fffaf3" />
      <g
        transform="translate(100 65)"
        fill="none"
        stroke="#3c474a"
        strokeWidth="5"
        strokeLinecap="square"
      >
        <path d="M0 0h600v360H0V0Zm350 0v142m0 66v152m0-142h250" />
        <g strokeWidth="1.5">
          <path d="M-22 0H-32m10 360H-32m5-360v360M0-22v-10m600 10v-10M0-27h600" />
          <path d="m-30 3 6-6m-6 360 6 6M-3-30l6 6m594-6 6 6" />
        </g>
        <g fill="#fffaf3" strokeWidth="2">
          <path d="M114-5h110V5H114Zm12 5h85M435-5h72V5h-72Zm6 5h61" />
          <rect x="75" y="55" width="166" height="180" rx="2" />
          <rect x="83" y="63" width="68" height="40" rx="5" />
          <rect x="165" y="63" width="68" height="40" rx="5" />
          <rect x="83" y="114" width="150" height="113" fill="#efeee8" />
          <path d="M84 132h148" />
          <rect x="40" y="64" width="25" height="40" />
          <rect x="251" y="64" width="25" height="40" />
          <path d="M350 142v65h65a65 65 0 0 0-65-65M135 360h75v-75a75 75 0 0 0-75 75" />
          <path d="M389 306h174v33H389Zm8 10h158m-90-10v33" />
          <rect x="395" y="21" width="162" height="72" rx="9" />
          <rect x="405" y="31" width="140" height="52" rx="15" />
          <rect x="370" y="125" width="55" height="60" />
          <ellipse cx="397" cy="155" rx="17" ry="18" />
          <rect x="519" y="145" width="35" height="16" rx="2" />
          <ellipse cx="536" cy="180" rx="16" ry="23" />
        </g>
      </g>
    </svg>
  );
}
