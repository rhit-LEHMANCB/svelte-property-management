# Lifecycle: p0-payments-and-access-fixes

- Branch: `p0-payments-and-access-fixes`
- Stage: 4 Review (resumed 2026-10-06 on the user's instruction: "fix everything and run another round, if it passes continue along")
- Review round: 3 of 3 done; round 4 run on the user's instruction after the halt
- QA cycle: 0 of 3
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

## Deferred findings

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
Stage 4 (review loop), 2026-10-06. Reason: review round 3 still had 2 majors (see Review rounds). Evidence: findings above; local checks all green at commit HEAD.
Next step for a human: decide whether to (a) fix the two majors and the `hasEntry` minor on this branch and re-run the review/ship stages (`/dev-lifecycle p0-payments-and-access-fixes`, resume at stage 4), or (b) accept them and ship, with duplicate-delivery idempotency filed as a follow-up. Nothing has been merged or deployed.
