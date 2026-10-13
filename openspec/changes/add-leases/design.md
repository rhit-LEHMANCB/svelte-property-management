# Design

## Context

Today a tenant is linked to a property by a `junction_user_property/{tenantId}_{propertyId}` document with an optional `moveInMonth`. That link is read in nine places: the authenticated layout, payment, maintenance, checkout, property delete, user delete, the assoc API, the tenants API and the property edit page. Payment history and recorded invoices live under `properties/{id}`. The balance logic in `src/lib/server/payments.ts` is pure and already handles carry-over months, so it only needs an end month. `/api/user/add` already creates an account with rollback. Storage rules allow a public `get` on every path. The handler tests use `tests/helpers/fakeFirestore.ts`, which supports `==`, `in` and transactions but not `array-contains`.

See proposal.md for motivation and `specs/` for the required behavior.

## Goals / Non-Goals

**Goals:**
- One server module owns lease rules: status, overlap, conflicts and balance inputs. Pages and APIs only call it.
- Creating accounts never leaves half-made users behind, and saving a lease never races another save into a conflict.
- A migration framework small enough to read in one sitting, runnable in CI, locally and against the emulator.

**Non-Goals:**
- Deleting `junction_user_property` documents or the property-level `payment_history`. A later migration does that once leases have run in production.
- Proration, deposits, renewals, e-signature.
- A general admin UI for migrations.

## Decisions

### Lease document shape
`leases/{leaseId}`: `propertyId`, `tenantIds: string[]`, `rent: number` (dollars, as on properties), `startDate: 'YYYY-MM-DD'`, `endDate: 'YYYY-MM-DD' | null`, `document: { path, fileName, size, uploadedAt } | null`, `createdAt`, `updatedAt`. Subcollections: `payment_history/{year}` (same shape as today) and `recorded_invoices/{invoiceId}`.

Dates are strings, not timestamps. A lease date is a calendar day, not an instant, and strings compare correctly, avoid time-zone shifts and match the month keys used for billing. Status is computed on read from "today" in the business time zone, never stored, so it cannot go stale.

Queries: by tenant (`tenantIds array-contains uid`, served by the automatic single-field index) and by property (`propertyId ==` ordered by `startDate desc`, a composite index added to `firestore.indexes.json`).

*Alternative:* one document per tenant-lease pair, like the junction. Rejected: the lease is the shared unit for rent and payments, and an array of at most a handful of ids is the simplest way to query by tenant.

### Saving a lease: order of steps
`src/lib/server/leases.ts` exposes `saveLease({ leaseId?, propertyId, input, confirmOverlap })`, used by both create and edit:
1. Validate the input with a zod schema (shared with the client form). Normalize emails (trim, lowercase, de-duplicate).
2. Resolve each email with `adminAuth.getUserByEmail`, which matches case-insensitively, then read the user document for `permissions`. Unknown emails are marked as new.
3. Check for conflicts: admins, and existing tenants on another lease that overlaps these dates (array-contains query per tenant, filtered in memory). Any conflict returns a per-email error, and nothing is created.
4. Check for overlap at the property. If there is one and `confirmOverlap` is false, return the overlapping leases so the page can ask.
5. Create accounts for new emails through the shared `createTenantAccount(email)` helper, collecting undo steps.
6. In a Firestore transaction, re-read the conflicting-lease queries for every tenant (including new ones) and write the lease. A conflict that appeared since step 3 aborts the transaction.
7. If step 6 fails, run the undo steps and report the error.
8. After the commit, send welcome emails to the new accounts and return any addresses that failed.

Re-checking inside the transaction closes the race between two admins saving at once. Account creation cannot be in a transaction (Auth and Stripe), hence the undo list, the same pattern `/api/user/add` already uses.

### Shared account creation
Move the body of `/api/user/add` into `src/lib/server/users.ts` as `createTenantAccount(email, { sendWelcome })`, which returns `{ uid, undo }`. The Users page endpoint calls it with the welcome email on. The lease flow calls it with the email off, because its welcome email is sent after the commit and names the property. `renderWelcomeEmail(link, lease?)` gains an optional `{ address, startDate }` that adds one sentence.

### Balance per lease
`monthsOwed`, `computeBalance` and `allocatePayment` take `startMonth` (from `startDate`) instead of `moveInMonth`, plus an optional `endMonth`. The last month owed is the earlier of the current month and the end month, and nothing is owed before the start month. `loadHistories` takes the parent document reference (a lease) instead of a property id. The `MOVE_IN_MONTH_PATTERN` guard against centuries of rent stays.

`/payment` loads every lease the tenant is on, computes each balance, and shows each lease that is current or has money owed. The form sends `leaseId` with the amount. Checkout checks that the tenant is on that lease and caps the amount at that lease's balance. The invoice metadata gains `leaseID` and keeps `propertyID`.

### Webhook
With `leaseID`, the webhook records against `leases/{id}` in the same single transaction as today, with `recorded_invoices` under the lease. Without `leaseID` (an invoice created before this change), it finds the user by `stripeID == invoice.customer` and records against that user's current lease at `propertyID`. If there is none, it logs and acknowledges.

### Lease document (PDF)
The upload is part of the create and edit form (multipart). The server checks the size (≤ 10 MB), the `application/pdf` type and the `%PDF-` magic bytes, writes `leases/{leaseId}/document.pdf`, waits for the write to finish, and then records `document`. `GET /api/lease/{leaseId}/document` checks that the caller is an admin or on the lease, then streams the file with `Content-Type: application/pdf` and `Content-Disposition: inline`.

