# Tasks

## 1. Shared "has payments" rule

- [ ] 1.1 Extract the payment check from `deleteLease` into a helper in `src/lib/server/leases.ts` (rent `payment_history`, paid late fee, paid deposit), make `deleteLease` use it, and verify the existing lease delete handler tests still pass
- [ ] 1.2 Make the edit-lease page load set `hasPayments` with the helper, and extend the "edit page says whether the lease has recorded payments" test in `tests/handlers/leases.test.ts` to cover a deposit-only and a late-fee-only lease; verify it passes

## 2. Property delete refuses paid leases

- [ ] 2.1 In `src/routes/api/property/[propertyId]/+server.ts`, check every lease first and answer 409 with the spec's message without removing anything; verify with a handler test for a lease with rent history, for a deposit-only lease and for a late-fee-only lease (property, leases, history, maintenance, junctions and storage all kept)
- [ ] 2.2 Delete the leases through `deleteLease` before the other cascade steps and answer 409 if one returns `has-payments`; verify with a handler test that a payment recorded between the check and the delete keeps the paid lease and its history, and that the property is still deletable after the payment is removed
- [ ] 2.3 Update the existing property delete handler tests whose lease seeds carry payment history so they match the spec (leases with only `recorded_invoices`, unpaid or waived late fees, an empty deposit ledger delete; legacy property-level history still deletes); verify `npm run test` passes for `tests/handlers/property-management.test.ts`
- [ ] 2.4 Add a test that other properties' leases and history are untouched by a refused and by a successful delete, and that a property with no leases still deletes

## 3. Pages

- [ ] 3.1 Edit-lease page: show the "cannot be deleted" text only when `data.lease.hasPayments` and disable Delete then; verify with an e2e check in the existing lease specs (no payments: no text, Delete works; with a deposit-only payment: text shown, Delete disabled)
- [ ] 3.2 Properties list: read the failed response's `message` and show it in the error toast, falling back to "Error removing property."; verify with an e2e check that deleting a property with a paid lease shows the reason and keeps the row

## 4. Specs and verification

- [ ] 4.1 Confirm `openspec validate protect-paid-leases-from-delete --strict` passes and the delta specs match the final behavior
- [ ] 4.2 Run `npm run lint`, `npm run check`, `npm run test` and `npm run build`; verify all pass
