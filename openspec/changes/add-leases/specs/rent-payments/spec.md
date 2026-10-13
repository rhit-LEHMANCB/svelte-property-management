# Spec Delta

## MODIFIED Requirements

### Requirement: Start a payment
The system SHALL create a Stripe Checkout session for a tenant-specified amount against one of the tenant's leases via `POST /api/stripe/create-checkout-session/payment`.

#### Scenario: Valid amount
- **WHEN** a signed-in tenant supplies a `leaseId` for a lease they are on and a numeric amount within that lease's total owed
- **THEN** a session is created for their Stripe customer with a "Rent" line (the amount) and a "Transaction Fee" line of 2.9% of the amount plus $0.30
- **AND** the invoice metadata carries the `leaseID`, the `propertyID` and the rent and fee amounts in cents
- **AND** the response contains the Checkout URL

#### Scenario: Not the tenant's lease
- **WHEN** the `leaseId` is missing, unknown, or names a lease the tenant is not on
- **THEN** the response is 403 and no Stripe session is created

#### Scenario: Invalid amount
- **WHEN** the amount is missing or not a number
- **THEN** the response is 400

#### Scenario: Amount above the balance
- **WHEN** the amount is greater than the lease's total owed
- **THEN** the response is 400 and no Stripe session is created

#### Scenario: Fractional cents
- **WHEN** the amount has more than two decimal places or is not greater than 0
- **THEN** the response is 400 and no Stripe session is created

#### Scenario: Return pages
- **WHEN** a session is created
- **THEN** its success URL is `/payment/success` and its cancel URL is `/payment`

### Requirement: Record payments
The system SHALL verify the Stripe signature on `POST /api/stripe/webhook` and, on `invoice.payment_succeeded`, record the rent amount and the transaction fee in `leases/{id}/payment_history/{year}` under the month name, using the business time zone (America/Indiana/Indianapolis).

#### Scenario: First payment of the month
- **WHEN** no entry exists for the month
- **THEN** `remainingBalance` is set to the lease's rent minus the amount and the transaction `{date, amount, fee}` is appended

#### Scenario: Later payment in the month
- **WHEN** the month entry exists
- **THEN** `remainingBalance` is decremented by the amount and the transaction is appended

#### Scenario: Payment covers carried-over months
- **WHEN** the payment exceeds the oldest unpaid month's remainder
- **THEN** the payment is applied to the oldest unpaid months of the lease first, each affected month gets its own transaction and `remainingBalance`, and the fee is recorded on the first transaction
- **AND** all reads and writes for the payment, including the record that the invoice was handled, happen in one transaction, so a failure leaves nothing recorded

#### Scenario: Month near midnight
- **WHEN** an invoice is created at 23:30 on the last day of a month in the business time zone
- **THEN** the payment is recorded under that month, not the next one

#### Scenario: Invoice without a lease
- **WHEN** an invoice created before leases existed carries a `propertyID` but no `leaseID`
- **THEN** it is recorded against the current lease at that property that the paying Stripe customer is on
- **AND** when there is none, it is logged as an error naming the invoice, customer and amounts, and acknowledged with 200

#### Scenario: Write fails
- **WHEN** a Firestore write fails while recording a payment
- **THEN** the response is 500 so Stripe retries the event

#### Scenario: Redelivered invoice
- **WHEN** an `invoice.payment_succeeded` event arrives for an invoice that was already recorded against the lease
- **THEN** it is acknowledged with 200 and nothing is recorded again

#### Scenario: Bad signature
- **WHEN** the signature is missing or fails verification
- **THEN** the response is 400

#### Scenario: Unrelated event
- **WHEN** any other event type arrives
- **THEN** it is logged and acknowledged with 200

#### Scenario: Unknown property
- **WHEN** the invoice names a lease that does not exist
- **THEN** it is logged as an error naming the invoice, customer and amounts, nothing is recorded, and the response is 500 so the failed delivery shows in Stripe and is retried

### Requirement: Real balance and due date
The system SHALL show the tenant, for each of their leases with money owed, the total owed through the current month or the lease's end month, whichever is earlier, and its due date, from that lease's `payment_history`, and the server SHALL reject amounts above it.

#### Scenario: No payments yet
- **WHEN** a tenant's lease has rent 1000, started this month and has no payments
- **THEN** `/payment` shows a balance of $1,000.00 for that lease due on the 1st of this month

#### Scenario: Partial payment
- **WHEN** the tenant has paid $400 this month on that lease
- **THEN** `/payment` shows a balance of $600.00 for it

#### Scenario: Unpaid past months carry over
- **WHEN** the lease started two months before the current month and nothing has been paid
- **THEN** the balance is three times the rent, across year boundaries

#### Scenario: No move-in month
- **WHEN** a lease was migrated from tenant links that had no move-in month
- **THEN** rent counts from the lease's start month, the month the migration ran, as it did before the migration

#### Scenario: Ended lease
- **WHEN** a lease with rent 1000 ended last month, its final two months are unpaid and the tenant has a new current lease
- **THEN** `/payment` lists the ended lease with $2,000.00 owed and the current lease with its own balance, and the tenant chooses which to pay

#### Scenario: Upcoming lease
- **WHEN** the tenant's only lease starts next month
- **THEN** nothing is owed yet

#### Scenario: Shared lease
- **WHEN** two tenants are on the same lease and one pays $500
- **THEN** both see the lease's balance reduced by $500

#### Scenario: Paid in full
- **WHEN** nothing is owed on any lease
- **THEN** `/payment` shows that there is nothing to pay and no amount can be submitted

#### Scenario: Overpayment
- **WHEN** a request amount exceeds the lease's total owed
- **THEN** the server responds 400
