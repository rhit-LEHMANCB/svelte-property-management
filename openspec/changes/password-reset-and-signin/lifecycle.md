# Lifecycle: password-reset-and-signin

- Branch: `claude/password-reset-and-signin`
- Stage: 7 Production PR (Gate B: human verifies and merges production PR #140, which carries this change)
- Review round: 4 of 5
- QA cycle: 2 of 3
- Started: 2026-10-13

## Interview summary
Approved: yes (2026-10-13)

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
Approved: yes (2026-10-13)
Accepted preflight gaps: none (browser build mismatch worked around in the container)

## Preflight
GitHub backend: **GitHub MCP** (`gh` token invalid; cloud session; `get_me` = rhit-LEHMANCB).

| Check | Result |
| --- | --- |
| git commit and push to origin | ok (branch pushed) |
| GitHub backend | MCP, `get_me` ok |
| Env files (`scripts/pull-env.sh` via 1Password) | ok, `.env` and `.env.qa` written, mode 600, untracked |
| QA credentials (4 vars, dev project) | present in `.env.qa` |
| Playwright `qa` project | present in `playwright.config.ts` |
| Browsers | Playwright 1.63 expects headless shell build 1243; container has 1194. Worked around by symlinking the preinstalled Chromium to the expected path (container only, no repo change); `npm run test:e2e` 100 passed |
| Dev deploy on develop | last run success (#135 merge) |
| Dev site | https://lehman-realty-dev.web.app/signin answers 200 |
| `npm run lint`, `check`, `test`, `build` | all pass |
| New secrets or variables | none needed |

## Review rounds
- Round 1: 0 blockers, 1 major, 2 minors, 2 nits. Fixed all: failed delivery now releases its rate-limit slot (+ retry test); non-JSON reset body answers 400; timing side channel and hydrated disabled-account trade-off documented in design/proposal; unknown-address link failures no longer logged as errors. None rejected.
- Round 2: 0 blockers, 1 major, 3 minors, 1 nit. Fixed all: reset endpoint validates the email (400) before touching the rate limit, empty rate-limit docs are deleted, document-growth risk recorded; profile disabled/throttled branches tested; one shared unknown-account check; profile toast reworded to "Reset email requested. Check your inbox." so a rate-limited click is not called a send; expiry test asserts exact timestamps. None rejected.
- Round 3: 0 blockers, 0 majors, 2 minors, 2 nits. Loop exits. Fixed: plus-tag and Gmail-dot variants of one mailbox share a rate limit (spec scenario + tests). Rejected with reason: (a) a provider error after acceptance can free the slot and allow one duplicate email: a duplicate is better than silently dropping the retry the user was told to make; (b) `lifecycle.md` in the change folder: it is the dev-lifecycle run state the skill requires, archived with the change; (c) `/signin?reset=success` notice can be shown by anyone: harmless text by design, no state behind it.
- Round 4 (QA cycle 1 fix, one round): 0 blockers, 0 majors, 2 minors, 1 nit. Fixed: comment explains why the link-generation unknown-account check stays (account deleted between lookup and send); first-request test asserts the lookup runs with the typed address. Rejected with reason: the nit (unknown addresses answer without waiting on the provider) is the timing trade-off already accepted in design.md.

## Out-of-scope observations
(only QA observations outside this change's scope, to turn into issues at wrap-up; review findings are fixed, never listed here)

## QA report
Evidence branch: `qa-evidence/password-reset-and-signin` (not merged). Specs: `tests/qa/password-reset-and-signin/`.

- **Cycle 1** (deployed `15f2795`, 2026-10-13 04:25 UTC): FAIL, one app bug. On the dev project a reset request for an unknown address answered 500 (`PUT /api/signin/reset`) and `/forgot` showed the delivery-failure message, revealing which addresses have accounts. Cause: email enumeration protection makes link generation for an unknown address fail as `auth/internal-error` instead of a not-found code; the emulator does not model it. Fixed in #143 (look the account up first), with one review round (round 4). 20 of 26 QA checks passed; the other failures were the same cause.
- **Cycle 2** (deployed `61655cc`, 2026-10-13 ~05:00 UTC): **PASS**, 31 passed, 1 skipped (delivery failure needs a forced provider error). Both cycle 1 failures retested and fixed, with and without scripts. Regression pass: admin and tenant sign in and load every navigation page with no console errors or 4xx/5xx.

| Scenario | Result | Evidence |
|---|---|---|
| Successful sign-in (admin, tenant), cookie lifetime | pass | [admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-successful-sign-in-admin.png) · [tenant](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-successful-sign-in-tenant.png) |
| Invalid credentials | pass | [shot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-invalid-credentials.png) |
| Disabled account / Too many attempts (Firebase response intercepted) | pass, partial | [disabled](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-disabled-account.png) · [throttled](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-too-many-attempts.png) |
| Session cookie cannot be created (`/api/signin` intercepted) | pass, partial | [shot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-session-cookie-cannot-be-created.png) |
| Unauthenticated page redirect, API not redirected | pass | HTTP-level |
| Forgot password page is public | pass | [shot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-forgot-password-page-is-public.png) |
| Request from the sign-in page | pass | [shot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/forgot-request-from-the-sign-in-page.png) |
| Same answer for unknown or limited emails (JS and no JS) | pass | [JS](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/forgot-same-answer-for-unknown-or-limited-emails.png) · [no JS](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/forgot-same-answer-for-unknown-emails-no-js.png) |
| Reset email sent (real tenant account; delivery not seen) | pass, partial | [shot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/forgot-reset-email-sent-real-account.png) |
| Unknown email (API 200 `email_sent`) | pass | HTTP-level |
| Empty or invalid email (page and API 400) | pass | [shot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/forgot-empty-or-invalid-email.png) |
| Wrong mode / Missing code (400 "Invalid action") | pass | [wrong mode](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-wrong-mode.png) · [missing code](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-missing-code.png) |
| Continue after a reset (notice on `/signin?reset=success`; Continue press not exercised) | partial | [shot](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-continue-after-a-reset-signin-notice.png) |
| Submit before hydration, typed early, wrong credentials on POST form | pass | [no JS](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-submit-before-hydration.png) · [typed early](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-typed-early.png) · [POST error](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/authentication-wrong-credentials-post-form.png) |
| Rate limit (1/min, 5/h, case, `+tag`) | answers identical; suppression not observable | — |
| Email failure / Delivery failure, POST-form disabled/throttled/session failure, stale token 401 | not covered | needs fault injection or real accounts |
| Regression: admin and tenant pages | pass | [admin](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/regression-admin-home.png) · [tenant](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/password-reset-and-signin/openspec/changes/password-reset-and-signin/qa/screenshots/regression-tenant-home.png) |

Observations outside the specs: none needing action (admins are redirected from tenant pages to `/admin`, as intended; after a `/forgot` request the page offers only "Back to sign in"). The QA scenarios that passed are already covered by the e2e suite on the emulators (`tests/e2e/specs/signin.spec.ts`, `password-reset.spec.ts`), so no QA script needed porting.

## Verification checklist for the human
On the dev site before merging production PR #140, then on production after the deploy:
- [ ] **Reset email end to end (high).** `/signin` → "Forgot password?" → a mailbox you control. Open the email, follow the link, set a new password, press Continue. Expect `/signin` with "Your password was changed. Please sign in.", no "Leave site?" prompt, and the new password works. Repeat with the link's `continueUrl` edited to another site: Continue must still land on `/signin`. Why a person: needs a real inbox. On production also confirm the link uses the production domain.
- [ ] **Rate limit (high).** Submit the same mailbox twice within a minute (second time upper-cased or with `+tag`). Expect one email, identical answers. Why a person: suppression is invisible by design.
- [ ] **Unknown address on production (high).** Submit an address with no account on production `/forgot`. Expect the generic message, not "We couldn't send the email". Why: the fix depends on the project's email enumeration protection setting, which QA only saw on dev.
- [ ] **Disabled account (medium).** Disable a throwaway user in the Firebase console and sign in with and without JavaScript. Expect "This account has been disabled. Please contact Lehman Family LLC." without JavaScript; with JavaScript it may show "incorrect" when enumeration protection is on (documented trade-off).
- [ ] **Profile reset button (medium).** Profile → Reset. Expect the toast "Reset email requested. Check your inbox." and one email.
- [ ] **Phone layout (low).** `/signin`, `/forgot`, `/reset` at about 375 px: readable, "Forgot password?" reachable.
- [ ] **Archive PR.** After the production deploy, confirm the "Archive OpenSpec changes" PR into `develop` opens and merges.

Production-only risks: no new env vars, secrets or Stripe changes. New server-only Firestore collection `passwordResetRequests` (client rules stay deny-all). Behavior for unknown reset addresses depends on Firebase Auth's email enumeration protection; the code handles it on or off.

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
