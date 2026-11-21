import React from 'react';
import { Icon } from './ui.jsx';

export const DOORS = [
  ['door-single-left', 'Single left'],
  ['door-single-right', 'Single right'],
  ['door-double', 'Double'],
  ['door-pocket', 'Pocket'],
  ['door-sliding', 'Sliding'],
  ['door-bifold', 'Bifold'],
];

export const FIXTURES = [
  ['toilet', 'Toilet'],
  ['sink', 'Sink'],
  ['shower', 'Shower'],
  ['tub', 'Bathtub'],
  ['bed', 'Bed'],
  ['wh', 'Water heater'],
  ['washerdryer', 'Washer / dryer'],
  ['counter', 'Counter'],
  ['stove', 'Stove'],
];

export function editorMode(tool) {
  if (tool === 'pan' || tool === 'select') return 'view';
  return 'edit';
}

export function ToolButton({ tool, id, setTool, label }) {
  return (
    <button
      type="button"
      data-tour={id}
      className={`tool ${tool === id ? 'active' : ''}`}
      aria-pressed={tool === id}
      onClick={() => setTool(id)}
    >
      <Icon name={id} size={17} />
      <span>{label}</span>
    </button>
  );
}

export function ToolChoices({ choices, tool, setTool }) {
  return choices.map(([id, label]) => (
    <ToolButton key={id} id={id} label={label} tool={tool} setTool={setTool} />
  ));
}

const MODES = [
  ['view', 'View', 'pan'],
  ['edit', 'Edit', 'edit'],
];
const CONTROLS = {
  view: [['pan', 'Pan'], ['select', 'Select'], ['settings', 'Plan settings']],
  edit: [
    ['wall', 'Wall'],
    ['doors', 'Door', 'door'],
    ['cleanup', 'Clean up', 'clean'],
    ['text', 'Text'],
    ['tools', 'More', 'more'],
  ],
};
const PANELS = ['doors', 'tools', 'settings', 'cleanup'];

export function PhoneControls({
  mode,
  tool,
  selected,
  hint,
  onCancelWall,
  onTool,
  onMode,
  onOpen,
}) {
  const modeTools = { view: 'pan', edit: 'wall' };
  return (
    <div className="phoneDock">
      <div className={tool === 'wall' ? 'phoneHint wallHint' : 'phoneHint'}>
        <span aria-live="polite">{hint}</span>
        {onCancelWall && <button onClick={onCancelWall}>Cancel</button>}
        {selected && (
          <button aria-haspopup="dialog" onClick={() => onOpen('properties')}>
            <Icon name="settings" size={16} /> Properties
          </button>
        )}
      </div>
      <div className="phoneToolRow" role="group" aria-label={`${mode} controls`}>
        {CONTROLS[mode].map(([id, label, icon = id]) => {
          const opensPanel = PANELS.includes(id);
          const inCategory = (id === 'doors' && tool.startsWith('door-'))
            || (id === 'cleanup' && ['clean', 'erase'].includes(tool));
          return (
            <button
              key={id}
              data-tour={id}
              aria-haspopup={opensPanel ? 'dialog' : undefined}
              aria-pressed={opensPanel ? undefined : tool === id}
              className={inCategory ? 'active' : undefined}
              onClick={() => (opensPanel ? onOpen(id) : onTool(id))}
            >
              <Icon name={icon} size={19} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <div className="phoneModes" role="group" aria-label="Editor modes">
        {MODES.map(([id, label, icon]) => (
          <button
            key={id}
            aria-pressed={mode === id}
            onClick={() => onMode ? onMode(id) : onTool(modeTools[id])}
          >
            <Icon name={icon} size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
