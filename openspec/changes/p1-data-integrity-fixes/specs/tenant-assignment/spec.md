# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: One property per tenant (not enforced)`
- TO: `### Requirement: One property per tenant`

## MODIFIED Requirements

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

### Requirement: Assignable users
The system SHALL offer, on the property edit page, every non-admin user who is not assigned to any property, however many tenants exist.

#### Scenario: Options
- **WHEN** an admin opens a property's edit page
- **THEN** current tenants are listed and the add dropdown excludes them, every other assigned tenant, and all admins

#### Scenario: More than 10 tenants
- **WHEN** more than 10 tenants are assigned across properties
- **THEN** the page still loads and the dropdown lists the unassigned tenants

### Requirement: One property per tenant
The system SHALL allow a tenant to be linked to at most one property.

#### Scenario: Second assignment
- **WHEN** an admin assigns a tenant who already has a property other than this one
- **THEN** the response is 409, nothing is written, and the admin sees the message

#### Scenario: Same property again
- **WHEN** an admin assigns a tenant who is already assigned to this property
- **THEN** the request succeeds and the stored move-in month is kept
