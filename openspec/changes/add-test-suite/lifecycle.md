# Lifecycle: add-test-suite

- Branch: `add-test-suite` (from `origin/develop` at `75f789a`)
- Stage: 2 Propose and preflight, waiting at Gate A
- Review round: 0 of 3
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
Approved: no
Accepted preflight gaps: none yet

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
| QA credentials set | **fail** | `QA_ADMIN_EMAIL`, `QA_ADMIN_PASSWORD`, `QA_TENANT_EMAIL`, `QA_TENANT_PASSWORD` are not set, and no QA accounts are known to exist in `lehman-realty-dev`. |
| Dev deploy passing on `develop` | pass | Last completed run succeeded; the run for #51 was in progress. |
| Secrets for this change | pass | None needed. |

## Plan changes made during preflight
- Task 5.4: Playwright config now has two projects, `e2e` and `qa`.
- Task 7.2 and design: document the `qa` project and add an `.env.example` with the format of every variable (including the `FB_PRIVATE_KEY` JSON shape).

## Review rounds
(none yet)

## Deferred findings
(none yet)

## QA report
(stage 6)

## Verification checklist for the human
(stage 7)
