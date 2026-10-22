# Proposal

## Why

Three small defects report the wrong outcome for bad input or break form conventions: `/api/signin` answers 500 for a malformed ID token (#182), the Reset password button is not a real submit (#183), and the property edit page answers 500 for an unknown property (#152). Each makes real server failures harder to spot or the form behave unlike the others.

## What Changes

- `POST /api/signin` answers 401 "Invalid ID token" when the ID token cannot be verified, and sets no cookie (#182).
- The Reset password form submits through the form, and "Change Password" is `type="submit"`, so Enter submits like the other auth forms (#183).
- `/admin/properties/<id>/edit` answers 404 "Property not found" for an unknown or deleted property, like `/admin/properties/<id>/leases/new` (#152).
- Not in this change: #55 and #56 are already fixed on `develop` (the reset load throws 400; the form uses `taintedMessage: false`). Close them as already fixed.

## Capabilities

### New Capabilities

### Modified Capabilities
- `authentication`: a malformed ID token is rejected with 401.
- `property-management`: "Unknown property" on edit answers 404 instead of 500.

## Impact

- `src/lib/server/session.ts` (token verification), `src/routes/(ignorebase)/reset/+page.svelte`, `src/routes/(authenticated)/admin/properties/[propertyId]/edit/+page.server.ts`.
- Handler tests in `tests/handlers/authentication.test.ts` and `tests/handlers/property-management.test.ts`.
- No data, rollout or UI-visible changes.
