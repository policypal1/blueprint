# Seven-day path to a small beta

The goal is a usable beta with a handful of contractors, not a fully mature CAD product. Seven days is a working target; move the launch if saving, authorization, or payments fail their checks. Keep your existing income while testing demand.

| Day | Work                                                                                                                                                                                                      | Done when                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Install this frontend. Test your client's real plans. Watch them upload, calibrate, revise, export, and reopen a project. Fix blockers.                                                                   | They complete one real revision without you directing every click.                                                                                   |
| 2   | Finish editor and landing-page QA on desktop and tablet. Print an exported scale sample at 100%. Check backups and old project compatibility.                                                             | The acceptance checklist in TESTING.md passes for the browsers you support.                                                                          |
| 3   | Add managed authentication and private cloud storage. Design project ownership first. Migrate local projects only with an explicit user action after sign-in, retaining a local backup.                   | Two test users can save/reopen their own projects, and neither can read or change the other's records or files.                                      |
| 4   | Test server authorization, database/storage access policies, size quotas, version conflicts, backup recovery, account deletion, and privacy disclosures. Add error reporting without collecting drawings. | Direct API requests with missing, expired, or other-user credentials fail. Backup restoration and deletion work.                                     |
| 5   | Add provider-hosted checkout and a billing portal. Verify signed webhooks, handle retries idempotently, and enforce entitlements on the server. Test failed payments, cancellation, and refunds.          | Test purchases grant access once; duplicate events do not double-grant; a client-side flag cannot unlock a paid plan.                                |
| 6   | Run acceptance tests with large/malformed files, denied storage, interrupted saves, touch input, and slow connections. Publish accurate support, pricing, privacy, and cancellation information.          | No known data-loss or cross-account access bugs remain. Hosted headers and checkout behavior are verified.                                           |
| 7   | Invite 3–5 contractors individually, observe real tasks, and fix blockers. Charge only if billing and recovery checks passed.                                                                             | You can explain who used it, whether they completed a revision, what stopped them, and whether they paid or explicitly agreed to the proposed price. |

## Pricing to validate

Test **$15 for one project with a 30-day editing window** and **$29/month for frequent use**. Keep exported files usable permanently. Explain what happens to an expired project's saved data before implementing expiry. The current website presents these as proposed prices and charges nothing.

Avoid credits for the basic editor: users should understand the bill without estimating clicks or exports. If you later introduce costly AI processing, price it separately after measuring its cost and error rate.

At $29/month, **69 continuously paying subscribers produce $2,001 MRR**, before payment fees, hosting, taxes, support, refunds, churn, or your time. Single-project sales are revenue, not MRR. No pricing model or build can guarantee $2,000/month. $4,000–$5,000 profit requires revenue above that after all expenses.

## Spend after you learn

Use your current client and direct outreach first. Ask about their last actual revision, current workaround, frequency, who pays, and whether they will pay for the next job. Track import completion, first export, repeat use, and payment, with consent and without collecting plan contents.

Given your limited cash, do not make Facebook or Google ads the first launch requirement. Start paid acquisition only after several people complete useful work and pay. Calculate a sustainable acquisition cost from actual retention and contribution margin; set a fixed budget you can afford to lose. Stop tests that bring visits without completed revisions.

## After the first week

Prioritize real requests: cloud recovery/version history, faster large plans, better touch precision, project organization, and trustworthy scale/printing. Multi-sheet documents, vector PDF output, DXF/DWG, collaboration, and automatic plan tracing are separate projects. Do not promise them as part of this first beta.
