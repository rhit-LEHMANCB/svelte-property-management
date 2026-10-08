# Lifecycle: p0-payments-and-access-fixes

- Branch: `p0-payments-and-access-fixes`
- Stage: **complete (archived automatically on 2026-10-07 after the production release `5815a72`)**
- Review round: 4 (round 4 run on the user's instruction after the halt at round 3)
- QA cycle: 3 of 3 (cycles 1 and 2 failed on the environment, cycle 3 passed)
- Started: 2026-10-06

## Interview summary
(approved: yes, 2026-10-06)

**Goal.** Close the five P0 issues: #54 session cookie lifetime, #42 tenant routes accept admins, #37 Stripe webhook reliability, #36 payment page uses a fake balance, #83 Stripe test/live separation. One change, one PR.

**Scope**
- **#54:** `maxAge` in seconds (`expiresIn / 1000`); handler test asserts 432000.
- **#42:** shared role guard for `/maintenance`, `/insurance`, `/payment`: admins get a 303 to `/admin`. Also add a server-side admin check to `/admin/+page` so it is not protected only by the `/` redirect.
- **#37:** await every Firestore write in the webhook (failure returns 500 so Stripe retries); record the "Transaction Fee" line on the transaction as `fee` (it does not change the balance); pick the month in `America/Indiana/Indianapolis`, not server locale; find the rent line by something sturdier than the literal description "Rent" (invoice line metadata).
- **#36:** real balance and due date; server rejects amounts above the balance (400); confirmation page for Stripe success and cancel URLs; round `amount * 100`.
- **#83 (revised after dashboard check):** the user reports dev and production are both in Stripe test mode and test mode cannot be turned off, so the account is probably not activated for live payments and dev and production likely share one test account. Code: a startup guard that refuses a live key (`sk_live_`/`rk_live_`) outside production and only logs a loud warning for a test key in production (it must not break the production deploy). Docs next to `.env.example`: which key goes where, creating a separate Stripe sandbox for dev, activating the account for live mode, replacing customer ids at the switch. The sandbox and activation steps are human tasks, not code.

**Out of scope:** auto-pay, receipts, notifications, SendGrid (#90), the other P1+ issues, Stripe API-version bump.

**Roles.** Tenants: pay and see their balance. Admins: redirected away from tenant pages; set a tenant's move-in month. Unauthenticated: unchanged.

**Data changes**
- `junction_user_property/{tenantId}_{propertyId}` gets `moveInMonth` (`"YYYY-MM"`). Admin sets it when assigning a tenant and can edit it later on the property's Tenants tab. Existing junctions have none.
- `payment_history/{year}.{Month}.transactions[]` entries gain optional `fee`.
- No migration script: a junction without `moveInMonth` is treated as "current month only", so no carry-over until an admin sets it.

**Balance rule (#36).** For each month from `moveInMonth` through the current month (US Eastern), owed = rent; paid = sum of that month's transactions' `amount` (a month with a `remainingBalance` entry uses it). Balance = sum of unpaid remainders, never below 0 (an overpayment in one month does not offset another beyond zero for that month; extra credit is not tracked). Due date = the 1st of the current month if the current month is unpaid; otherwise "nothing to pay". Carry-over spans year boundaries by reading each year's document.

**Payment cap (confirmed by user).** A tenant can never pay more than the remaining balance: the maximum for one payment is the total owed through the current month (unpaid past months plus this month's remainder). No prepaying future months, no overpayment. Enforced on the server (400) and in the client.

**Edge cases**
- No `moveInMonth`: balance = current month's remainder only.
- Webhook for unknown property: logged and acknowledged 200 (retrying cannot help); Firestore failure: 500 (retry).
- Duplicate webhook delivery for the same invoice: out of scope, noted as a deferred finding.
- Amount with more than 2 decimals or above the balance: 400 from the server, same toast text as today in the client.

**Security.** The over-balance check is the server's, not just the client's. Role guard runs server-side in the layout `load`. The key-mode guard reads the key prefix only and never prints it.

**Acceptance (WHEN/THEN)**
- WHEN a user signs in THEN the cookie `Max-Age` is 432000 seconds.
- WHEN an admin opens `/payment`, `/maintenance` or `/insurance` THEN they are redirected to `/admin`.
- WHEN a tenant with rent 1000 and no payments opens `/payment` THEN the page shows $1,000.00 due on the 1st of this month.
- WHEN they pay $400 THEN the webhook records amount 400 and the fee, and `/payment` shows $600.00.
- WHEN a tenant with `moveInMonth` two months ago and no payments opens `/payment` THEN the balance is 3 × rent.
- WHEN a request amount exceeds the balance THEN the server responds 400 and no Stripe session is created.
- WHEN a Firestore write fails in the webhook THEN it responds 500.
- WHEN Stripe returns from Checkout THEN the tenant lands on a confirmation page; cancel returns to `/payment`.
- WHEN a non-production environment starts with an `sk_live_` key THEN startup fails with a clear message; WHEN production starts with an `sk_test_` key THEN it starts and logs a warning.

**Rollout notes**
- No new secrets or variables. The guard relies on `PUBLIC_FB_PROJECT_ID` (`lehman-realty-dev` is the dev project) to tell environments apart.
- Human tasks, not blocking this change: create a separate Stripe sandbox for dev (own keys and webhook for the dev site, put in the `develop` GitHub environment); activate the Stripe account for live mode, then replace production's keys and webhook secret and fix users' test customer ids. Until then production "payments" are test payments.
- Existing tenants have no `moveInMonth` until an admin sets it.
- Production currently uses a test key, so the guard only warns there; it cannot break the production deploy.

**Dashboard checklist (done by the user; outcome: both environments in test mode, live mode unavailable; remaining items become production-PR human tasks)**
1. In Stripe, confirm the key in the GitHub `develop` environment is a test or sandbox key and the one in `production` is a live key from the production account (the key's first characters show `sk_test_`/`rk_test_` vs `sk_live_`/`rk_live_`).
2. Confirm two webhook endpoints exist: `https://lehman-realty-dev.web.app/api/stripe/webhook` (test mode) and the production domain's (live mode), each with its own signing secret matching that environment's `STRIPE_ENDPOINT_SECRET`.
3. Confirm production user documents hold live customer ids (`cus_` created in live mode) and dev ones hold test ids.

**Assumptions:** `America/Indiana/Indianapolis` is the business timezone; the rent due date is the 1st; amounts are USD; one property per tenant (#39 not fixed here).

## Gate A
Approved: yes, 2026-10-06 (user)
Accepted preflight gaps: `npm run check` fails on the stale local `.env` unless `PUBLIC_FRONTEND_URL=http://localhost:5173 STRIPE_ENDPOINT_SECRET=whsec_local` are set on the command line (use that); e2e not yet run locally (Java 26 vs CI's 21).
`gh pr merge` confirmed allowed by the user.

**Resume notes (context was cleared before stage 3):** openspec CLI is at `/tmp/claude-1000/-home-lehmancb-code-svelte-property-management/f334f564-f8f9-407d-829a-6c15351d6006/scratchpad/osp/node_modules/.bin/openspec` (or reinstall `@fission-ai/openspec@1.14.1` into a scratch dir). Run `export NVM_DIR=~/.nvm; source $NVM_DIR/nvm.sh; nvm use` before any npm command. Never read or edit `.env`. Branch `p0-payments-and-access-fixes` has the proposal commit (not pushed).

## Preflight
| Check | Result |
|---|---|
| git identity and push access | OK (Caleb Lehman; `origin` reachable) |
| `gh auth` scopes | OK (`repo`, `workflow`) |
| `gh pr merge` permitted in this session | **Needs user confirmation** (cannot be tested without merging) |
| Playwright `qa` project + browsers | OK (`qa` project present; chromium installed) |
| QA credentials | OK: all four set in `.env.qa` (mode 600, untracked); not in env |
| Dev deploy workflow on `develop` | OK (latest 5 runs success) |
| `npm run lint` | OK |
| `npm run test:unit` / `test:handlers` | OK (46 and 152 passed) |
| `npm run check` | **Gap**: fails on a stale local `.env` (missing `PUBLIC_FRONTEND_URL`, `STRIPE_ENDPOINT_SECRET`); passes with those two set on the command line, so the run uses that |
| Java for e2e emulators | OpenJDK 26 found (CI uses Temurin 21); e2e not yet run locally |
| `openspec` CLI | Not installed; using pinned `@fission-ai/openspec@1.14.1` from the scratchpad |
| Secrets/variables needed in `develop` environment | None |


## Review rounds
- Round 1: 1 blocker, 1 major, 3 minors, 1 nit. Fixed: blocker (webhook applied payments only to the invoice month, so carried-over months never cleared; now allocates oldest-first using `moveInMonth` in invoice metadata), major (move-in month limited to 2000-2099 and walk clamped), minor (re-assigning a tenant keeps `moveInMonth`), minor (unreadable amount logged at error level). Not fixed: minor on `isProductionProject` (matches the approved design), nit on `invalidateAll` await.
- Round 2: 0 blockers, 2 majors, 5 minors, 1 nit. Fixed: major (allocation now in the delta spec and design), major (webhook writes all year documents in one batch), minor (tenant id validated), minors (cross-year and failure tests; concurrent-webhook race added to Known Gaps). Accepted: stale `moveInMonth` in invoice metadata (documented in design), 2000-01 lower bound (admin-editable), cleared month input.
- Round 3: 0 blockers, 2 majors, 4 minors, 1 nit. NOT fixed (max rounds reached, so the run halted):
  - major: `increment` in the webhook is not idempotent, so a redelivery after a lost 500 response double-decrements `remainingBalance`. This is the duplicate-delivery gap already recorded as deferred; the fix is to store the invoice id and skip recorded invoices.
  - major: the multi-year failure test only checks 500; the fake batch is not atomic, so the test would pass without the batch. Fix: make the fake batch all-or-nothing and assert neither year document exists.
  - minor: `hasEntry` should be `typeof entry.remainingBalance === 'number'` to match `monthOwedCents`.
  - minor: re-assign keeping `moveInMonth` has no spec scenario.
  - minor: key guard treats an empty or unknown project id as production; consider an explicit allowlist.
  - minor: concurrent-webhook race (already a Known Gap). Nit: 2000-01 lower bound.
- Round 3 fixes (before round 4): webhook now runs in one transaction with a `recorded_invoices/{id}` marker (idempotent redelivery, no concurrent overwrite, no partial multi-year write); fake Firestore batch and transaction are all-or-nothing and the test asserts nothing is left behind; `hasEntry` matches `monthOwedCents`; re-assign scenario added to the spec; empty project id throws in the key guard; move-in month limited to 5 years back; cleared month input is reverted with a toast. Not changed: stale `moveInMonth` in invoice metadata (accepted, documented in design).
- Round 4: 0 blockers, 0 majors, 3 minors, 2 nits. Passed. All deferred below.

## Deferred findings
- A future `moveInMonth` (e.g. 2099-12) is accepted; add an upper bound.
- No test that `stripe.ts` calls the key guard (only the guard function is tested).
- The five-year and future-month limits are tested through POST but not PATCH.
- POST re-assign reads then sets the junction (not atomic against a concurrent PATCH).
- `arrayUnion` merges two identical transactions (same second, amount, fee); balances stay right.
- The move-in month field on the Tenants tab is narrow ("September 202" is cut off on desktop).
- Two checkouts started before the first webhook lands can together exceed the balance.

## QA report
### QA report: p0-payments-and-access-fixes

- Deployed commit: `a4aa41b` on `develop` (dev site: https://lehman-realty-dev.web.app)
- QA cycle: 3 of 3 (cycles 1 and 2 failed for environment reasons, see below)
- Run at: 2026-10-07
- Result: **PASS** (0 failing scenarios)

Evidence (screenshots, QA specs, a webhook e2e spec): branch `qa-evidence/p0-payments-and-access-fixes` (not merged).

**Earlier cycles.** Cycle 1: a paid checkout did not lower the balance because the dev Stripe webhook was not configured. Cycle 2: every payment returned 500 because the dev API key pointed at the production sandbox, where the QA tenant's customer id did not exist. Both were fixed in Stripe and GitHub settings with no code change; the same webhook handler also passed on the Firestore emulator (`tests/e2e/specs/webhook.spec.ts` on the evidence branch).

#### End-to-end payment on the dev site
Balance $1,000.00 before; $1.00 payment created a Checkout session with Rent $1.00 and Transaction Fee $0.33; Stripe's back arrow returned to `/payment` with the balance unchanged; paying with the 4242 test card landed on `/payment/success` and the balance dropped to $999.00 via the webhook; with the move-in month two months back (balance $2,999.00) a $5.00 payment dropped it to $2,994.00.

#### Scenarios
| Capability | Scenario | Result | Evidence |
|---|---|---|---|
| authentication | Cookie `Max-Age` is 432000 | pass | ![authentication-cookie-lifetime](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/authentication-cookie-lifetime.png?raw=true) |
| access-control | Admin opens /payment, /maintenance, /insurance, /payment/success: 303 to /admin | pass | ![access-control-admin-opens-tenant-page-payment](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/access-control-admin-opens-tenant-page-payment.png?raw=true) |
| access-control | Tenant opens /payment | pass | ![access-control-tenant-opens-tenant-page](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/access-control-tenant-opens-tenant-page.png?raw=true) |
| access-control | Tenant opens /admin and /admin/users: 401 | pass | ![access-control-tenant-opens-admin-admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/access-control-tenant-opens-admin-admin.png?raw=true) |
| rent-payments | Real balance and due date | pass | ![rent-payments-no-payments-yet](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/rent-payments-no-payments-yet.png?raw=true) |
| rent-payments | Valid amount: session with Rent and fee lines | pass | ![rent-payments-stripe-checkout-reached](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/rent-payments-stripe-checkout-reached.png?raw=true) |
| rent-payments | Invalid, fractional-cent, zero, negative and over-balance amounts: 400 | pass | ![rent-payments-over-balance-refused](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/rent-payments-over-balance-refused.png?raw=true) |
| rent-payments | Cancel returns to /payment | pass | ![rent-payments-return-pages-cancel](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/rent-payments-return-pages-cancel.png?raw=true) |
| rent-payments | Success returns to /payment/success | pass | ![rent-payments-return-pages-success](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/rent-payments-return-pages-success.png?raw=true) |
| rent-payments | Partial payment lowers the balance (webhook) | pass | ![rent-payments-partial-payment](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/rent-payments-partial-payment.png?raw=true) |
| rent-payments | Unpaid past months carry over | pass | ![rent-payments-past-months-carry-over](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/rent-payments-past-months-carry-over.png?raw=true) |
| rent-payments | Carry-over across a year boundary | pass | ![rent-payments-carry-over-year-boundary](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/rent-payments-carry-over-year-boundary.png?raw=true) |
| rent-payments | Payment toward carried-over months | pass | ![rent-payments-carry-over-payment-balance](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/rent-payments-carry-over-payment-balance.png?raw=true) |
| tenant-assignment | Change move-in month (toast, persists) | pass | ![tenant-assignment-change-move-in-month](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/tenant-assignment-change-move-in-month.png?raw=true) |
| tenant-assignment | Invalid month rejected, 5-year bound | pass | ![tenant-assignment-invalid-month-nothing-written](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/tenant-assignment-invalid-month-nothing-written.png?raw=true) |
| tenant-assignment | Re-assign keeps the month | pass | ![tenant-assignment-reassign-keeps-month](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/tenant-assignment-reassign-keeps-month.png?raw=true) |
| tenant-assignment | Non-admin PATCH: 401 | pass | ![tenant-assignment-non-admin-patch](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/tenant-assignment-non-admin-patch.png?raw=true) |
| regression | Tenant top-level pages | pass | ![regression-tenant-insurance](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/regression-tenant-insurance.png?raw=true) |
| regression | Admin top-level pages | pass | ![regression-admin-home](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/p0-payments-and-access-fixes/openspec/changes/p0-payments-and-access-fixes/qa/screenshots/regression-admin-home.png?raw=true) |

#### Observations outside the specs
- (low) On the Tenants tab the move-in month field is narrow: "September 202" is cut off at desktop width. Cosmetic; deferred.
- (low) "No move-in month" with an empty field could not be reproduced: the UI cannot clear it and the junction already had a month.
- (low) The QA tenant now has $6.00 of sandbox payments recorded in the dev QA property's history.

#### Not covered by automation
Webhook bad signature, redelivery, failed write and unknown property through real Stripe (covered by handler tests and the emulator e2e spec); month near midnight; startup key guards; paid-in-full state; a payment spanning several months checked in Firestore (verified through the balance only); a fresh assign without a month; phone layouts.


## Verification checklist for the human
### Human verification checklist (ranked by risk)

**Before merging (production configuration)**
1. **Production Stripe webhook** (high). No webhook endpoint exists for production, so payments there would never be recorded. In the Stripe account production uses, add an endpoint `https://manager.lehmanfamilyllc.com/api/stripe/webhook` (event `invoice.payment_succeeded`), put its signing secret in `STRIPE_ENDPOINT_SECRET` in the GitHub `production` environment, and let the production deploy pick it up. If dev and production share one Stripe account, each endpoint also receives the other's events; an event for a property that is not in that Firestore is ignored and logged.
2. **Stripe key mode on production** (high). Production runs a test-mode key, so the startup guard only logs a warning there and payments are test payments. Confirm the production deploy starts normally and the log shows that warning. When the account is activated for live mode, follow `docs/stripe-setup.md` (live key, live webhook and secret, live customer ids) and make one small real payment.
3. **Set `moveInMonth` for existing tenants** (high). Existing junctions have none, so they owe only the current month until an admin sets it on the property's Tenants tab. Decide each tenant's real move-in month before announcing the balances.

**After the production deploy**
4. **One test payment on production** (high). As a tenant, pay a small amount with the Stripe test card; expect `/payment/success`, and the balance on `/payment` to drop by that amount within a minute. Check the Stripe webhook delivery log shows 200 and `properties/{id}/payment_history/{year}` has the transaction with `fee`.
5. **Webhook resend and bad signature** (medium). Resend a processed `invoice.payment_succeeded` event: expect 200 and no second change in the balance. A request with a wrong signature should return 400.
6. **Payment across several months** (medium). Set a move-in month two months back, pay more than the current month's remainder (not just $5) and look at Firestore: oldest month paid first, one transaction per month, the fee on the first transaction only.
7. **Paid in full** (medium). Pay the whole balance as a tenant: expect "You have nothing to pay" and a disabled "Make a Payment".
8. **Admin redirect and tenant pages in real browsers** (low). As an admin open `/payment`, `/maintenance`, `/insurance`: expect `/admin`. As a tenant open `/admin`: expect an error page, not the admin page.
9. **Phone layout and session cookie** (low). `/payment`, `/payment/success` and the Tenants tab month field on a phone (the field is narrow on desktop too); `__session` expires in about 5 days (check Safari).


## Halted
The run halted three times and was resumed each time; it is not halted now.
- Stage 4, 2026-10-06: review round 3 ended with 2 majors. The user asked for them to be fixed and for another round; round 4 passed.
- Stage 6, 2026-10-06 (QA cycle 1): the dev Stripe webhook was not configured. The user added it.
- Stage 6, 2026-10-07 (QA cycle 2): the dev API key pointed at the production sandbox, so the QA tenant's Stripe customer did not exist. The user repointed the key and fixed the data. Tracking issue: #92.

## Archive
Archived automatically on 2026-10-07 after the production release `5815a72` ([workflow run](https://github.com/rhit-LEHMANCB/svelte-property-management/actions/runs/37705106349)). That marks this lifecycle complete.
