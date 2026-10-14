# Lifecycle: add-leases

- Branch: `claude/add-leases`
- Stage: 6 QA, fixing the cycle 1 bug on `claude/fix-prototype-leases` before cycle 2
- GitHub backend: GitHub MCP (`gh` token invalid; cloud session, `get_me` returns rhit-LEHMANCB)
- Review round: 4 of 5
- QA cycle: 1 of 3
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
- Round 1 (2026-10-13): 0 blockers, 1 major, 5 minors, 1 nit.
  - Fixed: major, migration 0001 re-run replaced lease history recorded after the first run (now copies only missing documents; test added; design updated).
  - Fixed: minor, the edit transaction now re-reads the lease (404 if deleted meanwhile; keeps a document attached meanwhile).
  - Fixed: minor, the edit page warns about tenants whose account no longer exists.
  - Fixed: minor, a missing PDF file answers 404 instead of a 500.
  - Fixed: minor (half), the layout no longer reads the other tenants' names on every page; only the dashboard load does.
  - Not fixed: minor, the webhook acknowledging an unknown lease with 200. The rent-payments spec ("Unknown property") requires 200, and the race needs an admin to delete a lease with no payments while its tenant is mid-checkout.
  - Not fixed: minor (other half), the users page reading the whole leases collection. It already reads every user document, so this is the same order of cost for an admin-only page.
  - Not fixed: nit, property delete removing its leases' payment history. That is the specified cascade ("Delete property"), as before for property history.
- Round 2 (2026-10-13): 0 blockers, 2 majors, 4 minors, 1 nit.
  - Fixed: major, a lease delete racing a payment. The check and delete are now one transaction (test added).
  - Fixed: major, a paid invoice whose lease is missing was acknowledged quietly. Both rounds flagged this, so it is treated as a real defect, and the rent-payments delta changed. An invoice naming a missing lease now logs `UNRECORDED PAYMENT` with invoice, customer and amounts and answers 500, so Stripe retries and shows the failing delivery. A pre-lease invoice with no matching lease logs the same error and still answers 200, since a retry cannot help. **This changes the round-1 "not fixed" decision; the human should confirm it at Gate B.**
  - Fixed: minor, after a save whose welcome email failed, the form is hidden so it cannot be saved twice.
  - Fixed: minor, the same-property overlap is re-checked inside the save transaction (test added).
  - Fixed: minor, migration 0001 warns about tenants linked to several properties and lists them in its summary (test added).
  - Fixed: nit, removed the unused `currentLeaseId` from the layout.
  - Not fixed: minor, /payment loading a balance for every lease, including ended ones. An ended lease can still owe rent, so it must be read to know. The count is small.
- Round 3 (2026-10-13): 0 blockers, 0 majors, 5 minors, 1 nit. **Exit condition met.**
  - Fixed: minor, lease dates must be in years 2000-2099, the range billing understands (test added).
  - Fixed: minor, a Storage failure after deleting a lease is logged rather than answered 500, and a repeat delete removes leftover files (tests added).
  - Fixed: minor, the edit page warns that changing dates on a lease with payments changes which months are billed; a unit test pins that behavior.
  - Fixed: minor, the deploy step checks backups only when a migration is pending, so a backups-API problem cannot block a deploy with nothing to migrate (test added).
  - Fixed: nit, the misplaced LeaseForm comment.
  - Not fixed: minor, the users page reading every lease (same reason as round 1).
- After round 3: lint, check, 489 unit/handler tests, build, check:server and 111 e2e tests pass.
- Round 4 (2026-10-14, the QA cycle 1 fix, migration 0002): 0 blockers, 1 major, 3 minors.
  - Fixed: major, the migration checked and moved one document at a time, so a document with subcollections could stop the run after others had moved. It now checks every document first (test with two documents added).
  - Fixed: minor, tests for a re-run, the `_migrations` record and summary, and a dry run leaving no record.
  - Not fixed: minor, other code (users page, checkout, lease edit) also assumes every lease has `tenantIds`. Once 0002 has run nothing breaks it, and the deploy runs migrations before hosting.

