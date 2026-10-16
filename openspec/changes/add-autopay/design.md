# Design

## Context

See proposal.md for the why. The pieces this builds on:

- `runDailyJob` (`billingJob.ts`) takes a Firestore lock, then per lease charges late fees in a transaction (`chargeLateFees`) and sends notices using a claim-then-send pattern on `leases/{id}/notices` (`create` fails if claimed; stale claims are retried).
- `computeLedger` (`billing.ts`) gives `totalCents`, per-month rows with `dueDate`, `owedCents`, and `dueDate` of the earliest owed item. Rent is payable and counted 7 days early; `allocate` splits a payment late fees, deposit, oldest rent.
- Checkout creates an invoice with metadata `leaseID`, `propertyID`, `rentCents`, `depositCents`, `lateFeeCents`, `feeCents`. The webhook records `invoice.payment_succeeded` in one transaction, dated `invoice.created`, guarded by `leases/{id}/recorded_invoices/{invoiceId}`.
- Every user has a `stripeID` customer. Firestore client access is denied by rules; all data access is server-side with the admin SDK.
- Stripe requests pin API version 2023-10-16. E2E tests point the SDK at `tests/e2e/support/fake-stripe.mjs`.
- Another change, `add-lease-proration-and-deposits`, still has unarchived delta specs for `billing-jobs` and `rent-payments`.

## Goals / Non-Goals

**Goals:**
- Autopay is one more step in the existing run, reusing the ledger, `allocate`, the webhook and the notice claim pattern rather than a parallel billing path.
- No path can charge a lease twice or beyond its balance.

**Non-Goals:**
- Saved methods for one-time Checkout, refunds, admin-side enrollment, charging before a due date.
- A success email (the tenant sees the payment in `/payment`; Stripe receipts are not enabled).

## Decisions

**1. One new spec, no deltas on `billing-jobs` and `rent-payments`.** Those specs are still pending in the unarchived lease change; a delta against them would fail to archive if archived first. Alternative: wait for that change to archive. Rejected: it blocks the work on a human merge and makes the order fragile.

**2. Setup through Stripe Checkout in `setup` mode.** `payment_method_types: ['card', 'us_bank_account']`, customer = the user's `stripeID`, metadata `{leaseID, uid, amountCents}`, `success_url` = `/payment?autopay_session={CHECKOUT_SESSION_ID}`. The page then calls `POST /api/autopay/complete`, which retrieves the session (expanding `setup_intent.payment_method`), checks `metadata.uid` equals the caller, the caller is on the lease, and the session is complete, then writes the enrollment. Alternative: SetupIntent plus the Payment Element, which needs Stripe.js in the client and card forms in our UI. Checkout keeps card data and bank verification (instant verification or micro-deposit) on Stripe and needs no new client dependency. Because `complete` is idempotent and reads Stripe, a missed redirect is recoverable by returning to the same URL. For ACH, `us_bank_account` setup may finish with a method that is not yet verified; an unverified method that fails shows up as a charge failure and the normal retry and email path.

**3. Enrollment documents.** `leases/{id}/autopay/{uid}`: `paymentMethodId`, `type`, `brand`, `last4`, `amountCents | null`, `enrolledAt`. Charge order is `enrolledAt` ascending, then uid. Re-enrolling replaces the method but keeps `enrolledAt`. A setup session started before the current method was saved (`methodUpdatedAt`) cannot replace it, and turning autopay off writes `leases/{id}/autopay_off/{uid}` (`offAt`) so a session started before that cannot turn it back on (409); an old return link replayed from the browser history is the case this covers. Amounts are capped at $999,999.99. The payment method id is read only by server code; page data and admin data are built from a `publicEnrollment()` mapper that omits it.

