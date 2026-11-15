import React from 'react';
import { Brand, Icon, PRODUCT_NAME } from './ui.jsx';

const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export default function RecentPlans({
  projects, hydrated, busy, saveStatus, onUpload, onCreate, onRestore, onSample, onSelect,
}) {
  const disabled = !hydrated || busy;
  return (
    <div className="recentPage">
      <header className="recentHeader">
        <a href="#/" aria-label={`${PRODUCT_NAME} home`}><Brand /></a>
        <span role="status">{saveStatus}</span>
      </header>
      <main className="recentBody" aria-busy={disabled}>
        <div className="recentTitle">
          <h1>Recent plans</h1>
          <button className="primary" onClick={onUpload} disabled={disabled}>
            <Icon name="upload" /> {busy ? 'Opening plan…' : 'Upload a plan'}
          </button>
        </div>
        <div className="recentActions">
          <button onClick={onCreate} disabled={disabled}><Icon name="plus" /> New blank plan</button>
          <button onClick={onRestore} disabled={disabled}><Icon name="folder" /> Restore backup</button>
          <button onClick={onSample} disabled={disabled}><Icon name="file" /> Try a sample plan</button>
        </div>
        {hydrated && (projects.length ? (
          <ul className="recentList">
            {projects.map((plan) => {
              const updated = new Date(plan.updatedAt);
              return (
                <li key={plan.id}>
                  <button className="recentPlan" onClick={() => onSelect(plan)} disabled={disabled}>
                    <span className="recentThumbnail" aria-hidden="true">
                      {plan.background && plan.showBackground
                        ? <img src={plan.background} alt="" loading="lazy" decoding="async" />
                        : <Icon name="file" size={26} />}
                    </span>
                    <span className="recentPlanName">
                      <strong>{plan.name}</strong>
                      {Number.isFinite(updated.getTime()) && (
                        <time dateTime={updated.toISOString()}>{formatDate.format(updated)}</time>
                      )}
                    </span>
                    <Icon name="arrow" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="recentEmpty">
            <Icon name="folder" size={32} />
            <p>No plans yet</p>
          </div>
        ))}
      </main>
    </div>
  );
}
