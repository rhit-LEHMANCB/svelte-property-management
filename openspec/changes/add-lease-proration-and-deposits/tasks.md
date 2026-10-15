# Tasks

## 1. Lease billing terms in the data model

- [x] 1.1 Add `deposit: { amount, dueDate } | null`, `lateFee`, `graceDays` and `lateFeesFrom` to `LeaseDoc` (`src/lib/server/leaseDates.ts`) and types for the `late_fees/{YYYY-MM}` and `deposit/ledger` documents; verify `npm run check` passes
- [x] 1.2 Add migration `migrations/0003-lease-billing-terms.ts` (no deposit, late fee 5% of rent, 5 grace days, `lateFeesFrom` = run date; skip leases that already have `lateFee`; undo steps); verify `tests/unit/migrations.test.ts` passes, with new cases for a fresh lease, a re-run and an already-migrated lease

## 2. Billing ledger

- [x] 2.1 Add day-count proration in `src/lib/server/billing.ts` (charge per month, due dates: start date for the first month, the 1st after); verify unit tests in `tests/unit/billing.test.ts` for the Oct 15–Mar 14, single-month, leap-year and whole-month scenarios
- [x] 2.2 Compute paid per month from `transactions`, with the legacy `rent − remainingBalance` fallback, and the credit pool applied oldest first; verify unit tests for the recomputed existing lease ($677.42 credit), credit larger than owed, and a legacy entry
- [x] 2.3 Derive late fees (due date ≥ `lateFeesFrom`, deadline = due + grace, on-time payments by transaction date, credit counts as on time, fixed `amount` once recorded, waivers); verify unit tests for unpaid after grace, paid within grace, paid after the fee, before the start date, waived, and fee 0
- [x] 2.4 Compute deposit owed, paid, held and settlement state ("to settle" when ended and unsettled or mismatched); verify unit tests for upcoming, partial, settled and paid-after-settlement
- [x] 2.5 Compute totals, the rent, deposit and late-fee breakdown, and the earliest due date; replace `computeBalance` and `loadLeaseBalance` callers with a `loadLeaseLedger` that also reads `late_fees` and `deposit/ledger`; verify existing balance tests are updated and `npm run test:unit` passes
- [x] 2.6 Add `allocate(ledger, amountCents)` (late fees oldest first, then deposit, then rent oldest first, leftover to the last rent month); verify unit tests for the $600 split example and a waived fee

## 3. Checkout and webhook

- [x] 3.1 Build checkout line items from `allocate` ("Late Fee", "Security Deposit", "Rent" when greater than 0, "Transaction Fee" on the total) and metadata `lateFeeCents`, `depositCents`, `rentCents`, `feeCents`; cap at the ledger total; verify handler tests in `tests/handlers/rent-payments.test.ts` for split, rent-only and over-balance
- [x] 3.2 Rewrite webhook recording to recompute the ledger in the transaction and write `payment_history`, `late_fees` and `deposit/ledger` from `allocate`, setting `remainingBalance` to charge minus all paid; pre-change invoices go to rent only; verify handler tests for the split, a waived fee before recording, a redelivery, a legacy invoice and a write failure

## 4. Leases: form, delete, admin actions

- [x] 4.1 Add deposit amount, deposit due date (default start date), late fee and grace days to `leaseForm.ts` validation and the create and edit pages, with the late fee following 5% of the rent until edited, and refuse lowering the deposit below what is paid; verify `tests/handlers/leases.test.ts` cases for valid terms, invalid terms and a lowered deposit
- [x] 4.2 Set `lateFeesFrom` to the business date when a lease is created; verify a handler test
- [x] 4.3 Make `deleteLease` refuse when `late_fees` or `deposit/ledger` has a payment; verify a handler test for a deposit-only payment returning 409
- [x] 4.4 Add `POST /api/lease/[leaseId]/late-fees/[month]/waive` (admin only, transactional); verify handler tests for waive, tenant 403 and unknown month 404
- [x] 4.5 Add `PUT /api/lease/[leaseId]/deposit/settlement` (admin only, after end date, amounts must add up, reasons required, replaces an earlier settlement); verify handler tests for settled, mismatch, missing reason, lease not ended 409, correction and tenant 403
- [x] 4.6 Show balance, credit, deposit state ("Deposit to settle"), late fees with a Waive button, and a settle-deposit form on the admin Leases tab; verify `npm run check` and a manual check in the dev server

## 5. Tenant pages

- [x] 5.1 Show owed, the rent, deposit and late-fee breakdown, credit and the earliest due date per lease on `/payment`, including upcoming leases that owe a deposit; verify a handler or load test for an upcoming lease with a deposit and for the breakdown
- [x] 5.2 Add the deposit, late-fee terms and credit to the tenant lease card, and a past-leases section for ended leases with a deposit (held or settlement with deductions); verify a load test that another tenant's lease is not shown
- [x] 5.3 Use "Lehman Family LLC" in any new user-facing copy and remove nothing about autopay; verify by grep that no new copy says "Lehman Family Realty" or "Lehman Realty"

## 6. Docs and specs housekeeping

- [x] 6.1 Document the billing model (proration, credit, late fees, deposit records) and migration 0003 in the README; verify the README section names the new documents and fields
- [x] 6.2 Run `npm run lint`, `npm run check`, `npm test`, `npm run test:e2e` and `npm run build`; verify all pass
