# Proposal

## Why

Leases are billed by whole calendar month and rent is always due on the 1st, so a lease that starts October 15 is charged a full October due before move-in, and one that ends March 14 pays all of March. There is also no way to take a security deposit (a deposit paid through `/payment` is recorded as rent) and no late fee for rent paid after the due date. Leases just shipped (the `add-leases` change), and both were left out of scope there; they are needed before the first real mid-month tenants are billed.

## What Changes

- **Proration, always on.** A first or last month that the lease covers only in part is charged rent × days occupied ÷ days in that month, counting the start and end days, rounded to the cent. Whole months bill as today. **BREAKING** for existing leases that start or end mid-month: their balances are recomputed.
- **Due dates.** The first month's rent is due on the lease start date; later months are due on the 1st.
- **Credit.** A month that has been paid more than it owes (existing leases recomputed with proration) leaves a credit on the lease that pays the oldest amount still owed. It is shown as "Credit"; nothing is refunded.
- **Security deposit.** A lease can have a deposit amount and a deposit due date (default: the start date). It can be paid in parts from the moment the lease is saved, including while it is upcoming. It is recorded separately from rent, never incurs a late fee, and cannot be lowered below what has been paid.
- **Late fees.** Each lease has a flat late fee (prefilled at 5% of rent) and grace days (default 5). A month whose rent is still unpaid more than the grace days after its due date incurs the fee once. The **daily billing job** charges and records it, and it is owed only from then. An admin can waive one month's fee.
- **Daily billing job.** Google Cloud Scheduler calls `POST /api/jobs/daily` at 6:00 Eastern in each environment (an admin can also run it). Each run charges late fees, catching up on missed days, and emails every tenant on the lease:
  - a late-fee notice when a fee is charged;
  - due-date reminders 7 days before and on the due date for unpaid rent and deposits.

  Each email is sent once. One run proceeds at a time, and each run leaves a summary.
- **Payable a week early.** A month's rent counts in the balance, and can be paid, from 7 days before its due date, the same day as its first reminder.
- **Paying.** `/payment` keeps one amount field, capped at the lease's total owed (late fees + unpaid deposit + rent − credit). The amount is applied to late fees, then the deposit, then rent oldest month first. Checkout shows a "Late Fee", "Security Deposit" and "Rent" line for each non-zero part, and the "Transaction Fee" (2.9% + $0.30) on the whole amount. The webhook records each part separately.
- **Deposit settlement.** After the end date, an admin records one settlement: the amount returned and itemized deductions kept (amount and reason). Returned plus kept must equal what is held. It can be corrected later. Refunds happen outside the app and are only recorded.
- **UI.** Lease create and edit forms gain deposit amount, deposit due date, late fee and grace days. The admin lease list shows deposit state ("Deposit to settle" for ended leases still holding one), late fees and credit, with a settle-deposit form and a waive action. The tenant lease card and `/payment` show deposit, late fees and credit; upcoming leases that owe a deposit appear on `/payment`.
- **Migration `0003`.** Sets every existing lease to no deposit, a late fee of 5% of rent, 5 grace days, and a late-fee start date of the migration date, so months already late are not charged a fee.
- Autopay is not part of this change; it is planned as the next change.

## Capabilities

### New Capabilities
- `lease-billing`: what a lease charges for rent over time: proration of partial months, due dates, credit from overpaid months, and late fees with grace periods and waivers.
- `billing-jobs`: the daily job that charges late fees and sends late-fee notices and due-date reminders.
- `security-deposits`: a lease's security deposit: its terms, payment, what is held, and its settlement when the lease ends.

### Modified Capabilities
- `leases`: the lease record gains deposit and late-fee terms; create and edit forms take them; a rent change re-prices unpaid months; deposit and late-fee payments also block deletion; the admin list and tenant card show deposit, late fees and credit.
- `data-migrations`: adds the migration that gives existing leases their billing terms.
- `rent-payments`: starting a payment and recording it now split one amount into late fees, deposit and rent; the balance and due date come from prorated rent, late fees, deposit and credit, and upcoming leases with a deposit owed are payable.

## Impact

- **Code:** `src/lib/server/payments.ts` and `balance.ts` (billing model), `leaseDates.ts` (`LeaseDoc` fields), `leaseForm.ts` and `leases.ts` (form fields, validation, delete rule, summaries), the checkout route and webhook under `src/routes/api/stripe/`, `/payment`, the dashboard lease card, the admin lease pages, and a new admin action route for waivers and settlements.
- **Data:** new fields on `leases/{id}`; new per-month fields in `payment_history`; new `deposit` and `late_fees` records under each lease. Migration `migrations/0003-lease-billing-terms.ts`.
- **Scheduling and email:**
  - New route `POST /api/jobs/daily`.
  - New private environment variable `JOBS_SECRET`, in the GitHub `develop` and `production` environments.
  - One Google Cloud Scheduler job per Firebase project, set up by a person with a documented `gcloud` command.
  - New reminder and late-fee emails, sent through the existing email provider.
- **Stripe:** new Checkout line names and invoice metadata (`lateFeeCents`, `depositCents`); no Stripe or Firebase console changes.
- **Tests:** unit tests for proration, allocation and late fees; handler tests for checkout, webhook, lease form and admin actions; migration test.
