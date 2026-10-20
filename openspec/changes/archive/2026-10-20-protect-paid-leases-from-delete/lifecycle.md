# Lifecycle: protect-paid-leases-from-delete

- Branch: `claude/pensive-lamport-i7b44a`
- Stage: **complete (archived automatically on 2026-10-20 after the production release `148bb99`)**
- Review round: 2 of 5
- QA cycle: 1 of 3
- Started: 2026-10-20
- Issues: #172, #173

## Interview summary
(approved: yes, 2026-10-20)

**Goal.** Deleting a property must not destroy payment history, and the edit-lease page must warn about payments only when the lease has them.

**In scope.**
1. `DELETE /api/property/[propertyId]` answers 409 and removes nothing when any of the property's leases has recorded payments, using the same definition as `deleteLease`: rent `payment_history`, a paid late fee, or a paid deposit. The message says the property has leases with recorded payments and tells the admin to set end dates on them instead. A property whose leases have no payments deletes as today.
2. The check and the cascade delete cannot race with the Stripe webhook recording a payment: the payment check runs before any removal, and a lease that gains a payment between the check and its delete is not removed (same transaction approach as `deleteLease`).
3. Edit-lease page: the "A lease with recorded payments cannot be deleted" text shows only when the lease has payments, and Delete is disabled then. The page's `hasPayments` uses the server's definition (rent history, paid late fees, paid deposit), so it also covers a lease with only a deposit payment.
4. Properties list: no up-front check. The error toast shows the server's 409 reason instead of the generic "Error removing property."

**Out of scope.** A force-delete override; disabling Delete on the properties list up front; legacy property-level `payment_history` (still deleted with the property); refunds; changing how a single lease is deleted.

**Roles.** Admin only, as today.

**Data.** No schema change, no migration.

**Edge cases.** Property with no leases deletes. Property with only unpaid or waived late fees and an empty deposit deletes. A failed cleanup can still be repeated (spec unchanged). Concurrent payment during delete: the paid lease blocks it.

**Security.** No change to access rules.

**Acceptance.**
- WHEN an admin deletes a property that has a lease with rent payments, THEN the response is 409, nothing is removed, and the toast says why.
- WHEN the only payment is toward a deposit or a late fee, THEN it is also refused.
- WHEN no lease has payments, THEN the property and everything under it are removed as today.
- WHEN an admin opens edit-lease for a lease with no payments, THEN no delete warning shows and Delete works; with payments, the warning shows and Delete is disabled.

**Rollout.** None.

**Assumptions.** The 409 wording mirrors the lease one. No UI design pass is needed beyond a text change and a disabled button.

## Gate A
Approved: yes, 2026-10-20 (by the user, in chat)
Accepted preflight gaps: `npm run check` needs `JOBS_SECRET`; a dummy value is exported in the shell for local `check` and `build`.

## Design pass
Design pass: skipped (no UI change: one disabled button and a conditional line of text on the edit-lease page, and a toast message on the properties list).

## Preflight
GitHub backend: GitHub MCP (`gh` token fails in this cloud session; `get_me` works).

| Check | Result |
| --- | --- |
| git commit and push to `origin` | pass (change branch pushed) |
| GitHub backend | pass: MCP (`get_me` returns rhit-LEHMANCB) |
| Playwright `qa` project and browsers | pass (`playwright.config.ts` has `qa`; Chromium in /opt/pw-browsers) |
| QA credentials (dev project) | pass: pulled from 1Password into gitignored `.env.qa` (mode 600, untracked); all four variables set |
| Dev deploy on `develop` | pass (run 39345662759 succeeded on cef66b1) |
| `npm run lint` | pass |
| `npm run test` (full) | pass (handler suites for this change: 81 tests) |
| `npm run check` | GAP: 1 error, `JOBS_SECRET` is not exported from `$env/static/private` because the pulled `.env` lacks it (CI supplies it as a secret). Local fix for the run: export `JOBS_SECRET=local-check` in the shell for `check` and `build`; nothing is committed. |
| Java for emulators | pass |
| Secrets/variables for the `develop` environment | none needed |

## Ship
PR into `develop`: https://github.com/rhit-LEHMANCB/svelte-property-management/pull/186. Merged 2026-10-20 as a856dbc. Dev deploy run 39451451692 succeeded. QA cycle 1 passed.

