# QA report: <change-name>

- Deployed commit: `<sha>` on `develop` (dev site: <url>)
- QA cycle: <n> of 3
- Run at: <timestamp>
- Result: PASS | FAIL (<n> failing scenarios)

## Scenarios
One row per changed scenario from the delta specs, then regression checks.

| Capability | Scenario | Result | Evidence |
|---|---|---|---|
| <capability> | <scenario name> | pass / fail | ![<scenario>](<image link>) |

For each **failure**: classification (`app bug`, `test bug`, `environment`), what was expected, what happened, steps, trace path.

## Screenshots
A screenshot per scenario at the point that proves the result (after the action, showing the visible outcome), and one at the failure point for each failure. Name files `<capability>-<scenario-slug>.png`. Show the role used (admin or tenant) in the caption. No credentials, tokens or real personal data; crop or mask them.

## Observations outside the specs
Problems noticed that no scenario covers (layout, wording, accessibility, slow pages, console errors), each with severity.

## Not covered by automation
What QA could not check and why (real email delivery, Stripe live mode, other devices).

## Recommended human tests
3 to 8 manual checks, ranked high to low risk. For each:

1. **<short title>** (risk: high | medium | low)
   - Where: <URL or navigation>
   - Do: <exact steps, accounts to use>
   - Expect: <observable result>
   - Why a person: <why automation could not decide it>

Typical candidates: a real email arrives and its link works on the production domain; a Stripe payment in live mode or with a real card; a layout or flow on a phone; screen reader or keyboard use; wording and tone; anything depending on production-only configuration (environment variables, authorized domains, runtime); behavior with real production data volumes.
