# Spec Delta

## MODIFIED Requirements

### Requirement: Start a payment
The system SHALL create a Stripe Checkout session for a tenant-specified amount and payment method (`card` or `bank`) against one of the tenant's leases via `POST /api/stripe/create-checkout-session/payment`, splitting the amount, in order, into late fees owed, then unpaid deposit, then rent. The session SHALL offer only the chosen method and add that method's transaction fee on top of the amount.

#### Scenario: Valid amount
- **WHEN** a signed-in tenant supplies a `leaseId` for a lease they are on, a method, and a numeric amount within what can be paid on that lease now
- **THEN** a session is created for their Stripe customer with a "Late Fee", "Security Deposit" and "Rent" line for each part of the split that is greater than 0, and a "Transaction Fee" line for the method
- **AND** the invoice metadata carries the `leaseID`, the `propertyID`, the payment method, and the rent, deposit, late fee and transaction fee amounts in cents
- **AND** the response contains the Checkout URL

#### Scenario: Card
- **WHEN** the method is `card` and the amount is $964.52
- **THEN** the "Transaction Fee" line is 2.9% of the amount plus $0.30, rounded to the cent ($28.27)
- **AND** the session accepts only cards, including Apple Pay and Google Pay, and does not offer a bank account, Cash App Pay or any other method

#### Scenario: Bank account
- **WHEN** the method is `bank` and the amount is $964.52
- **THEN** the "Transaction Fee" line is $5.00, whatever the amount
- **AND** the session accepts only a US bank account (ACH Direct Debit), which the tenant can connect by instant bank login or microdeposits

#### Scenario: Missing or unknown method
- **WHEN** the method is missing or is not `card` or `bank`
- **THEN** the response is 400 and no Stripe session is created

#### Scenario: Split across parts
- **WHEN** a lease owes a $75.00 late fee, $500.00 of deposit and $1,500.00 of rent and the tenant pays $600.00 by card
- **THEN** the session has a $75.00 "Late Fee" line, a $500.00 "Security Deposit" line, a $25.00 "Rent" line and a $17.70 "Transaction Fee" line

#### Scenario: Rent only
- **WHEN** a lease owes only rent
- **THEN** the session has only the "Rent" and "Transaction Fee" lines

#### Scenario: Not the tenant's lease
- **WHEN** the `leaseId` is missing, unknown, or names a lease the tenant is not on
- **THEN** the response is 403 and no Stripe session is created

#### Scenario: Invalid amount
- **WHEN** the amount is missing or not a number
- **THEN** the response is 400

#### Scenario: Amount above the balance
- **WHEN** the amount is greater than the lease's total owed minus the payments already on their way for it
- **THEN** the response is 400 and no Stripe session is created

#### Scenario: Fractional cents
- **WHEN** the amount has more than two decimal places or is not greater than 0
- **THEN** the response is 400 and no Stripe session is created

#### Scenario: Return pages
- **WHEN** a session is created
- **THEN** its success URL is `/payment/success` (marked as a bank payment for the bank method) and its cancel URL is `/payment`

### Requirement: Client-side amount limits
The system SHALL reject amounts that are not greater than 0, exceed the amount that can be paid now (the displayed balance minus payments already on their way), or are not multiples of 0.01, and SHALL require a payment method to be chosen.

#### Scenario: Over balance
- **WHEN** the tenant enters more than the amount that can be paid now
- **THEN** an error shows in the payment dialog and no request is sent

#### Scenario: Method choice with fees
- **WHEN** the tenant opens "Make a Payment" and enters an amount
- **THEN** the dialog offers "Card" with its fee (2.9% + $0.30 of that amount) and "Bank account" with its $5.00 fee, and continues to Stripe with the chosen method

### Requirement: Payment confirmation page
The system SHALL show tenants a confirmation page at `/payment/success` after Stripe Checkout completes.

#### Scenario: Return from Stripe
- **WHEN** a tenant returns from a completed card Checkout
- **THEN** `/payment/success` explains that the payment was received and may take a moment to appear, with a link back to `/payment`

#### Scenario: Return from a bank payment
- **WHEN** a tenant returns from a completed bank Checkout
- **THEN** `/payment/success` explains that bank payments take a few business days to complete, that it shows as processing on `/payment` until then, and links back to `/payment`
