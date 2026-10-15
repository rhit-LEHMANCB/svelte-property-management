# Spec Delta

## MODIFIED Requirements

### Requirement: Delete property
The system SHALL let an admin delete a property and everything that hangs off it, and SHALL finish all of that cleanup before reporting success.

#### Scenario: Cascade
- **WHEN** a property is deleted
- **THEN** its document, its maintenance requests, its `payment_history` subcollections, its leases with their `payment_history` and `recorded_invoices` subcollections, its storage files and its leases' documents are removed
- **AND** the response is sent only after every removal has finished

#### Scenario: Large property
- **WHEN** a property has more than 500 documents to remove
- **THEN** all of them are removed

#### Scenario: Failure
- **WHEN** any removal fails
- **THEN** the response is 500 and repeating the delete finishes the cleanup

### Requirement: Cleanup of tenant links on delete
The system SHALL remove a property's leases, and any `junction_user_property` rows left from before leases, when the property is deleted.

#### Scenario: Deleted property with tenants
- **WHEN** a property with a current lease is deleted
- **THEN** no lease or junction row references it
- **AND** that lease's tenants can load the app without an error and are shown as having no property
