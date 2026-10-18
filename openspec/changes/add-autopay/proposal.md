# Proposal

## Why

Tenants pay rent by hand through Stripe Checkout every month, and the checkout copy already promises that setting up auto-pay waives the transaction fee, which does not exist. Late rent costs the tenant a fee and costs the landlord chasing. The billing ledger, the payment order and the daily billing job (`add-lease-proration-and-deposits`, issue #161) now give autopay something to build on: one more step in the same daily run.

## What Changes

- **Enrollment.** On `/payment` a tenant saves a card or an ACH bank account (Stripe Checkout in setup mode) and turns autopay on or off for each lease they are on. Each tenant on a lease enrolls separately and sets their own amount; leaving it blank means whatever is owed.
- **Charging.** The daily job gets an autopay step after late fees. On a lease with rent, deposit or late fees due today or earlier, enrolled tenants are charged in enrollment order. Each is charged the smaller of their amount and what is still owed after the earlier charges, so a lease is never charged above its balance.
- **How a charge is made.** A Stripe invoice carrying the same metadata as a Checkout payment, paid off session with the tenant's saved method. The existing webhook records it (late fees, then deposit, then oldest rent), dated when the charge started.
- **Fees follow the payment method.** Cards pay 2.9% + $0.30 (changed to a flat 3% on 2026-10-18 by the owner, in `add-one-time-bank-payments`) added to the charge; ACH bank debit is free on autopay (the landlord absorbs it). The checkout line text "Set up auto-pay to waive this fee" is removed because autopay no longer waives anything for cards. One-time Checkout is otherwise unchanged.
- **Failures.** A failed charge moves to the next enrolled tenant in the same run, then retries on each of the next 3 daily runs. The tenant is emailed on each failure and when autopay gives up. Autopay stays on.
- **Reminders.** An enrolled tenant gets an "autopay will charge $X on <date>" email 7 days before the due date instead of the 7-day and due-day reminders. Other tenants on the lease keep the usual reminders.
- **Late fees.** A lease with a charge still pending (ACH takes days) is not charged late fees. A payment is dated when the charge started, so a slow settlement counts as on time. If the charge later fails, the tenant is emailed and the usual late-fee rules resume at the next run.
- **Safe to repeat.** A claimed charge record per lease, due date and tenant, deterministic Stripe idempotency keys, the daily-job lock and the webhook's recorded-invoice guard together prevent charging or recording twice.
- **Admin view.** The admin lease list shows who has autopay on (method and amount) and any pending or failed charge. The daily job summary lists autopay charges and failures.

## Capabilities

### New Capabilities
- `autopay`: saving a payment method, enrollment and amount per tenant and lease, the daily charge, fees by method, failures and retries, reminders and late-fee interaction, idempotency, and what admins see.

### Modified Capabilities
<!-- None as deltas. Autopay changes behavior of `billing-jobs` and `rent-payments`, but the unarchived change add-lease-proration-and-deposits owns the pending edits to those specs, so every autopay requirement lives in the new `autopay` spec to keep both archivable in any order. -->

## Impact

- **Code:** `src/lib/server/billingJob.ts` (autopay step, reminder replacement, late-fee skip), new `src/lib/server/autopay.ts`, new routes under `src/routes/api/autopay/`, the Stripe webhook (`invoice.payment_failed`, pending and succeeded state), `/payment` page and server load, the admin lease list, `email-templates.ts`, the checkout route's fee line text.
- **Data:** new `leases/{id}/autopay/{uid}` and `leases/{id}/autopay_charges/{dueDate-uid}` documents. Firestore rules already deny all client access, so no rules change. No migration.
- **Stripe:** Checkout setup mode, off-session invoices; ACH Direct Debit must be enabled in the Stripe dashboard (dev, later live); the webhook endpoint must also receive `invoice.payment_failed`. No new environment variables.
- **Ordering:** builds on the billing job and ledger from `add-lease-proration-and-deposits`, so that change must reach production first.
- **Tests:** unit tests for the charge plan and fee, handler tests for the new routes, job and webhook, an e2e spec against the fake Stripe.
