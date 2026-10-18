# Lifecycle: add-lease-proration-and-deposits

- Branch: `claude/add-lease-proration-and-deposits`
- Stage: **complete (archived automatically on 2026-10-18 after the production release `82681f9`)**
- GitHub backend: GitHub MCP (`gh` token in GH_TOKEN is invalid; cloud session, `get_me` returns rhit-LEHMANCB)
- Review round: 3 of 5
- QA cycle: 3 of 3
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


## Amendment 1 (2026-10-15, after Gate B was reached; approved: yes, 2026-10-15)

The user chose to hold production PR #157 and move late fees to a daily scheduled job before release. Proration and deposits are unchanged.

**Decisions**
- **Trigger.** Google Cloud Scheduler calls a protected app route, `POST /api/jobs/daily`, at 6:00 America/Indiana/Indianapolis every day, in each Firebase project (dev and production).
- **Job scope.**
  - It charges late fees by writing a record for each month that became late.
  - It emails a late-fee notice when it charges a fee.
  - It emails due-date reminders **7 days before and on the due day**, for rent and for deposits, only while the amount is still unpaid.
  - Autopay stays in the next change and will use the same job.
- **Payable from the first reminder.** A month's rent counts in the balance, and can be paid, from 7 days before its due date (for example, from October 25 for November 1). For a lease starting October 15, the first month is payable from October 8. The due date and the late-fee rule do not change. A deposit is still payable as soon as the lease is saved.
- **Missed runs.** The next run catches up on fees: every late month without a recorded fee is charged, with its original due date. Reminders are only sent on their own days, so a missed day's reminders are not resent.
- **Recipients.** Every tenant on the lease gets their own email. No admin emails. Tenants cannot opt out.
- **Lateness rule unchanged.** A month is late if less than its rent was paid, counting credit, by the end of its due date plus the grace days, and only from the late-fee start date on. Paying afterwards does not remove a fee. Waive works as before.

**What changes from the approved plan**
- The balance no longer works out late fees itself. A fee is owed only once the job has recorded it (`late_fees/{YYYY-MM}` with `chargedAt`). Between the end of the grace period and the next run, nothing is owed.
- Emails are sent at most once each. A record per lease, notice type and month prevents a second send if the job runs again.

**Assumptions** (not asked)
1. The route accepts either `Authorization: Bearer <JOBS_SECRET>` (Cloud Scheduler) or a signed-in admin. That lets an admin, or QA on the dev site, run the job on demand. Anyone else gets 401.
2. Only one run can happen at a time (a lock), and each run writes a summary to `_jobs/daily/runs/{date}`. A run that fails part way is safe to repeat.
3. Emails come from Lehman Family LLC through the existing email provider, with the amount, the due date and a link to `/payment`. A failed email is logged and retried on the next run, because its sent record is written only after a successful send.
4. Rollout: a new private secret `JOBS_SECRET` goes in the GitHub `develop` and `production` environments. A Cloud Scheduler job is created in each project, which is a human step with a documented `gcloud` command. Until the scheduler exists, no fees are charged and no emails go out.
5. PR #157 stays open and on hold. Its head is `develop`, so it picks up the rework once that is merged to `develop`. The QA and checklist are then redone.

## Amendment 2 (2026-10-16, while PR #157 waits at Gate B; approved: yes, 2026-10-16)

The user asked why a lease with rent and a deposit due on the same day sends two reminder emails, and chose to combine reminders only.

**Decisions**
- Each tenant gets at most one reminder email per lease per run. It lists every rent month and deposit reminded that day, each with its amount and due date, and the total.
- A late-fee notice stays its own email, even on a day with reminders.
- Records stay per reminder, so at-most-once delivery and stale-claim recovery are unchanged. A failed send releases every claim in that email.
- The run summary's `emailsSent` lists emails: a combined email is one entry whose `notice` joins its reminder keys with `+`.

Approved: yes, 2026-10-15 (by the user in session, after the proposal and preflight were presented)
Accepted preflight gaps: none

Amendment 1: approved 2026-10-15 by the user in session. Accepted gaps: `JOBS_SECRET` is not yet in the GitHub environments, and the Cloud Scheduler API is disabled with no job in either project. Both are human rollout steps before production; dev QA runs the job as an admin.

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

### Preflight for amendment 1 (2026-10-15)

| Check | Result |
| --- | --- |
| git commit and push | OK (pushed 2d0b6db) |
| GitHub backend | GitHub MCP, as before |
| Playwright, browsers, QA credentials | OK, unchanged: `.env.qa` mode 600 and gitignored; browser mapping in the scratchpad |
| Dev deploy on develop | OK: run 95 (800f8fe) succeeded |
| Local checks | OK at the last run; Java present |
| `JOBS_SECRET` in the GitHub `develop` environment | Not added yet (cannot be checked with this access). Not needed for dev QA, which runs the job as an admin |
| Cloud Scheduler on `lehman-realty-dev` | The Cloud Scheduler API is **disabled**, and no job exists. This is a human rollout step; the job is not needed for QA |

