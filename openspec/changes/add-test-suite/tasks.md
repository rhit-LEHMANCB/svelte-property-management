# Tasks

## 1. Test tooling setup

- [x] 1.1 Run `npm install` on current `develop` (a stale `node_modules` is missing `stripe`) and verify `npm run build` still succeeds
- [x] 1.2 Add `vitest@^0.34` as a dev dependency, with `vitest.config.ts` using plain `$lib` and `$env/static/*` aliases and no SvelteKit plugin; verify `npx vitest run` starts and reports "no tests"
- [x] 1.3 Add `tests/fixtures/env-private.ts` and `env-public.ts` with fake values for every variable the server code imports; verify a throwaway test can import `$env/static/private` and read one
- [x] 1.4 Add npm scripts `test:unit` (schemas and helpers), `test:handlers` and `test`; verify each script runs and exits 0 when its folder has a passing test
- [x] 1.5 Make sure `eslint` and `prettier` pass on the new config and test folders; verify `npm run lint` is green

## 2. Layer 1: unit tests

- [x] 2.1 Test `passwordChangeSchema` and `profileSchema` against the authentication and user-profile scenarios (length, character classes, mismatch, phone and email); verify `npm run test:unit` passes and each test title names its scenario
- [x] 2.2 Test `propertySchema`, `insuranceSchema` and `maintenanceSchema` for every limit and the end-after-start rule; verify each rule has an accepting and a rejecting case
- [x] 2.3 Test the three `authHelpers` functions with a mocked `adminDB` for anonymous, non-admin, admin and missing-document callers; verify the thrown status codes match access-control

## 3. Layer 2: handler test infrastructure

- [x] 3.1 Write the in-memory Firestore fake in `tests/helpers/` covering the calls listed in design.md; verify with its own tests for `where(==)`, `where(not-in)`, `orderBy` with `limit`, subcollections, `arrayUnion`, `increment` and `serverTimestamp`
- [x] 3.2 Write `callHandler` and the Admin, Stripe and SendGrid doubles, with a per-test reset; verify a trivial handler call returns its `Response` and a thrown `error()` comes back as a status
- [x] 3.3 Verify a handler test passes with all real credentials unset and the network disabled (for example `env -i` plus a run with no connectivity), since the spec requires hermetic runs

## 4. Layer 2: handler tests per capability

- [x] 4.1 authentication: `POST/DELETE /api/signin` (cookie options, stale token 401, sign-out) and `PUT /api/signin/reset` (sent, failed); verify `npm run test:handlers` passes for these scenarios
- [x] 4.2 access-control: the `(authenticated)` layout load (first-login redirect, one property, wrong junction count) and the `/` redirect for admins; verify each scenario passes and the 500 message matches
- [x] 4.3 user-management and tenant-assignment: user add and delete, assoc lookup, property tenants POST and DELETE, each with an admin and a non-admin caller; verify the 401 and 400 cases
- [x] 4.4 property-management: property delete cascade, photo POST reorder and DELETE, the create and edit actions and the edit-page tenant options; verify each requirement has a passing test
- [x] 4.5 maintenance-requests: submit action, tenant and admin loads (5 per status, own property only), and close endpoint (400 without `workDone`); verify the stored fields match the spec
- [x] 4.6 user-profile and renters-insurance: contact update (Firestore, Stripe and Auth updates), photo action, insurance save and prefill, date-order rule; verify against the specs
- [x] 4.7 rent-payments: checkout session (rent line, fee `round(amount*100*0.029+30)`, metadata, bad amount), portal (with and without `stripeID`), and webhook (bad signature, first payment, later payment, unrelated event, awaiting writes with `vi.waitFor`); verify the balance arithmetic against the spec
- [x] 4.8 Review that no test asserts a Known Gap or a "not yet implemented" requirement; verify by searching test titles against those sections

## 5. Layer 3: end-to-end infrastructure

- [ ] 5.1 Add `firebase-tools` and `@playwright/test`, add an `emulators` section and permissive `firestore.rules` and `storage.rules` for auth, firestore and storage under project `demo-lehman-realty`; verify `firebase emulators:exec --project demo-lehman-realty --only auth,firestore,storage "echo ok"` succeeds (needs a JRE)
- [ ] 5.2 Add the `import.meta.env.MODE === 'e2e'` emulator hook in `src/lib/firebase.ts` and the optional `STRIPE_API_BASE_URL` override in `src/lib/server/stripe.ts`; verify `npm run build` output is unchanged for production mode and `npm run check` passes
- [ ] 5.3 Write the seed script (admin user, tenant user, property, junction) and the fake Stripe server; verify by running the seed against the emulator and checking the documents exist
- [ ] 5.4 Write `playwright.config.ts` with two projects: `e2e` (webServer `vite dev --mode e2e`, env block with generated admin key, fixed port, one worker, CI retry, report on failure) and `qa` (reads `BASE_URL` for the deployed dev site and the `QA_*` credentials from the environment or the gitignored `.env.qa`, starts no server or emulators, traces and screenshots on); verify `npx playwright test --list` shows both projects and the app reaches `/signin` in the emulator setup
- [ ] 5.5 Add npm script `test:e2e` wrapping `firebase emulators:exec`; verify one placeholder test passes through the script

## 6. Layer 3: smoke tests

- [ ] 6.1 Sign-in test: tenant signs in and lands on `/`, invalid password shows the error, sign-out clears the cookie; verify it passes, including the `Secure` cookie on `http://localhost`
- [ ] 6.2 Maintenance flow: tenant submits a request and sees it listed; admin sees it and closes it with a note; tenant sees it closed; verify it passes end to end
- [ ] 6.3 Property flow: admin creates a property and finds it in the list; verify it passes and the document exists in the emulator
- [ ] 6.4 Payment start: tenant enters an amount on `/payment` and is redirected to the fake Stripe URL, with the fee line present in the request the fake received; verify it passes
- [ ] 6.5 Verify the e2e suite passes three times in a row locally and the whole run stays under a few minutes

## 7. CI and documentation

- [ ] 7.1 Update `.github/workflows/firebase-hosting-pull-request.yml` with setup-java (21), Playwright browser install, and the unit, handler and e2e steps ahead of the build, with explicit test env values and report upload on failure; verify the PR check passes on a draft PR
- [ ] 7.2 Add a "Testing" section to `README.md` (layers, scripts, JRE requirement, how tests map to specs, the `qa` project and its `QA_*` variables) and an `.env.example` listing every variable the server and client import, with the format of each (for example `FB_PRIVATE_KEY` is a JSON string `{"privateKey": "..."}`); verify the commands run as written on a clean checkout and that a `.env` copied from the example builds
- [ ] 7.3 Update issue #48 to add the Vitest bump to the Vite upgrade step and to make this change the prerequisite; verify the issue shows the changes
- [ ] 7.4 Integration check: break one covered behavior on a throwaway branch and verify the PR check fails on it, then revert and verify it passes

## Workflow follow-up

- Archive the change after the PR is merged and the suite is green on `develop`.
