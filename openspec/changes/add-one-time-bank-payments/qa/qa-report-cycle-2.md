# QA report: add-one-time-bank-payments (cycle 2 of 3)

- Deployed commit: `07cf890` on `develop` (dev site: https://lehman-realty-dev.web.app)
- Run at: 2026-10-18
- Result: **PASS** (0 failing scenarios). Cycle 1's `environment` failure is resolved, now that the dev webhook delivers the `checkout.session.*` events.

## Scenarios
| Capability | Scenario | Result | Evidence |
|---|---|---|---|
| rent-payments | Valid amount ($600 card: Deposit $180, Rent $420, Fee $17.70) | pass | `screenshots/rent-payments-valid-amount.png` |
| rent-payments | Card ($964.52 gives a $28.27 fee, card only) | pass | `screenshots/rent-payments-card.png` |
| rent-payments | Bank account ($964.52 gives a $5.00 fee, US bank account only, no Cash App) | pass | `screenshots/rent-payments-bank-account.png` |
| rent-payments | Missing or unknown method gives 400 | pass | `screenshots/rent-payments-missing-or-unknown-method.png` |
| rent-payments | Split across parts (no QA lease owes a late fee) | pass, partly | `screenshots/rent-payments-split-across-parts.png` |
| rent-payments | Rent only | pass | `screenshots/rent-payments-rent-only.png` |
| rent-payments | Not the tenant's lease gives 403 | pass | `screenshots/rent-payments-not-the-tenant-lease.png` |
| rent-payments | Invalid amount, Amount above the balance, Fractional cents | pass | `screenshots/rent-payments-invalid-amount.png`, `screenshots/rent-payments-amount-above-the-balance.png`, `screenshots/rent-payments-fractional-cents.png` |
| rent-payments | Return pages (cancel goes to `/payment`; bank success URL carries `?bank=`) | pass | `screenshots/rent-payments-return-pages-cancel.png` |
| rent-payments | Over balance (dialog error, no request sent) | pass | `screenshots/rent-payments-over-balance.png` |
| rent-payments | Method choice with fees | pass | `screenshots/rent-payments-method-choice-with-fees.png`, `screenshots/rent-payments-method-choice-continues-bank.png` |
| rent-payments | Return from card Checkout / from a bank payment | pass | `screenshots/rent-payments-return-from-card-checkout.png`, `screenshots/pending-bank-payments-return-from-bank-checkout.png` |
| pending-bank-payments | Checkout completed, not settled; Processing note | pass | `screenshots/pending-bank-payments-checkout-completed-not-settled.png`, `screenshots/pending-bank-payments-processing-note.png` |
| pending-bank-payments | Payable amount reduced (dialog and server) | pass | `screenshots/pending-bank-payments-payable-amount-reduced.png` |
| pending-bank-payments | Returned before the event (no duplicate) | pass | `screenshots/pending-bank-payments-returned-before-the-event.png` |
| pending-bank-payments | Not the tenant's session | pass | `screenshots/pending-bank-payments-not-the-tenant-session-tenant.png`, `screenshots/pending-bank-payments-not-the-tenant-session-admin.png` |
| pending-bank-payments | Server only (Firestore REST 401/403) | pass | `screenshots/pending-bank-payments-server-only.png` |
| pending-bank-payments | Settles ($10 Success account: note clears, balance drops by exactly $10) | pass | `screenshots/pending-bank-payments-settles.png` |
| pending-bank-payments | Failed bank payment: Payment fails, and Failure note ($5 Insufficient Funds: failure note within about a minute, amount payable again, no fee) | pass | `screenshots/pending-bank-payments-failed-bank-payment.png`, `screenshots/pending-bank-payments-amount-payable-again.png` |
| pending-bank-payments | Everything on its way | not re-run (not enough spare test balance); passed in cycle 1 | cycle 1 evidence |
| regression | Tenant and admin pages, signed-out redirects, admin `/payment` | pass | `screenshots/regression-*.png` |

## Not covered by automation
- Dated when started, and the late-fee hold: needs the daily job and dated data.
- Autopay counting pending bank payments.
- Lost-event check after 7 days.
- Late and duplicate events.
- Failure emails: no inbox access.
- Co-tenant view: one QA tenant only.
- Microdeposits, real ACH timing, live mode, phones.

## Observations
- (low) The old $50 payment from cycle 1, on lease `IopO2Aqo5Glp3aY5CVqX`, stays "processing" until the daily job's 7-day check (from 2026-10-24). It is dev data only.
- (low) Stripe test-mode bank payments settle or fail in about a minute, which is not real ACH timing.
- (low) Stripe test Checkout shows the merchant name as "Sandbox". Check that the live account's business name reads "Lehman Family LLC".

## Payments made in cycle 2 (test mode, lease `IopO2Aqo5Glp3aY5CVqX`)
- Card: $1.00, succeeded.
- Bank, Insufficient Funds account: $5.00, failed, nothing charged.
- Bank, Success account: $10.00, settled.
- Final balance: $1,169.00.
