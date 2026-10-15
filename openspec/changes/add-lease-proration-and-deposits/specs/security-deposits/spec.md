# Spec Delta

## Purpose

A security deposit is money a tenant pays to secure a lease, held separately from rent and settled when the lease ends by recording what is returned and what is kept.

## ADDED Requirements

### Requirement: Deposit terms
The system SHALL store on each lease an optional deposit amount in dollars (greater than 0, at most two decimals) and a deposit due date, which defaults to the lease start date. A lease without a deposit amount has no deposit.

#### Scenario: Deposit with default due date
- **WHEN** an admin saves a lease starting 2026-11-01 with deposit 1000 and no deposit due date
- **THEN** the lease stores deposit 1000 due 2026-11-01

#### Scenario: Chosen due date
- **WHEN** the admin sets the deposit due date to 2026-10-20
- **THEN** the lease stores that due date

#### Scenario: Invalid deposit
- **WHEN** the deposit is 0 or less or has more than two decimals
- **THEN** nothing is saved and the form shows the error next to the field

#### Scenario: Lowered below what is paid
- **WHEN** $600.00 of a $1,000.00 deposit has been paid and the admin changes the deposit to 500
- **THEN** nothing is saved and the form says the deposit cannot be less than the $600.00 already paid

### Requirement: Deposit owed and paid
The system SHALL count a lease's unpaid deposit toward what the lease owes from the moment the lease is saved, including while it is upcoming, and SHALL accept it in parts. Deposit payments are recorded separately from rent and never reduce rent owed.

#### Scenario: Upcoming lease
- **WHEN** today is 2026-10-10 and a tenant's only lease starts 2026-11-01 with a $1,000.00 deposit due 2026-11-01
- **THEN** `/payment` lists that lease with $1,000.00 owed, due 2026-11-01

#### Scenario: Partial deposit
- **WHEN** the tenant pays $400.00 toward that deposit
- **THEN** $600.00 of deposit is still owed and $400.00 is held

#### Scenario: Deposit is not rent
- **WHEN** a payment pays a deposit in full
- **THEN** no month's rent is reduced by it

### Requirement: Deposit held
The system SHALL treat the deposit held on a lease as the deposit paid minus any recorded settlement, and SHALL show it to the admin and the lease's tenants.

#### Scenario: Before settlement
- **WHEN** $1,000.00 of deposit has been paid and nothing is settled
- **THEN** the admin lease list and the tenant's lease card show $1,000.00 held

#### Scenario: Ended lease still holding a deposit
- **WHEN** a lease has ended and still holds a deposit
- **THEN** the admin lease list marks it "Deposit to settle"

### Requirement: Settle a deposit
The system SHALL let an admin, on or after the day after a lease's end date, record one settlement of its deposit: an amount returned and zero or more kept deductions, each with an amount greater than 0 and a reason. Returned plus kept SHALL equal the deposit paid. The admin can replace the settlement later. Money is returned outside the app; the app only records it.

#### Scenario: Settled
- **WHEN** a lease with $1,000.00 paid has ended and the admin records $800.00 returned and $200.00 kept for "Carpet cleaning"
- **THEN** the settlement is stored with who recorded it and when, and the deposit shows as settled with nothing held

#### Scenario: Does not add up
- **WHEN** returned plus kept is not equal to the deposit paid
- **THEN** nothing is saved and the form says the amounts must add up to the deposit paid

#### Scenario: Missing reason
- **WHEN** a deduction has no reason
- **THEN** nothing is saved and the form shows the error next to that deduction

#### Scenario: Lease not ended
- **WHEN** the admin tries to settle the deposit of a current or upcoming lease
- **THEN** the response is 409 and nothing is saved

#### Scenario: Correct a settlement
- **WHEN** the admin records a new settlement of $900.00 returned and $100.00 kept for an already settled deposit
- **THEN** it replaces the earlier one

#### Scenario: Tenant tries to settle
- **WHEN** a signed-in tenant sends a settlement request
- **THEN** the response is 403 and nothing changes

#### Scenario: Deposit paid after settlement
- **WHEN** a deposit payment is recorded on a lease whose deposit is already settled
- **THEN** the paid amount no longer matches the settlement, the lease shows "Deposit to settle" again, and the admin must record a new settlement

### Requirement: Tenant sees the deposit settlement
The system SHALL show a tenant, on their dashboard, each of their ended leases that has a deposit, with the deposit paid and either the amount held or the settlement: amount returned and each deduction with its reason.

#### Scenario: Settled
- **WHEN** a tenant's ended lease has a settlement of $800.00 returned and $200.00 kept for "Carpet cleaning"
- **THEN** the dashboard shows the deposit paid, $800.00 returned and $200.00 kept for "Carpet cleaning"

#### Scenario: Another tenant's lease
- **WHEN** a tenant who is not on a lease opens their dashboard
- **THEN** that lease's deposit and settlement are not shown to them
