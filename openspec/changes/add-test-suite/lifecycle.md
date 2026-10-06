# Lifecycle: add-test-suite

- Branch: `add-test-suite` (from `origin/develop` at `75f789a`)
- Stage: 4 Review loop (stage 3 complete: 33 of 33 tasks done)
- Review round: 1 of 3 done (fixes applied, round 2 next)
- QA cycle: 0 of 3
- Started: 2026-10-05
- Issue: #50 (related: #48)

## Interview summary
Reconstructed from the conversation and the existing proposal, design and tasks; not re-asked.

- **Goal:** automated tests exist before the dependency upgrades in #48, so each upgrade is judged against current behavior instead of a manual click-through.
- **Scope:** three layers in order. (1) Vitest unit tests for the zod schemas and `authHelpers`. (2) Vitest tests for the `api/*` handlers, form actions and page loads, with Firebase Admin, Stripe and SendGrid doubled. (3) 4 to 5 Playwright smoke tests on the Firebase emulators: sign-in, tenant submits a maintenance request, admin closes it, admin creates a property, tenant starts a payment. Plus npm scripts, a test step in the PR check, and a second Playwright project `qa` for the lifecycle's QA stage.
- **Out of scope:** coverage targets, component tests, testing Firebase/Stripe/SendGrid themselves, fixing Known Gaps.
- **Test plan:** `openspec/specs/` scenarios; tests named after them; Known Gaps and "not yet implemented" requirements never asserted.
- **Constraints:** Node 20; SvelteKit 1 / Svelte 4 / Vite 4 today; Vitest pinned to 0.34 (Vite 4); layers 1 and 2 independent of Svelte and Skeleton so they survive #48 unchanged; no production-code changes except emulator and stub hooks, with no new required env vars.
- **Decisions already made:** in-memory Firestore fake for layer 2 (not the emulator); `import.meta.env.MODE === 'e2e'` client hook; optional `STRIPE_API_BASE_URL` for a fake Stripe; project id `demo-lehman-realty`; generated throwaway admin key at run time.
- **Order of work:** this change first, then the Node 20 runtime bump (deadline 2026-10-30), then the rest of #48.
- **Rollout:** no new GitHub secrets or variables for the tests. QA needs dev-project accounts (see preflight).
- **Assumptions to verify in implementation:** `Secure` session cookie accepted on `http://localhost` in Chromium; the Auth emulator works with session cookies through the Admin SDK.

Interview approved: yes (carried over from the conversation)

