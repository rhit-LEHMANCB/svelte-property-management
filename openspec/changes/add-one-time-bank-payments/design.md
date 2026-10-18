# Design

## Context

One-time payments use Stripe Checkout in payment mode with `invoice_creation`. The webhook records a payment on `invoice.payment_succeeded` from the invoice metadata (`leaseID`, the split parts, `feeCents`), inside one Firestore transaction guarded by `leases/{id}/recorded_invoices/{invoiceId}`. Checkout sets no `payment_method_types`, so it offers every method enabled in the Stripe dashboard, including ACH and Cash App Pay since autopay shipped. It always adds the card fee (`cardFeeCents`).

Autopay (`add-autopay`) already models ACH settlement for its own charges: `leases/{id}/autopay_charges` with `pending`, a late-fee hold in `chargeLateFees` (`hasPendingCharge`), `inFlightCents` for planning and notices, a daily check of stale pending charges, and failure emails sent by the daily job with retries. This change gives one-time bank payments the same treatment, reusing those patterns.

## Goals / Non-Goals

**Goals:** card or bank choice with the right fee; Checkout restricted to the chosen method; a pending one-time bank payment is shown, capped against, holds late fees and autopay, and is dated by its start day; failures are recorded and emailed to the tenant and admins.

**Non-goals:** changing the card or autopay fees; refunds or ACH return fees; admin UI for one-time pending payments; any change to card payments beyond `payment_method_types: ['card']`.

## Decisions

