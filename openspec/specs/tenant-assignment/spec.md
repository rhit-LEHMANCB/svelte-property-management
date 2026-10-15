# tenant-assignment Specification

## Purpose
Admins link a user to a property. The link is stored in `junction_user_property`, keyed `{tenantId}_{propertyId}`.

## Requirements

### Requirement: Remove-tenant control opens only its confirmation
The system SHALL, when an admin uses the remove control on a tenant row of a property's Tenants tab, show only the confirmation dialog, and SHALL open the tenant's user-info dialog only when the admin activates the tenant's name in that row.

#### Scenario: Cancel removal
- **WHEN** an admin clicks the remove icon on a tenant and cancels
- **THEN** the confirmation closes and no user-info dialog opens

#### Scenario: Confirm removal
- **WHEN** an admin clicks the remove icon and confirms
- **THEN** the tenant is unlinked and no user-info dialog opens afterwards

#### Scenario: Open the row
- **WHEN** an admin activates the tenant's name in the row
- **THEN** the user-info dialog opens

#### Scenario: No nested interactive controls
- **WHEN** the tenant row is inspected with assistive technology
- **THEN** the row action and the remove action are separate controls, not a button inside a button

### Requirement: Tenant picker tells apart tenants who share a name
The system SHALL show each tenant in a property's add-tenant picker as their name followed by their email in parentheses, and SHALL match the search text against both.

#### Scenario: Two tenants with the same name
- **WHEN** two unassigned tenants are both named "Dana Double"
- **THEN** the picker lists "Dana Double (dana.one@…)" and "Dana Double (dana.two@…)", and adding one assigns that tenant only

#### Scenario: Search by email
- **WHEN** an admin types part of a tenant's email
- **THEN** that tenant is offered

#### Scenario: No email on record
- **WHEN** a tenant has no email
- **THEN** the picker shows the name alone, without empty parentheses

### Requirement: Move-in month is chosen from month and year dropdowns
The system SHALL let an admin choose a tenant's move-in month on a property's Tenants tab from a Month dropdown and a Year dropdown, both when adding a tenant and on each tenant's row, so it works the same in every browser (Firefox and desktop Safari show `<input type="month">` as a plain text box).

#### Scenario: Adding defaults to this month
- **WHEN** an admin opens the Tenants tab
- **THEN** the add row's Month and Year dropdowns show the current month

#### Scenario: Changing a tenant's month
- **WHEN** an admin picks a new month or year on a tenant's row
- **THEN** the new move-in month is saved and shown after a reload

#### Scenario: Saving fails
- **WHEN** saving a changed move-in month fails
- **THEN** an error is shown and the row's dropdowns go back to the stored month

## Known Gaps
- Tenants assigned before `moveInMonth` existed have none and are charged the current month only until an admin sets it.
