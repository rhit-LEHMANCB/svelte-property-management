# Spec Delta

## MODIFIED Requirements

### Requirement: Client-side amount limits
The system SHALL reject amounts that are not greater than 0, exceed the displayed balance, or are not multiples of 0.01.

#### Scenario: Over balance
- **WHEN** the tenant enters more than the balance
- **THEN** the message is shown under the amount field with an error outline, the dialog stays open and no request is sent
