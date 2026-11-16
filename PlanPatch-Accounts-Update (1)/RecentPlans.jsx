import React from 'react';
import { Icon } from './ui.jsx';

const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function PlanList({ plans, disabled, onSelect }) {
  return (
    <ul className="recentList">
      {plans.map((plan) => {
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
  );
}

export default function RecentPlans({
  projects, hydrated, busy, saveStatus, onUpload, onCreate, onSample, onSelect, account, onSignIn, authBusy,
}) {
  const disabled = !hydrated || busy;
  const saveWarning = /failed|unavailable/.test(saveStatus);
  return (
    <div className="recentPage">
      <main className="recentBody" aria-busy={disabled}>
        <div className="recentTitle">
          <h1>Recent plans</h1>
          <button className="primary" onClick={onUpload} disabled={disabled}>
            <Icon name="upload" /> {busy ? 'Opening plan…' : 'Upload a plan'}
          </button>
        </div>
        <p className="recentPasteHint">
          Paste a blueprint image with <kbd>⌘V</kbd> or <kbd>Ctrl+V</kbd>.
        </p>
        <div className="recentActions">
          <button onClick={onCreate} disabled={disabled}><Icon name="plus" /> New blank plan</button>
          <button onClick={onSample} disabled={disabled}><Icon name="file" /> Try a sample plan</button>
        </div>
        {account && (
          <section className="recentGroup" aria-labelledby="account-plans-title">
            <h2 id="account-plans-title">Saved to your account</h2>
            {account.notice && <p className="recentSaveStatus saveWarning" role="alert">{account.notice}</p>}
            {account.status === 'loading' && <p className="recentSaveStatus" role="status">Loading account plans…</p>}
            {account.status === 'error' && (
              <div className="accountListError">
                <p className="recentSaveStatus saveWarning" role="alert">Could not load account plans.</p>
                <button onClick={account.onRefresh}>Try again</button>
              </div>
            )}
            {account.plans.length > 0
              ? <PlanList plans={account.plans} disabled={disabled} onSelect={(plan) => account.onSelect(plan.id)} />
              : account.status === 'ready' && <p className="recentSaveStatus">Open a plan and choose Save to account.</p>}
          </section>
        )}
        {onSignIn && (
          <button className="accountListSignIn" onClick={onSignIn} disabled={authBusy}>
            Sign in to see your saved plans
          </button>
        )}
        {account && <h2 className="devicePlansTitle">On this device</h2>}
        <p className={`recentSaveStatus${saveWarning ? ' saveWarning' : ''}`} role="status">{saveStatus}</p>
        {hydrated && (projects.length ? (
          <PlanList plans={projects} disabled={disabled} onSelect={onSelect} />
        ) : (
          <div className="recentEmpty">
            <Icon name="folder" size={32} />
            <p>{account ? 'No drafts on this device' : 'No plans yet'}</p>
          </div>
        ))}
      </main>
    </div>
  );
}
