# Tasks

## 1. Sign-in errors

- [x] 1.1 Add `src/lib/authErrors.ts` mapping Firebase REST and client error codes to the four sign-in messages; verify with unit tests for every code family and an unknown code.
- [x] 1.2 Make `verifyPassword` return `{ idToken } | { error: 'credentials' | 'disabled' | 'throttled' }` and throw only for unexpected failures; verify `tests/unit/verifyPassword.test.ts` covers `USER_DISABLED`, `TOO_MANY_ATTEMPTS_TRY_LATER`, credential codes and a network failure.
- [x] 1.3 Update the `/signin` form action to show the mapped message with the email kept, and wrap `setSessionCookie` in the same try/catch; verify handler tests for disabled, throttled and session-failure cases (no cookie set, `fail` not a thrown 500).
- [x] 1.4 Update the hydrated `/signin` client path to map Firebase client error codes, check `/api/signin`'s `response.ok`, stay on `/signin` with the unavailable message when it fails, and sign the client back out; verify with an e2e test that stubs `/api/signin` to fail.

## 2. Reset request: generic answer and rate limit

- [x] 2.1 Add the rate limit helper (`passwordResetRequests/{sha256(email)}`, 1/minute, 5/hour, transaction) and `requestPasswordReset(email)` returning `sent | suppressed`; verify unit tests with the fake Firestore for first request, second within a minute, sixth within an hour, expiry after an hour, and case-insensitive addresses.
- [x] 2.2 Treat `auth/user-not-found` from link generation as `suppressed` on the reset path only (welcome path unchanged); verify a handler test that an unknown email returns `{ status: "email_sent" }` and sends nothing, and the existing welcome tests still pass.
- [x] 2.3 Route `PUT /api/signin/reset` through `requestPasswordReset`; verify handler tests for sent, unknown, rate-limited (all `email_sent`) and delivery failure (500).

## 3. Forgot password page

- [x] 3.1 Add `src/routes/(ignorebase)/forgot/` (server action + script-free form, Lehman Family LLC heading, back link to `/signin`) and add `/forgot` to the hook's public paths; verify handler tests for valid, invalid, unknown, limited and failing emails and a hook test that `/forgot` is not redirected.
- [x] 3.2 Add the "Forgot password?" link to `/signin`; verify an e2e test that follows the link, submits an emulator user's email and sees the generic message.

## 4. Reset completion

- [x] 4.1 Move the `mode` and `oobCode` checks to `/reset`'s `load` (400 "Invalid action") and pass `oobCode` through `data`; verify handler tests for wrong mode, missing code and the valid case, and update the e2e wrong-mode test to assert status 400.
- [x] 4.2 Send Continue to `/signin?reset=success`, ignoring `continueUrl`, set `taintedMessage: false`, and show "Your password was changed. Please sign in." on `/signin` when `reset=success`; verify an e2e test that completes a reset with a foreign `continueUrl`, clicks Continue, sees no beforeunload dialog, and lands on `/signin` with the notice.

## 5. Spec and checks

- [x] 5.1 Remove the closed Known Gaps (no reset link on `/signin`, 500 on wrong mode, "Leave site?" prompt, reset `TODO`) from `openspec/specs/authentication/spec.md`; verify `openspec validate password-reset-and-signin --strict` passes.
- [x] 5.2 Run `npm run lint`, `npm run check`, `npm test`, `npm run test:e2e` and `npm run build`; verify all pass.
