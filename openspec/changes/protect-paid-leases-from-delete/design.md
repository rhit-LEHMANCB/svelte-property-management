# Design

## Context

- `deleteLease` (`src/lib/server/leases.ts`) already decides "has payments" inside one transaction: any `payment_history` document, a late fee with `paid > 0`, or a deposit ledger with `paid > 0`. The Stripe webhook records a payment in a transaction that reads the lease, so a payment either lands first and blocks the delete or finds the lease gone.
- `DELETE /api/property/{id}` does not use it. It reads the property's leases, deletes their `payment_history` and `recorded_invoices` in bulk (`deleteDocs`, batches of 500), then the leases, then the property.
- The edit-lease load sets `hasPayments` from `payment_history` alone, so it disagrees with `deleteLease` for a deposit-only or late-fee-only lease. The same flag also drives the "Changing its dates changes which months are billed" notice.
- The existing handler test "Cascade removes the property's leases with their history…" seeds a lease with `payment_history` and expects it to be deleted; that expectation is now wrong and the test changes.

## Goals / Non-Goals

**Goals:**
- One definition of "this lease has payments", used by the lease delete, the property delete and the edit page.
- A property delete never removes payment history, even when a payment arrives while it runs.

**Non-Goals:**
- Making the whole property delete a single transaction. It spans more than 500 documents and Storage, so it cannot be one.
- Changing legacy property-level `payment_history` handling (still deleted with the property).

## Decisions

**Share the rule through a helper.** Extract the check inside `deleteLease` into a function that takes a transaction (or plain reads) and a lease ref and returns whether the lease has a rent payment, a paid late fee or a paid deposit. `deleteLease` and the edit-lease load both call it. *Alternative:* keep two copies. Rejected: that is how the page and the server drifted apart.

**Property delete: check first, then delete each lease through `deleteLease`.**
1. Load the property's leases. Run the shared check on each. If any has payments, answer 409 and remove nothing.
2. Delete the leases one by one with `deleteLease`, before the other cascade steps. It re-checks inside its transaction, so a payment that lands after step 1 makes it return `has-payments`; the property delete then stops and answers 409. Leases already removed had no payments, so no history is lost, and the property, the paid lease and everything not yet removed stay.
3. Then remove junctions, maintenance, property-level history and invoices, Storage files and finally the property document, as today.

*Alternatives:* (a) one check then bulk delete as today, which leaves a window in which a webhook payment is deleted with its lease; (b) a Firestore transaction over everything, which exceeds the 500-write limit. A retry after a 409 or a 500 finds the remaining state by query and finishes, so the existing "repeat the delete" guarantee holds.

**Side effect:** `deleteLease` also removes a lease's `late_fees`, `deposit` ledger and `notices`, which the old property cascade left behind. That is a cleanup improvement and needs a test.

**409 message.** "This property has leases with recorded payments, so it cannot be deleted. Set an end date on those leases instead." thrown with `error(409, …)`, as the lease endpoint does.

**Properties list.** `removeProperty` reads the JSON body of a failed response and passes its `message` to `errorToast`, falling back to "Error removing property.", the same pattern the edit-lease page uses. No up-front flag per property.

**Edit-lease page.** The "cannot be deleted" paragraph is rendered only when `data.lease.hasPayments`, and the Delete button gets `disabled` then (keeping its `data-needs-hydration` attribute). The broader flag also shows the existing "Changing its dates…" notice for a deposit-only or late-fee-only lease, which is accurate for those leases.

## Risks / Trade-offs

- [A lease with more than 500 `recorded_invoices` or `notices` makes `deleteLease`'s transaction exceed Firestore's limit] → Leases bill monthly, so this is far above realistic size; the same limit already applies to deleting a single lease. Not changed here.
- [A 409 mid-way leaves a property with some leases deleted] → Only unpaid leases were removed, so nothing of value is lost; the admin sees the 409 and the paid lease remains.
- [Running `deleteLease` per lease is slower than a bulk delete] → Properties have a handful of leases; the "large property" test keeps covering volume.
- [The wider `hasPayments` shows the date-change notice in more cases] → Accurate, and low-risk.

## Migration Plan

None. No data or configuration changes; deploy and rollback are the normal code deploy.
