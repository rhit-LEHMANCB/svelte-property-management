# Proposal

## Why

Today a tenant is linked to a property one at a time with a move-in month, and the balance comes from the property's rent. There is no record of the agreement itself: its dates, its rent, who signed it, or the document. Admins also have to create each tenant account on the Users page before they can assign it. Leases make the agreement the source of truth and let an admin set up a whole household in one step, by email. They need a safe way to move existing data, which the project does not have yet.

## What Changes

- New `leases` collection. A lease belongs to a property and has one or more tenants, a monthly rent, a start date, an optional end date (month-to-month when there is none) and an optional private PDF.
- Admins list, create, edit and delete leases from a Leases tab on the property edit page. They add tenants by email: an existing non-admin user is attached, and an unknown email gets a new account and a welcome email naming the property and start date.
- Saving a lease whose dates overlap another lease at the same property asks the admin to confirm. A lease is refused, with a reason per email, if an email belongs to an admin or to someone already on an overlapping lease.
- **BREAKING** The lease replaces tenant assignment. A tenant's property is the property of their current lease. The "add tenant" picker, move-in month and `/api/property/{id}/tenants` and `/api/user/{id}/assoc` endpoints are removed, and `junction_user_property` is no longer read or written.
- **BREAKING** Rent is owed and paid per lease. The balance runs from the lease's start month through the earlier of this month and its end month, at the lease's rent. Payment history moves to `leases/{id}/payment_history`, and checkout and the webhook carry the lease id. After a lease ends no new rent accrues, but its unpaid balance stays payable.
- Tenants see a read-only lease card on their dashboard and can open their lease PDF.
- New data-migration mechanism: numbered migrations, tracked in Firestore, applied automatically during deploy before hosting, with a dry run, a check that the database has a backup schedule, and the newest finished backup recorded as the restore point.
- First migration turns each property's assigned tenants into one lease and copies the property's payment history to it, so balances carry over.

## Capabilities

### New Capabilities
- `leases`: Creating, editing, deleting and listing leases; adding tenants by email; overlap warnings and conflicts; the lease PDF; what a tenant sees of their lease.
- `data-migrations`: How schema and data migrations are written, recorded, run during deploy, and rolled back.

### Modified Capabilities
- `tenant-assignment`: All requirements removed; leases take over linking tenants to properties.
- `rent-payments`: Balance, checkout and payment recording move from the property to the lease. A tenant can pay against any of their leases that has a balance.
- `access-control`: A tenant's property comes from their current lease instead of a junction. Admin operations list leases instead of tenant assignment.
- `property-management`: Deleting a property removes its leases, their payment history and their documents, instead of junction rows and property payment history.
- `user-management`: Deleting a user removes them from their leases.
- `firebase-configuration`: Storage objects are public only under `properties/` and `users/`; lease documents are private.
- `app-platform` and `ui-accessibility`: the autocomplete and combobox requirements drop their tenant-picker examples; the tenant picker was the last combobox.
- `maintenance-requests`: A tenant can file requests only for the property of their current lease.

## Impact

- **Code:** the authenticated layout, dashboard, payment page, maintenance page, property edit page; new lease pages and API routes; checkout and webhook; user and property delete; `/api/user/add` (shared creation helper); email templates; `src/lib/server/payments.ts` and `balance.ts` (end month).
- **Removed:** `TenantPicker.svelte`, `MonthPicker.svelte`, `/api/property/{id}/tenants`, `/api/user/{id}/assoc`, and the tests that cover them.
- **Data:** new `leases`, `leases/{id}/payment_history`, `leases/{id}/recorded_invoices`, `_migrations`; new Firestore indexes; lease PDFs under `leases/{id}/` with Storage rules that deny direct reads.
- **Deploy:** `firebase-hosting-merge.yml` gains a migrate step between the rules deploy and hosting. A daily backup schedule (2-day retention) and a weekly one (8-day retention) must exist on the `(default)` database of both Firebase projects before the first such deploy.
- **Tooling:** `migrations/` folder, `npm run migrate`, and `tsx` to run TypeScript migrations in CI (if not already available).
