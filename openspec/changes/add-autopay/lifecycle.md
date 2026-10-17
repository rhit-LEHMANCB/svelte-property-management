# Lifecycle: add-autopay

- Branch: `autopay-uopafj` (designated branch of the cloud session; `autopay` holds the same proposal commit)
- Stage: 7 Production PR (Gate B: waiting on the human)
- Review round: 2 of 5
- QA cycle: 1 of 3
- Started: 2026-10-15

## Interview summary
(issue #161; confirmed by the user 2026-10-15)

**Goal.** Tenants save a card or ACH bank account and turn on autopay for a lease. The daily job (`runDailyJob`) charges it when rent is due, so nobody has to remember to pay.

**Scope.**
- Tenant saves a payment method through a Stripe SetupIntent (card or ACH) and turns autopay on/off per lease, on `/payment`. Each tenant on a lease enrolls separately and sets their own amount (blank = whatever is owed).
- New step in the daily job: for each lease with rent, deposit or late fees due today or earlier, charge enrolled tenants in enrollment order. Each is charged min(their amount, what is still owed after earlier charges), so a lease is never charged beyond its balance.
- Charges are Stripe invoices carrying the same metadata as Checkout, so the existing webhook records them (late fees, deposit, oldest rent).
- Fees follow the payment method, for autopay and manual alike: card 2.9% + $0.30. ACH is free on autopay (landlord absorbs it). Remove the "Set up auto-pay to waive this fee" checkout copy.
- Failures: try the next enrolled tenant in the same run, then retry on each of the next 3 daily runs. Email the tenant on each failure and on giving up. Autopay stays on.
- Reminders: autopay tenants get "autopay will charge $X on <date>" 7 days before instead of the 7-day and due-day reminders.
- Late fees: a charge is dated when initiated, and a pending charge (ACH) blocks late fees for that month. If it later fails, the failure email goes out and normal late-fee rules resume at the next run.
- Idempotency: one claimed charge record per lease, month and tenant (`create` fails on a duplicate), a deterministic Stripe idempotency key, and the existing recorded-invoice guard on webhook redelivery. The daily-job lock covers overlapping runs.
- Admin view: lease page shows who has autopay on (method, amount) and failed or pending charges; the job run summary lists charges and failures.

**Out of scope.** Stripe refunds, one-time Checkout with ACH or saved methods, admin enrolling tenants, share logic beyond the per-tenant amount cap.

**Roles.** Tenant manages only their own enrollment on leases they are on. Admin read-only. Unauthenticated users see nothing.

**Data.** `leases/{id}/autopay/{uid}` (payment method id, type, brand/last4 or bank, amountCents or null, enrolledAt); `leases/{id}/autopay_charges/{month-uid}` (claim, state pending/succeeded/failed, attempts, invoice id); Stripe SetupIntent and off-session invoices. Rules deny client writes; server only. No migration.

**Security.** Method ids are server-only; clients see brand/last4. Tenants cannot read other tenants' enrollments. No card data touches our servers.

**Acceptance (hand checks).**
- WHEN a tenant saves a card and enables autopay at $500 THEN `/payment` shows it on with the card's last4 and amount.
- WHEN the job runs on a due date with an enrollment THEN one invoice is paid, the balance drops, and re-running the job charges nothing.
- WHEN the card is declined THEN the tenant gets a failure email, and the next day's run retries.
- WHEN an ACH charge is pending past the grace period THEN no late fee is added.
- WHEN a Stripe webhook is redelivered THEN nothing is recorded twice.

**Rollout.** Enable ACH Direct Debit in the Stripe dashboard (dev, later live); subscribe the webhook endpoint to `invoice.payment_failed`; no new env vars. Firestore rules deploy with the change.

**Assumptions.** No ACH rate constant is needed because ACH is free on autopay. The card fee on autopay is added on top of the amount, as in Checkout. Invoices (not bare PaymentIntents) so the webhook is reused.

## Gate A
Approved: yes, 2026-10-16 (user replied "approved")
Accepted preflight gaps: Stripe dev dashboard (ACH Direct Debit, `invoice.payment_failed` webhook) is a manual step for the user; QA of real ACH and decline paths on the dev site depends on it.

Resumed in a cloud session (Linux) on 2026-10-16:
- GitHub backend switched to **GitHub MCP**: `gh` token invalid here, `CLAUDE_CODE_REMOTE=true`, `get_me` returns rhit-LEHMANCB.
- `.env` and `.env.qa` pulled with `scripts/pull-env.sh` (mode 600, gitignored); `.env` points at `lehman-realty-dev`. A local `JOBS_SECRET` placeholder was appended for `npm run check`.
- Baseline: `npm run check` pass, `npm test` 598 pass, `npm run lint` pass (no CRLF issue on Linux).

## Preflight
GitHub backend: `gh` (logged in as rhit-LEHMANCB; scopes repo, workflow).

| Check | Result |
| --- | --- |
| git identity, push to `origin` | pass (pushed `autopay`) |
| GitHub backend | pass: `gh` |
| Playwright `qa` project, browsers | pass (config present, chromium installed) |
| QA credentials (`QA_ADMIN_*`, `QA_TENANT_*`) | pass: all four set in the gitignored `.env.qa`, untracked. File mode shows 644 because NTFS has no POSIX modes; accepted. |
| Dev deploy workflow on `develop` | pass: last 3 runs succeeded |
| `nvm use` / Node | pass: v22.23.2 |
| `npm run check` | pass after creating a local gitignored `.env` from `.env.example` plus `JOBS_SECRET` (fresh worktrees have no `.env`) |
| `npm test` | pass: 598 tests |
| `npm run lint` | **gap on this Windows checkout only**: `core.autocrlf=true` makes Prettier flag 204 CRLF files. With `--end-of-line auto`, prettier and eslint pass. CI is Linux and unaffected. Implementation will use `npx prettier --check --end-of-line auto .` and `npx eslint .`. |
| Java for emulators (`test:e2e`) | pass: OpenJDK 21 |
| `develop` environment secrets | pass: nothing new needed (`JOBS_SECRET`, `STRIPE_*` exist) |
| Stripe dashboard (dev) | **manual, before QA**: enable ACH Direct Debit and add `invoice.payment_failed` to the dev webhook endpoint. Cannot be checked from here (Stripe connector not authorized). |

Observations (not part of this change): `.env.example` lacks `JOBS_SECRET`, so `npm run check` fails on a fresh checkout.

Correction to the interview summary: Firestore rules already deny all client access, so no rules deploy is needed. The earlier Rollout line saying rules deploy with the change is superseded by design.md.

## Review rounds
(one line per round: blockers, majors, minors, nits, fixed, rejected with reason)

Stage 3 done 2026-10-16: all tasks implemented; `npm run lint`, `npm run check`, `npm test` (672), `npm run build` pass; full `npm run test:e2e` passed except two insurance-visibility tests that relied on the users list's first page (fixed by searching; my new e2e tenants pushed the row to page 2). `develop` (PR #162, one reminder email per tenant) merged in; autopay reapplied on top of the grouped reminders.

- Round 1 (2026-10-16): 1 blocker, 3 majors, 6 minors, 2 nits. Fixed: README merge-conflict markers (blocker); enrolled tenants with no share lost their reminders (now keep them); enrollments re-read before each charge (turn off mid-run); an older setup session completed later no longer overwrites a newer enrollment (`session.created` vs `updatedAt`); lease id shape and `tenantIds` checked (403 not 500); non-JSON bodies handled; pending charges checked with Stripe after a day and the webhook also fails a still-`claimed` charge; crashed claims keep their amounts and start over with new keys when the amount changed or Stripe reports an idempotency conflict; tasks ticked; design notes enrollment on ended leases. Rejected: (10) failure emails stop retrying after `NOTICE_RETRY_DAYS` (7), the same window the existing late-fee notices use, and longer than the 4-day retry span, so no change; (11) the insurance e2e edit stays in this change because this change's e2e tenants are what broke it; it is called out in the PR description.
- Round 2 (2026-10-16): 0 blockers, 0 majors, 7 minors, 1 nit; all fixed, none rejected: an old setup link no longer re-enables autopay after it was turned off (`autopay_off/{uid}` tombstone, 409); re-enrollment compares against `methodUpdatedAt`, not the amount change; pending charges are checked with Stripe even with no enrollments; charges made before an unexpected error stay in the run summary; the webhook stores Stripe's failure reason; amounts capped at $999,999.99; one share rule decides both the autopay notice and who skips reminders; a failed charge stops showing once nothing is owed. No blockers or majors: review loop exits after round 2.

## Out-of-scope observations
- low: `/payment` does not list a tenant's ended lease with a zero balance, so autopay cannot be set up on it. Intended (nothing to pay); no issue needed.
- low: one-time Checkout offers Cash App Pay: Stripe account configuration, not this change.

## QA report
- Deployed commit: `0946caf` on `develop` (dev site: https://lehman-realty-dev.web.app); deploy run 38850360461 succeeded.
- QA cycle: 1 of 3, run 2026-10-16 by an independent agent (Playwright `qa` project, specs in `tests/qa/add-autopay/`).
- Result: **PASS**. 17 tests in 3 spec files, 0 failures. One earlier run timed out signing in as admin (transient) and passed on rerun.
- Evidence: branch [`qa-evidence/add-autopay`](https://github.com/rhit-LEHMANCB/svelte-property-management/tree/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots). One screenshot showed the QA tenant's email on Stripe's page and was masked before pushing.
- Cleanup: autopay is off again for the QA tenant (enrolled on the QA lease "payments QA Way" only during the run). The daily job was not run on dev, and Firestore was not written directly.
- ACH Direct Debit is on in the dev Stripe sandbox (Checkout setup offers a US bank account).

| Capability | Scenario | Result | Evidence |
|---|---|---|---|
| autopay | Start setup (setup-mode Checkout, card and bank offered) [tenant] | pass | ![autopay-start-setup-stripe-page](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-start-setup-stripe-page.png) |
| autopay | Not the tenant's lease or bad amount: 403 / 400 [tenant] | pass | ![autopay-setup-validation-errors](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-setup-validation-errors.png) |
| autopay | Complete enrollment: Visa ending 4242, $100.50 [tenant] | pass | ![autopay-controls-enrolled](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-controls-enrolled.png) |
| autopay | Someone else's or unfinished session: 400 [tenant] | pass | ![autopay-complete-unfinished-session](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-complete-unfinished-session.png) |
| autopay | Completing twice: 200, display unchanged (enrollment time not visible: partial) [tenant] | pass | ![autopay-complete-twice](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-complete-twice.png) |
| autopay | Payment method details stay server-side: no `pm_` anywhere [tenant, admin] | pass | ![autopay-no-payment-method-id](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-no-payment-method-id.png) |
| autopay | Change amount: $100.50 to $250.25, blank to Full balance, -1 is 400 [tenant] | pass | ![autopay-change-amount](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-change-amount.png) |
| autopay | Turn off: enrollment removed, Set up autopay returns [tenant] | pass | ![autopay-turn-off](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-turn-off.png) |
| autopay | Only your own: 404 without enrollment, 403 on another lease [tenant] | pass | ![autopay-change-only-your-own](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-change-only-your-own.png) |
| autopay | Tenant controls, not enrolled [tenant] | pass | ![autopay-controls-not-enrolled](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-controls-not-enrolled.png) |
| autopay | Checkout copy: fee line says 'Transaction fee for one-time card payment.' [tenant] | pass | ![autopay-checkout-fee-line](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-checkout-fee-line.png) |
| autopay | Admin lease list: 'Autopay: New User, Visa ending 4242, full balance' [admin] | pass | ![autopay-admin-lease-list](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-admin-lease-list.png) |
| autopay | Admin read-only: no controls; setup/PATCH/DELETE as admin 403 [admin] | pass | ![autopay-admin-read-only-api](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-admin-read-only-api.png) |
| autopay | Access, not signed in: all autopay routes 401 [anonymous] | pass | ![autopay-access-not-signed-in](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-access-not-signed-in.png) |
| autopay | Regression: tenant pages load without errors [tenant] | pass | ![autopay-regression-tenant-home](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-regression-tenant-home.png) |
| autopay | Regression: admin pages load without errors [admin] | pass | ![autopay-regression-admin-home](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-regression-admin-home.png) |
| autopay | Regression: signed-out /payment redirects to /signin [anonymous] | pass | ![autopay-regression-signed-out](https://github.com/rhit-LEHMANCB/svelte-property-management/raw/qa-evidence/add-autopay/openspec/changes/add-autopay/qa/screenshots/autopay-regression-signed-out.png) |
| autopay | Pending, failed or gave-up charge notes on /payment and admin | not covered | needs a job run |
| autopay | Another tenant's data on /payment | not covered | one tenant account |

**Not covered by automation on the dev site:** everything that needs the daily job or a Stripe webhook. That is the charge itself (due date, caps, never above balance, early rent, ended lease, $0.50 minimum, one lease failing), the fee on a real autopay invoice, idempotency, pending and settled state, declines, retries and giving up, reminder emails, and late fees with a pending charge. Running the job on dev would charge fees and email every dev tenant. Also not covered: bank-account enrollment (Stripe's bank flow cannot be scripted), a second tenant on the same lease, real email delivery, and phone layout. The handler tests (690) and the emulator e2e spec `tests/e2e/specs/autopay.spec.ts` cover the job and webhook paths against the fake Stripe.

## Verification checklist for the human
Ranked by risk. Use the dev site with Stripe test mode unless noted.

1. **Daily job charges a card with the cap and fee** (high). On a QA-only lease with rent due today, enroll one tenant at $300 and another with no amount (lease owes $1,000). Run the daily job as admin (`await fetch('/api/jobs/daily', {method: 'POST'})`). Expect invoices of $300 + $9.00 fee and $700 + $20.60 fee in the Stripe test dashboard, payments recorded on the lease, and nothing new on a same-day rerun. (Note: the job acts on every dev lease.)
2. **Declined card, retries and giving up** (high). Enroll with test card 4000 0000 0000 0341, run the job on the due date and the next 3 days. Expect the invoice voided, a failure email each day, a final "Autopay stopped for this payment" email, and autopay still on.
3. **ACH pending: no late fee, settles on time** (high). Enroll a test bank account, run the job on the due date and again after the grace period, then settle or fail the payment in the Stripe dashboard. Expect no late fee while pending, and the payment dated at charge start. If it fails, expect an email and late fees resuming. Requires `invoice.payment_failed` on the dev webhook endpoint.
4. **Production-only setup** (high). Before merging: turn on ACH Direct Debit in the live Stripe account and add `invoice.payment_failed` to the live webhook endpoint (`docs/stripe-setup.md#autopay`). No new environment variables. After deploy: set up autopay with a real card on a test lease, then turn it off.
5. **Bank account enrollment and display** (medium). Set up autopay with a test bank account. Expect "Bank account ending NNNN", no card-fee note, and no fee line on its charges.
6. **Reminder emails** (medium). 7 days before a due date, one tenant enrolled and one not. Expect the enrolled tenant to get only "Autopay will charge $X on <date>" (card fee included), and the other the usual reminder. A rerun sends nothing.
7. **Two tenants on one lease** (medium). Each sees and changes only their own enrollment; the admin list shows both.
8. **Phone layout, keyboard and wording** (low). Use the autopay controls and dialogs on a phone and by keyboard. Read the autopay copy, fee notes and emails (company shown as "Lehman Family LLC").

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
