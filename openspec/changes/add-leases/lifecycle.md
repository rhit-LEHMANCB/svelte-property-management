# Lifecycle: add-leases

- Branch: `claude/add-leases`
- Stage: 4 Review
- GitHub backend: GitHub MCP (`gh` token invalid; cloud session, `get_me` returns rhit-LEHMANCB)
- Review round: 0 of 5
- QA cycle: 0 of 3
- Started: 2026-10-13

## Interview summary
(approved: yes, 2026-10-13)

**Goal.** An admin creates leases on a property and adds tenants to a lease by email. If a user with that email already exists, they are attached. If not, a new tenant account is created for them. The lease becomes the source of truth for who lives where and what they owe. This change also sets the pattern for data migrations.

**In scope**
- New `leases` collection: property, tenant ids, monthly rent, start date, optional end date (month-to-month when there is none), optional PDF.
- Admin pages: a Leases tab on the property edit page that lists each lease with its status (upcoming, current or ended), dates, rent and tenants, plus create and edit lease pages. Edit covers rent, dates, adding and removing tenants by email, and attaching or replacing the PDF. An admin can delete a lease.
- Adding tenants by email: an existing non-admin user is attached, and an unknown email creates a user the same way `/api/user/add` does. Users created this way get the welcome email plus a line naming the property address and lease start date.
- Leases at one property may overlap. Saving one that overlaps shows a warning the admin must confirm; it is not refused.
- Conflicts are refused with a reason per email and nothing is created: the email belongs to an admin, or the person is already on another lease whose dates overlap this one (at any property).
- Lease drives assignment: a tenant's property is the property of their current lease. The separate "add tenant" picker and move-in month on the property page go away, and the `junction_user_property` reads are replaced by lease queries.
- Payments are tracked per lease in `leases/{id}/payment_history/{year}`. The balance runs from the lease's start month through the earlier of this month and its end month, using the lease's rent. Checkout sessions carry `leaseId`, and the webhook records against that lease. Tenants on the same lease share its balance.
- When a lease ends, rent stops after its end month. Any unpaid balance stays payable on `/payment`. The tenant keeps their login but is no longer assigned to the property and cannot file maintenance requests for it.
- Tenant dashboard: a read-only lease card with dates, rent, the other tenants' names and a PDF link.
- Data migrations: numbered files in `migrations/`, and a runner that applies any not yet recorded in a Firestore `_migrations` collection. Migrations must be safe to re-run, and the runner has a dry-run flag and an `npm run migrate` script. It runs in `firebase-hosting-merge.yml` after the rules deploy and before hosting, for both develop and production. Before applying anything, the runner records the start time and the newest finished backup (the restore point) in the `_migrations` record and the workflow log. It refuses to run when the database has no backup schedule. PITR stays off to avoid its cost while the app has no real data; scheduled backups (daily, 2-day retention; weekly, 8-day retention) are used instead. Backups restore into a new database, not in place. Each migration file says how to undo it.
- First migration: for each property with assigned tenants, create one lease from the property's rent, a start date of the earliest move-in month, no end date, those tenants, and the property's `payment_history` copied into the lease. The junction documents are left in place, so the old code still works until the new code is live. A later migration can remove them.

**Out of scope:** Rent proration, deposits, fees, lease renewal workflows, e-signature, lease templates, tenant self-service edits, removing `junction_user_property` documents.

**Roles.** Admins do everything above. A tenant (`user`) sees only their own leases and only the PDFs of leases they are on. Unauthenticated users see nothing new.

**Assumptions** (not asked; correct me if wrong)
1. Rent is billed by whole month: the start and end months are charged in full, and rent is due on the 1st, as today.
2. A lease needs at least one tenant. Removing the last one is refused.
3. A lease that has recorded payments cannot be deleted (history is kept). Its end date can be set instead.
4. The PDF is stored at `leases/{id}/document.pdf`, PDF only, up to 10 MB, and served through a server route that checks the viewer is an admin or a tenant on that lease. It is never a public URL.
5. When a tenant has more than one lease with a balance (for example an ended one with unpaid rent), `/payment` lists each, and they pay against a chosen lease.
6. New users get the placeholder name "New User", as today; the admin enters email only. Accounts are created first and undone if the lease write fails. Welcome emails go out after the lease is saved. If an email fails, the lease stays and the admin is told which address failed and that the person can use "Forgot password".
7. The property's `rent` field stays as the listed rent and prefills the rent on a new lease.
8. Deleting a user removes them from their leases. A lease left with no tenants is kept for its history.
9. Stripe invoices sent before this change, which have no `leaseId`, are recorded against the payer's current lease at that property.