`storage.rules` changes from a public `get` on `/{allPaths=**}` to public `get` on `properties/**` and `users/**` only (today's only prefixes), so `leases/**` falls through to deny. Storage rules grant access if any rule matches, so a deny rule beside the existing catch-all would not work.

*Alternative:* signed URLs. Rejected: they work for anyone holding the link until they expire, and the route check is simpler.

### Pages and routes
- `/admin/properties/[propertyId]/edit`: the Tenants tab becomes a Leases tab (the list, plus a "New lease" link). `TenantPicker.svelte`, `MonthPicker.svelte`, `monthPicker.ts` and their tests are removed.
- `/admin/properties/[propertyId]/leases/new` and `/admin/properties/[propertyId]/leases/[leaseId]`: one shared `LeaseForm.svelte` with superforms. Emails are entered one per row, with add and remove buttons. When the server returns an overlap, the form shows the overlapping leases and a "Save anyway" button that resubmits with `confirmOverlap`.
- `DELETE /api/lease/[leaseId]`: refuses with 409 if any `payment_history` document exists.
- Tenant dashboard (`/(authenticated)/+page`): lease cards from the layout's lease list.
- Removed: `/api/property/[propertyId]/tenants`, `/api/user/[userId]/assoc`.

### Layout context
The authenticated layout loads the tenant's leases once (`tenantIds array-contains uid`), computes status, and exposes `userLeases` (current, upcoming and ended, with property summaries) and `userProperty` (the current lease's property). If there are several current leases it picks the latest start date and logs. Pages read these from `parent()` instead of querying again.

### Migration framework
- `migrations/NNNN-name.ts` each export `{ name, description, undo, up(ctx) }`. `ctx` is `{ db, dryRun, log, now }`. In a dry run, writes go through a `ctx.write` wrapper that logs instead of writing, so a migration cannot forget to honor the flag.
- `scripts/migrate.ts`, run with `tsx` (added as a dev dependency), uses `firebase-admin` directly with Application Default Credentials and `FB_PROJECT_ID`. It does not use `$lib/server/admin`, which depends on SvelteKit's `$env`. It follows these steps:
  1. Check PITR through the Firestore Admin REST API (`GET projects/{p}/databases/(default)`, `pointInTimeRecoveryEnablement`), with a token from `google-auth-library` (already a dependency of `firebase-admin`). The check is skipped against the emulator.
  2. Take the lock: create `_migrations/_lock` in a transaction, or take over a lock older than 30 minutes.
  3. For each pending migration: log and write `startedAt` (the restore point), run `up`, then write `status: 'applied'`, `finishedAt` and the summary. On an error, write `status: 'failed'` with the error and exit non-zero.
  4. Release the lock.
- `npm run migrate` runs it, and `-- --dry-run` passes the flag through.
- In `firebase-hosting-merge.yml`, a new step between the rules deploy and the hosting deploy writes the service account to a temp file the same way the rules step does and runs `npm run migrate`. A failure stops the job before hosting.
- A unit test loads every file in `migrations/` and checks the name pattern, the unique sequence numbers and a non-empty `undo`.

*Alternative:* running migrations on app start. Rejected: concurrent cold starts and no clear place to see failures.

### First migration: `0001-leases-from-tenant-links`
For each property with junction rows: the lease id is `migrated-{propertyId}`, so a re-run finds it. Tenants are the junction tenant ids whose user is not an admin. Missing users are skipped and reported. Rent is the property's rent. The start date is the first day of the earliest valid `moveInMonth`, or the current month when there is none. `payment_history` and `recorded_invoices` documents are copied with the same ids using `set`, so a re-run overwrites with identical data. The summary lists per property the lease id, tenant count and documents copied.

## Risks / Trade-offs

- [Payments recorded by the old code between the migration and the hosting deploy land in property history and are not copied] → The window is the minute between the two deploy steps. The Gate B checklist includes comparing `recorded_invoices` counts under each migrated property and its lease. The migration can be re-run by deleting its `_migrations` record, since it overwrites with the property's data.
- [A tenant with a later move-in month than their housemate now owes from the earlier month] → The dry run prints each tenant's balance before and after. On dev, review it before merging. On production, the Gate B checklist asks for a spot check. Fix by editing the lease's start date.
- [The deploy service account may lack permission to read database metadata for the PITR check] → The run fails with a clear message, not silently. Grant `roles/datastore.viewer`, or confirm the account's existing role covers it.
- [The 10 MB uploads pass through the SSR function] → Cloud Functions accept 32 MB requests. The form checks the size on the client before sending.
- [Removing the public catch-all storage rule could hide files under a prefix nobody listed] → The code only writes `properties/` and `users/` today (checked with grep). The rules tests in `tests/e2e/specs/rules.spec.ts` cover both, plus a denied read of `leases/`.
- [`array-contains` is not in the test fake] → Add it to `fakeFirestore.ts` with a unit test.
- [Breaking API removal] → Only the app's own pages call the removed endpoints. They are removed in the same commit as their callers.

## Migration Plan

1. **Before merging to develop:** turn on PITR for `lehman-realty-dev`, if it is not on already.
2. **Merging to develop** deploys rules and indexes, runs `0001` against dev, then deploys hosting. QA checks migrated tenants' balances.
3. **Before Gate B:** a human turns on PITR for the production project. The production PR checklist says so first.
4. **At the production deploy**, the same steps run. The workflow log shows the restore time.

**Rollback:**
- Code: revert the merge on `production`. The junction rows and property history are untouched, so the old code works as before.
- Data: delete the `migrated-*` leases and the `_migrations/0001-leases-from-tenant-links` record.
- Payments recorded on leases after the deploy must be copied back to the property history by hand, since they exist only on the lease.
- PITR restore is the last resort: export at the recorded start time and import.
