# Spec Delta

## Purpose

A lease records who rents a property, for how much and for how long. It is the source of truth for which property a tenant lives at and what they owe.

## ADDED Requirements

### Requirement: Lease record
The system SHALL store each lease in `leases/{leaseId}` with its property, one or more tenant user ids, a monthly rent, a start date, an optional end date and an optional document. A lease with no end date runs month to month.

#### Scenario: Valid lease
- **WHEN** an admin saves a lease with rent 1250, start 2026-11-01, no end date and one tenant
- **THEN** a lease document stores the property id, the tenant id, rent 1250, start `2026-11-01` and no end date

#### Scenario: Invalid fields
- **WHEN** rent is not greater than 0 or has more than two decimal places, the start date is missing, or the end date is not after the start date
- **THEN** nothing is saved and the form shows the error next to the field

#### Scenario: No tenants
- **WHEN** an admin saves a lease with no tenant emails
- **THEN** nothing is saved and the form shows "A lease needs at least one tenant."

### Requirement: Lease status
The system SHALL treat a lease as upcoming before its start date, current from its start date through its end date (or with no end date), and ended after its end date, using dates in the business time zone (America/Indiana/Indianapolis).

#### Scenario: Current lease
- **WHEN** today is 2026-10-13 and a lease runs 2026-09-01 to 2027-08-31
- **THEN** its status is current

#### Scenario: Ended lease
- **WHEN** today is 2026-10-13 and a lease ended 2026-09-30
- **THEN** its status is ended

#### Scenario: Upcoming lease
- **WHEN** today is 2026-10-13 and a lease starts 2026-11-01
- **THEN** its status is upcoming

### Requirement: Add tenants by email
The system SHALL let an admin add tenants to a lease by email, attaching an existing non-admin user with that email, ignoring case and surrounding spaces.

#### Scenario: Existing tenant
- **WHEN** an admin saves a lease with the email of an existing tenant
- **THEN** that user's id is on the lease and no account is created

#### Scenario: Same email twice
- **WHEN** the same email appears twice, in any case
- **THEN** it is added once

#### Scenario: Malformed email
- **WHEN** an entry is not a valid email address
- **THEN** nothing is saved and the form names the entry

### Requirement: New tenant accounts from a lease
The system SHALL create an account for each lease email with no user, as admin user creation does, and SHALL send it a welcome email that names the property address and the lease start date.

#### Scenario: New email
- **WHEN** an admin saves a lease with an email that has no account
- **THEN** a tenant account with a Stripe customer and the placeholder name "New User" is created and put on the lease
- **AND** a welcome email with a password-setup link, the property's street address and city, and the start date is sent to that address
- **AND** the email names the company as "Lehman Family LLC"

#### Scenario: Saving fails after accounts were created
- **WHEN** the lease cannot be saved after new accounts were created for it
- **THEN** those accounts, their Stripe customers and their user documents are removed, nothing is saved, and the admin sees an error

#### Scenario: Welcome email fails
- **WHEN** the lease is saved but a welcome email cannot be sent
- **THEN** the lease and the account are kept
- **AND** the admin sees which address did not receive the email and that the person can use "Forgot password" on the sign-in page

### Requirement: Lease conflicts
The system SHALL refuse to save a lease, naming each email at fault and creating nothing, when an email belongs to an admin or to a user who is on another lease whose dates overlap this one at any property.

#### Scenario: Admin email
- **WHEN** a lease includes an admin's email
- **THEN** nothing is saved or created and the form says that address belongs to an admin

#### Scenario: Tenant on an overlapping lease
- **WHEN** a lease from 2026-11-01 includes a tenant who is on a lease at another property that runs to 2027-06-30
- **THEN** nothing is saved or created and the form names that address and the other property

#### Scenario: Back-to-back leases
- **WHEN** a tenant's lease ends 2026-10-31 and a new lease for them starts 2026-11-01
- **THEN** the lease is saved

### Requirement: Overlap warning
The system SHALL warn an admin before saving a lease whose dates overlap another lease at the same property, and SHALL save it only after the admin confirms.