## Review rounds
- Round 1: blockers 0, majors 1, minors 5, nits 2. Fixed: (major) a Storage failure while cleaning a deleted lease's files could not be retried, so the property now records the removed lease ids in `leaseFilesToDelete` until their files are gone and deletes those prefixes in a step that fails the request, with a handler test; (minor) spec wording now says no lease's payment history is removed; race test now asserts l0 is removed and l1 kept; added an e2e deposit-only edit-page test on its own property; renamed the large-property test; the 409 message is asserted exactly. Not changed, with reasons: a lease created between the lease query and the property delete (pre-existing, not part of this change's scope, and the admin form cannot create a lease for a property while it is being deleted by the same admin in practice); a lease's bookkeeping removed in one transaction (accepted in design.md Risks; far above realistic size).

- Round 2: blockers 0, majors 0, minors 5, nits 3 (exit). Fixed: the Storage-failure test now fails by prefix, not call order; added a handler test for a refused delete followed by a successful retry; added an e2e test for the generic toast; the deposit-only e2e cleans up in `finally`; the toast shows the server message only for 409 (spec updated); Cascade scenario and the race scenario wording updated. Not changed, with reasons: lease files of a property whose document does not exist (orphan leases only; recording the ids would need to create the property document, which is worse); sequential deleteLease plus a second deleteFiles (deliberate, in design); lifecycle.md is meant to be committed (the skill keeps state there and the archive workflow completes it).

## Out-of-scope observations
- The `.env.qa` values carry trailing spaces (see QA report); fix in 1Password.
- Two undeletable QA test properties remain in the dev project (see QA report).

## QA report
# QA report: protect-paid-leases-from-delete

- Deployed commit: `a856dbc` on `develop` (dev site: https://lehman-realty-dev.web.app)
- QA cycle: 1 of 3
- Run at: 2026-10-20
- Result: PASS (0 failing scenarios; 3 scenarios could not be run on the deployed site, see "Not covered by automation")
- Evidence: branch `qa-evidence/protect-paid-leases-from-delete` (specs under `tests/qa/protect-paid-leases-from-delete/`, screenshots under the change's `qa/screenshots/`). Not merged.

## Scenarios
| Capability | Scenario | Result | Evidence |
|---|---|---|---|
| property-management | A lease has rent payments: 409, reason in the message, nothing removed | pass | ![property-management-a-lease-has-rent-payments](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/property-management-a-lease-has-rent-payments.png?raw=true) |
| property-management | A lease has only a deposit payment: 409, nothing removed | pass | ![property-management-a-lease-has-only-a-deposit-payment](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/property-management-a-lease-has-only-a-deposit-payment.png?raw=true) |
| property-management | A lease has only a paid late fee: 409 | not run (see below) | none |
| property-management | Leases without payments (an unpaid late fee configured): property deleted | pass | ![property-management-leases-without-payments-deleted](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/property-management-leases-without-payments-deleted.png?raw=true) |
| property-management | Other properties untouched after a refused and a successful delete | pass | ![property-management-other-properties-untouched](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/property-management-other-properties-untouched.png?raw=true) |
| property-management | Properties list: refused delete shows the reason; the property stays | pass | ![property-management-refused-delete-toast](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/property-management-refused-delete-toast.png?raw=true) |
| property-management | Properties list: 500 with a message shows the generic text | pass | ![property-management-other-failure-500-message](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/property-management-other-failure-500-message.png?raw=true) |
| property-management | Properties list: 500 with no body shows the generic text | pass | ![property-management-other-failure-500-no-body](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/property-management-other-failure-500-no-body.png?raw=true) |
| property-management | Properties list: 403 with a message shows the generic text | pass | ![property-management-other-failure-403-message](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/property-management-other-failure-403-message.png?raw=true) |
| leases | Edit page, lease with no payments: no text, Delete enabled | pass | ![leases-edit-page-for-a-lease-with-no-payments](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/leases-edit-page-for-a-lease-with-no-payments.png?raw=true) |
| leases | Edit page, lease with rent payments: text shown, Delete disabled | pass | ![leases-edit-page-for-a-lease-with-payments-rent](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/leases-edit-page-for-a-lease-with-payments-rent.png?raw=true) |
| leases | Edit page, deposit-only payment: text shown, Delete disabled | pass | ![leases-edit-page-for-a-lease-with-only-a-deposit-payment](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/leases-edit-page-for-a-lease-with-only-a-deposit-payment.png?raw=true) |
| leases | Lease with payments (rent, deposit-only): DELETE answers 409 | pass | ![leases-has-only-a-deposit-payment](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/leases-has-only-a-deposit-payment.png?raw=true) |
| leases | Lease with no payments: delete works | pass | ![leases-no-payments-lease-deleted](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/leases-no-payments-lease-deleted.png?raw=true) |
| regression | Admin loads every top-level page without errors | pass | ![regression-admin-top-level-pages](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/regression-admin-top-level-pages.png?raw=true) |
| regression | Tenant loads every top-level page without errors | pass | ![regression-tenant-top-level-pages](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/protect-paid-leases-from-delete/openspec/changes/protect-paid-leases-from-delete/qa/screenshots/regression-tenant-top-level-pages.png?raw=true) |

The paid cases were created through the app: two ended QA leases were each paid $1.00 by the QA tenant with Stripe's test card, and the webhook recorded the payment (rent on one, deposit on the other). The non-409 failures were simulated by intercepting the request.

## Triage
No `app bug`, `test bug` or `design deviation`. One test timed out once on the sign-in page and passed on rerun (`environment` flake). No fix cycle was needed.

## Observations outside the specs
- Low, test setup: the values in the dev `.env.qa` carry trailing spaces, so the repo's `signIn` helper fails on them; the QA specs trim them. Trim the file in 1Password so other QA runs do not trip on it.
- Low, wording: on the edit page of a lease with payments, two notices show together ("This lease has recorded payments. Changing its dates…" and "…so it cannot be deleted. Set an end date instead."). They are consistent and both are accurate.
- Low, UX: the properties list gives no up-front hint that a delete will be refused (out of scope by decision); the toast clears after a few seconds.
- Low, test data: two QA properties with a $1 test payment can no longer be deleted through the app (that is the feature): `qa-protect-rent-…` (id `roqhX2xRFjwSUH0N7XJA`, lease `i4pultxqLE86C70BSTSs`) and `qa-protect-deposit-…` (id `PrXgff8gLol8vdHzDv3U`, lease `s84Ga47SHb1CAOSYWMmX`). They are in the dev project only. Remove them from the Firebase console if wanted.

## Not covered by automation
- Paid late fee only: property 409, lease 409 and the edit page. Late fees are written only by the daily job, which needs the job secret. Covered by handler tests, not on the dev site.
- The race with the Stripe webhook, a removal failure and its repeat, and a property with more than 500 documents. Covered by handler tests only.
- The cascade of maintenance requests, Storage files and bookkeeping records after a successful delete, and legacy junction rows: only the property and lease disappearing was visible.
- A tenant of a deleted property then loading the app.
- Phone layout, keyboard and screen reader use.


## Verification checklist for the human
Ranked by risk. Use the dev site and test accounts, not production data, unless a step says so.

1. **A lease whose only payment is a late fee blocks delete** (risk: high). Where: dev site as admin, a lease where the daily job charged a late fee. Do: pay only the late fee as the tenant, then open the lease edit page, try deleting the lease and then its property. Expect: the page says the lease has recorded payments, Delete is disabled, the property delete shows the refusal toast and nothing is removed. Why a person: needs the daily job and its secret.
2. **Delete a property with one paid and one unpaid lease** (risk: high). Do: delete it. Expect: refused with the reason and neither lease removed. Then confirm a property whose leases are all unpaid deletes together with its Storage files. Why a person: the order of removal on a mixed property.
3. **After the production deploy, try to delete a property you know has payment history** (risk: high). Where: production admin. Do: attempt the delete on a property with a paid lease. Expect: refused with the toast and the lease and its history intact. Do not delete real data on purpose.
4. **A tenant after their property is deleted** (risk: medium). Do: delete a property with an unpaid current lease, sign in as its tenant. Expect: the home page loads and shows no property.
5. **Failure then repeat** (risk: medium). Do: delete a property while Storage is blocked or flaky, then repeat. Expect: "Error removing property." first, and a clean delete on the repeat with no orphaned lease files.
6. **Phone layout of the refusal toast and the edit-lease card** (risk: low). Expect: the toast is readable and the "cannot be deleted" line and disabled button fit without scrolling sideways.
7. **Keyboard and screen reader on a disabled Delete** (risk: low). Expect: the disabled button is announced as unavailable and the reason text is reachable.


## Halted
(only if the run halted)

## Implementation notes
- Local e2e could not run in this sandbox (the Firestore emulator jar cannot be downloaded); the e2e specs for this change are checked by the PR workflow. Lint, `check`, full vitest (791 tests) and build pass locally with `JOBS_SECRET` exported.
- Storage cleanup of a lease's files during a property delete is done by `deleteLease`, which logs and continues on failure (a retry cannot find a lease that is already gone), so an outage can leave a deleted lease's private PDF orphaned.

## Archive
Archived automatically on 2026-10-20 after the production release `148bb99` ([workflow run](https://github.com/rhit-LEHMANCB/svelte-property-management/actions/runs/39466598338)). That marks this lifecycle complete.
