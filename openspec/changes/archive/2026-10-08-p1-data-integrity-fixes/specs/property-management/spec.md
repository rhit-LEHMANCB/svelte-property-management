# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Cleanup of tenant links on delete (not yet implemented)`
- TO: `### Requirement: Cleanup of tenant links on delete`

## MODIFIED Requirements

### Requirement: Delete property
The system SHALL let an admin delete a property and everything that hangs off it, and SHALL finish all of that cleanup before reporting success.

#### Scenario: Cascade
- **WHEN** a property is deleted
- **THEN** its document, its maintenance requests, its `payment_history` subcollections and its storage files are removed
- **AND** the response is sent only after every removal has finished

#### Scenario: Large property
- **WHEN** a property has more than 500 documents to remove
- **THEN** all of them are removed

#### Scenario: Failure
- **WHEN** any removal fails
- **THEN** the response is 500 and repeating the delete finishes the cleanup

### Requirement: Cleanup of tenant links on delete
The system SHALL remove `junction_user_property` rows for a property when it is deleted.

#### Scenario: Deleted property with tenants
- **WHEN** a property with assigned tenants is deleted
- **THEN** no junction row references it
- **AND** those tenants can load the app without an error
