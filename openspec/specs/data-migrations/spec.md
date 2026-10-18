# data-migrations Specification

## Purpose
Changes to stored data ship with the code that needs them. Each migration runs once per Firebase project, in order, during deploy, and leaves a record that tells a human exactly when it ran and how to undo it.

## Requirements

### Requirement: Migration files
The system SHALL keep each migration as a file in `migrations/` named `NNNN-short-name`, with a four-digit sequence number, a description and written undo steps, and SHALL apply migrations in sequence order.

#### Scenario: Order
- **WHEN** `0001-leases-from-tenant-links` and `0002-example` are both pending
- **THEN** 0001 is applied before 0002

#### Scenario: Missing undo steps
- **WHEN** a migration file has no undo steps
- **THEN** the test suite fails

### Requirement: Applied once
The system SHALL record each applied migration in `_migrations/{name}` and SHALL skip migrations already recorded as applied.

#### Scenario: Pending migration
- **WHEN** the runner finds a migration with no record
- **THEN** it applies it and writes a record with the start time, the finish time, the outcome and a summary of what changed

#### Scenario: Already applied
- **WHEN** the runner finds a migration recorded as applied
- **THEN** it does not run it again

### Requirement: Safe to re-run
Every migration SHALL be safe to run again on data it has already changed, so that a run interrupted part way can be repeated.

#### Scenario: Interrupted run
- **WHEN** a migration failed part way and the runner runs it again
- **THEN** it finishes the work without duplicating what the first run did

### Requirement: Restore point
The system SHALL record, before applying any migration, the time it is about to start and the name and snapshot time of the database's newest finished backup, in the migration's record and in the run's output.

#### Scenario: Start time and backup
- **WHEN** a deploy applies a migration and the database has finished backups
- **THEN** the workflow log and `_migrations/{name}` show the start time in UTC and the newest finished backup's name and snapshot time, before any data is changed

#### Scenario: No backup yet
- **WHEN** the database has a backup schedule but no backup has finished yet
- **THEN** the run logs a warning, records the restore point as none, and continues

### Requirement: Backup schedule required
The system SHALL refuse to apply migrations to a database that has no backup schedule, and SHALL fail the run with a message saying how to create one. The check is skipped against the Firestore emulator.

#### Scenario: No schedule
- **WHEN** the runner targets a database with no backup schedule
- **THEN** no migration is applied and the run fails with that message

#### Scenario: Schedule present
- **WHEN** the database has at least one backup schedule
- **THEN** pending migrations are applied

### Requirement: Failure stops the deploy
The system SHALL stop at the first failed migration, record it as failed with the error, and fail the deploy before the new site version goes live.

#### Scenario: Migration fails
- **WHEN** a migration throws
- **THEN** later migrations are not applied, its record says failed with the error message, and hosting is not deployed

### Requirement: Dry run
The system SHALL offer a dry run that reports what each pending migration would change without writing anything, including the `_migrations` record.

#### Scenario: Dry run
- **WHEN** a person runs `npm run migrate -- --dry-run`
- **THEN** the planned changes are printed and no document is written

### Requirement: Runs during deploy
The system SHALL apply pending migrations in the deploy workflow for develop and production after Firestore rules and indexes deploy and before hosting deploys, using that environment's credentials.

#### Scenario: Deploy with a pending migration
- **WHEN** a commit with a new migration is pushed to develop
- **THEN** the deploy applies it to the dev project before deploying hosting

#### Scenario: Nothing pending
- **WHEN** every migration is already applied
- **THEN** the step reports nothing to do and the deploy continues

### Requirement: Single runner
The system SHALL let only one migration run at a time per project, and a second run SHALL fail without applying anything while another holds the lock, unless the lock is more than 30 minutes old.

#### Scenario: Concurrent runs
- **WHEN** a run starts while another run holds a lock taken 2 minutes ago
- **THEN** the second run fails and applies nothing

#### Scenario: Stale lock
- **WHEN** the lock was taken more than 30 minutes ago
- **THEN** the new run takes the lock and continues

### Requirement: Leases from existing tenant links
The system SHALL include a migration that creates, for each property with tenants linked in `junction_user_property`, one lease with those tenants, the property's rent, a start on the first day of the earliest move-in month and no end date, and that copies the property's payment history and recorded invoices to the lease.

#### Scenario: Property with tenants
- **WHEN** a property with rent 1000 has two linked tenants with move-in months 2026-03 and 2026-05
- **THEN** one lease is created for both with rent 1000 and start 2026-03-01
- **AND** the property's `payment_history` and `recorded_invoices` documents are copied under the lease

#### Scenario: No move-in month
- **WHEN** no linked tenant has a move-in month
- **THEN** the lease starts on the first day of the month the migration runs

#### Scenario: Balance unchanged
- **WHEN** the migration has run
- **THEN** a tenant whose move-in month was the earliest at their property owes the same balance as before

#### Scenario: Run again
- **WHEN** the migration runs again
- **THEN** no second lease is created for a property it already migrated

#### Scenario: Links kept
- **WHEN** the migration has run
- **THEN** the `junction_user_property` documents and the property's `payment_history` are left in place

### Requirement: Prototype leases archived
The system SHALL include a migration that moves every document in `leases` without a `tenantIds` list, written by the 2024 leases prototype, to `legacy_leases` under the same id, adding when and by which migration it was moved.

#### Scenario: Prototype lease moved
- **WHEN** `leases` holds a prototype document with `users`, `rent`, `startDate` and `endDate`
- **THEN** after the migration it is gone from `leases` and `legacy_leases` holds its data with `archivedAt` and `archivedBy`

#### Scenario: Current leases untouched
- **WHEN** a lease has a `tenantIds` list
- **THEN** it and its subcollections are left in place

#### Scenario: Unexpected subcollections
- **WHEN** a document without `tenantIds` has subcollections
- **THEN** the run stops with an error naming the document and nothing is moved

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
