# Proposal

## Why

Deleting a lease with recorded payments is refused (409), but deleting its property deletes the same lease and its payment history without a check (#172). The edit-lease page also always shows "A lease with recorded payments cannot be deleted", even for a lease that can be deleted (#173), and its `hasPayments` flag counts only rent history, so a lease with only a deposit or late-fee payment shows no warning although the delete is refused.

## What Changes

- `DELETE /api/property/{id}` refuses with 409 and removes nothing when any of the property's leases has a recorded rent, deposit or late-fee payment (the same rule as deleting a single lease). A property with no paid leases is deleted as today.
- The payment check and the removal of each lease are done so that a payment recorded by the Stripe webhook during the delete cannot be lost: a lease that gains a payment is kept and the delete answers 409.
- The properties list shows the server's reason in its error toast instead of "Error removing property."
- The edit-lease page shows the "cannot be deleted" text only for a lease that has payments, and disables Delete then. Its `hasPayments` flag uses the same rule as the server (rent history, a paid late fee or a paid deposit).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `property-management`: "Delete property" refuses a property that has a lease with recorded payments.
- `leases`: "Delete a lease" gains a scenario for how the edit page presents a lease that can or cannot be deleted.

## Impact

- `src/routes/api/property/[propertyId]/+server.ts`, `src/lib/server/leases.ts` (shared "has payments" rule), the lease edit page load and view, and `src/routes/(authenticated)/admin/properties/+page.svelte`.
- Tests: `tests/handlers/property-management.test.ts`, `tests/handlers/leases.test.ts`, `tests/e2e/specs/data-integrity.spec.ts` if it covers property delete.
- No data model change, migration, dependency or configuration change.

Out of scope: a force-delete override, disabling Delete on the properties list up front, legacy property-level `payment_history` (still removed with the property), refunds, and changing how a single lease is deleted.
