# Tasks

## 1. Fees and records

- [ ] 1.1 Add `BANK_FEE_CENTS` and `oneTimeFeeCents(method, amountCents)` (server) plus a client-safe fee module in `src/lib/` with the same numbers; unit tests for card ($964.52 → $28.27, $600 → $17.70) and bank ($5.00 at any amount)
- [ ] 1.2 Add the `bank_payments` record type, `bankPaymentsRef`, `loadBankPayments`, `bankInFlightCents`, and forward-only transition helpers (`markBankPaymentPending`, `markBankPaymentSucceeded`, `failBankPayment`) in a new server module; unit/handler tests for every transition, including out-of-order and repeated events

## 2. Checkout

- [ ] 2.1 Accept and validate `method` in `create-checkout-session/payment`; set `payment_method_types` (`card` or `us_bank_account`), the method's fee line and description, and `paymentMethod`/`bankPaymentId` metadata on the session, payment intent and invoice
- [ ] 2.2 For bank, write the `started` record before returning the URL and use the success URL `/payment/success?bank={CHECKOUT_SESSION_ID}`
- [ ] 2.3 Cap the amount at `payableCents` (total minus autopay and bank in-flight); handler tests for card, bank, bad method, cap with pending payments, and no Cash App Pay/other types

## 3. Webhook

- [ ] 3.1 Handle `checkout.session.completed` (unpaid → pending with `startedDay`; paid → set `startedDay` only)
- [ ] 3.2 `invoice.payment_succeeded`: date the payment by the record's `startedDay`, compute the split at that time, mark the record succeeded in the same transaction
- [ ] 3.3 Handle `checkout.session.async_payment_succeeded` (succeeded only once the invoice is recorded) and `checkout.session.async_payment_failed` / bank `invoice.payment_failed` (fail with reason, then send emails)
- [ ] 3.4 Handler tests: pending, settle dated by start day with no late fee, redelivery, out-of-order events, failure, failure after success

## 4. Success page

- [ ] 4.1 `payment/success/+page.server.ts`: for `?bank=<session>`, verify the session belongs to the user and lease, then apply the pending transition; return whether it was a bank payment
- [ ] 4.2 Bank wording on `/payment/success` ("Lehman Family LLC" style, few business days, shows as processing); handler tests for own, someone else's, and non-bank sessions

## 5. Daily job and autopay

- [ ] 5.1 Late-fee hold: skip late fees while any `bank_payments` record on the lease is pending; test
- [ ] 5.2 `planAutopay` `otherInFlightCents` and `noticesFor` split subtract bank in-flight; tests ($1,000 owed, $600 pending → autopay charges $400)
- [ ] 5.3 Check records pending more than 7 days with Stripe and fail canceled/failed ones; warnings on errors; test
- [ ] 5.4 Retry unsent tenant/admin failure emails for failures within 7 days with a claim, at most once per group; tests

## 6. Emails

- [ ] 6.1 `renderBankPaymentFailedEmail` and `renderBankPaymentFailedAdminEmail` templates (signed "Lehman Family LLC"); send to the paying tenant and every admin user; unit tests for content

## 7. Payment page

- [ ] 7.1 Page load returns `payableCents`, lease-wide pending bank payments (amount, day) and the caller's own recent failure only
- [ ] 7.2 Replace the prompt with a payment dialog: amount, Card/Bank choice with live fees and total, validation against `payableCents`, posts `method`
- [ ] 7.3 Processing note, failure note, "Your balance is being paid." with the button disabled when nothing is payable
- [ ] 7.4 E2E spec (emulators) for the dialog: fees shown, method sent, over-cap rejected; processing note rendered from a seeded pending record

## 8. Wrap-up

- [ ] 8.1 Update the Known Gaps of `rent-payments` if any remain, run lint, check, unit, handler and e2e tests and build
- [ ] 8.2 Add the rollout notes (three `checkout.session.*` webhook events on dev and live endpoints; live ACH enabled) to the change's lifecycle and the production PR checklist
