# Spec Delta

## MODIFIED Requirements

### Requirement: Tenant property context
The system SHALL give each non-admin user in the authenticated area at most one property, the property of their current lease, and SHALL let a tenant with no current lease use the app instead of failing.

#### Scenario: One property
- **WHEN** a tenant is on exactly one current lease
- **THEN** the layout exposes that lease's property as `userProperty` to all child pages

#### Scenario: No property
- **WHEN** a tenant has no current lease, because they were never added to one, their lease has not started, it has ended, or their property was deleted
- **THEN** the layout loads without `userProperty` and without an error
- **AND** the dashboard shows each upcoming lease in its "Your lease" card with its start date, with no separate notice repeating it, and the balance tile links to `/payment` when money can be paid now; with no upcoming lease it shows that no property is assigned
- **AND** `/maintenance` stays on the page and explains why requests are not available, naming the upcoming lease and its start date when there is one
- **AND** `/payment` lists their upcoming leases (with autopay setup) and any ended lease with money owed, and with none says there is no lease to pay for
- **AND** `/profile` and `/insurance` load normally

#### Scenario: Wrong number of properties
- **WHEN** a tenant is on more than one current lease, which only data written outside the app can cause
- **THEN** the layout uses the one with the latest start date and logs the conflict
