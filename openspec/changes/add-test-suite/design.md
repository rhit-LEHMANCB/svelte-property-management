# Design

## Context

See proposal.md for motivation. Constraints that shape the approach:

- Today: SvelteKit 1.27, Svelte 4, Vite 4.4, Node 20 (`.nvmrc`). Issue #48 will replace most of this, so tests should depend on as little of it as possible.
- Server modules run side effects at import time: `src/lib/server/admin.ts` initializes Firebase Admin from `$env/static/private`, and `stripe.ts` builds a Stripe client from a key. `$env/static/*` imports fail if a variable is missing.
- API handlers are plain `(event) => Response` functions that use `locals.userID`, so they can be called without a server. Form actions use `sveltekit-superforms`, which reads `event.request.formData()`.
- The webhook handler does not await its Firestore writes (a known gap), so tests need to wait for them.
- The PR check workflow already exposes the real secrets as job env vars and builds with them.
- Java is not installed on the dev machine; GitHub's `ubuntu-latest` runner has it.

## Goals / Non-Goals

**Goals:**
- A fast layer that runs on every save, and a slower end-to-end layer that proves the real app boots and the main flows work.
- Layers 1 and 2 pass unchanged before and after the #48 upgrades.
- Tests run with no real credentials and no network.

**Non-Goals:**
- Coverage targets or component tests (they would be rewritten for Svelte 5 and Skeleton).
- Testing Firebase, Stripe or SendGrid themselves.
- Fixing Known Gaps. Where code is wrong, tests record what it does today only if a spec scenario covers it.

## Decisions

**Vitest 0.34.x, not 1.x or later.** Vitest 1+ requires Vite 5, and the app is on Vite 4. Pin `vitest@^0.34` now and bump it in the same step as the Vite upgrade. *Alternative:* Jest, rejected: needs a separate TypeScript and ESM setup that Vitest gets from Vite.

**Do not use the SvelteKit Vite plugin in Vitest.** The config sets plain aliases: `$lib` → `src/lib`, and `$env/static/private` and `$env/static/public` → fixture modules under `tests/fixtures/`. Handlers only need `@sveltejs/kit` runtime helpers (`error`, `json`, `redirect`), which work without the plugin. This keeps layers 1 and 2 independent of the SvelteKit version and avoids loading `.env` files. *Alternative:* `sveltekit()` plugin plus `.env.test`, rejected: `.env.*` is gitignored, and it ties the tests to plugin behavior that changes across majors.

**Handler tests use an in-memory fake instead of the Firestore emulator.** `vi.mock('$lib/server/admin')` supplies a small fake supporting the calls the code makes: `collection/doc/where(==, not-in)/orderBy/limit/get/set/update/add/delete`, subcollections, `FieldValue` (`serverTimestamp`, `increment`, `arrayUnion`, `arrayRemove`) and `Timestamp`. Auth and Storage are plain `vi.fn` doubles, and Stripe and SendGrid are mocked at module level. *Why:* no Java, no emulator start-up, runs in seconds. *Trade-off:* the fake can disagree with real Firestore, so it stays minimal and the end-to-end layer covers real behavior.

**A tiny `callHandler` helper builds the request event.** It takes `locals`, `params`, a JSON or FormData body and returns the `Response`, or the thrown `error`/`redirect`, so tests assert on status codes. Page loads that call `event.parent()` get a stubbed parent.

**Tests are named after spec scenarios.** Layout: `tests/unit`, `tests/handlers`, `tests/e2e`, with `describe('<capability>')` and `it('<scenario name>')`. A check or script can later grep the specs for scenario names without a matching test.

**End-to-end runs through Firebase emulators and a fake Stripe, with no new required env vars.** The `$env/static/*` model would break every deploy if a new variable were required, so the switches avoid it:
- Client: `src/lib/firebase.ts` calls `connectAuthEmulator` only when `import.meta.env.MODE === 'e2e'`. Production builds use another mode, so the branch is removed.
- Server: Firebase Admin already honors `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` and `FIREBASE_STORAGE_EMULATOR_HOST`, so `admin.ts` needs no change.
- Stripe: `stripe.ts` reads an optional `process.env.STRIPE_API_BASE_URL` (not `$env/static`) and, when set, points the client at it. A small Node HTTP server started by Playwright answers the Checkout Session call with a local URL.
- Project id `demo-lehman-realty`: Firebase's `demo-` prefix guarantees the emulators never reach a real project, and `.firebaserc` (gitignored) is not needed.
- The app runs as `vite dev --mode e2e` on a fixed port, with an env block set in `playwright.config.ts`. The admin private key is generated at run time with `crypto.generateKeyPairSync` so no key, even a throwaway one, is committed.
- Emulators (auth, firestore, storage) are started by `firebase emulators:exec`, which also tears them down. A seed script creates one admin, one tenant, one property and the tenant link before each run, via the Admin SDK.

**A second Playwright project, `qa`, serves the lifecycle's QA stage.** It reuses the same config and helpers but takes `BASE_URL` for the deployed dev site, starts no server or emulators, and keeps traces and screenshots. The `dev-lifecycle` skill runs it with real dev accounts supplied through `QA_*` environment variables. For this change itself there is no user-facing behavior to QA, so its QA run is a regression pass over the existing flows.

**Only 4 or 5 end-to-end tests.** One per flow in the spec, sharing a signed-in storage state per role. Each uses real navigation and form posts, which is what the Svelte 5 and Skeleton upgrades are most likely to break.

**CI changes go in the existing PR workflow.** Order: install, lint, `svelte-check`, unit and handler tests, end-to-end tests, build. It adds `actions/setup-java` (Temurin 21, which current `firebase-tools` needs) and `npx playwright install --with-deps chromium`. The e2e step sets every `PUBLIC_FB_*`, `FB_*`, `SENDGRID_*`, `STRIPE_*` value explicitly, so the job-level real secrets are never used by tests. Failure uploads the Playwright report as an artifact.

## Risks / Trade-offs

- [In-memory Firestore fake drifts from real behavior] → keep it minimal, document each supported call in the fake, and let the e2e layer exercise the real emulator.
- [Secure session cookie on `http://localhost`] → Chromium accepts `Secure` cookies on localhost; verify in the first e2e test, and only fall back to an HTTPS dev server if it does not.
- [Emulator `verifySessionCookie` behavior differs from production] → the emulator skips signature checks; the e2e sign-in test proves the cookie round-trip works, and token validity itself is Firebase's concern.
- [Emulators need Java locally] → document the `jre-openjdk-headless` package in the README test section. Layers 1 and 2 do not need Java, so most work can proceed without it.
- [PR check gets slower and flakier] → cap e2e at 5 tests, one worker, and a retry in CI; keep layers 1 and 2 as separate steps so their result is clear.
- [The webhook handler's unawaited writes make assertions racy] → tests wait on the document state (`vi.waitFor`) instead of the handler's return.
- [Tests could lock in bugs] → only scenarios in the specs are tested; Known Gaps and "not yet implemented" requirements are never asserted.
- [Vitest must move with Vite] → recorded in tasks and in #48 as a step of the Vite upgrade.
