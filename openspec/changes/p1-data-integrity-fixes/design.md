# Design

## Context

All writes go through SvelteKit server handlers using the Firebase Admin SDK (`adminDB`, `adminAuth`, `adminStorage`) and Stripe. Firestore has no cross-system transactions, so Auth, Stripe and Firestore changes cannot be atomic; the pattern here is ordered steps with compensation. The handler tests use an in-memory `fakeFirestore` that has no `batch()` or transactions, and e2e tests run against the emulators. See proposal.md for motivation and scope.

## Goals / Non-Goals

**Goals:**
- A failure in any multi-system write leaves no orphan and no disagreement between systems.
- One reusable way to delete many Firestore documents, awaited, in chunks of 500.
- Early clicks and typing are never silently lost.

**Non-Goals:**
- Real transactions across Auth, Stripe and Firestore, or a background reconciler.
- Migrating or detecting existing dangling junctions.
- Race-proof "one property per tenant" under two simultaneous admin requests (see Risks).

## Decisions

1. **Batched deletes helper** (`src/lib/server/firestoreDelete.ts`): `deleteDocs(refs)` splits into batches of 500 and commits them in order. `payment_history` is a known subcollection (`properties/{id}/payment_history/{year}`), so its documents are read directly and no generic subcollection walker is needed. Delete property collects the property's junction rows, its maintenance requests and the documents under its `payment_history` subcollections. Storage deletion and Firestore deletion are awaited together; the property document is removed last so a failed run can be repeated. *Alternative:* `recursiveDelete` from the Admin SDK. Rejected because the fake Firestore cannot model it and the cascade also spans collections, not just a subtree.
2. **Assignment checks** in `POST /api/property/{id}/tenants`: read the property (404), the user (404, 400 for `permissions === 'admin'`), then all junctions for `tenantId`; any whose `propertyId` differs gives 409. Same-property re-add stays idempotent. *Alternative:* a Firestore transaction over the query. Rejected for now: the fake has none and two admins assigning the same tenant at the same moment is not a realistic case.
3. **Assignable users:** read users where `permissions == 'user'` and all junction `tenantId`s once, and filter in memory. This removes `not-in` and the 10-value limit. The user count is small. *Alternative:* chunk `not-in` by 10; rejected as more code for no gain.
4. **Create user with compensation:** steps are Auth create, Stripe create, Firestore set, email send. A `rollback` list collects an undo function after each step (`deleteUser`, `customers.del`, doc delete); on any error they run in reverse, each in its own try/catch (failures logged), and then a 500 is thrown. The email failure rolls back everything, by decision in the interview. *Alternative:* keep the user and warn. Rejected by the user.
5. **Delete user:** guard `params.userId === locals.userID` first (400). Then delete the Stripe customer (a `resource_missing` error counts as done), the user's junction rows (batched), the storage prefix, the user document, and Auth last (`auth/user-not-found` counts as done). Stripe goes first because it is the step most likely to fail for a reason we cannot retry cheaply; the order leaves a retry able to finish. Maintenance requests and payment history are kept by decision.
6. **Profile save order and rollback:** load previous user data, validate the form, then if the email changed verify the current password (decision 7). Steps: Auth `updateUser({ email })` (only if changed), Stripe `customers.update` (only if `stripeID`), Firestore `update`. Each completed step records its undo (Auth back to the old email, Stripe back to the old name/email/phone); on error they run in reverse and the action returns `message(form, ..., { status: 500 })`. Firestore is last because it is the source of the page's data; Auth and Stripe changes can be reversed by API calls.
7. **Password check** (`src/lib/server/verifyPassword.ts`): calls the Firebase Auth REST endpoint `accounts:signInWithPassword` with `PUBLIC_FB_API_KEY` and returns the `idToken` on success or `null` on `INVALID_PASSWORD`/`EMAIL_NOT_FOUND`. When `FIREBASE_AUTH_EMULATOR_HOST` is set the host is switched to the emulator, so e2e works. The password is never logged or returned. The same helper powers the sign-in POST fallback (decision 9). The profile form gets a `currentPassword` field shown only when the email field differs from the saved one; the zod schema keeps it optional and the action enforces it when the email changed. *Alternative:* require a recent sign-in on the session; rejected because the session cookie is 5 days and the user chose the password prompt.
8. **Hydration gating:** a marker attribute `data-needs-hydration` on buttons, and global CSS in `app.css`: `html:not([data-hydrated]) [data-needs-hydration]` gets `pointer-events: none`, reduced opacity and a CSS spinner (`::after`). The root layout `onMount` sets `document.documentElement.dataset.hydrated = ''`. A `<noscript><style>` in `app.html` cancels the rule. Because the attribute is server-rendered the gating exists from the first paint, with no flash. Inputs are not blocked. The attribute is added to: Sign in, Make a Payment, the admin maintenance close button, and every button that opens a modal or drawer (found by grepping `modalStore.trigger`/`getModalStore` callers). *Alternative:* a `hydrated` Svelte store with `disabled={!$hydrated}`; rejected because SSR output is then enabled and clickable until hydration, which is the bug.
9. **Sign-in as a real form:** the page wraps inputs in `<form method="POST">` with `name="email"` / `name="password"` and a `+page.server.ts` default action that calls `verifyPassword`, then `adminAuth.createSessionCookie(idToken)`, sets the cookie as `/api/signin` does and redirects to `/`; on failure it returns `fail(400, { email, error })` and the page shows the existing error text. After hydration the handler `preventDefault`s and keeps the current client flow (`signInWithEmailAndPassword` then `/api/signin`) but reads the values from `FormData`, not from `bind:value`, which fixes the lost-email symptom. The sign-in button also has `data-needs-hydration` (per the user's "both"); pressing Enter still submits the form to the server before hydration. The `+page.svelte` drops its value bindings; the email input only gets a `value` attribute when the server returns one after a failed no-JS sign-in, because Svelte resets a bound or valued input to its initial value on hydration (found by the early-typing e2e test).

## Risks / Trade-offs

- [Two admins assign the same tenant at once and both pass the check] → Accepted; the layout still fails closed with its existing 500, and the assignment check runs on the next attempt. Revisit with a transaction if it ever happens.
- [Rollback itself fails, leaving a mismatch] → Each undo is attempted independently, failures are logged with the user id, and the response says the update failed; support can retry the save.
- [Stripe customer deletion is irreversible] → Accepted in the interview; maintenance and payment history stay in Firestore.
- [Hydration CSS disables a button if hydration never completes (JS error, blocked script)] → The control stays inert and spinning; that is a visible failure rather than silent loss, and the sign-in form still works via Enter or the `<noscript>` rule.
- [Server-side sign-in duplicates `/api/signin` cookie options] → Share one `setSessionCookie(cookies, idToken)` helper.

## Migration Plan

No data migration. Deploy normally: merge to `develop`, QA on the dev site, production PR. Rollback is a revert of the merge; nothing persisted depends on the new code. Existing dangling junctions from past property deletes stay until an admin removes the tenant or runs the delete again.

## Open Questions

- Whether `PUBLIC_FB_API_KEY` is exposed in the server env under that name in the production build (it is a public variable, so the server can import it from `$env/static/public`); confirmed during implementation.
