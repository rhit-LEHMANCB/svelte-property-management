# tenant-assignment Specification

## Purpose
Admins link a user to a property. The link is stored in `junction_user_property`, keyed `{tenantId}_{propertyId}`.

## Requirements

### Requirement: Assign tenant
The system SHALL let an admin link a user to a property via `POST /api/property/{id}/tenants`, and SHALL only link an existing non-admin user to an existing property.

#### Scenario: Assign
- **WHEN** an admin supplies a `tenantId` for an existing tenant who has no property, and the property exists
- **THEN** a junction document `{tenantId}_{propertyId}` is written

#### Scenario: Missing tenant
- **WHEN** `tenantId` is absent
- **THEN** the response is 400 "Please provide a Tenant Id"

#### Scenario: Unknown user
- **WHEN** no user has the supplied `tenantId`
- **THEN** the response is 404 and nothing is written

#### Scenario: Unknown property
- **WHEN** the property in the URL does not exist
- **THEN** the response is 404 and nothing is written

#### Scenario: Admin as tenant
- **WHEN** the supplied user is an admin
- **THEN** the response is 400 and nothing is written

### Requirement: Remove tenant
The system SHALL let an admin unlink via `DELETE /api/property/{id}/tenants`.

#### Scenario: Remove
- **WHEN** an admin supplies a `tenantId`
- **THEN** the junction document is deleted

### Requirement: Assignable users
The system SHALL offer, on the property edit page, every non-admin user who is not assigned to any property, however many tenants exist.

#### Scenario: Options
- **WHEN** an admin opens a property's edit page
- **THEN** current tenants are listed and the add dropdown excludes them, every other assigned tenant, and all admins

#### Scenario: More than 10 tenants
- **WHEN** more than 10 tenants are assigned across properties
- **THEN** the page still loads and the dropdown lists the unassigned tenants

### Requirement: Look up a user's property
The system SHALL let an admin fetch a user's property through `GET /api/user/{id}/assoc`.

#### Scenario: Unassigned user
- **WHEN** the user has no junction
- **THEN** the response is `{ userProperty: undefined }`

#### Scenario: Assigned user
- **WHEN** the user has exactly one junction
- **THEN** the response contains the property id and data

### Requirement: One property per tenant
The system SHALL allow a tenant to be linked to at most one property.

#### Scenario: Second assignment
- **WHEN** an admin assigns a tenant who already has a property other than this one
- **THEN** the response is 409, nothing is written, and the admin sees the message

#### Scenario: Same property again
- **WHEN** an admin assigns a tenant who is already assigned to this property
- **THEN** the request succeeds and the stored move-in month is kept

### Requirement: Move-in month
The system SHALL store a move-in month (`YYYY-MM`) on a tenant's junction document, accepted when assigning a tenant and changeable afterwards by an admin.

#### Scenario: Assign with a move-in month
- **WHEN** an admin assigns a tenant and supplies `moveInMonth` `2026-08`
- **THEN** the junction document stores `moveInMonth` `2026-08`

#### Scenario: Assign without a move-in month
- **WHEN** an admin assigns a tenant and supplies no `moveInMonth`
- **THEN** the junction document stores the current month in the business time zone

#### Scenario: Re-assign an assigned tenant
- **WHEN** an admin assigns a tenant who is already assigned to the property and supplies no `moveInMonth`
- **THEN** the stored `moveInMonth` is kept

#### Scenario: Change the move-in month
- **WHEN** an admin updates an assigned tenant's `moveInMonth` via `PATCH /api/property/{id}/tenants`
- **THEN** the junction document is updated and the response is 200

#### Scenario: Invalid month
- **WHEN** `moveInMonth` is not a month in the form `YYYY-MM`, or is more than five years before the current month
- **THEN** the response is 400 and nothing is written

#### Scenario: Non-admin
- **WHEN** a non-admin calls `PATCH /api/property/{id}/tenants`
- **THEN** the response is 401

## Known Gaps
- Tenants assigned before `moveInMonth` existed have none and are charged the current month only until an admin sets it.
