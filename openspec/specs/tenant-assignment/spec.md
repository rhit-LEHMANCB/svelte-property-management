# tenant-assignment Specification

## Purpose
Admins link a user to a property. The link is stored in `junction_user_property`, keyed `{tenantId}_{propertyId}`.

## Requirements

### Requirement: Assign tenant
The system SHALL let an admin link a user to a property via `POST /api/property/{id}/tenants`.

#### Scenario: Assign
- **WHEN** an admin supplies a `tenantId`
- **THEN** a junction document `{tenantId}_{propertyId}` is written

#### Scenario: Missing tenant
- **WHEN** `tenantId` is absent
- **THEN** the response is 400 "Please provide a Tenant Id"

### Requirement: Remove tenant
The system SHALL let an admin unlink via `DELETE /api/property/{id}/tenants`.

#### Scenario: Remove
- **WHEN** an admin supplies a `tenantId`
- **THEN** the junction document is deleted

### Requirement: Assignable users
The system SHALL offer, on the property edit page, all users not already assigned to that property.

#### Scenario: Options
- **WHEN** an admin opens a property's edit page
- **THEN** current tenants are listed and the add dropdown excludes them

### Requirement: Look up a user's property
The system SHALL let an admin fetch a user's property through `GET /api/user/{id}/assoc`.

#### Scenario: Unassigned user
- **WHEN** the user has no junction
- **THEN** the response is `{ userProperty: undefined }`

#### Scenario: Assigned user
- **WHEN** the user has exactly one junction
- **THEN** the response contains the property id and data

### Requirement: One property per tenant (not enforced)
The system SHALL allow a tenant to be linked to at most one property.

#### Scenario: Second assignment
- **WHEN** an admin assigns a tenant who already has a property
- **THEN** the request is rejected

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
- Nothing prevents assigning a tenant to a second property; the tenant then fails with 500 on every page (see access-control).
- Assignment does not verify that the user or property exists.
- The "not-in" query for assignable users fails once a property has more than 10 tenants (Firestore limit).
- Admins, whose role has no property, appear in the assignable list.
- Tenants assigned before `moveInMonth` existed have none and are charged the current month only until an admin sets it.
