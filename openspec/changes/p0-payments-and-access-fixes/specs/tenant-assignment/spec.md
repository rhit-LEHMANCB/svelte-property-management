# Spec Delta

## ADDED Requirements

### Requirement: Move-in month
The system SHALL store a move-in month (`YYYY-MM`) on a tenant's junction document, accepted when assigning a tenant and changeable afterwards by an admin.

#### Scenario: Assign with a move-in month
- **WHEN** an admin assigns a tenant and supplies `moveInMonth` `2026-08`
- **THEN** the junction document stores `moveInMonth` `2026-08`

#### Scenario: Assign without a move-in month
- **WHEN** an admin assigns a tenant and supplies no `moveInMonth`
- **THEN** the junction document stores the current month in the business time zone

#### Scenario: Change the move-in month
- **WHEN** an admin updates an assigned tenant's `moveInMonth` via `PATCH /api/property/{id}/tenants`
- **THEN** the junction document is updated and the response is 200

#### Scenario: Invalid month
- **WHEN** `moveInMonth` is not a month in the form `YYYY-MM`
- **THEN** the response is 400 and nothing is written

#### Scenario: Non-admin
- **WHEN** a non-admin calls `PATCH /api/property/{id}/tenants`
- **THEN** the response is 401
