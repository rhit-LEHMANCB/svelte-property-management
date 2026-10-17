# QA report: add-one-time-bank-payments (cycle 1 of 3)

- Deployed commit: `07cf890` on `develop` (dev site: https://lehman-realty-dev.web.app)
- Run at: 2026-10-17, about 05:30 to 06:30 UTC
- Result: FAIL, 1 failing scenario group classified `environment`, no `app bug`

## Passed (with screenshots in `screenshots/`)
- rent-payments, every changed scenario:
  - Valid amount, Card ($964.52, fee $28.27, card only), Bank account (fee $5.00, US bank account only, no Cash App), Missing or unknown method (400), Split across parts (late-fee line not covered), Rent only.
  - Not the tenant's lease (403), Invalid amount, Amount above the balance, Fractional cents, Return pages.
  - Over balance (inline dialog error, no request sent), Method choice with fees, Return from a card Checkout, Return from a bank payment.
- pending-bank-payments:
  - Checkout completed, not settled (real test-mode bank payment shows "is processing", balance unchanged), Returned before the event, Not the tenant's session, Server only (Firestore REST 403).
  - Processing note (one tenant), Payable amount reduced (dialog and server), Everything on its way ("Your balance is being paid.", button disabled, server 400), Settles (note clears, balance drops; settlement took 1 to 3 minutes in test mode).
- Regression: tenant and admin pages load with no 5xx or page errors; signed-out redirects; admin `/payment`.

## Failure F1 (`environment`): failed bank payment never marked failed
- Steps:
  1. As the QA tenant, pay $50 by bank on "deposits QA Way" (`IopO2Aqo5Glp3aY5CVqX`).
  2. Use Stripe's "Test (Non-OAuth)" institution with its "Insufficient Funds" account.
  3. Return to `/payment` and keep reloading.
- Expected: the processing note becomes "Your bank payment of $50.00 started on 10/17/26 did not go through. The amount is still owed." and the full balance is payable again.
- Actual: still "is processing" after more than 15 minutes; the payable amount is still reduced by $50.
- Why `environment`: the success path worked on the same site. The failure path depends on `checkout.session.async_payment_failed`, and the dev webhook endpoint may not send it yet. QA could not read the Stripe dashboard to confirm. Screenshot: `screenshots/pending-bank-payments-failed-bank-payment.png`.

## Not covered by automation
- Late-fee hold while pending, and fees resuming after a failure: needs the daily job and a lease past its grace period.
- Autopay with a pending bank payment.
- Payment dated when started, and Recorded once: stored data that QA cannot read.
- Settled at once, Late events, and Lost event (7 days).
- Failure emails: no mailbox access, and the failure never happened (F1).
- Co-tenant view: only one QA tenant account exists.
- Microdeposit verification.
- Live mode, Apple Pay and Google Pay, and phones.

## Observations outside the specs
- Low: Stripe Checkout shows the merchant as "Sandbox", the test account's business name. Check that the live account shows "Lehman Family LLC".
- Low: no wallet button appeared on the card Checkout in headless Chromium, so "Apple Pay and Google Pay work too" was not verified.
- Info: test-mode ACH settles in 1 to 3 minutes, so the pending window on dev is short.

## Data
- QA completed real test-mode payments on dev: $1.00 by card, and bank payments of $1,499, $800, $300, $20, $600, $150 and $50 on the QA tenant's QA leases. All of them settled.
- Still pending: $50.00 (Insufficient Funds account) on `IopO2Aqo5Glp3aY5CVqX`.

## Recommended human tests
1. (high) Bank payment failure end to end:
   - Check the dev webhook endpoint subscribes to the three `checkout.session.*` events.
   - Repeat the Insufficient Funds payment, and check the pending $50 one in Stripe.
   - Expect the failure note, the full balance payable again, and one email to the tenant and one to each admin.
2. (high) Late fee and autopay with a pending bank payment, using the daily job.
3. (high) Payment dated the day it was started (stored transaction date, no late fee).
4. (medium) Co-tenant sees the same processing note and payable cap.
5. (medium) Microdeposit verification flow.
6. (low) Dialog layout on a phone, and wallets on the card Checkout.
7. (low) Live Stripe business name reads "Lehman Family LLC".