#### Scenario: Overlap
- **WHEN** an admin saves a lease that overlaps another lease at the same property
- **THEN** nothing is saved and the admin sees the overlapping lease's dates and tenants with a choice to save anyway

#### Scenario: Confirmed
- **WHEN** the admin chooses to save anyway
- **THEN** the lease is saved

### Requirement: Admin lease list
The system SHALL show admins every lease of a property on a Leases tab of the property edit page, newest start date first, with its status, dates, rent and tenant names and emails.

#### Scenario: Property with leases
- **WHEN** an admin opens the Leases tab of a property with an ended and a current lease
- **THEN** both are listed with their status, the current one first

#### Scenario: Property with no leases
- **WHEN** the property has no leases
- **THEN** the tab says there are no leases and offers to create one

### Requirement: Create a lease
The system SHALL let an admin create a lease for a property from a form whose rent starts at the property's rent.

#### Scenario: Prefilled rent
- **WHEN** an admin opens the new-lease form for a property with rent 1200
- **THEN** the rent field shows 1200 and can be changed

#### Scenario: Unknown property
- **WHEN** the property does not exist
- **THEN** the page responds 404

### Requirement: Edit a lease
The system SHALL let an admin change a lease's rent, dates and tenants, applying the same validation, account creation, conflict and overlap rules as creating one.

#### Scenario: Add a tenant
- **WHEN** an admin adds a new email to an existing lease
- **THEN** an account is created for it, it is put on the lease and it gets the welcome email

#### Scenario: Remove a tenant
- **WHEN** an admin removes one of two tenants
- **THEN** the removed user's account is kept and they are no longer on the lease

#### Scenario: Remove the last tenant
- **WHEN** an admin removes every tenant
- **THEN** nothing is saved and the form shows "A lease needs at least one tenant."

#### Scenario: Change the rent
- **WHEN** an admin changes the rent
- **THEN** months that already have a payment entry keep their recorded remaining balance, and months without one are charged the new rent

### Requirement: Delete a lease
The system SHALL let an admin delete a lease that has no recorded payments, removing it and its document, and SHALL refuse to delete a lease with payments.

#### Scenario: No payments
- **WHEN** an admin deletes a lease with no payment history
- **THEN** the lease and its document are removed

#### Scenario: Has payments
- **WHEN** an admin deletes a lease that has recorded payments
- **THEN** the response is 409, nothing is removed and the admin is told to set an end date instead

### Requirement: Lease document
The system SHALL let an admin attach or replace one PDF of at most 10 MB on a lease, and SHALL serve it only to admins and the lease's tenants, never by a public URL.

#### Scenario: Attach
- **WHEN** an admin uploads a PDF when creating or editing a lease
- **THEN** it is stored as the lease's document, replacing any earlier one

#### Scenario: Wrong type or too large
- **WHEN** the file is not a PDF or is larger than 10 MB
- **THEN** nothing is saved and the form says why

#### Scenario: Tenant on the lease
- **WHEN** a tenant on the lease opens its document link
- **THEN** the PDF is returned

#### Scenario: Other tenant
- **WHEN** a signed-in tenant not on the lease requests its document
- **THEN** the response is 403

#### Scenario: Direct storage read
- **WHEN** anyone requests the stored file directly from Firebase Storage
- **THEN** the read is denied

### Requirement: Tenant lease card
The system SHALL show a tenant, on their dashboard, a read-only card for each of their current and upcoming leases with the property address, dates, monthly rent, the other tenants' names and a link to the document if there is one.

#### Scenario: Current lease
- **WHEN** a tenant with a current lease that has a document opens the dashboard
- **THEN** the card shows the address, dates, rent, the other tenants' names and a document link

#### Scenario: Month to month
- **WHEN** the lease has no end date
- **THEN** the card says it is month to month

#### Scenario: No lease
- **WHEN** a tenant has no current or upcoming lease
- **THEN** the dashboard says no lease is on file
