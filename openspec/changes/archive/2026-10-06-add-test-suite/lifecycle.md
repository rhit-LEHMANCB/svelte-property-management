# Lifecycle: add-test-suite

- Branch: `add-test-suite` (from `origin/develop` at `75f789a`)
- Stage: **8 complete (lifecycle finished).** Merged to `develop` (PR #53), deployed to dev, independent QA passed, released to production by a human (PR #62), archived automatically (PR #63).
- Review round: 4 done (3 plus 1 extra requested by the user); round 4 had no blockers or majors
- QA cycle: 1 of 3 (passed)
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

**Round 2** (blockers 0, majors 1, minors 5, nits 2). All fixed; none rejected.
- Major: the real `email.ts` (Firebase link with continue URL `PUBLIC_FRONTEND_URL/`, and the failure paths) was mocked away everywhere. Added `tests/handlers/email.test.ts`, which runs the real module with only SendGrid and the Admin double replaced.
- Minor: the over-balance e2e check no longer depends on the placeholder balance of 1000; the wrong-mode e2e no longer pins the response status; reset specs use a unique user per attempt so a CI retry can run; the CI cache is now saved even when tests fail and the job has a 20 minute timeout; dropped a test that only exercised the doubles.
- Nit: the `qa` project refuses a `BASE_URL` that is not the dev site or a local server (checked against both production hostnames); the fake Firestore now rejects `undefined` field values like the real SDK (no handler wrote one).

**Round 3** (blockers 0, **majors 1**, minors 6, nits 4). The skill says a third round that still has a major halts the run, so it halted here.
- Major (fixed after the round, NOT re-reviewed): the QA `BASE_URL` guard in `playwright.config.ts` ran before `.env.qa` was loaded, so a production URL kept in that file would have skipped the check. The file is now loaded first, then guarded; an empty `BASE_URL` is treated as unset. Verified by hand with a temporary `.env.qa` containing each production hostname (blocked), an empty value and the dev URL (allowed).
- Minor, fixed: `.env.qa` read errors are no longer swallowed (only a missing file is ignored, and a missing `process.loadEnvFile` gives a clear message); the Stripe base-URL override is honored only for a loopback host (new `tests/handlers/stripe-client.test.ts`); the Playwright report is uploaded whenever the run is not cancelled, so a test that only passed on retry stays visible; README notes that QA output can hold failure screenshots and that `test:qa` is POSIX-shell syntax.
- Nit, fixed: stale comment in the sign-in helper; a vacuous assertion removed.
- Not changed: the CI cache is scoped per PR ref by GitHub, so a new PR starts cold (it still helps re-runs of the same PR); the network block covers `fetch`, `http` and `https` but not raw sockets (the Firebase and Stripe modules are already doubled); `firebase-tools` is a large dev dependency.
- Question from the reviewer: `lifecycle.md` contains no secrets or account data, only the git author email already in the commit history.

**Round 4** (extra round requested by the user after the halt; blockers 0, **majors 0**, minors 6, nits 3). The exit criterion is met.
- Fixed: the BASE_URL guard now runs whenever the config loads (not only for `npm run test:qa`), `PLAYWRIGHT_QA` must be exactly `1`, and a malformed URL gives a readable error (checked for the npm script, a direct `--project=qa`, an unflagged run and a malformed value); the Stripe override ignores a malformed URL with a warning, drops the `[::1]` form, and has tests for `localhost` and a malformed value; the e2e setup fails loudly if the emulator wipe fails; a handler test also asserts status 200; the design and tasks now describe the `qa` project and the separate `tests` job as built.
- Not changed: failure screenshots stay on for the `qa` project (the README says so; passwords are masked); the cache save step still runs after a failed job because the emulator jars are only downloaded during the e2e step, so a partial download could in principle be cached (per-PR scope limits the damage); actions are pinned by major tag, as in the existing workflow.
- Needs a repository setting, not code: for a failing test to block a merge, the `tests` check must be marked required.

## Deferred findings
- `POST /api/signin` sets the cookie with `maxAge: expiresIn`, and `expiresIn` is 5 days in milliseconds. SvelteKit cookie `maxAge` is in seconds, so the browser cookie lives about 13.7 years. The session itself still expires after 5 days at Firebase, so the practical effect is limited, but the value is wrong. Not in the specs' Known Gaps; tests assert only httpOnly, secure and path. File an issue at wrap-up.
- `/reset` with a wrong `mode` responds 500 (page text "500 Invalid action"), not the intended 400: the `error(400)` is thrown inside the component while rendering. Found by the e2e test; recorded in the authentication spec's Known Gaps. File an issue at wrap-up.
- After a successful password reset, the Continue button navigates with an absolute URL while the superforms form is still marked tainted, so the browser shows "Leave site? Changes you made may not be saved" and, in headless Chromium, the navigation is cancelled. Recorded in the authentication spec's Known Gaps. File an issue at wrap-up.

## QA report
Independent QA agent (fresh Sonnet 5.5, given only the dev URL, the proposal and delta spec, the QA guide and the current behavior specs). Dev site `https://lehman-realty-dev.web.app`, deployed commit `bba5eeb` on `develop`, cycle 1 of 3, 2026-10-06. **Result: PASS, 0 failing scenarios.** The change adds test tooling and no user-facing behavior, so this was a regression pass of the main flows against the behavior specs. Playwright, 9 tests, desktop Chromium.

| Capability | Scenarios checked (all passed) |
|---|---|
| authentication | unauthenticated redirect to `/signin`; wrong password shows the error toast; admin sign-in then sign-out |
| access-control | admin lands on `/admin` with the admin navigation; tenant navigation (Dashboard, Maintenance, Payment, Profile, Insurance, About Us) |
| user-profile | profile loads with the right contact info for tenant and admin |
| maintenance-requests | valid submission is listed; empty subject is refused; admin sees it and closes it with a note |
| renters-insurance | end date not after start date is refused; admin user modal has an Insurance tab ("No insurance info") |
| rent-payments | amount prompt opens; 5000 is refused; 1 goes to Stripe-hosted checkout in sandbox with Rent $1.00 plus a $0.33 fee line (no card entered) |
| property-management | properties list; the QA property's edit page opens (nothing edited) |
| user-management | users directory lists the users |

Screenshots (19, redacted: emails, phone numbers and other people's rows are blacked out because the repository is public) are under the tag `qa-evidence-add-test-suite` (the temporary branch was deleted after the release), under `openspec/changes/add-test-suite/qa/screenshots/`, together with the QA spec `tests/qa/add-test-suite/regression.spec.ts`. The first set of images showed the QA accounts' emails and another user's contact details; it was discarded and the images were retaken with redaction. QA data (19 `qa-regression-*` maintenance requests) was verified as QA tenant data and deleted from the dev Firestore.

**Observations outside the specs** (filed): the tenant closed-request list labels the closed date "Opened:" (#57); input typed or clicked before hydration is silently lost (#58); the users list sorts last names case-sensitively (#59); QA failures can leave the typed password in `test-results/error-context.md` (#60). Known gaps seen again: the payment page's hardcoded $1,000 balance (#36). Not covered by automation: anything that sends email, completing a Stripe payment and the webhook, saving profile and insurance data, property and user create, edit and delete, other browsers and phones, screen readers.

## Verification checklist for the human
Ranked by risk. This release adds tests, CI and docs and no user-facing behavior; the production-code changes are an Auth emulator hook that is dead code in production builds and an optional, loopback-only Stripe override that is unset in production.

1. **After the production merge, watch the new archive workflow run.** It is new and has never run for real (it only triggers on a push to `production`). Expect a PR titled "Archive OpenSpec changes (release ...)" into `develop` that archives `add-test-suite` and merges itself. If it does not appear, check the workflow log (`openspec-archive.yml`).
2. **Smoke the production site once the deploy finishes** (5 minutes): sign in as an admin and a tenant at the production URL, load Maintenance and Payment. The deploy now installs the new dev dependencies (Playwright, Vitest, firebase-tools), so it will be slower; confirm it still succeeds.
3. **Password reset email, end to end** (high). On `/profile` click Reset, open the email, follow the link, set a new password. Needs a real inbox; confirms SendGrid, Firebase and `PUBLIC_FRONTEND_URL`. Also confirm the production environment's Stripe webhook and portal settings and Firebase Auth's authorized domains use `manager.lehmanfamilyllc.com`. Known quirks: #55, #56.
4. **Complete a payment with Stripe's test card on the dev site** (high): pay $1 with `4242 4242 4242 4242`; check the Stripe dashboard for the Rent and fee lines and `properties/{id}/payment_history/{year}` for the month entry.
5. **Sign-in on a phone and on a slow connection** (medium): type immediately after the page loads, with autofill and by hand. Known bug: #58.
6. **Insurance form in a real browser** (medium): the end-before-start message is a native bubble that automation cannot capture; then save a valid policy and check the admin modal and the missing-insurance badge.
7. **Property edit page, photos and tenant assignment** (medium): assign and remove the QA tenant on the QA property and restore afterwards; upload and reorder a photo.
8. **Small wording and ordering bugs** (low): the closed-request "Opened:" label (#57) and the users list ordering (#59).
9. **Make the `tests` check required** in the repository's branch protection, otherwise a failing test only turns the check red and does not block a merge.

## Halted (resolved)
The run halted after round 3 (one major). The major was fixed, the findings were filed as issues #54, #55 and #56, and the user asked for round 4, which came back clean. The original halt notes are kept in the draft PR #53 description.

## Wrap-up
- **Production release:** PR #62 (`develop` to `production`) was merged by a human at 12:52 UTC on 2026-10-06. The production deploy succeeded (live hosting release at 12:58 UTC; the function `ssrlehmanrealty` is `ACTIVE` on `nodejs20`), and both production hostnames returned 200.
- **Archive:** the new `openspec-archive.yml` workflow ran for the first time on that push. It archived this change into `openspec/changes/archive/2026-10-06-add-test-suite/`, added the `test-suite` capability to `openspec/specs/` (10 specs now), and opened and merged PR #63 into `develop` in 24 seconds. The PR-check run that its creation triggered failed instantly with no jobs, because the PR had already merged; filed as #64.
- **Issues filed from this change:** #54 (cookie `maxAge` unit), #55 (`/reset` wrong mode returns 500), #56 ("Leave site?" prompt after a reset), #57 (closed-request label says "Opened:"), #58 (input lost before hydration), #59 (users list case-sensitive sort), #60 (QA failure can leave the typed password in `test-results/`), #64 (archive PR check race). Existing: #36, #46, #48.
- **Evidence:** the redacted screenshots and the QA spec are kept under the tag `qa-evidence-add-test-suite`; the production PR's images point at it.
- **Next in the plan:** the Node runtime bump (the Cloud Functions Node 20 runtime is decommissioned on 2026-10-30), then the rest of #48. The test suite is now in place for those upgrades.
