# Design

## Context

Billing lives in two modules. `src/lib/server/payments.ts` enumerates months (`monthsOwed`), computes a balance (`computeBalance`) and splits a payment oldest month first (`allocatePayment`). `src/lib/server/balance.ts` loads the `payment_history/{year}` documents a lease needs (`loadHistories`, `loadLeaseBalance`). A month entry is `{ remainingBalance, transactions: [{ date, amount, fee? }] }` in dollars, and a month with no entry owes the full rent. The checkout route caps the amount at the balance. The webhook re-runs the allocation inside a Firestore transaction, writes the month entries and `recorded_invoices/{invoiceId}`, and is idempotent.

`remainingBalance` is written as "rent at the time minus what was paid". That cannot be re-priced: when proration or a rent change alters what a month is charged, the stored remainder is stale. Firestore rules deny all client access, and every read goes through the admin SDK on the server, so new subcollections need no rule changes.

## Goals / Non-Goals

**Goals:**
- One pure, synchronous function computes a lease's full billing state from the lease, its stored records and "now". The balance, the checkout split, the webhook allocation, the admin list and the tenant card all use it, so they cannot disagree.
- All arithmetic in integer cents. Dollars only at storage and display edges, as today.
- Existing data keeps working without a backfill of payment entries.

**Non-Goals:**
- No scheduled job: late fees are derived when the billing state is read, not written by a cron.
- No change to the two-checkouts-before-the-webhook gap (still a Known Gap).
- Autopay.

## Decisions

### 1. A billing ledger computed from records, not stored remainders
New module `src/lib/server/billing.ts` exports `computeLedger({ lease, histories, lateFees, deposit, now })`. It returns:
- per-month rows: `{ key, chargeCents, paidCents, dueDate }`;
- per-month late fees: `{ key, amountCents, paidCents, waived, dueDate, owedCents }`;
- deposit: `{ amountCents, dueDate, paidCents, owedCents, heldCents, settlement }`;
- `creditCents`, the owed parts `{ lateFeesCents, depositCents, rentCents }`, `totalCents` and `dueDate`.

`chargeCents` is the prorated rent. A month's `paidCents` is the sum of its `transactions[].amount`. For a legacy entry with a `remainingBalance` and no `transactions` array, it is `rent − remainingBalance`. Paying beyond a month's charge goes into a credit pool. The pool is applied to the oldest months still short of their charge, and the leftover is `creditCents`. `computeBalance` and `allocatePayment` become thin wrappers or are replaced. `monthsOwed` stays the month enumerator.

*Alternative:* keep `remainingBalance` authoritative and rewrite it with a migration whenever terms change. Rejected: every rent or date edit would need a re-pricing write, and recomputing existing leases fully (an interview decision) would be a one-off data rewrite that is hard to undo.

`remainingBalance` is still written by the webhook, as charge minus all paid, so the field stays meaningful for anyone reading the raw data. Nothing reads it except the legacy fallback above.

### 2. Proration on calendar-day strings
Lease dates are `YYYY-MM-DD` calendar days, so day counts are computed from the strings with UTC `Date` arithmetic. That avoids any time-zone shift. Only "today" and the month of a payment use the business time zone, as now.

For each month: covered days = from max(start, 1st) to min(end, last day), inclusive. Then `chargeCents = round(rentCents × days ÷ daysInMonth)`, which is exact for whole months. The first month's due date is the start date; later months are due on the 1st. A month enters the balance on its 1st, as today. An upcoming lease starting mid-month therefore shows its first month from the 1st, due on the start date.

### 3. Late fees derived at read time, recorded only when touched
Lease fields: `lateFee` (dollars), `graceDays`, `lateFeesFrom` (`YYYY-MM-DD`, set to the business date when a lease is created, and by the migration for existing leases).

A month is late when its due date ≥ `lateFeesFrom`, its deadline (due date + grace days) is before today, and what was paid toward it with transaction `date` on or before the deadline (business time zone), plus credit applied to it, is less than its charge. Credit counts as on time. Its late fee is then due on deadline + 1 day.

Records go in `leases/{id}/late_fees/{YYYY-MM}`: `{ amount, paid, transactions, waivedAt?, waivedBy? }`, written only when a fee is paid or waived. `amount` is fixed at the first write, from the lease's late fee at that moment. Before any write, the lease's current `lateFee` is used. A later change to the lease's fee therefore cannot make a paid fee overpaid. A waiver sets `waivedAt`/`waivedBy`, and the unpaid part stops being owed.

