# Lifecycle: add-one-time-bank-payments

- Branch: `claude/add-one-time-bank-payments`
- Stage: 3 Implement
- GitHub backend: GitHub MCP (`gh` token in GH_TOKEN is invalid; cloud session, `get_me` returns rhit-LEHMANCB)
- Review round: 0 of 5
- QA cycle: 0 of 3
- Started: 2026-10-16

## Interview summary
(approved: yes, confirmed by the user 2026-10-16)

**Goal.** Tenants can make a one-time payment from a bank account (ACH) for a flat $5 fee instead of the card fee, and a bank payment that is still settling shows as processing, cannot be paid twice and holds off late fees, as autopay ACH already does.

**Scope.**
- "Make a Payment" modal: amount plus a choice of **Card** (fee 2.9% + $0.30, Apple Pay / Google Pay allowed) or **Bank account** (fee $5.00), each showing its fee for the entered amount.
- Server takes the method: card Checkout uses `payment_method_types: ['card']`, and bank Checkout uses `['us_bank_account']`. Cash App Pay and other methods are never offered. The fee is a "Transaction Fee" line added on top, and `feeCents` and the method go in the invoice metadata. Bank verification uses Stripe's default (instant login or microdeposits).
- **Pending state.** When a bank Checkout completes unpaid, a pending one-time payment record is kept on the lease. /payment shows "A bank payment of $X started on <date> is processing." The payable amount for every tenant on the lease drops by it, and the server rejects amounts above balance minus in-flight. The balance itself drops only when it settles.
- **Late fees.** No late fee while a one-time bank payment is pending. When it settles, it is recorded as paid on the day the tenant started it. If it fails, the usual rules resume from the next daily run.
- **Failure.** The record is marked failed. The paying tenant and every admin user get an email that the bank payment of $X did not go through and is owed again (tenant email links to /payment). /payment shows a failed note for a few days. The $5 is not charged, since nothing was collected.
- Success page: bank payments say they take a few business days.
- Copy uses "Lehman Family LLC".

**Out of scope.** Any change to card fees or to autopay fees. A separate interim fix ahead of #157 (the user chose to ship only this change). Refunds or charging ACH return fees. Admin UI for one-time pending payments (admins get the failure email only).

**Roles.** Tenants pay only on their own leases (unchanged). Admins receive failure emails. Nothing from another tenant's payment is shown, except the lease-level processing note and the reduced payable amount, which co-tenants share.

**Data.** New lease subcollection for one-time bank payments (keyed by Checkout session id): uid, amount, fee, state pending/succeeded/failed, startedAt, invoiceId, failure reason, email-sent flags. Server-only (Firestore rules deny clients).

**Assumptions (not asked).**
- A pending one-time bank payment also counts as in-flight for autopay and reminders, so autopay does not charge money already on its way.
- Stripe signals Checkout ACH through `checkout.session.completed` (payment_status `unpaid`), `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`. Exact invoice timing is to be verified in design. Recording stays idempotent through the existing recorded-invoice guard.
- Failure emails are sent once and retried by the daily job if sending fails, using the autopay pattern.

**Acceptance (examples).**
- Tenant enters $964.52 and picks Bank: Checkout shows Rent $964.52 plus Transaction Fee $5.00 and offers only bank. Picking Card shows the fee $28.27 and offers card and wallets but not Cash App Pay or bank.
- After a bank Checkout in live mode: /payment shows the processing note, Make a Payment allows at most balance minus $964.52, and the co-tenant sees the same.
- Grace period ends while pending: no late fee. It settles on day 8: recorded dated day 2, no late fee.
- It fails: the tenant and admins are emailed, the note says it failed, the full balance is payable again, and late-fee rules apply from the next run.

**Rollout.**
- Add `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` to the dev and live Stripe webhook endpoints (exact list confirmed in design).
- ACH Direct Debit enabled in live (the user is doing this).
- No new env vars expected.
- Release PR #157 still carries the interim behavior (bank offered at card fee) if it merges before this change.

## Gate A
Approved: yes, by the user on 2026-10-17 ("approve"), as proposed, including decision 1 (autopay charges in flight also lower the payable amount).
Accepted preflight gaps: none (local `npm run check` needs a placeholder `JOBS_SECRET`; CI provides the real one)

## Preflight
Run 2026-10-16.

| Check | Result |
| --- | --- |
| Env files (`scripts/pull-env.sh` via 1Password service account) | OK: `.env` and `.env.qa` pulled, mode 600, gitignored |
| git commit + push to origin | OK: pushed `claude/add-one-time-bank-payments` |
| GitHub backend | OK: GitHub MCP, `get_me` = rhit-LEHMANCB (`gh` token invalid) |
| Playwright `qa` project + browsers | OK: `playwright.config.ts` has `qa`; Chromium in /opt/pw-browsers |
| QA credentials (4 vars) | OK: all present in `.env.qa` (not printed) |
| Dev deploy `firebase-hosting-merge.yml` on develop | OK: run 38951808079 (d260d55) success |
| `npm run lint` | OK |
| `npm run check` | OK with `JOBS_SECRET` set; the pulled `.env` lacks `JOBS_SECRET` (CI provides it), so local checks run with a placeholder |
| Unit + handler tests (`vitest run`) | OK: 40 files, 697 tests |
| Java + Firebase CLI for emulator e2e | OK: Java present, firebase 15.32.1 |
| Secrets/variables for this change | None needed |
| Stripe webhook events (rollout, not a run blocker) | Needed: add `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` to the dev endpoint before QA (the success page covers pending without them) and to the live endpoint before production |

## Rollout notes
- Stripe dev and live webhook endpoints: add `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` (keep `invoice.payment_succeeded` and `invoice.payment_failed`). Dev before QA; live before the production merge.
- Live Stripe: ACH Direct Debit enabled (the user is doing this). Link stays off.
- No new environment variables or secrets. No data migration (`leases/{id}/bank_payments` starts empty; Firestore rules already deny clients).
- Local runs: Playwright 1.5x here expects Chromium build 1243 while the container has 1194; the run used an uncommitted wrapper config pointing `launchOptions.executablePath` at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Review rounds
(none yet; one line per round: blockers, majors, minors, nits, fixed, rejected with reason)

## Out-of-scope observations
(only QA observations outside this change's scope, to turn into issues at wrap-up; review findings are fixed, never listed here)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
