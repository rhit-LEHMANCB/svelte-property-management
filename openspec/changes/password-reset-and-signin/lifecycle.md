# Lifecycle: password-reset-and-signin

- Branch: `claude/password-reset-and-signin`
- Stage: 1 Interview
- Review round: 0 of 5
- QA cycle: 0 of 3
- Started: 2026-10-13

## Interview summary
Approved: no

**Goal.** A signed-out user can reset a forgotten password from the sign-in page, the reset page fails cleanly on bad links and ends on sign-in, and sign-in errors say what actually went wrong. Issues: #46, #55, #56, and the sign-in items of #119.

**Scope.**
- New public `/forgot` page, linked as "Forgot password?" from `/signin`. Email field; works before hydration and without JavaScript (form action), like `/signin`.
- Reset requests always answer with the same message: "If an account exists for that email, we've sent a reset link." Unknown emails, disabled-provider lookups and rate-limited requests look identical to the user. `PUT /api/signin/reset` (used by `/profile`) follows the same rule: unknown email is not a 500.
- Per-email rate limit on reset emails: at most 1 per minute and 5 per hour per address, tracked server-side in Firestore keyed by a hash of the lowercased email (client rules stay deny-all). Over the limit, no email is sent and the generic message is shown.
- `/reset`: check `mode` and `oobCode` in the server `load`, so a wrong mode or missing code answers a real 400 "Invalid action" (#55).
- After a successful reset, Continue always goes to `/signin?reset=success`, ignoring `continueUrl` (closes an open redirect); `/signin` then shows "Your password was changed. Please sign in." No "Leave site?" prompt (#56: likely already gone with superforms 3 and `window.location.assign`; prove it with an e2e test that clicks Continue).
- Sign-in errors, on both the no-JS form action and the hydrated client path:
  - disabled account: "This account has been disabled. Please contact Lehman Family LLC."
  - too many attempts: "Too many sign-in attempts. Please wait a few minutes and try again."
  - wrong credentials: unchanged.
  - session cookie failure (`setSessionCookie` / `/api/signin` not ok): "Sign-in is unavailable right now. Please try again." shown as the form error/toast, never a bare 500, and the client no longer navigates to `/` when `/api/signin` failed.
- Update the authentication spec and remove the Known Gaps this closes.

**Out of scope.** IP-based or global sign-in rate limiting; changing the welcome email (#118/#120); the session cookie lifetime gap (#54); other #119 items.

**Roles.** Unauthenticated users can use `/forgot` and `/reset`. No admin/tenant difference.

**Data.** New server-only collection `passwordResetRequests/{sha256(lowercased email)}` holding recent request timestamps. No migration.

**Security.** No account enumeration from `/forgot` or the reset API; rate limit stops inbox flooding; no open redirect after reset; hook allows `/forgot` without a session.

**Acceptance.**
- WHEN a signed-out user clicks "Forgot password?" on `/signin` and submits their email THEN they see the generic message and receive a reset email.
- WHEN they submit an unknown email THEN they see the same message and no email is sent.
- WHEN the same email is submitted twice within a minute THEN only one email is sent; both show the generic message.
- WHEN `/reset?mode=verifyEmail&oobCode=x` is opened THEN the response is 400 "Invalid action"; same for `mode=resetPassword` without `oobCode`.
- WHEN a reset succeeds and Continue is clicked THEN the browser goes to `/signin` with the success message and no "Leave site?" prompt, whatever `continueUrl` says.
- WHEN a disabled user or a rate-limited user signs in (with or without JS) THEN the specific message is shown.
- WHEN the session cookie cannot be created THEN the sign-in form shows the "unavailable" message and stays on `/signin`.

**Rollout.** No new env vars or secrets. The Firebase reset link's continue URL stays `PUBLIC_FRONTEND_URL/` (Continue ignores it now).

**Assumptions.** Error wording above; rate-limit numbers fixed in code; the profile page's reset button keeps working with the generic success.

## Gate A
Approved: no
Accepted preflight gaps: none

## Preflight
(table of checks and results, from stage 2)

## Review rounds
(none yet; one line per round: blockers, majors, minors, nits, fixed, rejected with reason)

## Out-of-scope observations
(only QA observations outside this change's scope, to turn into issues at wrap-up; review findings are fixed, never listed here)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
