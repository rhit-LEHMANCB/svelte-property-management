# Spec Delta

## MODIFIED Requirements

### Requirement: Submit request
The system SHALL let a tenant on a current lease submit a request with a subject and description for that lease's property.

#### Scenario: Valid submission
- **WHEN** subject is 1 to 50 characters and description is 1 to 10,000
- **THEN** a `maintenance` document is created with `status: "Open"`, the tenant's `propertyId`, `propertyAddress` (street, city, state), `submitter` (full name) and a server `dateAdded`

#### Scenario: Invalid form
- **WHEN** validation fails
- **THEN** nothing is created and the form returns "Invalid form"

#### Scenario: Lease ended
- **WHEN** a tenant whose lease has ended, and who has no other current lease, submits a request
- **THEN** nothing is created and they are redirected to `/`
