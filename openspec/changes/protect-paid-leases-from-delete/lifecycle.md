# Lifecycle: protect-paid-leases-from-delete

- Branch: `claude/pensive-lamport-i7b44a`
- Stage: 4 Review
- Review round: 1 of 5
- QA cycle: 0 of 3
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

## Review rounds
- Round 1: blockers 0, majors 1, minors 5, nits 2. Fixed: (major) a Storage failure while cleaning a deleted lease's files could not be retried, so the property now records the removed lease ids in `leaseFilesToDelete` until their files are gone and deletes those prefixes in a step that fails the request, with a handler test; (minor) spec wording now says no lease's payment history is removed; race test now asserts l0 is removed and l1 kept; added an e2e deposit-only edit-page test on its own property; renamed the large-property test; the 409 message is asserted exactly. Not changed, with reasons: a lease created between the lease query and the property delete (pre-existing, not part of this change's scope, and the admin form cannot create a lease for a property while it is being deleted by the same admin in practice); a lease's bookkeeping removed in one transaction (accepted in design.md Risks; far above realistic size).

## Out-of-scope observations
(none yet)

## QA report
(stage 6)

## Verification checklist for the human
(stage 7)

## Halted
(only if the run halted)

## Implementation notes
- Local e2e could not run in this sandbox (the Firestore emulator jar cannot be downloaded); the e2e specs for this change are checked by the PR workflow. Lint, `check`, full vitest (791 tests) and build pass locally with `JOBS_SECRET` exported.
- Storage cleanup of a lease's files during a property delete is done by `deleteLease`, which logs and continues on failure (a retry cannot find a lease that is already gone), so an outage can leave a deleted lease's private PDF orphaned.
