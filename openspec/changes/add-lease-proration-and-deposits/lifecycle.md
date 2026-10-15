# Lifecycle: add-lease-proration-and-deposits

- Branch: `claude/add-lease-proration-and-deposits`
- Stage: 7 done: production PR #157 open, waiting for Gate B (human verification and merge)
- GitHub backend: GitHub MCP (`gh` token in GH_TOKEN is invalid; cloud session, `get_me` returns rhit-LEHMANCB)
- Review round: 1 of 5
- QA cycle: 1 of 3
- Started: 2026-10-15

## Interview summary
(approved: yes, 2026-10-15)

**Goal.** Bill leases fairly for partial months, collect and account for security deposits, and charge late fees, all inside the existing lease balance and Stripe Checkout flow. Autopay is the next change, not this one.

**In scope**
- **Proration, always on.** A first or last month that is only partly inside the lease is charged rent × days occupied ÷ days in that month, counting both the start and end days and rounding to the cent. A lease that starts on the 1st and ends on the last day of a month (or has no end date) is billed exactly as today. If the start and end fall in the same month, only the days between them are charged.
- **Due dates.** The first month's rent is due on the start date. Every later month is due on the 1st.
- **Existing leases are prorated fully.** Their balances are recomputed with proration. A month that was paid more than it now owes leaves a **credit** on the lease. The credit pays the oldest month still owed, and admin and tenant both see it as "Credit". No refunds are made.
- **Deposit.** Each lease gets an optional deposit amount and a deposit due date, which defaults to the start date. The deposit can be paid as soon as the lease is saved, including while the lease is upcoming, and in parts. No late fee is ever charged on a deposit. The admin can change the amount, but not below what has already been paid.
- **Late fees.** Each lease has a flat late fee, prefilled at 5% of rent and editable, and a number of grace days, default 5. A month whose rent is still unpaid more than the grace days after its due date incurs the fee once. The admin can waive one month's late fee.
- **Paying.** `/payment` takes one amount, capped at the total owed (late fees + unpaid deposit + rent − credit). It is applied in a fixed order: late fees first, then the deposit, then rent from the oldest month. Checkout shows a line for each part that is not zero ("Late Fee", "Security Deposit", "Rent") plus the existing "Transaction Fee" (2.9% + $0.30 of the whole amount). The webhook records each part separately, so deposit money never counts as rent. An upcoming lease that owes a deposit appears on `/payment`.
- **Deposit settlement.** After the end date, the admin records one settlement: the amount returned plus kept deductions, each with an amount and a reason. Returned plus kept must equal what is held. The admin can correct a settlement later. Refunds are recorded only; the money is returned outside the app. The tenant dashboard shows the deposit held, and the settlement once there is one.
- **Admin and tenant UI.** The lease create and edit forms get deposit amount, deposit due date, late fee and grace days. The lease list and detail show the deposit held or settled, late fees and credit. The tenant lease card shows the deposit and the late-fee terms.
- **Migration** `0003`: sets every existing lease to no deposit, late fee 5% of rent, 5 grace days, and `lateFeesFrom` = the migration date. Only months due on or after that date can incur a late fee. It is safe to re-run, and its file says how to undo it.

**Out of scope:** autopay and saved-card charging (next change), Stripe refunds, interest on deposits, late-fee reminder emails, rent that changes during a lease, using deposit deductions to pay the balance.

**Roles.** Admins set terms, waive late fees and settle deposits. A tenant sees only their own leases' balances, deposit, late fees and settlement. Unauthenticated users see nothing new.

**Assumptions** (not asked; correct me if wrong)
1. The amount a month still owes comes from the payments recorded against it, not the stored `remainingBalance`, so recomputing with proration is consistent. `remainingBalance` is still written for compatibility.
2. A late fee uses the lease's current late-fee amount. A waiver is stored per month, as are paid late fees.
3. A lease with any recorded deposit or late-fee payment cannot be deleted, the same rule as rent payments.
4. Invoices from before this change, which carry no split metadata, are recorded as rent, as today.
5. Ended leases with a deposit still held are marked "Deposit to settle" in the admin lease list.
6. No new environment variables, Stripe console changes or Firebase console changes. The migration relies on the backup schedule that already exists.

**Acceptance examples**
- WHEN a $1,500 lease runs Oct 15 to Mar 14 THEN October owes 1500 × 17/31 = $822.58, due Oct 15, and March owes 1500 × 14/31 = $677.42.
- WHEN an existing Oct 15 lease already paid $1,500 for October THEN it shows a $677.42 credit, which reduces November's rent.
- WHEN November's rent is unpaid on Nov 7 and grace is 5 days THEN a late fee of 5% of rent is owed once. WHEN the admin waives it THEN it disappears.
- WHEN a tenant owes a $50 late fee, $500 deposit and $1,500 rent and pays $600 THEN $50 goes to the late fee and $500 to the deposit (paid in full), and $50 is left over for rent.
- WHEN a lease with $1,000 held ends and the admin records $800 returned and $200 kept for "carpet cleaning" THEN the deposit shows settled. A settlement that does not add up to $1,000 is refused.

