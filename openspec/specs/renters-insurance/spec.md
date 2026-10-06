# renters-insurance Specification

## Purpose
Tenants record their renters insurance policy so the landlord can see coverage dates.

## Requirements

### Requirement: Record policy
The system SHALL let a signed-in user save company name, policy number, start date and end date to their user document under `insurance`.

#### Scenario: Valid submission
- **WHEN** company name and policy number are 1 to 100 characters and the end date is after the start date
- **THEN** the dates are stored as formatted date strings and the form returns "Form submitted"

#### Scenario: End date not after start date
- **WHEN** the end date is on or before the start date
- **THEN** validation fails with "End date must be after start date" on the end date field

### Requirement: Prefill existing policy
The system SHALL load a stored policy into the form.

#### Scenario: Existing policy
- **WHEN** the user has an `insurance` field
- **THEN** the form is prefilled, with the stored date strings parsed back to dates

### Requirement: Admin visibility of insurance
The system SHALL show a user's policy on the Insurance tab of the admin user info modal, or "No insurance info" if none exists.

#### Scenario: Policy on file
- **WHEN** an admin opens a user's info modal and selects the Insurance tab
- **THEN** company name, policy number and effective dates are shown

#### Scenario: No policy
- **WHEN** the user has no `insurance` field
- **THEN** the tab shows "No insurance info"

### Requirement: Missing-insurance flag
The system SHALL badge tenants who have no insurance on file in the admin user list.

#### Scenario: Tenant without policy
- **WHEN** an admin views the user list and a user with `permissions == "user"` has no `insurance`
- **THEN** a warning badge appears on their avatar

## Known Gaps
- There is no expiry reminder or notification.
