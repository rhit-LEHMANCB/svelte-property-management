---
name: dev-lifecycle
description: Run a feature or fix through the full development lifecycle for this repo - interview, OpenSpec proposal (human approval), implementation, independent code review (max 3 rounds), merge to develop, agent-run Playwright QA on the dev site, then a human-verified promotion to production. Use when the user says "dev lifecycle", "lifecycle", "ship this end to end", or asks to take a change from idea to production with review and QA.
allowed-tools: Bash(openspec:*), Bash(gh:*), Bash(git:*), Bash(npm:*), Bash(npx:*)
metadata:
  version: "1.0"
---

Take one change from idea to production through fixed stages and gates. The state lives in `openspec/changes/<name>/lifecycle.md` so the run can resume in a new session. Read it first if the change already exists, and continue from its recorded stage.

## Rules that hold in every stage

- **Never merge to `production`, and never deploy to it.** A human does that. Preparing the PR is the last thing this skill does for production.
- **Merging to `develop` needs the user's explicit "yes" for that PR**, asked at stage 5. Do not merge on an earlier approval. If a merge is denied by permissions, stop and tell the user what to run.
- **QA touches the dev Firebase project only** (`lehman-realty-dev`, https://lehman-realty-dev.web.app). Never put production URLs, project ids or credentials in a test, a prompt or a report.
- Update `lifecycle.md` at the end of every stage: stage name, date, round counters, outcome.
- Gates are real stops. Present what is needed, then wait. Do not carry an approval from one gate to the next.
- Use the repo's Node: `nvm use` (see `.nvmrc`). Commits use the user's usual author identity; end commit messages with the attribution line the harness gives.

## Stages

### 0. Intake
Derive a kebab-case change name from the request. Create a branch from the latest `origin/develop` named after it. Create `openspec/changes/<name>/` with `openspec new change "<name>"` and write the initial `lifecycle.md` from `references/lifecycle-template.md`.

### 1. Interview
Read `references/interview.md` and follow it. Ask in rounds of at most 4 questions with `AskUserQuestion`, grounded in what you found in the code and in `openspec/specs/`, until the ambiguity list is empty. Then write a one-page **interview summary** (scope, out of scope, roles, data, edge cases, acceptance criteria, rollout) into `lifecycle.md` and show it. Continue only when the user confirms it.

### 2. Propose, then Gate A
Run the OpenSpec propose workflow (`openspec-propose`) using the interview summary as the input, so it does not re-ask. Run `openspec validate "<name>" --strict`. Present the artifacts.

**Gate A (human):** stop. The user approves the proposal, or asks for changes. Revise with `openspec-update-change` and re-present until approved. Record the approval.

### 3. Implement
Run the OpenSpec apply workflow (`openspec-apply-change`). Tests are written with each task as the tasks file requires. Before leaving this stage, `npm run lint`, `npm run check`, the test scripts that exist, and `npm run build` must all pass locally. Commit in small, logical commits.

### 4. Review loop (max 3 rounds)
Round counter starts at 0 in `lifecycle.md`. For each round:

1. Start a **new** reviewer with the Agent tool: `subagent_type: "Explore"` (read-only), `model: "sonnet"` (Sonnet 5.5). Never resume a previous reviewer; each round must be independent.
2. Give it only what `references/reviewer-prompt.md` lists: the diff against `origin/develop`, the change's proposal, specs and design, and the review rubric. Do **not** include your reasoning, earlier findings or a summary of how you built it.
3. Parse its findings (severity: blocker, major, minor, nit).
4. Fix every blocker and major. For one you disagree with, record the reason in `lifecycle.md` and do not fix it; the next round's reviewer will see the code, not your reasons, so a real defect will resurface. Minors and nits go in a "deferred" list for wrap-up unless they are trivial.
5. Re-run the local checks from stage 3, commit, increment the counter.

Exit when a round returns no blockers or majors. If round 3 still has them, **stop and escalate**: show the open findings and ask the user how to proceed. Do not continue to stage 5.

### 5. Ship to develop
Push the branch and open a PR into `develop` (check for a PR template; end the body with the generated-by line). Wait for the PR check to pass. If it fails, fix it, and treat any behavior-changing fix as needing one more review round.

Ask the user for an explicit go-ahead to merge **this PR** into `develop`. On "yes", merge it (merge commit, matching the repo history). If merging is not permitted, give the user the command and wait.

### 6. QA on the dev site
Wait for the push-to-`develop` deploy workflow (`gh run list --workflow firebase-hosting-merge.yml --branch develop`) to succeed. If it fails, diagnose it as a deploy problem first, and do not start QA.

Read `references/qa-guide.md` and start a QA agent that exercises the **changed behavior** (the change's spec scenarios) and a short regression pass, using Playwright against the dev URL. Collect its report. QA gets at most 3 cycles: on failure, fix on a new branch and PR into `develop` (same stages 3 to 5 for the fix, with one review round), then re-run QA. After the third failed cycle, stop and escalate.

### 7. Human verify and promote
Write the QA report and a verification checklist into `lifecycle.md`. Open a PR from `develop` into `production` containing:

- the proposal summary, the change names and issue links,
- review history (rounds, what was fixed, what was deferred),
- the QA report (scenarios run, pass or fail, screenshots or trace paths),
- a checklist for the human: the 3 to 5 things to look at on the dev site, and any production-only risks (environment variables, Stripe, domains, runtime).

**Stop.** The human verifies and merges. Do not merge, and do not rerun the deploy.

### 8. Wrap-up
When the user says the production merge is done: confirm the production deploy succeeded, run the OpenSpec archive workflow (`openspec-archive-change`) with spec sync, file issues for the deferred minor findings and known gaps found during QA, and mark the lifecycle complete.
