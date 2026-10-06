# rent-payments Specification

## Purpose
Tenants pay rent online through Stripe Checkout, and a webhook records each payment against the property's monthly balance.

## Requirements

### Requirement: Start a payment
The system SHALL create a Stripe Checkout session for a tenant-specified amount via `POST /api/stripe/create-checkout-session/payment`.

#### Scenario: Valid amount
- **WHEN** a signed-in tenant with one property supplies a numeric amount
- **THEN** a session is created for their Stripe customer with a "Rent" line (the amount) and a "Transaction Fee" line of 2.9% of the amount plus $0.30
- **AND** the invoice metadata carries the `propertyID`
- **AND** the response contains the Checkout URL

#### Scenario: Invalid amount
- **WHEN** the amount is missing or not a number
- **THEN** the response is 400

### Requirement: Client-side amount limits
The system SHALL reject amounts that are not greater than 0, exceed the displayed balance, or are not multiples of 0.01.

#### Scenario: Over balance
- **WHEN** the tenant enters more than the balance
- **THEN** an error toast shows and no request is sent

### Requirement: Manage payment methods
The system SHALL send a tenant to the Stripe billing portal via `GET /api/stripe/create-customer-portal`.

#### Scenario: Portal
- **WHEN** the user has a `stripeID`
- **THEN** a portal session is created with return URL `/payment` and its URL returned

#### Scenario: No Stripe customer
- **WHEN** the user has no `stripeID`
- **THEN** the response is 400

### Requirement: Record payments
The system SHALL verify the Stripe signature on `POST /api/stripe/webhook` and, on `invoice.payment_succeeded`, record the rent line item in `properties/{id}/payment_history/{year}` under the month name.

#### Scenario: First payment of the month
- **WHEN** no entry exists for the month
- **THEN** `remainingBalance` is set to the property's rent minus the amount and the transaction `{date, amount}` is appended

#### Scenario: Later payment in the month
- **WHEN** the month entry exists
- **THEN** `remainingBalance` is decremented by the amount and the transaction is appended

#### Scenario: Bad signature
- **WHEN** the signature is missing or fails verification
- **THEN** the response is 400

#### Scenario: Unrelated event
- **WHEN** any other event type arrives
- **THEN** it is logged and acknowledged with 200

### Requirement: Real balance and due date (not yet implemented)
The system SHALL display the tenant's actual remaining balance and due date from `payment_history`, and the server SHALL reject amounts above it.

#### Scenario: Overpayment
- **WHEN** a request amount exceeds the remaining balance
- **THEN** the server responds 400

## Known Gaps
- Auto-pay is referenced in copy but has no implementation here.
- Two checkouts started before the first webhook lands can together exceed the balance.
- Production runs with a Stripe test-mode key until the account is activated for live payments; the key-mode guard only warns there.
