# Spec Delta

## Purpose

A daily billing job charges late fees and emails tenants late-fee notices and due-date reminders, so that what tenants owe and are told follows the calendar without anyone acting.

## ADDED Requirements

### Requirement: Daily run
The system SHALL run the billing job once a day at 6:00 America/Indiana/Indianapolis, triggered by Google Cloud Scheduler calling `POST /api/jobs/daily` in each environment. The route SHALL accept a request bearing the environment's job secret, or a signed-in admin, and SHALL refuse every other caller.

#### Scenario: Scheduler with the secret
- **WHEN** Cloud Scheduler calls the route with `Authorization: Bearer` and the correct secret
- **THEN** the job runs and the response summarizes what it did

#### Scenario: Admin runs it on demand
- **WHEN** a signed-in admin calls the route
- **THEN** the job runs as it does on schedule

#### Scenario: Anyone else
- **WHEN** the route is called with no secret, a wrong secret, or as a signed-in tenant
- **THEN** the response is 401 and nothing runs

#### Scenario: No secret configured
- **WHEN** the environment has no job secret
- **THEN** only a signed-in admin can run the job

### Requirement: One run at a time, safe to repeat
The system SHALL let only one run proceed at a time and SHALL make a repeated run on the same day change nothing that the earlier run already did. Each run SHALL store a summary of what it charged and sent.

#### Scenario: Overlapping runs never send twice
- **WHEN** two runs reach the same notice for the same tenant
- **THEN** only one of them sends it

#### Scenario: Overlapping calls
- **WHEN** a second call arrives while a run is in progress
- **THEN** the second call is answered 409 and does nothing

#### Scenario: Run again the same day
- **WHEN** the job runs twice on 2026-11-07
- **THEN** the second run charges no fee twice and sends no email twice

#### Scenario: Summary
- **WHEN** a run finishes
- **THEN** a record for that day lists the late fees charged, the emails sent and any errors

### Requirement: Late-fee notice
The system SHALL email each tenant on a lease, once, when the job charges a late fee on it. The email names the month, the fee, the lease's address and the total owed, and links to `/payment`. It is sent from Lehman Family LLC.

#### Scenario: Fee charged
- **WHEN** the run on 2026-11-07 charges a $75.00 late fee for November on a lease with two tenants
- **THEN** each tenant gets one late-fee email for November

#### Scenario: Email fails
- **WHEN** sending one tenant's email fails
- **THEN** the failure is recorded in the run summary, the response is 500 so Cloud Scheduler retries, and a later run sends it again; the fee itself stays charged once

### Requirement: Due-date reminders
The system SHALL email each tenant on a lease a reminder 7 days before, and on, the due date of each rent month and of the deposit, when that amount is not yet paid in full. A reminder is sent only on its day; a reminder for a day with no run is not sent later.

#### Scenario: Seven days before
- **WHEN** the run on 2026-10-25 finds November's $1,500.00 rent, due 2026-11-01, unpaid
- **THEN** each tenant on the lease gets one reminder naming the amount still owed, the due date and a link to `/payment`

#### Scenario: On the due day
- **WHEN** the run on 2026-11-01 finds November's rent still not paid in full
- **THEN** each tenant gets one due-today reminder

#### Scenario: Already paid
- **WHEN** November's rent was paid in full before 2026-10-25
- **THEN** no reminder is sent for it

#### Scenario: Deposit due
- **WHEN** a $1,000.00 deposit due 2026-11-15 is unpaid on 2026-11-08
- **THEN** each tenant gets a deposit reminder

#### Scenario: Ended lease
- **WHEN** a lease has ended
- **THEN** no reminders are sent for it