## Out-of-scope observations
- Every SSR request logs "IAM Service Account Credentials API has not been used in project 226313058184 … create-custom-tokens" on dev, since at least 2026-10-08. The app never signs tokens, so this comes from Firebase Hosting's framework integration; pages still work. Enabling that API on the project, or granting the SSR service account Service Account Token Creator, would quiet it.
- Opening the edit page of a property that no longer exists answers 500 ("Error retrieving property") rather than 404. This is existing behavior; QA hit it after deleting its own properties.

## QA report
### Cycle 1 (2026-10-13, deployed commit ab685c6)
**Result: FAIL**, with 1 app bug. Every other observable scenario passed: lease create and edit, validation, add by email, conflicts, overlap and Save anyway, delete with and without payments, PDF type and size limits, document access 200/403/401, private Storage reads, tenant card, per-lease balances, a Stripe test-mode payment through the webhook, admin-only checks, cascades and the regression pass. Specs: `tests/qa/add-leases/` (not committed yet). Screenshots: `openspec/changes/add-leases/qa/screenshots/`.

- **App bug:** `GET /admin/properties/wrIhk0hPRVK1hDCaId8y/edit` (property "boom", the one migrated lease) answers 500 every time.
  - Its `__data.json` shows the edit page's own load failing ("Internal Error"). The layout, and the new-lease and lease-edit loads for the same property, all succeed.
  - The same page works for QA-created properties with three leases, so the lease query and its index work.
  - The property's fields validate locally with `superValidate`.
  - The cause is therefore something specific to this property's data, and it is not visible without the server error (the app has no `handleError`, and this session has no Cloud Logging access).
- **Observations needing a person:**
  - Welcome emails to `qa-…@example.com` all failed; the lease-save path handled this correctly.
  - Users → Add User with such an address shows "Error creating user." Its account creation rolls back when the welcome email fails, which is existing behavior.
  - It is unknown whether the dev email provider rejects only example.com. Human test 1 covers it.
- **Minor:**
  - A tenant opening an admin lease URL gets 401 (admin route) rather than 403.
  - An oversized PDF is cleared from the field, and saving then keeps no new document.
  - Neither breaks a spec scenario.
- **Data:** all `qa-` data was removed. Stripe test payments remain on the QA tenant's test customer.
- **Root cause (2026-10-14, from the Cloud Run log with the read-only `claude-code@` account):** `TypeError: Cannot read properties of undefined (reading 'map')` in `tenantSummaries` ← `summarizeLease` ← `listPropertyLeases`. The `leases` collection on dev still holds 7 documents written by the 2024 `feature/leases` prototype for boom (`users`, `lease`, `startTimestamp`; no `tenantIds`, no subcollections). The new-lease and lease-edit pages never list them, which is why they worked.
  - **Fix:** migration `0002-archive-prototype-leases` moves documents without `tenantIds` to `legacy_leases` (data kept, plus `archivedAt` and `archivedBy`), and stops if one has subcollections. They are not converted into leases: as ended 2024 leases with no payments they would show months of rent owed. New requirement "Prototype leases archived" in the data-migrations delta; task 9.3; 4 tests. Production may or may not hold such documents; the migration handles both.

## Verification checklist for the human
(filled in stage 7)

## Halted
- **2026-10-13, stage 6, QA cycle 1:** the edit page 500 for property `wrIhk0hPRVK1hDCaId8y` needs its server error to be root-caused.
  - **Next step for a human:** open Google Cloud Console → Logging (project `lehman-realty-dev`), filter for the SSR function's errors around a fresh visit to `/admin/properties/wrIhk0hPRVK1hDCaId8y/edit`, and paste the error and its stack.
  - Or sign the Firebase MCP in to the dev project so this session can read the property and lease documents.
  - Then Claude fixes it, re-runs review and QA (cycle 2).
  - **Resolved 2026-10-14:** the user set up a read-only dev service account; the log gave the cause (see QA report, cycle 1).