### 1. Method and fee
- The request body gains `method: 'card' | 'bank'`; anything else is 400.
- `src/lib/fees.ts` (client-safe, no server imports) holds `cardFeeCents` (a flat 3%, rounded to the cent; it was 2.9% + $0.30 until the owner's decision on 2026-10-18, issue #169), `BANK_FEE_CENTS = 500` and `oneTimeFeeCents(method, amountCents)`. The server and the dialog both use it, so the fees always match; `src/lib/server/autopay.ts` re-exports `cardFeeCents`.
- Card: `payment_method_types: ['card']`. Stripe shows Apple Pay and Google Pay under the card type; Cash App Pay and bank are excluded.
- Bank: `payment_method_types: ['us_bank_account']`, with no `verification_method` set (Stripe's default allows instant or microdeposits).
- Both keep `setup_future_usage: 'on_session'`. The fee line is named "Transaction Fee" with the description "Transaction fee for one-time card payment." or "Transaction fee for one-time bank payment.".
- Metadata on the invoice, the session and the payment intent: `paymentMethod: 'card' | 'bank'`. For bank, also `bankPaymentId`, a random id generated per session (see 2), so every Stripe object leads back to the record.

**Alternative rejected:** leaving `payment_method_types` unset and computing the fee after the tenant picks a method in Checkout. Checkout cannot change line items after the method is chosen.

### 2. Record: `leases/{leaseId}/bank_payments/{bankPaymentId}`
```
{ uid, amountCents, feeCents, state: 'started'|'pending'|'succeeded'|'failed',
  createdAt, startedAt: ISO | null, startedDay: 'YYYY-MM-DD' | null, invoiceId?, paymentIntentId?,
  error?, failedDay?, tenantEmailedAt?, adminsEmailedAt?, tenantEmailClaim?, adminsEmailClaim?, updatedAt }
```
- Written as `started` when the bank session is created (and deleted again if Stripe refuses the session); it holds nothing off yet. A `started` record more than 2 days old is an abandoned Checkout (sessions expire after 24 hours), and the daily job deletes it.
- State only moves forward: `started → pending → succeeded|failed` or `started → succeeded|failed`. Every transition is a transaction that reads the current state, so out-of-order events (Stripe does not guarantee order) never move a record backward, and repeats change nothing.
- `startedAt` is the moment of the session's completion and `startedDay` its business day (`businessToday`). Both are set by whichever of the completion event or the success page gets there first.
- `pending` and `failed` are the states the UI and jobs read. Firestore rules already deny all client access (`match /{document=**} { allow read, write: if false; }`).

A one-time card payment gets no record: it settles at once, as today.

### 3. Getting to pending
- **Webhook `checkout.session.completed`**: when the session metadata has `bankPaymentId` and `leaseID`, look up the record. If `payment_status` is `unpaid`, set `pending` with `startedDay` and the payment intent id. If `paid`, leave the record to the invoice webhook (which marks it `succeeded`), but still set `startedDay`.
- **Success page**: the bank success URL is `/payment/success?bank={CHECKOUT_SESSION_ID}`. Its `+page.server.ts` retrieves the session from Stripe and checks that `customer` equals the signed-in user's `stripeID` and that the metadata names a `bankPaymentId` and a lease the user is on. It then applies the same transition as the webhook, sharing one function. So `/payment` shows the processing note right away, even if the webhook is slow or not configured yet.
- Microdeposit sessions complete with `payment_status: 'unpaid'` too, so they are pending while verification waits.

### 4. Settling
- `invoice.payment_succeeded` is unchanged, except:
  - When the invoice metadata has `bankPaymentId` and the record has a `startedAt`, the payment's transaction date is that moment instead of `invoice.created`. The ledger used for the split is computed at that time too.
  - In the same transaction it marks the record `succeeded` (unless it is already `failed`, which is logged as an error and still recorded, because the money did arrive).
  - The existing `recorded_invoices` guard keeps it idempotent.
- `checkout.session.async_payment_succeeded`: only fills `startedAt`/`startedDay` if they are missing. The state is left to `invoice.payment_succeeded`. The payable cap and late-fee hold must not drop before the payment is in the ledger, so a record leaves `pending` only through the invoice webhook, or through failure.
- **Open question resolved by design, not by docs:** the Stripe docs do not say whether Checkout creates the post-payment invoice at session completion or only after an async payment succeeds. Either way works here. Recording still keys off `invoice.payment_succeeded`, and dating comes from the record, not the invoice. During QA on dev the order of events is observed and noted.

### 5. Failing
- `checkout.session.async_payment_failed` → `failBankPayment(record, reason)`: from `started`/`pending` to `failed` with `failedDay` and `error`. The reason comes from the payment intent's `last_payment_error.message` when it can be retrieved, otherwise "The bank payment did not go through". It then tries to send the emails (6).
- `invoice.payment_failed` with `bankPaymentId` in metadata is handled the same way, in case Checkout's invoice ever reaches it. Non-autopay, non-bank invoices are still ignored.
- The daily job checks records `pending` for 7 days or more (`startedDay + 7 <= today`). It retrieves the payment intent: `succeeded` is left to the webhook, `processing`/`requires_action` stays pending, and `requires_payment_method`/`canceled` is failed. Errors become run warnings.

### 6. Emails
- New templates in `email-templates.ts`: `renderBankPaymentFailedEmail` (tenant) and `renderBankPaymentFailedAdminEmail` (admin). Both are signed "Lehman Family LLC" and sent from `EMAIL_FROM`.
- Admins are `users` where `permissions == 'admin'`, each at their `email`.
- Sending is first tried right after the failure is recorded (webhook). `tenantEmailedAt` and `adminsEmailedAt` are each set after a successful send. The daily job retries unsent groups for failures within the last 7 days.
- A claim field set in a transaction before sending (`tenantEmailClaim`/`adminsEmailClaim` with a timestamp, treated as stale after 10 minutes), like the autopay notices, stops the webhook and the job from both sending. If a send succeeds but the stamp write fails, a duplicate is possible and accepted, as for autopay.
- When some admin sends fail, `adminsEmailedAt` is not set, and a retry resends to all admins. This is accepted for simplicity; admins are few.

### 7. In-flight amount everywhere
- New `bankInFlightCents(records)` sums `pending` records' `amountCents`. One loader, `loadBankPayments(leaseRef)`, mirrors `loadCharges`.
- **Payable cap**: `payableCents = max(0, ledger.totalCents − inFlightCents(autopayCharges) − bankInFlightCents(bankPayments))`. The page load returns it, and the Checkout endpoint rejects `amountCents > payableCents` with 400. The displayed balance stays `ledger.totalCents`.
- **Late-fee hold**: `chargeLateFees` reads `bank_payments where state == 'pending'` in its transaction next to `hasPendingCharge`, and skips fees when either is non-empty.
- **Autopay**: `planAutopay` gains an `otherInFlightCents` input (the bank in-flight sum), subtracted from `remaining`. `noticesFor` subtracts it in its `projectedSplit` too.

### 8. UI
- The "Make a Payment" prompt modal is replaced by a component modal (`src/lib/Components/Payments/PaymentDialog.svelte`, through the modal store's `component` type): an amount input plus a two-option radio group, "Card: Fee 2.9% + $0.30 ($X.XX)" and "Bank account: Fee $5.00". The fees update as the amount changes, and the total for the chosen method is shown. The dialog validates against `payableCents` and shows problems inline; the page checks again with the zod schema before calling the server.
- Lease card: for each `pending` record, "A bank payment of $X started on <date> is processing." (`role="status"`). For the caller's own `failed` record with `failedDay` within 7 days: "Your bank payment of $X started on <date> did not go through. The amount is still owed." When `payableCents` is 0 while the balance is above 0: "Your balance is being paid." and the button is disabled.
- The page load returns only what each tenant may see: amounts, days and states. It never returns another tenant's uid, error text or emails.

## Risks / Trade-offs

- **The webhook endpoints miss the new events** → the success page still creates the pending record. Failures are then caught only by the 7-day check, and emails are late. Rollout step: add the three `checkout.session.*` events to both endpoints before production.
- **Tenant closes the tab before the success page and the webhook lacks events** → nothing shows as pending until it settles (today's behavior). Mitigated by the rollout step.
- **Dating by start day** lets a payment that later settles count as on time. Intended; it matches autopay.
- **The interim behavior ships with #157** if that merges first. Accepted by the user.

## Migration Plan

No data migration: the collection is new and starts empty. Deploy order: add the webhook events in the dev Stripe dashboard (they are already allowed by the code's `default` branch), merge to develop, QA, then add the events to the live endpoint before merging to production. Rollback: revert the PR; existing records are ignored by the old code.