## Review rounds
Stage 3 done 2026-10-15: all 21 tasks ticked. Local checks: lint, check, 567 unit/handler tests, build, `npm run test:e2e` 149 passed (new `tests/e2e/specs/lease-billing.spec.ts`).
Round 1 (2026-10-15, fresh Explore/Sonnet reviewer): blockers 0, majors 0, minors 3, nits 1. Exit after fixing.
- minor, dead `allocatePayment`/`toDollars`: fixed (removed with their tests; `computeBalance` kept, commented as migration 0001's).
- minor, credit ignored payments in unloaded years or before the start month: fixed (the ledger reads every `payment_history` year and counts any month not owed as credit; unit test added).
- minor, admin list loads a ledger per lease: not changed. Reason: every lease, ended ones included, can owe rent or hold a deposit that the list must show; the cost is three reads per lease, which the design accepts at this app's scale.
- nit, unbounded deductions: fixed (at most 50; test added).
Local checks after the fixes: lint, check, 564 tests, build.

Amendment 1, stage 3 done 2026-10-15: tasks 7.1 to 7.8 ticked. Local checks: lint, check, 592 vitest tests (date-sensitive rent-payment tests pinned; probed at 2026-10-28 and 2027-01-01), build, `npm run test:e2e` 150 passed (balance expectations follow the 7-day window). `.env` and both workflows gained `JOBS_SECRET`.

Round 2 (amendment 1, 2026-10-15, fresh Explore/Sonnet reviewer): blockers 0, majors 1, minors 4, nits 1. All fixed; round 3 required.
- major, the ended-lease reminder test could not fail: fixed (now an ended lease with a deposit due on the run day; mutation-checked).
- minor, no test that a missed reminder day is not sent later: added.
- minor, a failed sent-record write could cause a duplicate email: fixed (each notice is claimed with `create()` before sending and released if the send fails).
- minor, the lock could expire during a long run: fixed (extended after each lease; the claim also prevents duplicate sends). Known edge: a run that dies between claiming and sending leaves that notice unsent.
- minor, `JOBS_SECRET` missing from the e2e app env: fixed.
- nit, 200 despite errors: changed to 500 when a run had errors, so Cloud Scheduler retries (the spec scenario says so).
Local checks: lint, check, 594 tests, build; e2e lease-billing and payment specs, 17 passed.

Round 3 (amendment 1, 2026-10-15, fresh Explore/Sonnet reviewer): blockers 0, majors 0, minors 4, nits 1. Exit after fixing; all fixed.
- minor, a claim never sent was lost: fixed (a claim with no `sentAt`, older than the lock window, is claimed again; test added).
- minor, extend and release did not check ownership: fixed (run token in `lockedBy`; transactional extend and release; test added).
- minor, a tenant with no email was skipped silently: fixed (a `warnings` entry in the run summary, which does not fail the run, since a retry cannot fix it; test added).
- minor, emails sent for a lease deleted after charging: fixed (the lease is re-checked before sending; test added).
- nit, notice step re-read records for every lease: fixed (charged records passed along; the property, tenants and notices are read only when something is due).
Local checks: lint, check, 598 tests, build.

Implementation notes: the tenant refusal status in the two new admin routes is 401 (the codebase's admin guard), so the spec scenarios were aligned from 403 to 401.

### Amendment 2 review (2026-10-16, on 8f73848)
No blocking findings. Four non-blocking ones, all fixed: the run summary counts emails rather than reminders (lifecycle.md wording corrected), the intro said "coming due" for amounts due today, a leftover doc comment, and an untested path (a reminder another run is still sending). Checks before review: lint, check, 604 unit and handler tests, build, 150 e2e tests.

### QA cycle 2 (amendment 1, 2026-10-15, on 7d1b3dc)
No app bug. Evidence is on the `qa-evidence` branch (commit b34ddbb).
- **Passed:** the job's admin run with a summary; 401 for no credentials, a wrong secret and a tenant; a repeat run charges and sends nothing; an ended lease gets no reminders; no fee before the late-fee start date; no late-fee line before a fee is charged; waive refuses an uncharged month (404); a tenant cannot waive (401). The light regression of lease-billing, leases, data-migrations and the top-level pages also passed.
- **Not verified:** reminders, charging, notices, waive success, and the 7-day payable window. The QA tenant's own current month-to-month lease blocks any current or future qa- lease for them. Also not verified: the scheduler secret path and the 409 overlap (the runs were too short to overlap).
- **Test bugs** (state left from cycle 1): `rent-payments.spec.ts` setup hit an overlap with the cycle 1 lease; `security-deposits` "Before settlement" reused a lease that was already settled. Triage: a fresh QA agent corrects the scripts (cycle 3).
- 7 job runs sent 0 emails and charged 0 fees on the dev project.

### QA cycle 3 (amendment 1, 2026-10-15, on 7d1b3dc): PASS
0 failing scenarios, 0 app bugs. Evidence is on the `qa-evidence` branch (commit d5085ff).
- **Test bugs fixed:** each run now creates its own 2021-dated qa- lease, the deposit spec no longer reuses a settled lease, the test waits after Stripe's Back link, and the job-call budget is respected.
- **rent-payments:** 15 pass. Stripe test checkout went through the dev webhook, and a $1,700 payment was recorded as $500 deposit and $1,200 rent.
- **security-deposits:** 16 pass.
- **billing-jobs:** the admin run, 401s, summary, run again, ended lease, and **overlapping calls (200 and 409)** pass.
- **Regression:** lease-billing 13, leases 19, data-migrations, and the top-level pages all pass.
- **Not verified** (needs a current or future lease for a tenant, a second tenant, the job secret, or a real inbox): reminders, charging a fee and its notice, waive success, the 7-day payable window, upcoming leases, and the webhook edge cases. These are the top human tests.
- 3 job calls this cycle, 0 emails, 0 fees.

## Out-of-scope observations
- Medium: deleting a property deletes its leases even when they have recorded payments (QA saw a lease with a $400 deposit payment vanish with its `qa-` property). This bypasses the lease delete rule. Existing behavior, not from this change.
- Low: after Stripe Checkout's "Back" link, `/payment` is blank for a few seconds before the balance appears (QA cycle 3). It is not established whether the app or the redirect causes it.
- Low: the edit-lease page always says "A lease with recorded payments cannot be deleted..." even when the lease has none. Existing copy.

## QA report

QA report: add-lease-proration-and-deposits

- Deployed commit: `1763b66` on `develop` (dev site: https://lehman-realty-dev.web.app)
- QA cycle: 3 of 3, by a fresh independent QA agent (Sonnet), 2026-10-15, about 04:20 to 05:30 UTC
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

Ranked by risk. Production-only setup comes first.

1. **Daily job setup (high, required before late fees or emails work in production).**
   - Generate a secret and add it as `JOBS_SECRET` in the GitHub `production` (and `develop`) environment and in the 1Password `.env` item. Every `.env` needs the line, even empty, or the build fails.
   - Enable the Cloud Scheduler API and create the `daily-billing` job with the README command: 6:00 America/Indiana/Indianapolis, a bearer header, and the site's `/api/jobs/daily`.
   - Run it once with `gcloud scheduler jobs run`. Expect 200 and a `_jobs/daily/runs/{today}` record.
2. **Migration 0003 on production (high).** The deploy log shows the restore point and the leases updated. Leases have no deposit, a 5% late fee, 5 grace days and a late-fee start date of the deploy day. A lease that started mid-month and paid a full first month shows credit. The database must keep its backup schedule, or the migration refuses to run.
3. **Late fee end to end (high; not reachable in QA).**
   - On dev, create a lease for a tenant with no other lease, with the first month due a few days out and grace 0. Leave it unpaid.
   - After the grace period, run the job as an admin: one fee is charged and every tenant gets a late-fee email from Lehman Family LLC. A re-run changes nothing.
   - Checkout shows a "Late Fee" line first. **Waive** removes an unpaid fee.
4. **Reminders (high; not reachable in QA).** Rent due in 7 days and a deposit due that day: one reminder per tenant on that day and on the due day, none once paid, none for ended leases. Rent shows on `/payment` from 7 days before its due date.
5. **Upcoming lease with a deposit (medium).** It is listed on `/payment` and payable before move-in. A partial payment shows as held. Deleting the lease returns 409.
6. **Stripe (medium).** Production still uses a test-mode key (Known Gap). Check the "Security Deposit" and "Late Fee" Checkout lines and that the webhook records each part.
7. **Privacy and shared leases (medium).** Two tenants on one lease both get emails and see the shared balance. Another tenant sees none of it.
8. **Phone layout (low).** The lease form, the admin list with the settle form, the dashboard and `/payment` at about 390 px.
9. **Blank `/payment` after Stripe Back (low).** Judge whether the few-second blank page matters.

No other secrets or variables are needed. Several `qa-` properties with test payments remain on the dev site and can be removed by hand.
## Halted
(only if the run halted: stage, reason, evidence, next step for a human)

## Archive
Archived automatically on 2026-10-18 after the production release `82681f9` ([workflow run](https://github.com/rhit-LEHMANCB/svelte-property-management/actions/runs/39145552594)). That marks this lifecycle complete.
