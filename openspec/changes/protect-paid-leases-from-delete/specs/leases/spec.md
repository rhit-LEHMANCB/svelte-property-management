# Spec Delta

## MODIFIED Requirements

### Requirement: Delete a lease
The system SHALL let an admin delete a lease that has no recorded rent, deposit or late-fee payments, removing it and its document, and SHALL refuse to delete a lease with any of them. The edit page SHALL tell the admin a lease cannot be deleted only when it has one of those payments.

#### Scenario: No payments
- **WHEN** an admin deletes a lease with no payment history
- **THEN** the lease and its document are removed

#### Scenario: Has payments
- **WHEN** an admin deletes a lease that has recorded payments
- **THEN** the response is 409, nothing is removed and the admin is told to set an end date instead

#### Scenario: Has only a deposit payment
- **WHEN** an admin deletes an upcoming lease whose only payment is toward its deposit
- **THEN** the response is 409 and nothing is removed

#### Scenario: Edit page for a lease with no payments
- **WHEN** an admin opens the edit page of a lease with no recorded rent, deposit or late-fee payment
- **THEN** no "cannot be deleted" text is shown and Delete is available

#### Scenario: Edit page for a lease with payments
- **WHEN** an admin opens the edit page of a lease with a recorded rent, deposit or late-fee payment
- **THEN** the page says the lease has recorded payments and cannot be deleted, and Delete is disabled
- **AND** this holds when the only payment is toward the deposit or a late fee
