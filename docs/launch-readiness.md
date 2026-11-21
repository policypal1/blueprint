# Blueprint launch review

Reviewed November 20, 2026 (Pacific). Public site: https://www.editfloorplans.com.

## Current product and disclosures

- **Trials and prices.** Verified eligible accounts can start a 72-hour trial. It expires without charging a card. One project credit costs $10 USD once, and monthly access costs $19 USD now and on each monthly renewal. A separate purchase starts paid service.
- **Checkout and cancellation.** The live and sandbox flows use separate Stripe customers and versioned consent. Monthly checkout requires its own affirmative renewal checkbox before Stripe collects payment details. Billing offers a direct Cancel subscription action. A settled first invoice produces a downloadable acknowledgment with the offer terms, support and cancellation link.
- **Billing records.** The live migration retains the wording, acceptance time and billing references for at least three years, extending retention on recorded billing activity or through the recorded paid period plus three years. Account deletion detaches the live record from the app user. Test records follow the sandbox deletion rules. Check the live workflow with a real transaction before relying on it.
- **Floor plans and privacy.** Public policies explain rights to uploaded plans, how private cloud projects and local drafts are stored, and the temporary browser copy that can restore a preview during sign-in or checkout. Optional analytics is off until the visitor opts in, and Global Privacy Control disables it. The privacy page records its effective date and how material changes will be announced. The editor produces markups for review and gives no professional approval of a plan.

## Outstanding before a paid launch

1. **Payment and fulfillment.** Production reported live mode, a recognized server key and checkout ready. The configured live prices were verified at $10 once and $19 per month, and the live webhook destination was active. Hosted orders and payment fulfillment still need end-to-end verification for each product. Confirm that a settled project payment grants exactly one credit and a settled first subscription invoice grants access with the correct acknowledgment. Verify cancellation through Account → Billing, access through the paid period and the refund workflow.
2. **Renewal notices.** Federal ROSCA and Oregon's automatic-renewal rules distinguish consumer sales from some commercial purchases. The editor is also offered publicly. Review applicable rules for the customers and locations served, including California consumer renewal reminders and fee-change notices where applicable. An acknowledgment saved in Billing is distinct from a delivered reminder. No automatic annual reminder job was identified in the repository. Confirm the processor or operator's delivery workflow and actual notice contents.
3. **Business registration and payment representative.** Oregon guidance requires an assumed business name registration when a sole proprietor uses a name other than their real and true name. Verify the registration for the name used with customers. For an operator under 18, verify the required adult representative with Stripe and any guardian verification that Stripe requests. Neither the published seller name nor a usable key establishes either fact.
4. **Hosting.** The production Vercel team was on Hobby at review. Vercel limits Hobby to personal, noncommercial use. Move commercial use to a permitted plan or host. The review did not purchase or change a plan.
5. **Operational privacy.** Verify the support inbox receives and handles privacy requests. Check Oregon privacy-law applicability against the business's actual consumer count and revenue. Revisit the notice before introducing new tracking, providers or uses of customer drawings.

This review covers the deployed notices and the implemented product flows. Business registration, the Stripe representative, receipt and notice delivery, and rules in individual sales jurisdictions require separate verification.

## Building requirements by location

States adopt different code editions and amendments. Local permit checklists, zoning and site-specific requirements also matter. Requirements for an architect's or engineer's seal depend on jurisdiction and project scope. Blueprint is a tool for communicating proposed revisions and cannot determine whether a particular drawing can legally be used for construction.

Official resources consulted:

- [Oregon residential permit guidance](https://www.oregon.gov/bcd/lbdd/Pages/oregon-permits.aspx)
- [California Building Standards Commission](https://www.dgs.ca.gov/BSC)
- [Washington State Building Code](https://sbcc.wa.gov/state-codes-regulations-guidelines/state-building-code)
- [Oregon automatic-renewal requirements, ORS 646A.295](https://www.oregonlegislature.gov/bills_laws/ors/ors646A.html)
- [Oregon business-name registration guidance](https://sos.oregon.gov/business/information-center/Pages/doing-business-means.aspx)
- [Federal online negative-option law, 15 USC § 8403](https://uscode.house.gov/us/usc/119-124/t15/s8403/)
- [California Attorney General, automatic renewal and cancellation](https://oag.ca.gov/node/608083)
- [California Attorney General, online privacy notices](https://oag.ca.gov/sites/all/files/agweb/pdfs/cybersecurity/making_your_privacy_practices_public.pdf)
- [Oregon Department of Justice, privacy law applicability](https://www.doj.state.or.us/consumer-protection/for-businesses/privacy-law-faqs-for-businesses/)
- [Stripe Services Agreement, section 1.2(b)](https://stripe.com/legal/ssa)
- [Stripe account age requirements](https://support.stripe.com/questions/age-requirement-to-create-a-stripe-account)
- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby)

## Conversion changes and next measurement

Visitors can try a guided doorway edit below the homepage hero. The PDF editing guide includes a recorded walkthrough with portrait footage on small screens. Visitors can also try the sample plan in the editor before uploading their own drawing.

The homepage explains how to upload an existing plan, edit walls and doors, and export the revision. The mobile FAQs cover supported file types, the 25 MB limit, multipage PDFs, downloads, where drafts are saved and how project credits differ from monthly access.

To evaluate conversion, compare qualified visits, demo starts, signups, completed first edits, exports and purchases. Use consented, non-sensitive funnel counts and feedback from five to ten unrelated paying customers.
