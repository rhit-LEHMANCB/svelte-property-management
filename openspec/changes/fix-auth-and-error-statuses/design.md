# Design

## Context

See proposal.md. `setSessionCookie` calls `adminAuth.verifyIdToken`, which throws for a malformed token and surfaces as 500. The reset page wires its button through `onclick` plus `preventDefault`. The edit load throws `error(500)` for a missing property document, while `leases/new` already throws 404.

## Goals / Non-Goals

**Goals:** correct status codes for #182 and #152; a real form submit for #183.

**Non-Goals:** #55 and #56 (already fixed); changing the edit page's actions; changing the stale-token behavior.

## Decisions

- #182: wrap only `verifyIdToken` in try/catch and `throw error(401, 'Invalid ID token')`. The stale-token check and `createSessionCookie` stay as they are, so genuine server failures still answer 500.
- #183: move the handler to the form's `onsubmit` (keep `preventDefault` and the Firebase calls), set `type="submit"` on the button, and drop the button's `onclick`. Keep `data-needs-hydration`.
- #152: `throw error(404, 'Property not found')`, the same message as `leases/new`.

## Risks / Trade-offs

- With `use:enhance` on the form, a submit before hydration would post natively. The handler runs on `onsubmit` after hydration, as the button's onclick did, and `data-needs-hydration` keeps tests waiting for it.
