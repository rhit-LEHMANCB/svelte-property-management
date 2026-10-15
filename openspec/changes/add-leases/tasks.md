# Tasks

## 1. Test and tooling groundwork

- [x] 1.1 Add `array-contains` (and `array-contains-any`) to `tests/helpers/fakeFirestore.ts` and verify with new cases in `tests/handlers/fakeFirestore.test.ts`
- [x] 1.2 Add `tsx` as a dev dependency and an `npm run migrate` script; verify `npm run migrate -- --help` prints usage

## 2. Migration framework

- [x] 2.1 Write `scripts/migrate.ts`: load `migrations/*.ts` in sequence order, read `_migrations`, take and release the `_migrations/_lock` lock (30-minute stale takeover), record `startedAt` before each migration, then `applied` or `failed` with the summary or error, and exit non-zero on failure; verify with unit tests run against the fake Firestore covering order, skipping applied migrations, failure stopping later ones, and both lock cases
- [x] 2.2 Add the dry-run `ctx.write` wrapper so no document (including `_migrations`) is written with `--dry-run`; verify with a unit test that a dry run leaves the fake store unchanged
- [x] 2.3 Add the backup-schedule check and restore-point lookup through the Firestore Admin REST API (fail with instructions when there is no schedule; record the newest `READY` backup for `(default)`, or warn and record none), skipped when `FIRESTORE_EMULATOR_HOST` is set; verify with unit tests on the response parsing (schedule present, no schedule, only unfinished backups, request error)
- [x] 2.4 Add `tests/unit/migrations.test.ts` checking every file in `migrations/` for the `NNNN-name` pattern, unique numbers, and non-empty `description` and `undo`; verify it fails on a deliberately bad fixture
- [x] 2.5 Add the migrate step to `.github/workflows/firebase-hosting-merge.yml` between the rules deploy and the hosting deploy, with the service account written to a temp file the same way as the rules step; verify with `npx actionlint` if available, otherwise by reading the YAML against the rules step
- [x] 2.6 Document migrations in `README.md` (how to write one, dry run, how the deploy runs them, the backup-schedule prerequisite and how to create it, where the start time and restore point are shown, how to roll back including restoring a backup into a new database); verify the documented commands run as written against the emulator

## 3. Lease model and rules

- [x] 3.1 Add the lease zod schema (rent, dates, emails, end after start) to `src/lib/schemas/index.ts`, with unit tests for each validation scenario in the `leases` spec
- [x] 3.2 Write `src/lib/server/leases.ts` with status (business time zone), date-overlap and conflict helpers; verify with unit tests for current, ended, upcoming, back-to-back and open-ended leases
- [x] 3.3 Add the `leases` composite index (`propertyId` asc, `startDate` desc) to `firestore.indexes.json`; verify the JSON parses and the e2e emulator starts
- [x] 3.4 Change `storage.rules` to allow public `get` only under `properties/` and `users/`; extend `tests/e2e/specs/rules.spec.ts` with a denied `leases/` read, and verify the rules spec passes

## 4. Accounts and email

- [x] 4.1 Move account creation from `/api/user/add` into `createTenantAccount(email, { sendWelcome })` in `src/lib/server/users.ts`, returning `{ uid, undo }`; verify the existing `user-management` handler tests still pass unchanged
- [x] 4.2 Extend `renderWelcomeEmail` with an optional `{ address, startDate }` sentence, using "Lehman Family LLC" in all copy; verify with `tests/unit/emailTemplates.test.ts` cases with and without a lease, including HTML escaping

## 5. Saving and deleting leases

- [x] 5.1 Implement `saveLease` (normalize emails, resolve users, conflicts, overlap with `confirmOverlap`, create accounts with undo, transactional re-check and write, emails after commit, per-email results); verify with handler tests covering every scenario of Add tenants by email, New tenant accounts from a lease, Lease conflicts, Overlap warning and Edit a lease
- [x] 5.2 Add PDF handling to `saveLease`: size, type and `%PDF-` checks, awaited write under `leases/{id}/` with a new name per upload, replacing any earlier one; verify with handler tests for a valid PDF, a non-PDF and an 11 MB file
- [x] 5.3 Add `GET /api/lease/[leaseId]/document` (admin or tenant on the lease, else 403); verify with handler tests for an admin, a tenant on the lease, another tenant and an unknown lease
- [x] 5.4 Add `DELETE /api/lease/[leaseId]` (admin only, 409 when `payment_history` has documents, removes the document file); verify with handler tests for both cases and a non-admin

