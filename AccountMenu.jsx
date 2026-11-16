import React, { useEffect, useRef } from 'react';
import { Icon } from './ui.jsx';

export function profileName(user) {
  const { planpatch_display_name, full_name, name } = user?.user_metadata ?? {};
  return [planpatch_display_name, full_name, name]
    .find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

export function AccountAvatar({ user }) {
  const value = profileName(user) || user?.email?.split('@')[0] || '';
  const letter = value.match(/\p{L}/u)?.[0]?.toLocaleUpperCase() || 'P';
  return <span className="accountAvatar" aria-hidden="true">{Array.from(letter)[0]}</span>;
}

export default function AccountMenu({ user, page, busy, onSignOut }) {
  const displayName = profileName(user) || 'My account';
  const menu = useRef(null);
  const trigger = useRef(null);
  const close = (focus = false) => {
    if (menu.current) menu.current.open = false;
    if (focus) trigger.current?.focus();
  };

  useEffect(() => {
    const dismissOutside = (event) => {
      if (menu.current?.open && !menu.current.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, []);
  useEffect(() => { close(); }, [page]);

  return (
    <details className="accountMenu" ref={menu} onKeyDown={(event) => {
      if (event.key !== 'Escape' || !menu.current.open) return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }}>
      <summary ref={trigger} aria-label={`Account menu for ${displayName}`}>
        <AccountAvatar user={user} />
        <span className="accountMenuName">{displayName}</span>
        <Icon name="chevron" className="accountMenuChevron" size={16} />
      </summary>
      <div className="accountMenuPanel">
        <div className="accountMenuIdentity">
          <AccountAvatar user={user} />
          <div>
            <strong>{displayName}</strong>
            {user?.email && <span>{user.email}</span>}
          </div>
        </div>
        <nav className="accountMenuLinks" aria-label="Account shortcuts">
          <a href="#/account" aria-current={page === 'account' ? 'page' : undefined} onClick={() => close()}>
            <Icon name="user" /> Profile settings
          </a>
          <a href="#/account/security" aria-current={page === 'security' ? 'page' : undefined} onClick={() => close()}>
            <Icon name="lock" /> Sign-in &amp; security
          </a>
          <a href="#/account/billing" aria-current={page === 'billing' ? 'page' : undefined} onClick={() => close()}>
            <Icon name="card" /> Billing &amp; payment methods
          </a>
        </nav>
        <div className="accountMenuFooter">
          <button type="button" disabled={busy} onClick={() => { close(true); onSignOut?.(); }}>
            <Icon name="logout" /> Sign out
          </button>
        </div>
      </div>
    </details>
  );
}
