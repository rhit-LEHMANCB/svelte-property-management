# autopay Specification

## Purpose
Tenants save a card or ACH bank account and turn on autopay per lease; the daily billing job charges it when money is due, with fees by payment method, retries, reminders, and no double charges or wrong late fees.

## Requirements

### Requirement: Save a payment method and enroll
The system SHALL let a signed-in tenant save a card or ACH bank account through Stripe Checkout in setup mode and enroll it for a lease they are on, with an optional amount, via `POST /api/autopay/setup` and `POST /api/autopay/complete`.

#### Scenario: Start setup
- **WHEN** a tenant supplies a `leaseId` they are on and an optional amount greater than 0 with at most two decimal places
- **THEN** a Checkout session in setup mode is created for their Stripe customer allowing card and bank account, carrying the lease, the user and the amount in its metadata, and its URL is returned

#### Scenario: Not the tenant's lease or bad amount
- **WHEN** the lease is missing, unknown or not the tenant's, or the amount is not a positive number with at most two decimals
- **THEN** the response is 403 or 400 respectively and no session is created

#### Scenario: Complete enrollment
- **WHEN** the tenant returns from a completed setup session that they started
- **THEN** `leases/{id}/autopay/{uid}` is saved with the payment method, its type (`card` or `us_bank_account`), brand and last four digits, the amount (or none) and the enrollment time, and the response shows only the display details

#### Scenario: Someone else's or unfinished session
- **WHEN** the session was started by another user, names a lease the user is not on, or is not complete
- **THEN** nothing is saved and the response is 403 or 400

#### Scenario: Completing twice
- **WHEN** the same session is completed again
- **THEN** the enrollment is unchanged, including its original enrollment time

#### Scenario: Payment method details stay server-side
- **WHEN** any client-facing response or page data describes an enrollment
- **THEN** it contains the type, brand, last four digits and amount, never the Stripe payment method id

### Requirement: Change or end autopay
The system SHALL let a tenant change the amount of, or turn off, their own enrollment on a lease via `PATCH /api/autopay` and `DELETE /api/autopay`.

#### Scenario: Change amount
- **WHEN** a tenant with an enrollment sends a valid new amount or `null` for the full balance
- **THEN** the amount is saved and later charges use it

#### Scenario: Turn off
- **WHEN** a tenant turns off autopay for a lease
- **THEN** their enrollment is removed and no further charge is made for them, while charges already pending stay recorded

#### Scenario: Only your own
- **WHEN** a tenant targets a lease they are not on, or has no enrollment on it
- **THEN** the response is 403 or 404 and nothing changes; another tenant's enrollment on the same lease is never touched

### Requirement: Tenant autopay controls
The system SHALL show on `/payment`, for each lease listed, the tenant's autopay state and controls.

#### Scenario: Not enrolled
- **WHEN** the tenant has no enrollment on a lease
- **THEN** the lease shows an amount field (blank means the whole balance) and a "Set up autopay" button

#### Scenario: Enrolled
- **WHEN** the tenant is enrolled
- **THEN** the lease shows the method (for example "Visa ending 4242" or "Bank account ending 6789"), the amount or "Full balance", actions to change the amount or turn autopay off, and the state of any pending or failed autopay charge

### Requirement: Autopay charge in the daily job
The system SHALL, after charging late fees in each daily run, charge enrolled tenants on every lease that has money due, in enrollment order.

#### Scenario: Charge on the due date
- **WHEN** a lease has rent due today with a balance owed and one tenant is enrolled with no amount
- **THEN** that tenant is charged what the lease owes, as a Stripe invoice paid with their saved method, and the webhook records it against the lease

#### Scenario: Amount cap and next tenant
- **WHEN** two tenants are enrolled, the first with amount $300 and the second with no amount, and $1,000 is owed
- **THEN** the first is charged $300 and the second $700

#### Scenario: Never above the balance
- **WHEN** the earlier charges in the run, or charges still pending, already cover what is owed
- **THEN** no further charge is made, and a charge never exceeds what is still owed

#### Scenario: Nothing due
- **WHEN** nothing is owed, or the earliest unpaid item is not due yet
- **THEN** no charge is made; rent payable early (7 days before its due date) is not charged early

#### Scenario: Ended lease
- **WHEN** a lease has ended but still owes rent or fees
- **THEN** enrolled tenants are still charged what is owed

#### Scenario: Minimum charge
- **WHEN** the amount to charge is below $0.50
- **THEN** no charge is made

#### Scenario: One lease fails
- **WHEN** charging one lease fails unexpectedly
- **THEN** the error is added to the run summary and the other leases are still processed

### Requirement: Transaction fee by payment method
The system SHALL add a transaction fee to an autopay charge by payment method type.

#### Scenario: Card
- **WHEN** the saved method is a card
- **THEN** a "Transaction Fee" line of 3% of the amount, rounded to the cent, is added, and `feeCents` is in the invoice metadata

#### Scenario: Bank account
- **WHEN** the saved method is an ACH bank account
- **THEN** no fee line is added

#### Scenario: Checkout copy
- **WHEN** a tenant starts a one-time Checkout payment
- **THEN** the "Transaction Fee" line no longer says that auto-pay waives it

