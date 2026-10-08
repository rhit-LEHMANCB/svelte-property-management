# Tasks

## 1. Shared helpers

- [x] 1.1 Add `batch()` (set/update/delete/commit) to `tests/helpers/fakeFirestore.ts` and a test in `fakeFirestore.test.ts`; verify `npm run test:handlers` passes
- [x] 1.2 Add `src/lib/server/firestoreDelete.ts` (`deleteDocs` in chunks of 500, `deleteSubcollections`) with a unit test that deletes 1,200 docs; verify the test passes
- [x] 1.3 Add `src/lib/server/verifyPassword.ts` (Firebase REST `signInWithPassword`, emulator-aware, never logs the password) and `setSessionCookie` shared with `/api/signin`; verify unit tests with a mocked `fetch` cover success, wrong password and emulator host

## 2. #38 Delete property

- [x] 2.1 Rewrite `DELETE /api/property/[propertyId]` to remove junctions, maintenance requests and `payment_history` subcollections with batched writes, await storage and Firestore together, and delete the property document last; verify handler tests cover tenants, more than 500 docs, and a failing step returning 500
- [x] 2.2 Update `property-management` Known Gaps in `openspec/specs` to drop the four fixed items; verify the file no longer lists them

## 3. #39 Tenant assignment

- [x] 3.1 Add property/user existence, admin and one-property checks to `POST /api/property/[propertyId]/tenants` (404, 404, 400, 409; same-property re-add stays OK); verify handler tests for each status and that nothing is written on rejection
- [x] 3.2 Replace the `not-in` query in the property edit page load with a `permissions == 'user'` read minus all assigned tenants; verify a handler test with more than 10 assigned tenants and an admin in the data
- [x] 3.3 Show the server's 409/404/400 message in the edit page's add-tenant toast; verify the e2e spec assigns an already-assigned tenant and sees the message
- [x] 3.4 Update `tenant-assignment` Known Gaps; verify the four fixed items are gone

## 4. #40 Users

- [x] 4.1 Rewrite `POST /api/user/add` with a rollback list (Auth user, Stripe customer, Firestore doc) and an awaited welcome email whose failure rolls everything back; verify handler tests for failure at Stripe, Firestore and email, each leaving no records
- [x] 4.2 Rewrite `DELETE /api/user/[userId]`: 400 on self, delete Stripe customer, junction rows, storage and user doc, then Auth, tolerating missing Stripe/Auth; verify handler tests for self-delete, tenant with a junction, and already-missing Stripe customer
- [x] 4.3 Update `user-management` Known Gaps; verify the three items are gone

## 5. #45 Profile

- [x] 5.1 Add an optional `currentPassword` field to the profile form and schema, shown when the email field differs from the saved email; verify a component or e2e check that the field appears only then
- [x] 5.2 Rewrite the `contact` action: verify password if the email changed, then Auth, Stripe, Firestore with reverse-order undo on failure; verify handler tests for success, wrong password, Stripe failing (Auth restored), Firestore failing (Stripe and Auth restored) and unchanged email
- [x] 5.3 Update `user-profile` Known Gaps; verify the two items are gone

## 6. #58 Hydration

- [x] 6.1 Add the hydration CSS and spinner to `src/app.css`, set `document.documentElement.dataset.hydrated` in the root layout `onMount`, and add the `<noscript>` override to `src/app.html`; verify `npm run build` passes and the e2e hydration spec sees the attribute after load
- [x] 6.2 Add `data-needs-hydration` to the Sign in button, the payment page Make a Payment button, the admin maintenance close button and every modal/drawer trigger (found with a grep for `getModalStore` and `getDrawerStore` callers); verify an e2e spec clicks each immediately after `goto` with no `networkidle` wait and ends in the correct state
- [x] 6.3 Add `src/routes/(ignorebase)/signin/+page.server.ts` with a default action (verify password, create session cookie, redirect to `/`, `fail(400)` with email kept), make the page a `<form method="POST">` that reads `FormData` after hydration; verify handler tests for success and wrong password and an e2e test that types immediately after `goto` and signs in
- [x] 6.4 Update `authentication` Known Gaps if relevant and the `docs/` page on testing hydration if one exists; verify `npm run lint`, `npm run check` and `npm test` pass

## 7. Integration

- [x] 7.1 Run `npm run lint`, `npm run check`, `npm run check:server`, `npm test` and `npm run build`; verify all pass
- [x] 7.2 Run `npm run test:e2e` (needs Java for the emulators); verify the new and existing specs pass

## 8. QA cycle 2 fix: tenants without a property

- [x] 8.1 Make the authenticated layout load for a tenant with no junction (no `userProperty`, no error), redirect `/payment` and `/maintenance` to `/` for them, and show a "No property is assigned" message on the dashboard; verify handler tests for the layout, both loads and the e2e spec "a tenant without a property" pass
- [x] 8.2 Add the `access-control` delta spec for the "Tenant property context" requirement (none, one, more than one); verify `openspec validate p1-data-integrity-fixes --strict` passes
