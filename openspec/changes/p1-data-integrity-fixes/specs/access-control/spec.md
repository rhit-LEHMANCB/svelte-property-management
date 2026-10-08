# Spec Delta

## MODIFIED Requirements

### Requirement: Tenant property context
The system SHALL give each non-admin user in the authenticated area at most one property, found through `junction_user_property`, and SHALL let a tenant with no property use the app instead of failing.

#### Scenario: One property
- **WHEN** a tenant has exactly one junction
- **THEN** the layout exposes `userProperty` to all child pages

#### Scenario: No property
- **WHEN** a tenant has no junction, because they were never assigned or their property was deleted
- **THEN** the layout loads without `userProperty` and without an error
- **AND** the dashboard shows that no property is assigned
- **AND** `/payment` and `/maintenance` redirect the tenant to `/`
- **AND** `/profile` and `/insurance` load normally

#### Scenario: More than one property
- **WHEN** a tenant has more than one junction
- **THEN** the layout fails with 500 "User is associated with wrong number of properties: N"
