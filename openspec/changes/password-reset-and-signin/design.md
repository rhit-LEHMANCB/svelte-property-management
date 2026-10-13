# Design

## Context

- `/signin` signs in through the Firebase client SDK after hydration and through a form action (`verifyPassword` REST call + `setSessionCookie`) before it. `verifyPassword` returns null for bad credentials and throws for anything else, so disabled accounts and Firebase throttling surface as "unavailable", and the action does not catch `setSessionCookie` failures.
- `PUT /api/signin/reset` calls `sendPasswordResetEmail`, where `adminAuth.generatePasswordResetLink` throws `auth/user-not-found` for an unknown email, which becomes a 500.
- `/reset` checks `mode` while the page renders (500 instead of 400) and sends Continue to `continueUrl ?? PUBLIC_FRONTEND_URL/`.
- Firestore rules deny all client access; server code uses the Admin SDK.

## Goals / Non-Goals

**Goals:** one server function owns "request a reset" (rate limit + generic outcome) for both callers; every sign-in failure maps to a known message on both sign-in paths.

**Non-Goals:** IP or global throttling, CAPTCHA, changes to the welcome email path (`sendPasswordResetEmail(email, true)` is not rate limited).

## Decisions

1. **`requestPasswordReset(email)` in `src/lib/server/passwordReset.ts`** returns `'sent' | 'suppressed'` (suppressed = unknown account or over the limit) and throws on real delivery failures. `/forgot` and `PUT /api/signin/reset` both call it; both map `sent` and `suppressed` to the same answer. Alternative: put the logic in the endpoint and have `/forgot` fetch it. Rejected: a form action calling its own API adds a hop and a second error path.
2. **Rate limit in Firestore**, document `passwordResetRequests/{sha256(lowercased trimmed email)}` with `requests: number[]` (ms timestamps). In a transaction: drop entries older than 1 hour; if the newest is under 60 s old or 5 remain, suppress; otherwise append now and allow. The check runs before the account lookup so unknown and known emails cost the same and are counted the same. Hashing keeps raw addresses out of the collection. Alternative: in-memory map. Rejected: Cloud Functions instances do not share memory and restart often.
3. **Unknown account**: `requestPasswordReset` looks the address up with `adminAuth.getUserByEmail` before generating the link, and treats `auth/user-not-found` (and, defensively, `auth/email-not-found` from link generation) as `suppressed`. The lookup is needed because a project with email enumeration protection (the dev project has it on; the Auth emulator does not model it) answers link generation for an unknown address without a link, which the Admin SDK reports as `auth/internal-error`. Found by QA cycle 1. The welcome path is unchanged and still fails loudly.
4. **Delivery failure on `/forgot`** shows a distinct retry message. This reveals an account exists only while the provider is failing; accepted (the alternative hides real outages from tenants).
5. **`/forgot` is a plain HTML form with a server action**, no client script, so it works before hydration without the hydration gating `/signin` needs. Email validated server-side with the existing zod email rule.
6. **`/reset` load**: read `mode` and `oobCode` from `url.searchParams` in `+page.server.ts` and `throw error(400, 'Invalid action')`; pass `oobCode` to the page through `data`. The page no longer imports `error` or reads `$page.url`.
7. **Continue** does `window.location.assign('/signin?reset=success')` (same origin, so superforms' tainted check does not apply and `continueUrl` is never read). `/signin` shows the success notice when `reset=success` is in the URL (read in a `load`, so it renders server-side). Superforms 3 defaults `taintedMessage` to false; the reset form also sets it explicitly so a future default change cannot bring the prompt back.
8. **Sign-in error mapping** in one helper `signInErrorMessage(code)` in `src/lib/authErrors.ts` (shared by server and client): `USER_DISABLED` / `auth/user-disabled` → disabled; `TOO_MANY_ATTEMPTS_TRY_LATER` / `auth/too-many-requests` → too many; credential codes → incorrect; anything else → unavailable. `verifyPassword` returns a discriminated result (`{ idToken } | { error: 'credentials' | 'disabled' | 'throttled' }`) and throws only for unexpected failures. The form action wraps both `verifyPassword` and `setSessionCookie` in one try/catch. The client checks `/api/signin`'s `response.ok` before `goto('/')`, and signs the Firebase client back out if the session call failed.

## Risks / Trade-offs

- [Firestore transaction adds latency to every reset request] → One small document per address; resets are rare.
- [The rate-limit collection grows] → Only well-formed email addresses reach it (the endpoint and `/forgot` answer 400 otherwise), a failed send that leaves no request deletes its document, and each document holds at most five numbers. Someone scripting many distinct valid-looking addresses can still add documents; IP throttling is a non-goal, and a TTL policy can be added later without code changes.
- [Client SDK with email enumeration protection reports `auth/invalid-credential` for disabled accounts in some projects] → Then the client path shows "incorrect"; the POST path still distinguishes. Covered by unit tests on the mapping, not on Firebase's behavior.

- [A known address answers more slowly than an unknown or rate-limited one, because only it waits for the email provider, so response timing can hint that an account exists] → Accepted: the answer text and status are identical, and the per-address limit caps probing to five tries an hour. Not awaiting the send would hide delivery failures, which the specs require to surface.
- [A failed delivery would otherwise use up the address's slot and silently drop the retry] → The slot is released when delivery fails; an unknown address keeps its slot so both are counted alike.

## Migration Plan

Deploy normally; no data migration. Rollback is a revert; the `passwordResetRequests` documents are inert.
