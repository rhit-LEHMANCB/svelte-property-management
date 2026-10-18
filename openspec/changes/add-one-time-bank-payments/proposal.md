# Proposal

## Why

ACH Direct Debit and Cash App Pay were turned on in Stripe for autopay, so one-time Stripe Checkout payments now offer them too. The app still adds the card fee to every one-time payment, so a tenant paying $964.52 by bank was charged a $28.27 card fee on dev. An ACH payment also takes several business days to settle. The app records a payment only when it settles, so during those days the balance still looks owed, a tenant (or a co-tenant) can pay it again, and the daily job can charge a late fee. Autopay already handles all of this for its own ACH charges; one-time payments do not.

## What Changes

- The "Make a Payment" modal asks for the amount and a payment method: **Card** (fee 3%, which includes Apple Pay and Google Pay) or **Bank account** (flat $5.00 fee). Each option shows its fee for the amount entered.
- `POST /api/stripe/create-checkout-session/payment` takes a `method` (`card` or `bank`). Each Checkout session is restricted to that method (`card` or `us_bank_account`), so Cash App Pay and any other method are never offered and the fee always matches how the tenant pays. The fee is a "Transaction Fee" line on top of the amount. Bank accounts can be verified by instant login or microdeposits (Stripe's default).
- A one-time bank payment that completes in Checkout but has not settled is kept as a **pending** record on the lease. While it is pending:
  - `/payment` shows "A bank payment of $X started on <date> is processing" to every tenant on the lease.
  - The most anyone can pay on the lease drops by the amounts already on their way, in the modal and on the server. That covers pending one-time bank payments and autopay charges in flight.
  - The daily job charges no late fee on the lease, as it does for pending autopay ACH.
  - Autopay and its notices treat the payment as money already on its way.
- When it settles, the payment is recorded as paid on the day the tenant started it, so a payment started within the grace period is on time.
- When it fails, the record is marked failed. The paying tenant and every admin user are emailed (a failed email is retried by the daily job), `/payment` shows the paying tenant a failed note for a few days, and the full balance is payable again. Late-fee rules resume from the next daily run.
- The webhook handles `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` in addition to `invoice.payment_succeeded`. The daily job checks a pending payment with Stripe after a few days in case an event was lost.
- `/payment/success` tells a tenant who paid by bank that the payment takes a few business days to complete.

- The card fee changes from 2.9% + $0.30 to a flat 3%, for one-time card payments and autopay card charges alike (owner's decision, 2026-10-18, issue #169). On card payments under about $30, 3% is less than Stripe's fee, and the business absorbs the difference.

## Capabilities

### New Capabilities
- `pending-bank-payments`: the lifecycle of a one-time bank payment from Checkout to settlement or failure, covering the pending record, what it holds off (double payment, late fees, autopay), how it is dated when it settles, and the failure emails.

### Modified Capabilities
- `rent-payments`: "Start a payment" takes a payment method, charges that method's fee (card 3%, bank $5.00), restricts Checkout to it, and caps the amount at the balance minus payments on their way. "Client-side amount limits" adds the method choice and the same cap. "Payment confirmation page" adds the bank wording. Dating, late fees and the other pending behavior live in `pending-bank-payments`, which leaves the "Record payments" and "Real balance" requirements, also modified by `add-lease-proration-and-deposits`, untouched.

## Impact

- Code: `src/routes/api/stripe/create-checkout-session/payment/+server.ts`, `src/routes/api/stripe/webhook/+server.ts`, `src/routes/(authenticated)/payment/+page.svelte` and `+page.server.ts`, `src/routes/(authenticated)/payment/success/+page.svelte`, `src/lib/server/autopay.ts` (fee helpers), `src/lib/server/billingJob.ts` (late-fee hold, in-flight amounts, failure-email retries), `src/lib/server/autopayCharge.ts` (amount available to charge), `src/lib/server/email-templates.ts`. New server module for one-time bank payment records.
- Data: new server-only Firestore subcollection `leases/{leaseId}/bank_payments/{paymentId}`. Firestore rules already deny all client access.
- Stripe: both webhook endpoints (dev and live) must also send `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`. ACH Direct Debit must be enabled in live (in progress). No new environment variables.
- Specs: builds on the in-flight `add-lease-proration-and-deposits` (its "Start a payment" text) and `add-autopay` (pending autopay charges) changes.
- Release: release PR #157 still carries today's interim behavior (bank offered with the card fee) if it merges before this change reaches production.
