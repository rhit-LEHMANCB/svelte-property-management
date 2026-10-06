# Spec Delta

## MODIFIED Requirements

### Requirement: Start a payment
The system SHALL create a Stripe Checkout session for a tenant-specified amount via `POST /api/stripe/create-checkout-session/payment`.

#### Scenario: Valid amount
- **WHEN** a signed-in tenant with one property supplies a numeric amount within the total owed
- **THEN** a session is created for their Stripe customer with a "Rent" line (the amount) and a "Transaction Fee" line of 2.9% of the amount plus $0.30
- **AND** the invoice metadata carries the `propertyID` and the rent and fee amounts in cents
- **AND** the response contains the Checkout URL

#### Scenario: Invalid amount
- **WHEN** the amount is missing or not a number
- **THEN** the response is 400

#### Scenario: Amount above the balance
- **WHEN** the amount is greater than the total owed
- **THEN** the response is 400 and no Stripe session is created

#### Scenario: Fractional cents
- **WHEN** the amount has more than two decimal places or is not greater than 0
- **THEN** the response is 400 and no Stripe session is created

#### Scenario: Return pages
- **WHEN** a session is created
- **THEN** its success URL is `/payment/success` and its cancel URL is `/payment`

### Requirement: Record payments
The system SHALL verify the Stripe signature on `POST /api/stripe/webhook` and, on `invoice.payment_succeeded`, record the rent amount and the transaction fee in `properties/{id}/payment_history/{year}` under the month name, using the business time zone (America/Indiana/Indianapolis).

#### Scenario: First payment of the month
- **WHEN** no entry exists for the month
- **THEN** `remainingBalance` is set to the property's rent minus the amount and the transaction `{date, amount, fee}` is appended

#### Scenario: Later payment in the month
- **WHEN** the month entry exists
- **THEN** `remainingBalance` is decremented by the amount and the transaction is appended

#### Scenario: Month near midnight
- **WHEN** an invoice is created at 23:30 on the last day of a month in the business time zone
- **THEN** the payment is recorded under that month, not the next one

#### Scenario: Write fails
- **WHEN** a Firestore write fails while recording a payment
- **THEN** the response is 500 so Stripe retries the event

#### Scenario: Bad signature
- **WHEN** the signature is missing or fails verification
- **THEN** the response is 400

#### Scenario: Unrelated event
- **WHEN** any other event type arrives
- **THEN** it is logged and acknowledged with 200

#### Scenario: Unknown property
- **WHEN** the invoice's property does not exist
- **THEN** it is logged and acknowledged with 200

## RENAMED Requirements

- FROM: `### Requirement: Real balance and due date (not yet implemented)`
- TO: `### Requirement: Real balance and due date`

## MODIFIED Requirements

### Requirement: Real balance and due date
The system SHALL show the tenant the total they owe through the current month and its due date, from `payment_history`, and the server SHALL reject amounts above it.

#### Scenario: No payments yet
- **WHEN** a tenant whose property rent is 1000 and whose move-in month is the current month has no payments
- **THEN** `/payment` shows a balance of $1,000.00 due on the 1st of this month

#### Scenario: Partial payment
- **WHEN** the tenant has paid $400 this month
- **THEN** `/payment` shows a balance of $600.00

#### Scenario: Unpaid past months carry over
- **WHEN** the move-in month is two months before the current month and nothing has been paid
- **THEN** the balance is three times the rent, across year boundaries

#### Scenario: No move-in month
- **WHEN** the tenant's junction has no `moveInMonth`
- **THEN** only the current month counts toward the balance

#### Scenario: Paid in full
- **WHEN** nothing is owed
- **THEN** `/payment` shows that there is nothing to pay and no amount can be submitted

#### Scenario: Overpayment
- **WHEN** a request amount exceeds the total owed
- **THEN** the server responds 400

## ADDED Requirements

### Requirement: Payment confirmation page
The system SHALL show tenants a confirmation page at `/payment/success` after Stripe Checkout completes.

#### Scenario: Return from Stripe
- **WHEN** a tenant returns from a completed Checkout
- **THEN** `/payment/success` explains that the payment was received and may take a moment to appear, with a link back to `/payment`

### Requirement: Stripe key-mode safety
The system SHALL refuse to start with a live Stripe key outside production and SHALL warn, without stopping, when production uses a test key.

#### Scenario: Live key outside production
- **WHEN** the server starts in an environment other than production with a key beginning `sk_live_` or `rk_live_`
- **THEN** startup fails with a message that names the problem and does not print the key

#### Scenario: Test key in production
- **WHEN** the server starts in production with a test key
- **THEN** it starts and logs a warning that payments are test payments
