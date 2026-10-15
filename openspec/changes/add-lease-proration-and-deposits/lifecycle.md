# Lifecycle: add-lease-proration-and-deposits

- Branch: `claude/add-lease-proration-and-deposits`
- Stage: 6 QA: PR #155 merged 2026-10-15 (1763b66, merge commit); waiting for dev deploy run 38679015088
- GitHub backend: GitHub MCP (`gh` token in GH_TOKEN is invalid; cloud session, `get_me` returns rhit-LEHMANCB)
- Review round: 1 of 5
- QA cycle: 0 of 3
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
(only QA observations outside this change's scope, to turn into issues at wrap-up; review findings are fixed, never listed here)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
