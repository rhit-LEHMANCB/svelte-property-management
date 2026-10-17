# Spec Delta

## Purpose

Lease billing decides what a lease charges for rent over time: how partial months are prorated, when each month is due, how overpaid months become credit, and when late fees apply.

## ADDED Requirements

### Requirement: Prorated partial months
The system SHALL charge each month of a lease its rent times the days the lease covers in that month, counting the start and end days, divided by the days in that month, rounded to the nearest cent. A month the lease covers in full is charged the full rent. This applies to every lease.

#### Scenario: Mid-month start and end
- **WHEN** a lease with rent 1500 runs 2026-10-15 to 2027-03-14
- **THEN** October 2026 is charged $822.58 (17 of 31 days), November through February $1,500.00 each, and March 2027 $677.42 (14 of 31 days)

#### Scenario: Starts on the 1st, month to month
- **WHEN** a lease with rent 1200 starts 2026-11-01 and has no end date
- **THEN** every month is charged $1,200.00

#### Scenario: Start and end in one month
- **WHEN** a lease with rent 900 runs 2027-02-10 to 2027-02-19
- **THEN** February 2027 is charged $321.43 (10 of 28 days) and no other month is charged

#### Scenario: Leap year
- **WHEN** a lease with rent 1000 starts 2028-02-15
- **THEN** February 2028 is charged $517.24 (15 of 29 days)

### Requirement: Rent due dates
The system SHALL make the first month's rent due on the lease start date and every later month's rent due on the 1st of that month, using dates in the business time zone (America/Indiana/Indianapolis). A month's rent counts toward the balance, and can be paid, from 7 days before its due date.

#### Scenario: Mid-month start
- **WHEN** a lease with rent 1500 starts 2026-10-15 and today is 2026-10-08
- **THEN** October's $822.58 is owed and due on 2026-10-15, not 2026-10-01

#### Scenario: Before the first payable day
- **WHEN** today is 2026-10-07 for the same lease
- **THEN** nothing is owed yet

#### Scenario: Later months
- **WHEN** the same lease reaches 2026-10-25
- **THEN** November's $1,500.00 is also owed, due on 2026-11-01

#### Scenario: Start on the 1st
- **WHEN** a lease starts 2026-11-01
- **THEN** November's rent is due on 2026-11-01 and can be paid from 2026-10-25

### Requirement: Credit from overpaid months
The system SHALL treat any amount recorded against a month beyond what that month is charged as credit on the lease, apply the credit to the oldest rent still owed, and show the unused credit to the admin and the lease's tenants as "Credit". Credit is never refunded or paid out by the app.

#### Scenario: Existing lease recomputed
- **WHEN** a lease with rent 1500 started 2026-10-15 and $1,500.00 was recorded for October before proration
- **THEN** October is paid, the lease has $677.42 of credit, and November owes $822.58

#### Scenario: Credit larger than what is owed
- **WHEN** a lease has $677.42 of credit and nothing else is owed this month
- **THEN** the balance is $0.00 and the credit $677.42 is shown

### Requirement: Late fee terms
The system SHALL store on each lease a late fee amount in dollars (0 or more, at most two decimals) and a whole number of grace days from 0 to 31. A month's late fee is the lease's current late fee amount.

#### Scenario: Valid terms
- **WHEN** an admin saves a lease with late fee 75 and grace days 5
- **THEN** the lease stores late fee 75 and grace days 5

#### Scenario: Invalid terms
- **WHEN** the late fee is negative or has more than two decimals, or the grace days are not a whole number from 0 to 31
- **THEN** nothing is saved and the form shows the error next to the field

#### Scenario: No late fee
- **WHEN** a lease's late fee is 0
- **THEN** no late fee is ever charged on it

### Requirement: Late fee charged once per late month
The system SHALL charge a month's late fee once, through the daily billing job, when less than that month's rent had been paid (counting credit) by the end of the day that is the grace days after its due date, provided that due date is on or after the lease's late-fee start date. A late fee is owed only once the job has recorded it, and is due on the day after the grace period ends. Deposits never incur late fees.

#### Scenario: Unpaid after grace
- **WHEN** a lease has rent 1500, late fee 75, grace 5 days, November's rent is due 2026-11-01 and only $1,000.00 was paid by the end of 2026-11-06
- **THEN** the daily run on 2026-11-07 records a $75.00 late fee for November, due 2026-11-07, and the lease owes it from then on

#### Scenario: Before the run
- **WHEN** the grace period has ended but the daily job has not yet run
- **THEN** no late fee is owed yet

#### Scenario: Paid within grace
- **WHEN** November's rent was paid in full on 2026-11-06
- **THEN** no late fee is charged for November

#### Scenario: Paid after the fee
- **WHEN** November's late fee was charged and the rent is paid in full on 2026-11-10
- **THEN** the $75.00 late fee is still owed until it is paid or waived

#### Scenario: Paid late but before the run
- **WHEN** November's rent was paid in full on 2026-11-07 at 05:00, before that day's run
- **THEN** the run still charges the fee, because less than the rent was paid by the end of 2026-11-06

#### Scenario: Missed run
- **WHEN** the job does not run on 2026-11-07 and runs next on 2026-11-08
- **THEN** that run charges November's fee with its due date 2026-11-07

#### Scenario: Before the late-fee start date
- **WHEN** a month's due date is before the lease's late-fee start date
- **THEN** no late fee is ever charged for that month

#### Scenario: Unpaid deposit
- **WHEN** a deposit is unpaid after its due date
- **THEN** no late fee is charged for it

### Requirement: Waive a late fee
The system SHALL let an admin waive one month's charged late fee on a lease, which removes whatever of that fee is still unpaid; amounts already paid toward it stay recorded. Only admins can waive.

#### Scenario: Waive
- **WHEN** an admin waives November's unpaid $75.00 late fee
- **THEN** the lease no longer owes it and the admin list shows it as waived

#### Scenario: Tenant tries to waive
- **WHEN** a signed-in tenant sends a waive request
- **THEN** the response is 401, as for every admin-only action, and nothing changes