**Rollout.** No secrets to add. The migration runs in the deploy workflow. Stripe Checkout line names change ("Security Deposit", "Late Fee" are new).

**Answers given.** Round 1: per-lease proration toggle (later changed by the user to always on); deposit due date per lease defaulting to the start date; refunds only recorded; existing leases migrated (later: prorated fully). Scope: late fees added, autopay moved to the next change. Late fee: flat per lease, default 5% of rent, once per month; grace per lease, default 5; one payment amount applied late fees → deposit → oldest rent; card fee on the whole payment; settlement itemized and must add up; overpaid months become credit; late fees only for months due after release.

## Gate A
Approved: yes, 2026-10-15 (by the user in session, after the proposal and preflight were presented)
Accepted preflight gaps: none

## Preflight
Run 2026-10-15 on `claude/add-lease-proration-and-deposits` (develop merged in at 0efda52, which has the add-leases archive).

| Check | Result |
| --- | --- |
| git commit and push | OK: author `Claude <noreply@anthropic.com>`; branch pushed to origin |
| GitHub backend | GitHub MCP. `gh` fails (invalid GH_TOKEN); `get_me` returns rhit-LEHMANCB |
| Merge permission | Not tested (expected to work, per skill) |
| Playwright `qa` project | OK: `playwright.config.ts` has it |
| Browsers | Pre-installed Chromium is build 1194 and Playwright 1.63 expects 1243. Mapped through a scratchpad `PLAYWRIGHT_BROWSERS_PATH` (no download); `npm run test:e2e` 145 passed |
| QA credentials | OK: `.env.qa` pulled from 1Password with `scripts/pull-env.sh`, mode 600, gitignored and untracked; all four QA_* variables set (values not printed) |
| Dev deploy on develop | OK: run 92 (cb865b6) succeeded. The archive merge 0efda52 (docs only) was pushed by the Actions token and started no deploy |
| Local checks | OK: Node 22, `npm run lint`, `npm run check`, `npm test` (494 passed), `npm run build`, `npm run test:e2e` (Java present) |
| Secrets and variables | None needed for this change |
| Not available under MCP | Approving a PR's pending workflow runs (human step at wrap-up if needed) |