**Acceptance (by hand)**
- An admin creates a lease with one existing tenant and one new email. The existing tenant sees the lease card, and the new address receives a welcome email naming the property.
- Creating a lease with an admin's email, or with a tenant who is on an overlapping lease elsewhere, is refused with a message naming that email, and no user or lease is created.
- Creating a lease whose dates overlap another lease at the same property shows a warning, and it saves after the admin confirms.
- A tenant whose lease started two months ago at $1,000 with no payments sees $3,000 owed. A payment lowers only that lease's balance.
- After a lease's end month, no new rent accrues, the old balance is still payable, and the maintenance form no longer offers that property.
- Another tenant cannot open a lease PDF they are not on (403).
- After deploy, existing tenants on dev show a migrated lease with the same balance as before, and `_migrations` records the run. Running the migration again changes nothing.

**Rollout**
- No new secrets. The migrate step reuses `FIREBASE_SERVICE_ACCOUNT_LEHMAN_REALTY` and `FB_PROJECT_ID`, which are already in both environments.
- Create two backup schedules on the `(default)` database of both Firebase projects in the console (Firestore → Disaster recovery): daily with 2-day retention and weekly with 8-day retention, before the first deploy that runs migrations. The runner refuses to apply migrations when there is no schedule.
- Firestore indexes for leases by tenant and by property are deployed by the existing rules and indexes step.
- On production, the migration runs automatically at deploy. The human checking Gate B should compare a few tenants' balances before and after.

**Spec impact:** new `leases` and `data-migrations` capabilities. Modified: `tenant-assignment` (replaced by leases), `rent-payments` (balance and ledger per lease), `user-management` (shared creation, removal from leases on delete), `maintenance-requests` and `access-control` (property from the current lease).

## Gate A
Approved: yes, 2026-10-13 ("approved": the user sets up the dev backup schedules before the merge)
Accepted preflight gaps: none. Backup schedules on dev and the service account's permission to list them are unverified from this session; if they are missing, the dev deploy fails at the migrate step and the run halts in stage 6.

## Preflight
Run 2026-10-13 on `claude/add-leases` after merging `origin/develop` at 34e4366.

| Check | Result |
| --- | --- |
| git commit and push to `origin` | Pass: commit 1d64577 pushed to `claude/add-leases` |
| GitHub backend | Pass: GitHub MCP (`gh` has an invalid `GH_TOKEN`) |
| Env files from 1Password | Pass: `.env` and `.env.qa` pulled, mode 600, gitignored, not printed |
| QA credentials | Pass: all four `QA_*` keys present in `.env.qa` |
| Playwright `qa` project and browsers | Pass: `qa` project in `playwright.config.ts`; Chromium installed to the version Playwright needs (README cloud-session fix) |
| Dev deploy workflow on `develop` | Pass: run 83 succeeded; run 84 (#139, a docs-only QA record) was still running at check time |
| Node | Pass: v22.22.0 matches `.nvmrc` |
| `npm run lint`, `check`, `test`, `build` | Pass |
| `npm run test:e2e` (emulators, Java) | Pass: 101 passed |
| GitHub `develop` secrets for this change | Pass: none needed (the migrate step reuses `FIREBASE_SERVICE_ACCOUNT_LEHMAN_REALTY` and `FB_PROJECT_ID`) |
| Backup schedules on `lehman-realty-dev` | **Not verified**: `gcloud` is not signed in and the Firebase connector has no access to the project. If there is no schedule at merge, the new migrate step fails the dev deploy (by design) and the run halts in stage 6 |
| Deploy service account can list backup schedules and backups | **Not verified**: same reason; the first dev deploy will show it |

## Implementation notes
- Lease PDFs are stored as `leases/{id}/{timestamp}.pdf` instead of `document.pdf`, so a failed save never overwrites the document in use; design and proposal updated.
- Unexpected failures while saving a lease come back as a form message ("could not be saved and nothing was changed") instead of an error page, to meet the spec's "the admin sees an error".
- Backups REST calls use firebase-admin's `applicationDefault().getAccessToken()` rather than adding `google-auth-library`.
- Pure lease date rules live in `src/lib/server/leaseDates.ts`; Firestore work in `leases.ts`.
- The admin Users modal showed a user's property through the removed `/api/user/{id}/assoc`; the users page load now passes each user's current-lease property instead.
- The tenant picker was the last combobox, so `app-platform` and `ui-accessibility` got small deltas dropping its examples; their picker e2e tests were removed with it.
- e2e: the global setup seeds the old tenant link and runs the real migration runner, so every e2e run exercises migration 0001; the fake Stripe server also answers `/v1/customers` and Resend's `/emails` (via `RESEND_BASE_URL`).
- README: the documented emulator command needs `--config firebase.emulators.json`; fixed while verifying it.
- Stage 3 done 2026-10-13: 34/34 tasks; lint, check, 409 unit/handler tests, build, check:server and 105 e2e tests pass. Manual emulator run of `npm run migrate` (dry run, apply, re-run) matched the spec.

## Review rounds
(none yet)

## Out-of-scope observations
(none yet)

## QA report
(filled in stage 6)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted)
