# Proposal

## Why

Five P1 issues let routine admin and user actions leave the data in a state that breaks the app or loses input: deleting a property strands its tenants with a 500 on every page (#38), a tenant can be assigned to a second property with the same effect (#39), user create, delete and profile save are multi-system writes with no rollback (#40, #45), and typing or clicking before the page hydrates silently drops input (#58). Fixing them together keeps one review and one QA pass over the user and property APIs they all touch.

## What Changes

- **#38 Delete property:** removes the property's `junction_user_property` rows, its maintenance requests and its `payment_history` subcollections (all awaited, in chunked batched writes) along with the property document and storage files.
- **#39 Assign tenant:** rejects with 409 if the tenant already has any property, 404 if the user or property does not exist, 400 if the user is an admin. The assignable list on the property edit page excludes admins and already-assigned tenants and no longer uses a Firestore `not-in` query.
- **#40 Users:** create rolls back the Auth user, Stripe customer and Firestore document on any failure, including a failed (now awaited) welcome email. Delete also removes the user's junction rows and Stripe customer. An admin cannot delete their own account (400).
- **#45 Profile:** the save order is Auth, Stripe, Firestore, and a later failure restores the earlier steps. Changing the email requires the current password, verified server-side.
- **#58 Hydration:** controls that do nothing before Svelte hydrates are disabled with a spinner until it finishes (sign-in, payment, admin maintenance, every modal trigger). Sign-in also becomes a real `<form method="POST">` that works before or without JS and no longer loses typed values.
- No **BREAKING** changes. Existing dangling junctions are not migrated.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `property-management`: delete cascades to junctions and payment history, awaited and batched.
- `tenant-assignment`: one property per tenant is enforced, assignment is validated, the assignable list is correct beyond 10 tenants.
- `user-management`: create is all-or-nothing, delete cleans up junctions and Stripe, no self-delete.
- `user-profile`: contact save is consistent across Auth, Stripe and Firestore, and an email change needs the current password.
- `authentication`: sign-in works before hydration through a POST form and keeps typed values.
- `app-platform`: controls are disabled with a spinner until the page is hydrated.

## Impact

- Code: `src/routes/api/property/[propertyId]`, `api/property/[propertyId]/tenants`, `api/user/add`, `api/user/[userId]`, `(authenticated)/profile`, `(authenticated)/admin/properties/[propertyId]/edit/+page.server.ts`, `(ignorebase)/signin` (new `+page.server.ts`), the root layout, `src/lib/ui` (spinner and hydration state), the payment and admin maintenance pages and every modal trigger, a new `src/lib/server` helper for password verification and batched deletes, `tests/helpers/fakeFirestore.ts` (batch support).
- Data: none new. Profile form gains a `currentPassword` field.
- Rollout: no new secrets; the password check uses the existing `PUBLIC_FB_API_KEY`. Stripe customer deletion on user delete is irreversible.
- Tests: handler tests for each changed endpoint, load and action; e2e additions for the sign-in POST fallback and for early typing after load.
