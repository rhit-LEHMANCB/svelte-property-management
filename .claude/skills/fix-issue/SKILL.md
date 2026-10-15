---
name: fix-issue
description: Investigate and fix one bug in this repo - reproduce it with a failing test, find the root cause with evidence, make the smallest fix, run one independent review, and open a PR into develop. A lighter alternative to dev-lifecycle for bugs and small fixes; it hands off to dev-lifecycle when the fix turns out to be bigger. Use when the user says "fix #123", "investigate and fix", "debug this", "fix-issue", or describes a bug they want fixed.
allowed-tools: Bash(git:*), Bash(npm:*), Bash(npx:*), Bash(gh:*), mcp__github__issue_read, mcp__github__issue_write, mcp__github__add_issue_comment, mcp__github__search_issues, mcp__github__create_pull_request, mcp__github__pull_request_read
metadata:
  version: "1.0"
---

Fix one bug: prove it, explain it, fix it, open a PR. No OpenSpec change, no interview, no QA agent, no production PR. The proof that the fix works is a test that failed before the fix and passes after it.

## Shape of a run

```
1 Intake ► 2 Reproduce ► 3 Root cause ► 4 Scope check ─┬─► 5 Fix ► 6 Review (1 round) ► 7 PR into develop
                                                        └─► hand off to dev-lifecycle
```

The run does not stop for questions unless a step below says to. Stage 4 is the only decision point, and it decides on its own from the criteria there.

## Rules that hold in every stage

- **Never merge.** Not into `develop`, not into `production`. The run ends at an open PR.
- **No fix before a failing test.** If the bug cannot be reproduced, stop (see stage 2). Do not ship a fix for a guessed cause.
- **Tests run locally only**: unit tests, handler tests, or the e2e suite on the Firebase emulators (`npm run test:e2e`, project `demo-lehman-realty`). Never point a test at the dev or production site, and never use credentials from `.env` or `.env.qa`.
- **Never print or commit secrets.**
- Use the repo's Node (`nvm use`, see `.nvmrc`). Follow `CLAUDE.md` (for example, the company name in UI copy). End commit messages with the attribution line the harness gives.
- **GitHub access:** use `gh` if `gh auth status` works; otherwise, in a cloud session, the GitHub MCP tools (load them with `ToolSearch`). Git push uses its own credentials under both.

## Stages

### 1. Intake
- With an issue number, read the issue and its comments. Without one, search open issues for a duplicate; if none, create a `bug` issue from the user's description (steps, expected, actual) so the PR has something to close.
- Create the branch `fix/<issue>-<short-slug>` from the latest `origin/develop`. If the session names a required branch, use that instead.

### 2. Reproduce
Write the test that shows the bug, run it, and see it fail **for the reason the issue describes** (read the failure message; a test failing for another reason does not count).

Pick the cheapest layer that shows the bug:
- Pure logic, schemas, helpers: `tests/unit` (`npm run test:unit`).
- Server `load` functions and form actions: `tests/handlers` (`npm run test:handlers`), with the fake Firestore in `tests/helpers`.
- Anything that needs a browser (client state, forms, stores, navigation): a Playwright spec in `tests/e2e/specs`, next to the existing spec for that area (`npx firebase emulators:exec --config firebase.emulators.json --project demo-lehman-realty --only auth,firestore,storage "npx playwright test --project=e2e <spec>"`; needs Java). The first run builds the app and takes a few minutes. While an e2e run is going, do not build, stash or switch branches in the same checkout: the app server serves the build output and dies if it changes, and every later test fails with `ECONNREFUSED 127.0.0.1:5174`.

Read the failure before trusting it. A test can fail because the test environment cannot do something the real app can (for example a route the fake Stripe server in `tests/e2e/support/fake-stripe.mjs` does not answer). Fix the harness in the same PR and run again until the test fails on the bug itself.

In a cloud session the pre-installed browser in `/opt/pw-browsers` may be older than the Playwright version the repo pins. Do not run `playwright install`. Instead, make a directory in the scratchpad that maps the expected browser name to the installed one, and point `PLAYWRIGHT_BROWSERS_PATH` at it.

If it cannot be reproduced after a fair attempt, stop: comment on the issue with what was tried, what happened, and what would help (data, browser, exact steps), and tell the user. Do not open a PR.

### 3. Root cause
Find why it happens, with evidence: the line responsible, and a log, trace, library source or a narrowed test that confirms it. Read the library's code in `node_modules` rather than guessing at its behavior. If the issue lists candidate causes, say which one was right and rule out the others.

Write a short note (cause, evidence, planned fix) and post it as a comment on the issue.

### 4. Scope check
Continue to stage 5 only if all of these hold:
- the fix touches a few files (about 3, tests not counted) in one area,
- it changes no Firestore data shape, schema, API route contract, security rule, or migration,
- it changes no Stripe or auth behavior beyond the bug itself,
- there is one clearly right fix, not a product decision between options.

Otherwise stop, commit and push the failing test to the branch, comment on the issue with the root cause and why it needs the full process, and tell the user to run `dev-lifecycle` for it (the failing test and the note are its starting point).

### 5. Fix
Make the smallest change that makes the reproduction test pass, without changing what the test checks. Keep unrelated cleanup out. Then run, and get all green:

`npm run lint`, `npm run check`, `npm test`, `npm run build`, plus the e2e spec(s) for the touched area if the reproduction was an e2e test.

If a check was already failing on `origin/develop`, note it and do not fix it here. A plain `npm run build` needs the `PUBLIC_*` variables from `.env`, which a fresh cloud checkout lacks. When it fails only for that reason, the e2e run's own `vite build --mode e2e` counts as the build check.

### 6. Review, one round
Start a **new** read-only reviewer: Agent tool, `subagent_type: "Explore"`, `model: "sonnet"`. Give it only the issue text, the diff against `origin/develop`, and this brief: "Review this bug fix. Does the test reproduce the reported bug, does the fix address its root cause rather than the symptom, and does it break anything nearby? List findings as blocker, major, minor or nit, each with file and line." Do not give it your reasoning.

Fix blockers and majors, and minors and nits that are plainly correct. Re-run the stage 5 checks. If you disagree with a finding, say why in the PR body. No second round; if a blocker cannot be fixed within the stage 4 limits, hand off as in stage 4.

### 7. PR into develop
Push the branch and open a PR into `develop` (pass base `develop` explicitly; use a PR template if one exists). The body has:
- `Fixes #<n>`
- **Root cause**: two or three sentences.
- **Fix**: what changed.
- **Test**: the test added, and that it failed before the fix and passes after.
- **Manual check**: the steps from the issue for a human to try.
- **Review**: findings and what was done with them.

Wait for the PR checks if the session can (`gh pr checks --watch`, or under MCP subscribe to PR activity and end the turn). Fix a red check caused by this change. Then report the PR link to the user and stop. The user merges.