## Review rounds
Stage 3 done 2026-10-15: all 21 tasks ticked. Local checks: lint, check, 567 unit/handler tests, build, `npm run test:e2e` 149 passed (new `tests/e2e/specs/lease-billing.spec.ts`).
Round 1 (2026-10-15, fresh Explore/Sonnet reviewer): blockers 0, majors 0, minors 3, nits 1. Exit after fixing.
- minor, dead `allocatePayment`/`toDollars`: fixed (removed with their tests; `computeBalance` kept, commented as migration 0001's).
- minor, credit ignored payments in unloaded years or before the start month: fixed (the ledger reads every `payment_history` year and counts any month not owed as credit; unit test added).
- minor, admin list loads a ledger per lease: not changed. Reason: every lease, ended ones included, can owe rent or hold a deposit that the list must show; the cost is three reads per lease, which the design accepts at this app's scale.
- nit, unbounded deductions: fixed (at most 50; test added).
Local checks after the fixes: lint, check, 564 tests, build.

Implementation notes: the tenant refusal status in the two new admin routes is 401 (the codebase's admin guard), so the spec scenarios were aligned from 403 to 401.

## Out-of-scope observations
- Medium: deleting a property deletes its leases even when they have recorded payments (QA saw a lease with a $400 deposit payment vanish with its `qa-` property). This bypasses the lease delete rule. Existing behavior, not from this change.
- Low: the edit-lease page always says "A lease with recorded payments cannot be deleted..." even when the lease has none. Existing copy.

## QA report

QA report: add-lease-proration-and-deposits

- Deployed commit: `1763b66` on `develop` (dev site: https://lehman-realty-dev.web.app)
- QA cycle: 1 of 3, by a fresh independent QA agent (Sonnet), 2026-10-15, about 04:20 to 05:30 UTC
- Result: **PASS**, 0 failing scenarios. Of 87 changed scenarios: 54 pass (some partly), 33 not verified on the dev site.
- Evidence branch: [`qa-evidence/add-lease-proration-and-deposits`](https://github.com/rhit-LEHMANCB/svelte-property-management/tree/qa-evidence/add-lease-proration-and-deposits). It holds 73 screenshots under `openspec/changes/add-lease-proration-and-deposits/qa/screenshots/` and the QA specs under `tests/qa/add-lease-proration-and-deposits/`.
- Stripe test mode and the dev webhook both worked. Four test-card payments were recorded (a deposit and rent split, a partial deposit, and a deposit paid after settlement).

**Why some scenarios could not be verified.** The QA tenant already has a current month-to-month lease, so the app (correctly) refuses any overlapping lease for them. As a result, every lease QA created for the tenant had ended. Late fees only apply to months due on or after the late-fee start date, which is the day the lease is created, plus the grace days. So no late fee could be produced on the dev site yet.

| Capability | Pass | Not verified | Not verified, in short |
|---|---|---|---|
| lease-billing | 12 | 7 | Later months' due date; late fee charged once (unpaid after grace, paid within grace, paid after the fee); fee not charged on an unpaid deposit; waive |
| security-deposits | 13 | 3 | Upcoming lease owing a deposit; settling a lease that has not ended (409); another tenant's lease |
| leases | 14 | 7 | Billing details with a Waive action; add or remove a tenant; tenant card with deposit terms on a current lease, with a document, and with no lease |
| rent-payments | 15 | 14 | Webhook edge cases that need signed events (redelivery, old invoice, midnight, no lease, write failure, unrelated or unknown); upcoming leases; shared lease; paid in full |
| data-migrations | 1 | 2 | Re-run; existing data recomputed (the equivalent "existing lease recomputed" passed) |
| regression | 3 | 0 | Admin and tenant top-level pages load with no console errors; a tenant cannot reach admin pages |

Highlights:
- Proration: 17/31 gives $822.58, 14/31 gives $677.42, 10/28 gives $321.43, and the 2024 leap year gives $517.24.
- Credit after a start-date move: $466.67.
- Checkout split for $600: Security Deposit $500.00, Rent $100.00, Transaction Fee $17.70.
- Deposit: lowering it below what was paid is refused; settlement mismatches and missing reasons are refused; a settlement can be corrected; a later payment reopens "Deposit to settle".
- Tenant refusals (401) for waive and settle.
- Delete returns 409 for a lease with any payment, including a deposit-only payment.

Failures: none. The QA agent fixed four test bugs of its own along the way.

Observations (QA, triaged):
- In scope, no change: the late-fee prefill shows "60" rather than "60.00". The number input drops trailing zeros; the value is correct.
- In scope, no change: "Past leases" lists an ended lease that has a deposit but no payment as "$0.00 held". The spec says ended leases with a deposit are shown.
- Low, unconfirmed: after a failed save, a server response refilled fields that fast automation had edited in the meantime. A person is unlikely to hit this.

Left on the dev site (cannot be deleted because they have payments):
- `qa-billing-credit`
- `qa-billing-payments`
- `qa-billing-deposits`

All other qa- data was removed.

## Verification checklist for the human
Ranked by risk. Production-only risks come first.

1. **Migration 0003 on production** (high). The deploy runs `0003-lease-billing-terms` before hosting. Check the deploy log shows the restore point and the leases updated. Then open a few leases: no deposit, late fee 5% of rent, 5 grace days. A lease that started mid-month and paid a full first month now shows **credit**. Balances of mid-month leases change by design.
2. **Late fee end to end** (high; could not happen on dev yet). As admin, create a lease for a tenant with no other lease, starting the 1st of next month, rent 1500, late fee 75, grace 5. On the 7th, the admin list and `/payment` show a $75.00 late fee. Paying the rent later does not remove it. **Waive** removes an unpaid fee. Checkout with a fee owed shows "Late Fee" first.
3. **Upcoming lease with a deposit** (high). Create a lease starting mid-next-month with a $1,000 deposit. As the tenant, `/payment` lists it with $1,000.00 owed, due on the start date, before move-in. Pay $400 with a test card: the card shows $400 paid and held. Deleting the lease returns 409. The first month is prorated and due on the start date.
4. **Stripe** (high). Production still uses a Stripe test-mode key (Known Gap). The new Checkout lines "Security Deposit" and "Late Fee" appear there. The webhook endpoint is unchanged, so no Stripe dashboard change is needed. When going live, check the line names and the 2.9% + $0.30 fee on the whole amount.
5. **Settlement guard and privacy** (medium). Settling the deposit of a current lease returns 409. A second tenant's dashboard shows nothing from another tenant's lease.
6. **Webhook edge cases in Stripe test mode** (medium). Resend a delivered `invoice.payment_succeeded` event: nothing is recorded twice. An old-format invoice (rent and fee only) goes entirely to rent.
7. **Add or remove tenants on a lease** (medium). Adding an email creates an account and sends a welcome email from Lehman Family LLC. A removed tenant keeps their account.
8. **Phone layout** (low). At about 390 px wide, check the lease form (deposit and late-fee fields), the admin lease list with the settle form, the tenant dashboard and `/payment`.
9. **Lease document** (low). Attach a PDF, open it as the tenant, and delete a lease that has a document.

No environment variables or secrets were added. The production database must keep its backup schedule, or the migration refuses to run. Also clean up the three `qa-billing-*` properties on the dev site if they are not wanted.

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