**4. What is "due" and the cycle key.** From `computeLedger`, the amount due now is the sum of the owed late fees, deposit and rent rows whose due date is today or earlier (`dueNow`), capped at `totalCents`. Rent counted early (7 days before its due date) is in `totalCents` but not due, so it is never charged early. The **cycle key** is the latest due date among those due items: a new due date (next month's rent, a late fee) starts a new cycle, so a cycle that gave up does not stop autopay for later due dates, and the new cycle charges everything then overdue. An ended lease works the same way, and a tenant can enroll on any lease listed on `/payment`, including an ended one that still owes money.

**5. Charge record per cycle and tenant.** `leases/{id}/autopay_charges/{cycleKey}_{uid}`: `state` (`claimed | pending | succeeded | failed | gave-up`), `attempts`, `lastAttemptDay`, `claimedAt`, `amountCents`, `feeCents`, `invoiceId`, `error`. For each enrollee in order the planner (`autopay.ts`, pure and unit-tested) decides: skip if `succeeded`, `gave-up`, or `pending`; skip if it already attempted today; skip if `attempts >= 4`; otherwise it is eligible. It computes `remaining = dueCents - sum(amountCents of the lease's pending, live-claimed and succeeded-not-yet-recorded charges)`, with a charge attempt for `min(cap ?? remaining, remaining)`. `succeeded` charges are recorded by the webhook before the next run, so they are already out of `totalCents`; `pending` ones are subtracted. Alternative: a lease-level lock doc. Rejected, the per-tenant record gives the same exclusion and doubles as history.

**6. Making the charge.** Per attempt, using Stripe keys `autopay-{leaseId}-{cycleKey}-{uid}-{attempt}`-suffixed per call: create invoice items for the late fee, deposit and rent parts (`allocationParts(allocate(ledger, lease, cents))`, the same split as Checkout) and for the card fee; `invoices.create` with `collection_method: 'charge_automatically'`, `customer`, `default_payment_method`, `auto_advance: false`, metadata as Checkout's plus `autopay: 'true'`, `uid`; `finalizeInvoice`; `pay` with `off_session: true` and the payment method. The claim is created (`create`) first and moved to `claimed -> pending/failed/succeeded` after. A stale `claimed` record (older than the lock window) is reused with the same attempt number, so Stripe returns the earlier objects through the idempotency keys rather than creating new ones. Alternative: a bare PaymentIntent. Rejected because the webhook, metadata and recorded-invoice guard already work on invoices.

**7. Outcomes.** `pay` returning `paid` -> `succeeded` (webhook records; the job does not write payment history). Returning with the payment intent `processing` (ACH) -> `pending`. A thrown card error or `requires_*` status -> void the invoice, `failed`, and move to the next enrollee. The webhook handles two events beyond today: `invoice.payment_succeeded` also flips a charge record to `succeeded` in the same transaction that records the payment (looked up by invoice metadata `leaseID`, `cycleKey`, `uid`), and the new `invoice.payment_failed` marks a `pending` charge `failed`, voids the invoice, and enqueues the failure email for the next run (a flag on the record, sent through the notice claim pattern; the webhook sends no email itself, so a slow provider never fails the delivery).

**7a. Lost events and crashes.** Even on a lease with no enrollments left, a `pending` charge one day old or more is checked with Stripe at the start of each run; an invoice that is void or whose payment failed is marked failed exactly as `invoice.payment_failed` would (a paid one is left to the webhook). The webhook also fails a charge that is still `claimed` for the same invoice, so an event that arrives before the job records a decline is not lost. A crashed claim keeps its original amounts; if what is owed changed, or Stripe reports an idempotency conflict, it starts over with a new `resume` number (new keys). Enrollments are read again before every charge, so turning autopay off mid-run takes effect.

**8. Retries and giving up.** `attempts` counts days with a failed run, not tenants; trying the next enrollee in a run is the same attempt. Attempt 1 is the first run on or after the cycle's due date (`lastAttemptDay` guards a second run the same day); attempts 2 to 4 are the following daily runs. The fourth failure sets `gave-up` and sends the give-up email. A tenant who turns autopay off or a lease that clears stops the loop naturally, since the planner recomputes from the ledger.

**9. Fee by method.** `autopayFeeCents(type, amountCents)`: card `round(amount * 0.029 + 30)` (the number Checkout uses, now shared in one function), bank account 0. Stored as `feeCents` in metadata so the webhook records it with the first transaction exactly as for Checkout. The fee is added on top; the tenant's cap applies to the rent amount, not the fee. The checkout fee-line description loses the autopay sentence.

**10. Late fees and pending charges.** `chargeLateFees` already runs before autopay. It gains one read: if any charge record for the lease is `pending`, it returns the ledger without charging fees. Payment date: no change is needed, the webhook already dates a payment `invoice.created`, which is the charge start day, and `monthPaidByCents` counts a transaction by its date. Alternative: a "grace-by-method" window for ACH. Rejected: the invoice date rule is simpler and exactly matches "settlement counts as on time".

**11. Reminders.** `noticesFor` takes the lease's enrollees. For rent or deposit rows whose `reminderDay` is `7d`, an enrolled tenant gets `autopay-7d-{dueDate}` (amount: min of cap and owed, plus the card fee; "autopay will charge ..."), and the `rent-*`/`deposit-*` `7d` and `due` notices are not generated for that tenant. Notices are already per tenant (`{key}-{uid}`), so the filter happens per tenant when notices are expanded. Late-fee notices are unchanged. Failure and give-up emails use keys `autopay-failed-{cycleKey}-{attempt}` and `autopay-gave-up-{cycleKey}`.

**12. Admin view.** `loadPropertyLeases` summary data gains `autopay: {name, method, amountCents|null}[]` and `autopayStatus` (latest non-succeeded charge: state and day). The list shows them next to the lease. The job summary gets `autopayCharges: {leaseId, uid, amount, outcome}[]`, with failures also in `errors` when unexpected (declines are normal and not job errors).

## Risks / Trade-offs

- [Double charge if a claim and a Stripe call straddle a crash] → Claim first, deterministic Stripe idempotency keys per attempt, `pending` blocks later runs, and the amount is re-derived from the ledger each time. Stripe keeps keys 24 hours; retries are on later days with a new attempt number, and a leftover open invoice from a crash is voided by the next attempt before a new one is made.
- [ACH takes days, so a pending charge may hide a real lateness] → Late fees pause only while a charge is pending; a failure resumes them next run. ACH is typically 4 business days, bounded by the grace period behavior the owner chose.
- [Unverified ACH mandate or no mandate] → Setup Checkout collects the mandate; failures flow through the normal email and retry path.
- [Fee constants drift from Stripe pricing] → One shared function with a unit test; change in one place.
- [Tenant with two leases on one saved method] → Enrollment is per lease, so two enrollments can reference the same method; each lease is charged separately with its own record.
- [Spec archive] → All behavior is in the new spec, so archiving never conflicts with the pending lease change; code requires that change's code, which is already on `develop`.

## Migration Plan

1. Ship to `develop`; enable ACH Direct Debit in the dev Stripe account; add `invoice.payment_failed` to the dev webhook endpoint.
2. QA on the dev site with Stripe test cards and test bank accounts (Checkout setup flow); the charge step is driven by the admin-triggered daily run.
3. Before the production deploy: the same Stripe dashboard changes in the live account. No data migration; existing leases simply have no enrollments.
4. Rollback: revert the deploy. Enrollment and charge documents are ignored by older code; any invoices already created are recorded by the older webhook as it does for Checkout invoices.
