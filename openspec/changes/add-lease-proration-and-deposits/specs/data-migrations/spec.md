# Spec Delta

## ADDED Requirements

### Requirement: Billing terms on existing leases
The system SHALL include a migration that gives every lease without late-fee terms no deposit, a late fee of 5% of its rent rounded to the cent, 5 grace days, and a late-fee start date of the day the migration runs, so months due before then never incur a late fee. Recorded payments are not changed; proration applies to existing leases through the billing rules.

#### Scenario: Existing lease
- **WHEN** a lease with rent 1500 and no late-fee terms exists and the migration runs on 2026-10-20
- **THEN** it has no deposit, late fee 75, grace days 5 and late-fee start date `2026-10-20`, and its payment history is unchanged

#### Scenario: Run again
- **WHEN** the migration runs again, or a lease already has late-fee terms because it was saved by the new code
- **THEN** that lease is left as it is

#### Scenario: Prorated after the migration
- **WHEN** an existing lease started 2026-10-15 with rent 1500 and $1,500.00 was recorded for October
- **THEN** after the migration October is charged $822.58 and the lease shows $677.42 of credit
