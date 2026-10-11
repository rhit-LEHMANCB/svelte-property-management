# Spec Delta

## ADDED Requirements

### Requirement: Remove-tenant control opens only its confirmation
The system SHALL, when an admin uses the remove control on a tenant row of a property's Tenants tab, show only the confirmation dialog, and SHALL open the tenant's user-info dialog only when the admin activates the row itself.

#### Scenario: Cancel removal
- **WHEN** an admin clicks the remove icon on a tenant and cancels
- **THEN** the confirmation closes and no user-info dialog opens

#### Scenario: Confirm removal
- **WHEN** an admin clicks the remove icon and confirms
- **THEN** the tenant is unlinked and no user-info dialog opens afterwards

#### Scenario: Open the row
- **WHEN** an admin activates the tenant row away from its action controls
- **THEN** the user-info dialog opens

#### Scenario: No nested interactive controls
- **WHEN** the tenant row is inspected with assistive technology
- **THEN** the row action and the remove action are separate controls, not a button inside a button
