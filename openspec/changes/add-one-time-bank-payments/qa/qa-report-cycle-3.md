# QA report: add-one-time-bank-payments (cycle 3 of 3)

- Deployed commit: `1573bf1` on `develop` (dev site: https://lehman-realty-dev.web.app). It includes the 3% card fee.
- Run at: 2026-10-18
- Result: **PASS**, 0 failing scenarios. Three test bugs (stale expected amounts in QA's own specs) were fixed and re-run green.

## The 3% card fee and the $5.00 bank fee
- The dialog shows "Fee 3% ($X.XX)" and the total for $333.33, $964.52, $600 and $20.
- Checkout's "Transaction Fee" line:

| Amount by card | Fee |
|---|---|
| $333.33 | $10.00 (rounded) |
| $964.52 | $28.94 |
| $600.00 | $18.00 |
| $20.00 | $0.60 |
| $1.50 | $0.05 (half cent rounds up) |
| $0.50 | $0.02 |
| $100.00, rent only | $3.00 |

- The `/payment` autopay copy says "cards include a transaction fee of 3%", and "2.9%" appears nowhere on the page.
- The bank fee is $5.00 at every amount, in the dialog and on Checkout.

Screenshots: `screenshots/rent-payments-card-fee-*.png`, `screenshots/rent-payments-dialog-fee-333_33.png`, `screenshots/rent-payments-autopay-copy-3-percent.png`, `screenshots/rent-payments-bank-account.png`.

## Every other changed scenario passed
- **rent-payments:** Valid amount, Card (cards and Apple Pay only), Bank account (US bank only), Missing or unknown method, Split across parts (late-fee line not covered), Rent only, Not the tenant's lease, Invalid amount, Amount above the balance, Fractional cents, Return pages, Over balance, Method choice with fees, Return from card and bank Checkout.
- **pending-bank-payments:** Checkout completed not settled, Processing note, Returned before the event, Not the tenant's session, Server only, Payable amount reduced, Failed bank payment ($5 Insufficient Funds), Settles ($10 Success account, about 50 seconds).
- **Regression:** tenant and admin pages load, signed-out redirects work, admin `/payment` shows no tenant data.

## Not covered by automation
- Failure emails.
- The late-fee hold, and fees resuming after a failure.
- Autopay with a pending bank payment, and the 3% on a real autopay card charge.
- Payment dated when started, and Recorded once.
- The lost-event check after 7 days.
- Late events.
- "Everything on its way" (no spare balance this cycle; passed in cycle 1).
- Co-tenant view.
- Microdeposits, real wallets, phones.

## Observations
- (info) `/payment` shows only the newest failure note per lease, so the earlier $5 failure and the new one appear as one note. This is intended.
- (low) Stripe test Checkout shows the merchant as "Sandbox". Check that the live business name reads "Lehman Family LLC".

## Payments made (test mode, lease `IopO2Aqo5Glp3aY5CVqX`)
- $1.00 by card, plus a $0.03 fee.
- $5.00 by bank (Insufficient Funds account): failed, nothing charged.
- $10.00 by bank (Success account): settled.
- Lease balance now $1,157.00. The old $50 cycle 1 payment is still processing and clears on the daily job's 7-day check.
