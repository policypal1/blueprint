# Blueprint launch review

Reviewed November 19, 2026. Public address: https://www.editfloorplans.com.

The product is branded Blueprint. The domain, support address, legal operator and existing billing identifiers remain consistent with the published business details.

## Verified in this change

- Terms, privacy, refunds/cancellation, support and privacy choices remain accessible from every public footer. Short pages use the full viewport before the footer.
- Terms explain ownership and permission to use drawings, limited processing rights, measurement limitations and the need for professional review when required.
- State and local codes, permits, amendments and professional seal requirements are explicitly distinguished from the editor's markup tools. No permit approval or code-compliance claim is made.
- The support page falls back to support@editfloorplans.com rather than a placeholder if its build variable is absent. Mailbox delivery was not retested in this change.
- The existing monthly checkout has separate affirmative recurring-payment consent, versioned disclosure records and a downloadable acknowledgment after a confirmed first test payment.
- Test billing remains test billing. Backend tests reject live payment events and verify server-controlled prices, authenticated ownership, refund revocation and the customer-scoped cancellation flow.
- Analytics remains optional, off before consent, and disabled by Global Privacy Control. The sample walkthrough does not save projects or send drawing data.
- All 54 component and backend tests pass. They cover editing, export, accounts, privacy choices, billing and sample playback. Production payment-provider flows were not completed by these tests.

## Outstanding before a paid launch

1. **Payment acceptance and cancellation.** Confirm the live Stripe business setup. Test purchase, payment confirmation, receipt/acknowledgment, renewal cancellation, refund, entitlement changes and account deletion end to end in the actual deployment. This release does not enable live keys or deploy backend changes.
2. **Acknowledgments and record retention.** Define and implement the production receipt/renewal-notice and consent-record retention process for the states served. The present test-consent table intentionally cascades on account deletion; it is not a production retention policy. Review the complete disclosure, cancellation and retainable acknowledgment against applicable state requirements before using real subscriptions.
3. **Business name.** Verify Oregon registration for the name under which the service is sold. Publishing policies or owning a domain does not register an assumed business name.
4. **Stripe ownership.** Stripe requires a legal guardian to be the account owner for an operator under 18 before accepting charges or transferring funds. Verify that requirement is satisfied.
5. **Hosting.** Confirm a hosting plan that permits commercial operation. Vercel Hobby is restricted to personal, noncommercial use; no paid plan was purchased in this change.

These are specific unverified launch items. A code and policy review does not establish compliance with every customer's state laws.

## Building requirements by location

States adopt different code editions and amendments. Local permit checklists, zoning and site-specific requirements also matter. Requirements for an architect's or engineer's seal depend on jurisdiction and project scope. Blueprint is a tool for communicating proposed revisions and cannot determine whether a particular drawing can legally be used for construction.

Official resources consulted:

- [Oregon residential permit guidance](https://www.oregon.gov/bcd/lbdd/Pages/oregon-permits.aspx)
- [California Building Standards Commission](https://www.dgs.ca.gov/BSC)
- [Washington State Building Code](https://sbcc.wa.gov/state-codes-regulations-guidelines/state-building-code)
- [Oregon automatic-renewal requirements, ORS 646A.295](https://www.oregonlegislature.gov/bills_laws/ors/ors646A.html)
- [Oregon business-name registration guidance](https://sos.oregon.gov/business/information-center/Pages/doing-business-means.aspx)
- [Stripe account age requirements](https://support.stripe.com/questions/age-requirement-to-create-a-stripe-account)
- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby)

## Conversion changes and next measurement

Visitors can open an animated sample before creating an account or uploading a drawing. The same sample appears in the first-use editor walkthrough. It demonstrates Pan, selecting a wall, changing thickness, drawing, doors, labels, cleanup, more tools, calibration, measurement and export. Playback can be paused, skipped, replayed and controlled manually; reduced-motion preferences are respected.

The homepage now explains file types, the upload limit and the skill level needed. Pricing makes clear that both options include editing and exports and that a single project does not require a subscription. FAQs explain how edits are layered over an imported drawing, which helps set expectations before signup.

These are conversion hypotheses, not a measured lift. Compare qualified visits, sample opens, signups, completed first edits, exports and paid conversions after launch. Collect only consented, non-sensitive funnel counts. Use feedback from the first 5–10 unrelated paying customers to decide the next change.