## Gate A
Approved: yes, 2026-10-05
Accepted preflight gaps: local `.env` out of date for develop (does not affect tests or CI; noted in #48). Local build checks use per-command env overrides instead.

## Preflight (2026-10-05)

| Check | Result | Note |
|---|---|---|
| git can commit and push | pass | Global identity `cblehman22@gmail.com` works. A stray `user.email t@t` that I leaked into the repo config from a test worktree was removed. |
| `gh` auth and scopes | pass | `repo`, `workflow`, `project`, `read:org`. |
| `gh pr merge` permitted | pass | Merging PR #51 worked in this session. |
| Local `npm ci`, lint | pass | Clean install on `develop`, Prettier clean. |
| Local `svelte-check` and build | **fail as configured** | Local `.env` is out of date for `develop`: missing `PUBLIC_FRONTEND_URL` and `STRIPE_ENDPOINT_SECRET`, and `FB_PRIVATE_KEY` is a raw PEM while `admin.ts` expects JSON `{"privateKey": "..."}`. With those three corrected for one command, check is 0 errors and the build passes (46 s). CI is unaffected. |
| Java for emulators | pass | OpenJDK 26.0.2 installed. |
| Playwright installed | not yet | Created by this change. |
| `qa` project exists | not yet | Added to tasks 5.4 and the design in this preflight; created by this change. |
| QA credentials set | pass (fixed at Gate A) | QA admin and tenant created in `lehman-realty-dev` (tenant through the dev app's own add-user endpoint, so it has a Stripe customer), plus a permanent `qa-property (do not delete)` and the tenant link. Credentials are in the gitignored `.env.qa` (mode 600). Verified on the dev site: tenant `/maintenance` 200, admin `/admin/users` 200, tenant `/admin/users` 401. |
| Local `.env` points at | note | `lehman-realty` = **production**. Never used for tests or QA. |
| Dev deploy passing on `develop` | pass | Last completed run succeeded; the run for #51 was in progress. |
| Secrets for this change | pass | None needed. |

## Plan changes made during preflight
- Task 5.4: Playwright config now has two projects, `e2e` and `qa`.
- Task 7.2 and design: document the `qa` project and add an `.env.example` with the format of every variable (including the `FB_PRIVATE_KEY` JSON shape).

## Implementation notes
- Emulator config lives in `firebase.emulators.json`, not in `firebase.json`, so the deploy config is untouched (task 5.1 text updated).
- `firebase-tools` and `@playwright/test` add about 8,700 lockfile lines. The app's own dependencies are unchanged; 25 transitive packages moved within their semver ranges.
- The e2e app is a production build served by `vite preview`, not `vite dev` (a cold dev server re-bundles dependencies and reloads the page mid-login; see design.md). The e2e build writes to `.svelte-kit/output` like `npm run build`.
- Verified assumptions: `Secure` session cookie is accepted on `http://127.0.0.1` in Chromium; the Auth emulator works with `createSessionCookie` through the Admin SDK.
- Mutation spot checks: six deliberately broken behaviors were each caught by the handler tests.
- Integration check (task 7.4): a throwaway PR (#52, closed) removed the close-request validation. The new `tests` job failed at "Unit and handler tests" on exactly the covering test (1 failed, 176 passed) and `build_and_preview` failed on ESLint; after the revert both jobs passed, including the e2e step on the CI runner (tests job 3m20s).
- Three consecutive local e2e runs: 15 of 15 passed each time, about 73 seconds per run.
- Local `npm run lint`, `check` and `build` need three env overrides (see Preflight) because the local `.env` is stale.

## Review rounds
**Round 1** (blockers 0, majors 4, minors 6, nits 2). All fixed; none rejected.
- Major: e2e test asserting 401 on an admin URL covered the "not yet implemented" route-enforcement requirement. Removed.
- Major: tenant-assignment tests asserted that admins appear in the assignable list (a Known Gap). Rewritten to check tenants only.
- Major: three negative e2e checks could pass before the app reacted. Each now waits for a positive signal first (validation message or error toast).
- Major: spec scenarios without tests. Added handler tests for non-admin photo upload and property edit, and e2e specs for password reset completion (valid, mismatch, wrong mode), admin insurance visibility and the missing-insurance badge, the profile reset button, and the full navigation labels.
- Minor: dropped a layout test that asserted a Known Gap's consequence; handler tests now block fetch and http(s) so a bypassed double fails; the `qa` project no longer records traces or video (they capture typed passwords); the invalid-credentials spec waits before filling; the `tests` job has `permissions: contents: read` and caches the Playwright browser and emulator jars; the fake Firestore leaves out documents lacking the field for `!=` and `not-in`.
- Nit: `port: target.port || undefined`; `tests/qa/.gitkeep` and a README note.
- Found while fixing: my access-control spec had the wrong navigation labels (tenant Dashboard, not Home; admin Home, not Admin; About Us only for tenants) and my authentication spec claimed a 400 for a wrong `/reset` mode (the app responds 500). Both specs corrected; the 500 and a "Leave site?" prompt after a successful reset are recorded as Known Gaps.

## Deferred findings
- `POST /api/signin` sets the cookie with `maxAge: expiresIn`, and `expiresIn` is 5 days in milliseconds. SvelteKit cookie `maxAge` is in seconds, so the browser cookie lives about 13.7 years. The session itself still expires after 5 days at Firebase, so the practical effect is limited, but the value is wrong. Not in the specs' Known Gaps; tests assert only httpOnly, secure and path. File an issue at wrap-up.
- `/reset` with a wrong `mode` responds 500 (page text "500 Invalid action"), not the intended 400: the `error(400)` is thrown inside the component while rendering. Found by the e2e test; recorded in the authentication spec's Known Gaps. File an issue at wrap-up.
- After a successful password reset, the Continue button navigates with an absolute URL while the superforms form is still marked tainted, so the browser shows "Leave site? Changes you made may not be saved" and, in headless Chromium, the navigation is cancelled. Recorded in the authentication spec's Known Gaps. File an issue at wrap-up.

## QA report
(stage 6)

## Verification checklist for the human
(stage 7)
