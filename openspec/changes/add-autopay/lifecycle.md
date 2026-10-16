# Lifecycle: add-autopay

- Branch: `autopay-uopafj` (designated branch of the cloud session; `autopay` holds the same proposal commit)
- Stage: 4 Review
- Review round: 0 of 5
- QA cycle: 0 of 3
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

## Out-of-scope observations
(only QA observations outside this change's scope, to turn into issues at wrap-up; review findings are fixed, never listed here)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
