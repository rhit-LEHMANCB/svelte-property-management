# maintenance-requests Specification

## Purpose
Tenants report problems at their property, and admins review and close them with a note of the work done.

## Requirements

### Requirement: Submit request
The system SHALL let a tenant submit a request with a subject and description.

#### Scenario: Valid submission
- **WHEN** subject is 1 to 50 characters and description is 1 to 10,000
- **THEN** a `maintenance` document is created with `status: "Open"`, the tenant's `propertyId`, `propertyAddress` (street, city, state), `submitter` (full name) and a server `dateAdded`

#### Scenario: Invalid form
- **WHEN** validation fails
- **THEN** nothing is created and the form returns "Invalid form"

### Requirement: Tenant request list
The system SHALL show a tenant the 5 newest open requests (by `dateAdded`) and 5 most recently closed (by `dateClosed`) for their own property.

#### Scenario: View
- **WHEN** a tenant opens `/maintenance`
- **THEN** only requests with their `propertyId` appear

### Requirement: Admin request list
The system SHALL show admins the 5 newest open and 5 most recently closed requests across all properties.

#### Scenario: View
- **WHEN** an admin opens `/admin/maintenance`
- **THEN** requests from all properties appear, limited to 5 per status

### Requirement: Close request
The system SHALL let an admin close a request with a required `workDone` note.

#### Scenario: Close
- **WHEN** an admin posts `workDone` to `/api/request/{id}/close`
- **THEN** status becomes `Closed`, `dateClosed` is set to server time and `workDone` is saved

#### Scenario: Missing note
- **WHEN** `workDone` is empty
- **THEN** the response is 400 "Please provide work done."

### Requirement: Notify on request (not yet implemented)
The system SHALL notify the landlord when a request is submitted and the tenant when it is closed.

#### Scenario: New request
- **WHEN** a tenant submits a request
- **THEN** an email is sent to the admin

## Known Gaps
- Lists are capped at 5 with no pagination or "show more".
- Closing does not check that the request exists or is still open; a closed request can be re-closed, overwriting `workDone`.
- `propertyAddress` and `submitter` are copied at submit time and not updated if the property or user is edited.
- There is no way for a tenant to edit or cancel a request.
- Querying by status plus ordering needs Firestore composite indexes that are not checked into the repo.
