# QA guide (dev site, agent-run Playwright)

QA runs after the change is merged to `develop` and the deploy workflow has succeeded. It runs unattended as a fresh agent that never saw the implementation. It checks the real deployed app at https://lehman-realty-dev.web.app, using the real dev Firebase project, in Stripe **test mode**.

## Tool: Playwright
Use Playwright (added by the `add-test-suite` change), not Stagehand. Playwright is already the project's end-to-end tool, so QA scripts and regression tests share config and helpers. Its steps are deterministic and replayable, which makes failures reproducible and lets a good QA script become a permanent regression test. Stagehand adds an LLM call to every step, which means extra API keys and cost, and a flaky run could be the tool or the app. Consider it only for exploratory sessions on pages that change often.

If `playwright.config.ts` does not exist yet, do not improvise: return an `environment` failure saying QA needs the test-suite change to land first. The lifecycle will halt.

## Setup (once per change)
- `playwright.config.ts` has a `qa` project that reads `BASE_URL` (default: the dev URL above) and does not start the emulators or a local web server.
- QA accounts: one admin and one tenant in the dev Firebase project, with their email and password in the environment (`QA_ADMIN_EMAIL`, `QA_ADMIN_PASSWORD`, `QA_TENANT_EMAIL`, `QA_TENANT_PASSWORD`). If any are missing, return an `environment` failure naming the missing variables (not their values). Never write credentials to a file in the repo, a screenshot or a report.
- Test data created by QA is prefixed `qa-` and removed at the end of the run. QA never edits or deletes data it did not create.
- Stripe payments use test mode and Stripe's test card `4242 4242 4242 4242`. If the dev site is not in test mode, skip payment steps and say so.

## Independence
You are an independent QA agent. You were not told how the change was built and you do not have the diff, technical design, task list or review notes. Judge the deployed site only against the specs you were given. The one exception is the approved UI mockup (see "Design comparison"), which is a visual reference, not a source of behavior.
- You may read the repo's UI code only to find routes, labels and selectors. Do not read the implementation to decide what is correct; the specs decide.
- Never edit application code. You may create and edit files only under `tests/qa/<change-name>/` and the evidence folder.
- Report what you observe, including when it contradicts the specs or the implementer's likely intent.

## What the QA agent does
1. Read the change's delta specs and list the WHEN/THEN scenarios whose behavior changed.
2. Write one Playwright spec per capability in `tests/qa/<change-name>/`, with a test per scenario, titled after the scenario.
3. Take a **screenshot for every scenario** at the point that proves the result, using `page.screenshot` with a stable file name `<capability>-<scenario-slug>.png`; also keep traces and a failure screenshot (`trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`). Save them under `openspec/changes/<change-name>/qa/screenshots/`.
4. Add a short regression pass: sign in as each role, load each top-level page, and the existing smoke flows from `tests/e2e/` pointed at the dev URL when they are safe to run against real data.
5. Run with `npx playwright test --project=qa`.
6. **Design comparison** (only if you were given mockup images). See the section below.
7. For anything the scripts cannot decide (layout, wording, flows only partly covered), open the page in the browser, take screenshots, and judge it against the spec. Record the judgement as an observation, not a pass.
8. Clean up the `qa-` data.
9. Think like a skeptical tester: write down what you could **not** verify and why, and turn the most valuable of those into **recommended human tests**.

## Design comparison
When the change added or changed UI, you get the approved mockup as PNGs named `<screen>-<state>-<viewport>.png`. For each one:
1. Drive the deployed page to the same screen, state and role, at the same viewport (desktop and phone), and save a screenshot as `design-<screen>-<state>-<viewport>.png` next to the mockup's name in the evidence folder.
2. Compare it to the mockup and look at each of these: layout and ordering, which controls and fields are present, labels and copy (including the company name "Lehman Family LLC"), empty, loading and error states, and how it reflows on the phone. Ignore pixel-level differences, real data replacing sample data, and the app's existing fonts and colors where the mockup only approximates them.
3. Record each real difference as a `design deviation` with the mockup file, your screenshot, what differs and a severity (high: a control, state or screen is missing or wrong; medium: layout or wording differs noticeably; low: cosmetic).

The specs decide pass or fail for behavior. A mockup difference never makes a spec scenario fail on its own, and if the mockup contradicts a spec, the spec wins and you report the contradiction.

## Report
Return the report in the format of `references/qa-report-template.md`: a row per scenario with its screenshot, failures classed as `app bug`, `test bug` or `environment`, a design comparison table (when mockups were given), observations outside the specs, what automation could not cover, and 3 to 8 ranked recommended human tests, each with where, exact steps, expected result and why a person is needed.

A QA script that passes and covers a changed scenario is committed to `tests/e2e/` (adjusted to run on the emulators) as part of the fix or wrap-up PR, so the behavior stays covered.
