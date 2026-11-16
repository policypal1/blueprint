import React from 'react';
import { Icon } from './ui.jsx';

const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export default function RecentPlans({
  projects, hydrated, busy, saveStatus, onUpload, onSelect,
  account, canCreate = true, singleProject = false,
}) {
  const disabled = !hydrated || busy;
  const saveWarning = /failed|unavailable/.test(saveStatus);
  const listError = account?.status === 'error';
  const loading = !hydrated || account?.status === 'loading';
  const plans = [
    ...projects.map((plan) => ({ plan, storedInAccount: false })),
    ...(account?.plans ?? []).map((plan) => ({ plan, storedInAccount: true })),
  ].sort((a, b) => (b.plan.updatedAt || 0) - (a.plan.updatedAt || 0));

  return (
    <div className="recentPage">
      <main className="recentBody" aria-busy={disabled}>
        <div className="recentTitle">
          <h1>Recent plans</h1>
          <button className="primary" onClick={onUpload} disabled={disabled || !canCreate}>
            <Icon name="upload" /> {busy ? 'Opening plan…' : 'Upload a plan'}
          </button>
        </div>
        {(singleProject || saveWarning || account?.notice || listError) && (
          <div className="recentMessages">
            {singleProject && (
              <p className="recentMessage">
                {canCreate ? 'Opening a new project uses one project credit.' : 'Your project credits are used.'}{' '}
                <a className="accountTextLink" href="#/account/billing">Manage project credits</a>
              </p>
            )}
            {saveWarning && <p className="recentMessage saveWarning" role="status">{saveStatus}</p>}
            {account?.notice && <p className="recentMessage saveWarning" role="alert">{account.notice}</p>}
            {listError && (
              <div className="accountListError">
                <p className="recentMessage saveWarning" role="alert">Could not load account plans.</p>
                <button onClick={account.onRefresh}>Try again</button>
              </div>
            )}
          </div>
        )}
        {plans.length > 0 ? (
          <ul className="recentList">
            {plans.map(({ plan, storedInAccount }) => {
              const updated = new Date(plan.updatedAt);
              const openPlan = storedInAccount ? () => account.onSelect(plan.id) : () => onSelect(plan);
              return (
                <li key={`${storedInAccount ? 'account' : 'device'}:${plan.id}`}>
                  <button className="recentPlan" onClick={openPlan} disabled={disabled || (!storedInAccount && !canCreate)}>
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
        ) : loading ? (
          <p className="recentMessage" role="status">Loading plans…</p>
        ) : !listError && !saveWarning && (
          <div className="recentEmpty">
            <Icon name="folder" size={32} />
            <p>No plans yet</p>
          </div>
        )}
      </main>
    </div>
  );
}
