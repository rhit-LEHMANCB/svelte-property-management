# Lifecycle: protect-paid-leases-from-delete

- Branch: `claude/pensive-lamport-i7b44a`
- Stage: 1 Interview (awaiting confirmation of the summary)
- Review round: 0 of 5
- QA cycle: 0 of 3
- Started: 2026-10-20
- Issues: #172, #173

## Interview summary
(approved: no)

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
Approved: no
Accepted preflight gaps: none

## Design pass
(stage 2; `skipped (no UI change)`, or the design link, date and decisions)

## Preflight
(stage 2)

## Review rounds
(none yet)

## Out-of-scope observations
(none yet)

## QA report
(stage 6)

## Verification checklist for the human
(stage 7)

## Halted
(only if the run halted)
