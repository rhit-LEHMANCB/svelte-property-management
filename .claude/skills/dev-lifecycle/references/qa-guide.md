# QA guide (dev site, agent-run Playwright)

QA runs after the change is merged to `develop` and the deploy workflow has succeeded. It checks the real deployed app at https://lehman-realty-dev.web.app, using the real dev Firebase project, in Stripe **test mode**.

## Tool: Playwright
Use Playwright (added by the `add-test-suite` change), not Stagehand. Playwright is already the project's end-to-end tool, so QA scripts and regression tests share config and helpers. Its steps are deterministic and replayable, which makes failures reproducible and lets a good QA script become a permanent regression test. Stagehand adds an LLM call to every step, which means extra API keys and cost, and a flaky run could be the tool or the app. Consider it only for exploratory sessions on pages that change often.

If `playwright.config.ts` does not exist yet, stop and tell the user that QA needs the test-suite change to land first.

## Setup (once per change)
- `playwright.config.ts` has a `qa` project that reads `BASE_URL` (default: the dev URL above) and does not start the emulators or a local web server.
- QA accounts: one admin and one tenant in the dev Firebase project, with their email and password in the environment (`QA_ADMIN_EMAIL`, `QA_ADMIN_PASSWORD`, `QA_TENANT_EMAIL`, `QA_TENANT_PASSWORD`). Ask the user for them if missing; never write them to a file in the repo or to a report.
- Test data created by QA is prefixed `qa-` and removed at the end of the run. QA never edits or deletes data it did not create.
- Stripe payments use test mode and Stripe's test card `4242 4242 4242 4242`. If the dev site is not in test mode, skip payment steps and say so.

## What the QA agent does
1. Read the change's delta specs and list the WHEN/THEN scenarios that changed behavior.
2. Write one Playwright spec per capability in `tests/qa/<change-name>/`, with a test per scenario, titled after the scenario.
3. Add a short regression pass: sign-in as each role, load each top-level page, and the existing smoke flows from `tests/e2e/` pointed at the dev URL when they are safe to run against real data.
4. Run with `npx playwright test --project=qa`, with traces and screenshots on failure.
5. For anything the scripts cannot decide (layout, wording, flows only partly covered), open the page in the browser, take screenshots, and judge it against the spec.
6. Clean up the `qa-` data.

## Report
Return a report with: the commit deployed, the URL, scenarios run with pass or fail, trace and screenshot paths for failures, observed problems that no scenario covers (with severity), and anything skipped and why. Failures are classed as `app bug`, `test bug` or `environment` (deploy, data, credentials), so the lifecycle knows whether to fix code, fix a test, or stop.

A QA script that passes and covers a changed scenario is committed to `tests/e2e/` (adjusted to run on the emulators) as part of the fix or wrap-up PR, so the behavior stays covered.