- **Stage:** 6, before QA. PR #145 merged into develop on 2026-10-13 (merge commit ab685c6).
- **Reason:** the dev deploy (run 38354071341, https://github.com/rhit-LEHMANCB/svelte-property-management/actions/runs/38354071341) failed in the new "Apply data migrations" step. The deploy service account has no permission to list Firestore backup schedules:
  `Could not read projects/lehman-realty-dev/databases/(default)/backupSchedules (HTTP 403) ... "The caller does not have permission", "status": "PERMISSION_DENIED"`.
  This is an environment permission, not a code fault, so a re-run cannot fix it. It is the gap the preflight could not verify.
- **State of dev:**
  - Rules and indexes were deployed (the new Storage rules only narrow public reads; the new `leases` index).
  - Migration 0001 did **not** run, so no data changed.
  - Hosting was **not** deployed; the dev site still runs the previous version.
- **Next step for a human:**
  1. In Google Cloud IAM for `lehman-realty-dev`, find the service account whose key is in the GitHub `develop` environment secret `FIREBASE_SERVICE_ACCOUNT_LEHMAN_REALTY`. Grant it a role that includes `datastore.backupSchedules.list` and `datastore.backups.list`, for example **Cloud Datastore Viewer** (`roles/datastore.viewer`).
  2. Make sure the two backup schedules exist on the `(default)` database: daily with 2-day retention, weekly with 8-day retention (Firestore, Disaster recovery).
  3. Re-run the failed job of that run (Actions, the run, "Re-run failed jobs"), or tell Claude to, and the lifecycle continues at stage 6 (QA).
  4. Do the same for the production project's service account before Gate B.
- **Resolved 2026-10-13:** the user granted the permission to the dev and prod deploy service accounts. The failed job was re-run; the run continues at stage 6.
- **Halted again 2026-10-13 19:40 (attempt 2 of run 38354071341):**
  - The backup check passed. Restore point: `projects/lehman-realty-dev/locations/nam5/backups/a6e92c76-cbe3-4018-94b0-5a0d61e293f4`, snapshot 2026-10-13T12:06:54Z.
  - The runner then failed reading `_migrations` with `7 PERMISSION_DENIED: Missing or insufficient permissions`. The deploy service account has deploy roles only and no Firestore data access. The preflight and the earlier instructions named only the backup permissions; the migration also reads and writes data with this account.
  - No data changed, and hosting was not deployed.
  - **Next step for a human:** grant the same deploy service account **Cloud Datastore User** (`roles/datastore.user`) on `lehman-realty-dev`, and on the production project before Gate B. Then re-run the failed job.
  - The README section "Data migrations" and design.md must also name this role; that goes into the record PR at stage 7.
- **Resolved 2026-10-13 20:18:** the user granted Cloud Datastore User on dev and prod. Attempt 3 of run 38354071341 succeeded: rules, migrations and hosting deployed.

## Dev deploy and migration (2026-10-13, run 38354071341 attempt 3)
- **Restore point:** `projects/lehman-realty-dev/locations/nam5/backups/a6e92c76-cbe3-4018-94b0-5a0d61e293f4`, snapshot 2026-10-13T12:06:54Z.
- **Migration 0001** started 2026-10-13T20:13:26Z.
  - **Created** `migrated-wrIhk0hPRVK1hDCaId8y`: 1 tenant, 0 history and 0 invoice documents. Tenant `ps5f8IRn…` owes $2000.00 before and after.
  - **Skipped:**
    - 5 junctions whose properties no longer exist: `62WeqsJTofz9uJFHC6mn`, `c1QSys9UFwvMVVFWlneo`, `dnJqCXQu8DtQqMXHVZhx`, `HFBVyK7XZFmW5wP0G4Xs`, `whfdvzJddthVUXxREVo2`.
    - 1 junction for a tenant that no longer exists (`eVO0c9os…` on `wrIhk0hPRVK1hDCaId8y`).
  - No balance changes, and no tenants on several properties.
- **Hosting:** version `09d5393511f7d8e2` on https://lehman-realty-dev.web.app.
