import React, { useEffect, useRef, useState } from 'react';

const paths = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  chevron: 'm8 10 4 4 4-4',
  close: 'm6 6 12 12M6 18 18 6',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',
  download: 'M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5',
  undo: 'M9 4 4 9l5 5M4 9h9a6 6 0 0 1 0 12',
  redo: 'm15 4 5 5-5 5m5-5h-9a6 6 0 0 0 0 12',
  select: 'm5 3 6 17 3-6 6-3L5 3Z',
  pan: 'M8 11V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v6-2a1.5 1.5 0 0 1 3 0v3c0 5-3 8-8 8h-1c-3 0-5-2-7-5l-2-3a1.6 1.6 0 0 1 2.5-2L8 13',
  wall: 'M3 8h18v8H3ZM8 8v8m8-8v8',
  window: 'M4 6h16v12H4ZM8 6v12m8-12v12M4 12h16',
  line: 'M4 20 20 4M4 17v3h3M17 4h3v3',
  rect: 'M4 6h16v12H4Z',
  measure: 'm3 16 13-13 5 5L8 21ZM8 12l2 2m1-5 2 2m1-5 2 2',
  dimension: 'M3 6v12M21 6v12M3 12h18m-15-3-3 3 3 3m12-6 3 3-3 3',
  text: 'M5 5h14M12 5v14M8 19h8',
  door: 'M5 20V4h13v16M5 4l9 3v14l-9-1m5-7h.1',
  erase: 'm4 14 9-10 7 7-9 10H9Zm6-7 7 7M10 21h11',
  clean: 'M7 3H3v4m14-4h4v4M3 17v4h4m14-4v4h-4M8 8h8v8H8Z',
  calibrate: 'M4 4v16h16M4 8h4m-4 4h3m-3 4h4m0 4v-3m4 3v-4m4 4v-3',
  toilet: 'M8 3h8v5H8Zm0 5c-7 9-2 13 4 13s11-4 4-13M9 13c-2 5 8 5 6 0',
  sink: 'M4 7h16v11H4Zm4 4h8v4H8Zm4-4V3h3',
  shower: 'M4 4h16v16H4Zm0 0 16 16M16 8h.1',
  tub: 'M6 7h12a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3ZM8 7V4h3',
  bed: 'M4 3h16v18H4Zm0 7h16M7 4v3h3V4m4 0v3h3V4',
  wh: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 5v8m6-8v8m-6-4h6',
  washerdryer: 'M3 4h18v16H3ZM7 8h10v8H7Zm10-2h.1',
  counter: 'M3 5h18v14H3Zm0 4h18M11 9v10m2-10v10',
  stove: 'M4 3h16v18H4ZM8 7h2v2H8Zm6 0h2v2h-2ZM8 13h2v2H8Zm6 0h2v2h-2Z',
  check: 'm5 12 4 4L19 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  grid: 'M3 3h18v18H3ZM9 3v18m6-18v18M3 9h18M3 15h18',
  folder: 'M3 6h6l2 3h10v11H3Z',
  file: 'M5 3h9l5 5v13H5Zm9 0v5h5M8 12h8m-8 4h6',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  back: 'm10 5-7 7 7 7M3 12h18',
  help: 'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.1M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
};
export function Icon({ name, size = 18, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name?.startsWith('door-') ? 'door' : name] || paths.file} />
    </svg>
  );
}
export function Brand({ compact = false }) {
  return (
    <span className="brand">
      <span className="brandMark">
        <svg
          viewBox="0 0 24 24"
          width="23"
          height="23"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M4 20V4h16v16H4Zm0-7h9V4m0 9v7m0-7h7" />
        </svg>
      </span>
      {!compact && (
        <span>
          Blueprint<span className="brandLight"> Studio</span>
        </span>
      )}
    </span>
  );
}
export function Modal({ title, onClose, children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const root = ref.current;
    const selector =
      'button:not(:disabled), input:not(:disabled), select, textarea, a[href], [tabindex="0"]';
    (
      root.querySelector('[autofocus]') ||
      root.querySelector('input, textarea') ||
      root.querySelector(selector)
    )?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const items = [...root.querySelectorAll(selector)].filter(
          (el) => el.getClientRects().length,
        );
        if (!items.length) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div
      className="modalBackdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modalHeader">
          <h2>{title}</h2>
          <button className="iconButton" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function useDialog() {
  const [state, setState] = useState(null);
  const resolver = useRef(null);
  const finish = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  };
  useEffect(() => () => resolver.current?.(null), []);
  const ask = (options) =>
    new Promise((resolve) => {
      resolver.current?.(null);
      resolver.current = resolve;
      setState(options);
    });
  const dialog = state && (
    <Modal title={state.title} onClose={() => finish(null)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          finish(
            state.type === 'confirm' || state.type === 'notice'
              ? true
              : new FormData(e.currentTarget).get('answer'),
          );
        }}
      >
        <p className="modalLead">{state.message}</p>
        {!['confirm', 'notice'].includes(state.type) && (
          <label className="field">
            <span>{state.label || 'Value'}</span>
            <input
              autoFocus
              name="answer"
              type={state.type || 'text'}
              defaultValue={state.initialValue || ''}
              required
              maxLength={100}
              min={state.min}
              max={state.max}
            />
          </label>
        )}
        <div className="modalActions">
          {state.type !== 'notice' && (
            <button type="button" onClick={() => finish(null)}>
              Cancel
            </button>
          )}
          <button className={state.danger ? 'danger' : 'primary'} type="submit">
            {state.confirmLabel || 'Continue'}
          </button>
        </div>
      </form>
    </Modal>
  );
  return [ask, dialog];
}
