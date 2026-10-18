# Spec Delta

## Purpose

Defines the first page each role lands on: a tenant's summary of what they owe, their lease, maintenance and insurance, and an admin's list of what needs attention, so the most common next step is one click away.

## ADDED Requirements

### Requirement: Tenant summary tiles
The system SHALL show a tenant three tiles on `/`: the balance owed across their leases (as Payment shows it) with the earliest due date and a "Make a payment" link, whether autopay is on for them on a current or upcoming lease, and the number of open maintenance requests for their property with a link to Maintenance. Each figure uses only the tenant's own leases, enrollment and property.

#### Scenario: Balance owed
- **WHEN** a tenant who owes $1,000.00 with rent due October 1 opens `/`
- **THEN** the balance tile shows $1,000.00, "Due October 1, 2026" and a "Make a payment" link to `/payment`

#### Scenario: Only an ended lease, still owing
- **WHEN** a tenant whose only lease has ended still owes $500.00
- **THEN** the "no property" notice is shown above a balance tile with $500.00 and a "Make a payment" link, and no autopay or maintenance tiles are shown

#### Scenario: Nothing owed
- **WHEN** a tenant owes nothing
- **THEN** the balance tile shows $0.00 and says nothing is due, with no payment link

#### Scenario: Autopay on
- **WHEN** the tenant is enrolled in autopay on a current or upcoming lease
- **THEN** the autopay tile shows "On" with a link to `/payment`; otherwise it shows "Off" and "Set up autopay"

#### Scenario: Open requests
- **WHEN** the tenant's property has 2 open maintenance requests
- **THEN** the maintenance tile shows 2 and links to `/maintenance`

#### Scenario: Another household's data
- **WHEN** another tenant on a different property has a balance, autopay and open requests
- **THEN** none of them affects this tenant's tiles

### Requirement: Tenant lease and insurance cards
The system SHALL show a tenant a "Your lease" card for each current or upcoming lease, a "Renters insurance" card with the policy's status, and their ended leases with a deposit in one "Past leases" card. The insurance status is "On file" when the policy ends more than 30 days from today, "Ending soon" within 30 days, "Expired" after its end date, and "Missing" when none is saved; each links to `/insurance`.

#### Scenario: Ending soon
- **WHEN** the tenant's saved policy ends in 20 days
- **THEN** the insurance card shows "Ending soon" with the end date and an "Update insurance" link

#### Scenario: Missing
- **WHEN** the tenant has never saved a policy
- **THEN** the insurance card shows "Missing" and an "Add insurance" link

#### Scenario: Upcoming lease
- **WHEN** a tenant whose only lease starts on October 23, 2099 and owes its $500.00 deposit opens `/`
- **THEN** the "Your lease" card shows the lease as upcoming with its dates, the balance tile shows $500.00 with a "Make a payment" link, and no notice above the tiles repeats the start date

#### Scenario: No lease
- **WHEN** a tenant has no lease on file
- **THEN** the dashboard shows the existing "no property" notice and no lease, balance or maintenance tiles

### Requirement: Admin needs-attention list
The system SHALL show an admin on `/admin` a "Needs attention" card listing the number of open maintenance requests, ended leases whose deposit is still to settle, and leases whose latest autopay charge failed or gave up while money is still owed, each with a link to where it is handled. A row whose count is 0 is not shown; when all are 0 the card says nothing needs attention.

#### Scenario: Counts
- **WHEN** there are 3 open requests, 1 deposit to settle and no failed autopay charges
- **THEN** the card lists "3 open maintenance requests" linking to `/admin/maintenance` and "1 deposit to settle" linking to `/admin/properties`, and no autopay row

#### Scenario: All clear
- **WHEN** every count is 0
- **THEN** the card says "Nothing needs attention right now."

#### Scenario: Tenant
- **WHEN** a tenant requests `/admin`
- **THEN** no counts are loaded or returned (the existing admin route enforcement applies)
