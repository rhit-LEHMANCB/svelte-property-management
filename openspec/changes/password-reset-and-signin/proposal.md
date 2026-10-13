# Proposal

## Why

A tenant who forgets their password cannot reset it without first signing in (#46), and the reset flow around it has rough edges: a bad link answers 500 instead of 400 (#55), Continue follows whatever `continueUrl` the link carries and may prompt "Leave site?" (#56), and the reset endpoint answers 500 for an unknown email, which reveals who has an account. Sign-in also reports every non-credential failure as a generic error or a bare 500 (#119).

## What Changes

- New public `/forgot` page, linked as "Forgot password?" from `/signin`, that requests a reset email and works without client-side scripts.
- Reset requests (from `/forgot` and `PUT /api/signin/reset`) answer the same way whether or not an account exists, and are rate limited per email address (1 per minute, 5 per hour). An unknown email no longer causes a 500.
- `/reset` rejects a wrong `mode` or a missing `oobCode` with a real 400 "Invalid action".
- After a successful reset, Continue always goes to `/signin`, which shows "Your password was changed. Please sign in." `continueUrl` is ignored. No "Leave site?" prompt.
- Sign-in, with and without scripts, shows specific messages for a disabled account and for too many attempts, and shows "Sign-in is unavailable right now. Please try again." (staying on `/signin`) when the session cookie cannot be created.
- Known Gaps closed in the authentication spec: no reset link on `/signin`, the 500 on a wrong mode, the "Leave site?" prompt, and the reset `TODO`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `authentication`: password reset request (generic answer, rate limit, `/forgot` page), password reset completion (400 on bad links, Continue to `/signin`), session establishment and sign-in before hydration (specific error messages, session failure handling), route protection (`/forgot` is public).

## Impact

- Routes: new `src/routes/(ignorebase)/forgot/`; changes to `signin`, `reset`, `api/signin/reset`; `hooks.server.ts` public paths.
- Server: `src/lib/server/email.ts` (unknown-user handling), new server-only rate limit helper using a `passwordResetRequests` Firestore collection (client rules stay deny-all), `verifyPassword.ts` error classification.
- Profile page reset button keeps working; it gets the same generic success.
- Tests: handler tests for the new action, load and endpoint; unit tests for the rate limit and error mapping; e2e tests for `/forgot`, reset Continue and the 400s.
- No new environment variables, secrets or console changes.
