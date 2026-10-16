# Spec Delta

## Purpose

Tracks a one-time bank (ACH) payment from Stripe Checkout until it settles or fails, so that money on its way is shown, is not paid twice, holds off late fees and autopay, and a failure is reported.

## ADDED Requirements

### Requirement: Pending bank payment
The system SHALL keep a server-only record of each one-time bank payment, on the lease it pays, from the moment the tenant completes Checkout until the payment settles or fails.

#### Scenario: Checkout completed, not settled
- **WHEN** a tenant completes a bank Checkout and Stripe reports the payment as not yet paid (processing, or waiting for microdeposit verification)
- **THEN** the payment is recorded as pending with the paying tenant, the amount (without the fee), the fee and the day it was started in the business time zone

#### Scenario: Returned before the event
- **WHEN** the tenant reaches `/payment/success` from a bank Checkout before Stripe's completion event has arrived
- **THEN** the same pending record is created from the Checkout session, and the later event does not create a second one

#### Scenario: Settled at once
- **WHEN** Stripe reports the bank Checkout as already paid when it completes
- **THEN** no pending record remains and the payment is recorded as a normal payment

#### Scenario: Not the tenant's session
- **WHEN** `/payment/success` is reached with a Checkout session that is not the signed-in tenant's, or is not a bank payment session of this app
- **THEN** no record is created or changed

#### Scenario: Server only
- **WHEN** any client reads or writes the records directly in Firestore
- **THEN** access is denied

### Requirement: Processing note
The system SHALL show on `/payment`, for each lease, every pending one-time bank payment on it to every tenant on the lease.

#### Scenario: Pending
- **WHEN** a bank payment of $964.52 started on 10/16/26 is pending on a lease
- **THEN** every tenant on the lease sees "A bank payment of $964.52 started on 10/16/26 is processing." for that lease
- **AND** the lease balance shown still includes it until it settles

### Requirement: No double payment while pending
The system SHALL limit a new payment on a lease, in the "Make a Payment" dialog and on the server, to the lease's total owed minus the payments already on their way: pending one-time bank payments and autopay charges in flight.

#### Scenario: Payable amount reduced
- **WHEN** a lease owes $1,000.00 and a $964.52 bank payment on it is pending
- **THEN** any tenant on the lease can pay at most $35.48 now, and the server rejects more with 400

#### Scenario: Everything on its way
- **WHEN** the pending payments cover the whole balance
- **THEN** `/payment` says the balance is being paid and "Make a Payment" is disabled for that lease

### Requirement: Payment dated when started
The system SHALL record a settled one-time bank payment as paid on the day the tenant completed Checkout, not the day it settled.

#### Scenario: Settles after the grace period
- **WHEN** rent is due on the 1st with 5 grace days, a bank payment for it is started on the 4th and settles on the 9th
- **THEN** the payment is recorded dated the 4th, the record is marked succeeded, and no late fee is charged for that month

#### Scenario: Recorded once
- **WHEN** Stripe delivers the paid invoice or the success event again
- **THEN** nothing is recorded again

### Requirement: Late fees held while pending
The system SHALL NOT charge a late fee on a lease in a daily run while a one-time bank payment on that lease is pending, as for a pending autopay charge.

#### Scenario: Pending at the end of the grace period
- **WHEN** a one-time bank payment is pending when the grace period ends
- **THEN** the daily job charges no late fee on the lease in that run

#### Scenario: Pending payment fails
- **WHEN** the pending payment later fails
- **THEN** the usual late-fee rules apply from the next daily run, using the payments actually recorded

### Requirement: Autopay counts pending bank payments
The system SHALL treat pending one-time bank payments as money already on its way when autopay works out what to charge and what its notices say.

#### Scenario: Due date while a bank payment is pending
- **WHEN** a lease owes $1,000.00 on its due date, a $600.00 one-time bank payment on it is pending, and a tenant is enrolled in autopay for the full balance
- **THEN** autopay charges at most $400.00

### Requirement: Failed bank payment
The system SHALL mark a pending one-time bank payment failed when Stripe reports that it failed, and the amount SHALL be payable again.

#### Scenario: Payment fails
- **WHEN** Stripe reports the bank payment failed (for example, insufficient funds, a closed account, or microdeposits never verified)
- **THEN** the record is marked failed with the reason, it no longer reduces what can be paid, and no transaction fee is charged

#### Scenario: Failure note
- **WHEN** the paying tenant opens `/payment` within 7 days after the failure
- **THEN** they see that their bank payment of $X started on <date> did not go through and the amount is still owed

#### Scenario: Lost event
- **WHEN** a payment has been pending for more than 7 days without any event
- **THEN** the daily job checks it with Stripe, marks it failed if Stripe says it failed or was canceled, and otherwise leaves it pending

#### Scenario: Late events
- **WHEN** a failure event arrives for a payment that is already succeeded or failed
- **THEN** nothing changes

### Requirement: Failure emails
The system SHALL email the paying tenant and every admin user once when a one-time bank payment fails, from "Lehman Family LLC".

#### Scenario: Tenant email
- **WHEN** a bank payment fails
- **THEN** the paying tenant gets an email naming the property, the amount, the start date and the reason, saying the amount is still owed, with a link to `/payment`

#### Scenario: Admin email
- **WHEN** a bank payment fails
- **THEN** every user with admin permissions gets an email naming the tenant, the property, the amount, the start date and the reason

#### Scenario: Email cannot be sent
- **WHEN** a failure email cannot be sent
- **THEN** the daily job retries it on later runs for up to 7 days, and each recipient group gets it at most once