*Alternative:* write fees with a daily job. Rejected: there is no scheduler in this app, and adding one belongs with autopay.

### 4. Deposit terms on the lease, payments in one ledger document
Lease field `deposit: { amount, dueDate } | null`. Payments and settlement live in `leases/{id}/deposit/ledger`: `{ paid, transactions: [{ date, amount, invoiceId }], settlement: { returned, deductions: [{ amount, reason }], recordedAt, recordedBy } | null }`.

Held = paid − (returned + kept) when a settlement matches the amount paid. Otherwise held = paid, and an ended lease shows "Deposit to settle". Lowering `deposit.amount` below `paid` is refused in the lease form's validation.

### 5. One allocator for checkout and webhook
`allocate(ledger, amountCents)` returns `{ lateFees: [{ key, cents }], depositCents, rent: [{ key, cents, hasEntry }] }`. It fills late fees oldest first, then the unpaid deposit, then rent oldest month first. Anything left over goes to the last rent month, as today, and becomes credit.

Checkout calls it to build the line items and puts `lateFeeCents`, `depositCents`, `rentCents` and `feeCents` in the invoice metadata. The webhook recomputes the ledger at the invoice time inside the transaction and calls `allocate` again with the invoice total (rent + deposit + late-fee cents). The money is then placed against current state; if a fee was waived in between, nothing is lost. The fee is computed on the total. An invoice whose metadata has neither `depositCents` nor `lateFeeCents` (created before this change) goes to rent only.

The webhook transaction reads the lease, the year documents, every `late_fees` document for the months involved and the deposit ledger. It writes all of them plus `recorded_invoices` in one commit.

### 6. Admin actions as API routes
- `POST /api/lease/[leaseId]/late-fees/[month]/waive`: admin only; 404 for an unknown lease or a month with no fee charged.
- `PUT /api/lease/[leaseId]/deposit/settlement`: admin only; 409 before the lease ends; 400 with field errors when the amounts do not add up or a reason is missing.

Both follow the `getAdminUserDataOrError` pattern in `src/routes/api/lease/[leaseId]/+server.ts` and run in a transaction. The Leases tab calls them and reloads.

### 7. Lease form
`leaseForm.ts` gains `deposit`, `depositDueDate`, `lateFee` and `graceDays`. On the new-lease page, the late fee follows 5% of the rent until the admin types in the late-fee field (a client-side "touched" flag). `deleteLease` also refuses when `late_fees` or the deposit ledger has a payment.

### 8. Migration `0003-lease-billing-terms`
For each lease without a numeric `lateFee`, it sets `deposit: null`, `lateFee: round(rent × 0.05, 2)`, `graceDays: 5` and `lateFeesFrom: <business date of the run>`. Leases that already have the fields are skipped, so a re-run changes nothing. The undo is to delete those four fields from leases recorded in the summary, after redeploying the previous app version.

## Risks / Trade-offs

- [Existing mid-month leases change balance on deploy] → Intended (interview). The QA and human checklist cover a recomputed lease. Credit is shown, not lost.
- [Lateness uses transaction dates; a payment made on the deadline but recorded by a webhook the next day] → The transaction `date` is the invoice creation time, not the webhook time, so it counts as on time.
- [Credit counts as on time even when it comes from a later overpaid month] → Rare (payments go oldest first). Accepted to keep one simple rule.
- [Legacy entries without `transactions`] → Fallback to `rent − remainingBalance`, with a unit test. The add-leases migration copied entries with their transactions, so this is a defensive path.
- [Checkout split can differ from what the webhook records, if state changed in between] → The webhook is authoritative. Stripe line names describe the intent at checkout time. Documented in the spec scenario.
- [Ledger computation reads more documents per balance (late_fees, deposit)] → Two extra reads per lease (a collection query and one document). Fine at this app's scale.

## Migration Plan

1. Deploy runs migration `0003` after rules and before hosting (existing workflow). It needs the existing backup schedule only.
2. Rollback: follow `0003`'s undo steps, then redeploy the previous version. The previous code ignores the new fields and subcollections. Deposit and late-fee payments recorded in the meantime would read as nothing to the old code, and would need recording by hand from the `deposit` and `late_fees` documents.
