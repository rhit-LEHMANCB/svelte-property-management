# Spec Delta

## MODIFIED Requirements

### Requirement: Delete property
The system SHALL let an admin delete a property and everything that hangs off it, and SHALL finish all of that cleanup before reporting success. The system SHALL refuse to delete a property when any of its leases has a recorded rent, deposit or late-fee payment, and SHALL remove nothing that holds payment history.

#### Scenario: Cascade
- **WHEN** a property none of whose leases has a recorded payment is deleted
- **THEN** its document, its maintenance requests, its `payment_history` subcollections, its leases with their `payment_history` and `recorded_invoices` subcollections, its storage files and its leases' documents are removed
- **AND** the response is sent only after every removal has finished

#### Scenario: Large property
- **WHEN** a property has more than 500 documents to remove
- **THEN** all of them are removed

#### Scenario: Failure
- **WHEN** any removal fails
- **THEN** the response is 500 and repeating the delete finishes the cleanup

#### Scenario: A lease has rent payments
- **WHEN** an admin deletes a property that has a lease with recorded rent payments
- **THEN** the response is 409 and its message says the property has leases with recorded payments and to set an end date on them instead
- **AND** the property, its leases and their payment history, its maintenance requests and its files are all kept

#### Scenario: A lease has only a deposit or late-fee payment
- **WHEN** an admin deletes a property whose only recorded payment is toward a lease's deposit or a lease's late fee
- **THEN** the response is 409 and nothing is removed

#### Scenario: Leases without payments
- **WHEN** an admin deletes a property whose leases have no recorded payments, even if they have unpaid or waived late fees
- **THEN** the property is deleted as in the cascade scenario

#### Scenario: A payment lands during the delete
- **WHEN** a payment is recorded on one of the property's leases after the delete has started and before that lease is removed
- **THEN** the response is 409 and the paid lease and its history are kept

#### Scenario: Payment history of other properties
- **WHEN** a property is refused or deleted
- **THEN** the leases and payment history of other properties are untouched

### Requirement: Cleanup of tenant links on delete
The system SHALL remove a property's leases, and any `junction_user_property` rows left from before leases, when the property is deleted.

#### Scenario: Deleted property with tenants
- **WHEN** a property with a current lease that has no recorded payments is deleted
- **THEN** no lease or junction row references it
- **AND** that lease's tenants can load the app without an error and are shown as having no property

#### Scenario: Refused delete keeps the tenant links
- **WHEN** the delete of a property is refused because a lease has payments
- **THEN** the leases and any junction rows of that property are kept

## ADDED Requirements

### Requirement: Property delete error shown to the admin
The system SHALL show an admin who deletes a property from the properties list the reason the server gives when the delete is refused, and SHALL fall back to a generic message only when the server gives none.

#### Scenario: Refused delete
- **WHEN** an admin confirms the delete of a property that has a lease with payments
- **THEN** an error toast shows that the property has leases with recorded payments, and the property stays in the list

#### Scenario: Other failure
- **WHEN** the delete fails and the response carries no message
- **THEN** the toast reads "Error removing property."
