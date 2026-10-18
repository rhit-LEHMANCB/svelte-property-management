# Spec Delta

## MODIFIED Requirements

### Requirement: Client-side amount limits
The system SHALL reject amounts that are not greater than 0, exceed the amount that can be paid now (the displayed balance minus payments already on their way), or are not multiples of 0.01, and SHALL require a payment method to be chosen.

#### Scenario: Over balance
- **WHEN** the tenant enters more than the amount that can be paid now
- **THEN** the message is shown under the amount field with an error outline, the dialog stays open and no request is sent

#### Scenario: Method choice with fees
- **WHEN** the tenant opens "Make a Payment" and enters an amount
- **THEN** the dialog offers "Card" with its fee (3% of that amount) and "Bank account" with its $5.00 fee, and continues to Stripe with the chosen method

