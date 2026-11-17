import React from 'react';
import { SignInPage } from './Auth.jsx';
import Marketing, { SiteFooter, SiteHeader } from './Marketing.jsx';
import { CustomerPolicyPage, POLICY_LINKS } from './Policies.jsx';

export default function PublicPage({ page, account, trialOffer }) {
  if (page === 'signIn') {
    return (
      <>
        <SiteHeader page={page} account={account} />
        <SignInPage account={{ loading: true }} />
      </>
    );
  }
  if (Object.hasOwn(POLICY_LINKS, page)) {
    return (
      <div className="marketing">
        <SiteHeader page={page} account={account} />
        <CustomerPolicyPage page={page} />
        <SiteFooter />
      </div>
    );
  }
  return <Marketing page={page} account={account} trialOffer={trialOffer} />;
}