### Requirement: Charges happen once
The system SHALL make at most one charge per lease, due date, tenant and attempt, and record each paid invoice once.

#### Scenario: Re-run on the same day
- **WHEN** the job runs again after a successful or pending charge
- **THEN** no second invoice is created

#### Scenario: Overlapping runs
- **WHEN** two runs start at once
- **THEN** the lock lets one proceed, and if both reach a charge, only the run that creates its claim record (`autopay_charges/{dueDate-uid}`) charges; the Stripe requests also use keys derived from the lease, due date, tenant and attempt number

#### Scenario: Crash after claiming
- **WHEN** a run claimed a charge but died before the invoice was paid
- **THEN** the next run, once the claim is stale, continues with the same Stripe keys and does not produce a second invoice

#### Scenario: Webhook redelivery
- **WHEN** `invoice.payment_succeeded` for an autopay invoice is delivered again
- **THEN** nothing is recorded again (the existing recorded-invoice guard)

#### Scenario: Payment dated at charge time
- **WHEN** an ACH autopay invoice settles days after it was created
- **THEN** its payment is recorded with the date the invoice was created, so rent paid by the end of the grace period counts as on time

### Requirement: Pending and settled state
The system SHALL track each autopay charge as pending, succeeded or failed on its charge record.

#### Scenario: Card success
- **WHEN** the invoice is paid at once
- **THEN** the charge is marked succeeded when the webhook records it

#### Scenario: ACH in progress
- **WHEN** the invoice payment is still processing
- **THEN** the charge is marked pending until `invoice.payment_succeeded` or `invoice.payment_failed` arrives

#### Scenario: Pending ACH fails
- **WHEN** `invoice.payment_failed` arrives for a pending autopay charge
- **THEN** the charge is marked failed, the tenant is emailed, and the failure counts as an attempt for retries

### Requirement: Failures and retries
The system SHALL handle a failed autopay charge by trying the next enrolled tenant, retrying on later days and emailing the tenant.

#### Scenario: Card declined
- **WHEN** a charge fails at once
- **THEN** the open invoice is voided, the charge is marked failed, the tenant is emailed that the charge failed and when it will retry, and the next enrolled tenant is tried in the same run

#### Scenario: Retries
- **WHEN** a charge failed on its due date
- **THEN** each of the next 3 daily runs retries it (attempts 2 to 4) while money is still owed, and the tenant is emailed on each failed retry

#### Scenario: Giving up
- **WHEN** the fourth attempt fails
- **THEN** the tenant is emailed that autopay has stopped for this payment and they must pay on `/payment`, no more attempts are made for that due date, and autopay stays on for later due dates

#### Scenario: Paid by hand meanwhile
- **WHEN** the balance is cleared between attempts
- **THEN** no retry is made

#### Scenario: Email problems
- **WHEN** a failure email cannot be sent
- **THEN** it is retried on the next run with the existing claim pattern and the charging is unaffected

### Requirement: Reminders for autopay tenants
The system SHALL send an enrolled tenant an autopay notice 7 days before a due date instead of the usual reminders for it.

#### Scenario: Notice
- **WHEN** a lease has rent or a deposit due in 7 days with a balance owed and a tenant is enrolled
- **THEN** that tenant gets one email saying autopay will charge the amount on the due date (the smaller of their amount and what is owed, plus the card fee for a card), instead of the 7-day and due-day reminders

#### Scenario: Others unaffected
- **WHEN** another tenant on the lease is not enrolled
- **THEN** they still get the 7-day and due-day reminders, and late-fee notices go to everyone as before

#### Scenario: Sent once
- **WHEN** the job runs again the same day
- **THEN** the notice is not sent again

### Requirement: Late fees and autopay
The system SHALL NOT charge a late fee on a lease while an autopay charge for it is pending.

#### Scenario: Pending ACH
- **WHEN** an ACH autopay charge is pending when the grace period ends
- **THEN** the daily job charges no late fee on the lease that run

#### Scenario: Pending charge fails
- **WHEN** the pending charge later fails
- **THEN** the usual late-fee rules apply from the next run, using the payments actually recorded

#### Scenario: Charge settles
- **WHEN** the pending charge settles and is recorded
- **THEN** the month is paid on time and no late fee is charged

### Requirement: Admin visibility
The system SHALL show admins who has autopay on and how charges went.

#### Scenario: Lease list
- **WHEN** an admin views a property's leases
- **THEN** each lease shows its enrolled tenants with method and amount, and a note for a pending or failed autopay charge with its date

#### Scenario: Job summary
- **WHEN** a daily run finishes
- **THEN** its stored summary lists each autopay charge (lease, tenant, amount, outcome) and failures

#### Scenario: Read-only
- **WHEN** an admin views autopay state
- **THEN** they cannot enroll, change or end a tenant's autopay

### Requirement: Access
The system SHALL reject unauthenticated calls to the autopay routes and expose an enrollment only to the tenant who made it and to admins.

#### Scenario: Not signed in
- **WHEN** a request to an autopay route has no session
- **THEN** the response is 401

#### Scenario: Another tenant's data
- **WHEN** a tenant loads `/payment`
- **THEN** it shows only their own enrollments, not those of other tenants on the lease
