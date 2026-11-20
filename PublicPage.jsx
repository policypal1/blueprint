import React from 'react';
import { AuthHeader, SignInPage } from './Auth.jsx';
import Marketing, { SiteFooter, SiteHeader } from './Marketing.jsx';
import { CustomerPolicyPage, POLICY_LINKS } from './Policies.jsx';
import FloorPlanGuides from './FloorPlanGuides.jsx';
import { publicPages } from './seo-pages.js';

export default function PublicPage({ page, account, trialOffer }) {
  if (page === 'signIn') {
    return (
      <>
        <AuthHeader />
        <SignInPage account={{ loading: true }} />
      </>
    );
  }
  if (page === 'notFound') {
    return (
      <div className="marketing">
        <SiteHeader page={page} account={account} />
        <main className="accessPage" aria-labelledby="not-found-title">
          <section className="accessCard notFoundCard">
            <p className="notFoundCode">404</p>
            <h1 id="not-found-title">Page not found</h1>
            <p>Double-check the address or return to the home page.</p>
            <div className="accessActions">
              <a href="/" className="button primary">Back to home</a>
              <a href="/#/editor" className="button">Open the editor</a>
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
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
  if (page === 'guides' || publicPages[page]?.article) {
    return (
      <div className="marketing">
        <SiteHeader page={page} account={account} />
        <FloorPlanGuides page={page} showTrial={trialOffer && !account?.signedIn} />
        <SiteFooter />
      </div>
    );
  }
  return <Marketing page={page} account={account} trialOffer={trialOffer} />;
}