## 6. Admin pages

- [x] 6.1 Replace the Tenants tab on the property edit page with a Leases tab listing leases newest first with status, dates, rent, tenant names and emails, plus the empty state; remove `TenantPicker.svelte`, `MonthPicker.svelte`, `monthPicker.ts` and `tests/unit/monthPicker.test.ts`; verify with `npm run check` and an e2e spec for the list and empty state
- [x] 6.2 Build `LeaseForm.svelte` and the `leases/new` and `leases/[leaseId]` pages (rent prefilled from the property, email rows, PDF field with client-side size check, overlap confirmation with "Save anyway", per-email errors and email-failure notice, delete with confirmation); verify with e2e specs for create with an existing and a new email, a conflict, an overlap confirmed, an edit, and a delete refused for a lease with payments
- [x] 6.3 Remove `/api/property/[propertyId]/tenants`, `/api/user/[userId]/assoc`, `tests/handlers/tenant-assignment.test.ts` and `tests/e2e/specs/tenant-assignment.spec.ts`; verify `grep -r junction_user_property src` only matches property and user delete, and the full test suite passes

## 7. Tenant side and payments

- [x] 7.1 Change the authenticated layout to load the tenant's leases, expose `userLeases` and `userProperty` from the current lease, and pick the latest start date (with a log) for several current leases; verify with `access-control` handler tests for one, none and several current leases
- [x] 7.2 Add `startMonth`/`endMonth` to `monthsOwed`, `computeBalance` and `allocatePayment`, and make `loadHistories` take a parent document reference; verify with `tests/unit/payments.test.ts` cases for an ended lease, an upcoming lease and carry-over across a year boundary
- [x] 7.3 Rework `/payment` to list each current lease or lease with money owed, with its balance and a pay form that sends `leaseId`; verify with handler tests and update `tests/e2e/specs/payment.spec.ts`
- [x] 7.4 Make checkout require a `leaseId` the tenant is on, cap at that lease's balance and add `leaseID` to the invoice metadata; verify with `rent-payments` handler tests for a valid lease, someone else's lease and an amount above the balance
- [x] 7.5 Make the webhook record against `leases/{id}` (history and recorded invoices), with the legacy fallback by Stripe customer and property for invoices without `leaseID`; verify with handler tests for each Record payments scenario, including the fallback and a redelivery
- [x] 7.6 Add the lease cards to the tenant dashboard (address, dates or month to month, rent, other tenants' names, document link, "no lease on file"); verify with an e2e spec
- [x] 7.7 Make `/maintenance` use the current lease's property and redirect without one; verify with `maintenance-requests` handler tests for a current and an ended lease

## 8. Cascades

- [x] 8.1 Make property delete also remove its leases with their `payment_history` and `recorded_invoices`, and their documents; verify with `property-management` handler tests including a property with more than 500 documents
- [x] 8.2 Make user delete remove the user from every lease (keeping leases left with no tenants); verify with `user-management` handler tests for a shared lease and a sole-tenant lease

## 9. First migration

- [x] 9.1 Write `migrations/0001-leases-from-tenant-links.ts` (id `migrated-{propertyId}`, non-admin existing tenants, property rent, earliest move-in month or current month, copy `payment_history` and `recorded_invoices`, summary per property, undo steps); verify with tests against the fake Firestore for each scenario of Leases from existing tenant links, including a second run
- [x] 9.2 Make the dry run print each linked tenant's balance before and after; verify with a test where two housemates have different move-in months

- [x] 9.3 Write `migrations/0002-archive-prototype-leases.ts` to move 2024 prototype documents (no `tenantIds`) from `leases` to `legacy_leases`, after QA cycle 1 found them making the property edit page fail on dev; verify with tests against the fake Firestore for each scenario of Prototype leases archived, including a dry run

## 10. Integration checks

- [x] 10.1 Run `npm run migrate` against the emulator with seeded junction data, then load the app and verify the migrated tenant sees the same balance
- [x] 10.2 Run `npm run lint`, `npm run check`, `npm test`, `npm run test:e2e` and `npm run build` and verify they all pass

## Workflow follow-up

- Before the production deploy, a human creates the daily (2-day retention) and weekly (8-day retention) backup schedules on the production Firestore `(default)` database.
- After the production deploy, compare the `recorded_invoices` counts under each migrated property and its lease, and spot-check a few balances.
- A later change removes `junction_user_property` documents and the property-level `payment_history` once leases have run in production.
