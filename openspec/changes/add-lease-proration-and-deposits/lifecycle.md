# Lifecycle: add-lease-proration-and-deposits

- Branch: `claude/add-lease-proration-and-deposits`
- Stage: 1 Interview (round 2 open)
- Review round: 0 of 5
- QA cycle: 0 of 3
- Started: 2026-10-15

## Interview summary
(in progress; approved: no)

Round 1 answers (2026-10-15):
- Proration: per-lease toggle, on by default for new leases.
- Deposit: due date set per lease, defaulting to the lease start date.
- Refunds: recorded only, no Stripe refunds.
- Existing leases: a migration marks them not prorated and no deposit, so balances do not change.

Round 2 (asked, not answered; the user replied with a message instead): how the tenant splits rent and deposit on /payment, whether the transaction fee applies to deposits, when first-month rent is due with proration off, and how settlement works.

## Gate A
Approved: no
Accepted preflight gaps: none

## Preflight
(table of checks and results, from stage 2)

## Review rounds
(none yet; one line per round: blockers, majors, minors, nits, fixed, rejected with reason)

## Out-of-scope observations
(only QA observations outside this change's scope, to turn into issues at wrap-up; review findings are fixed, never listed here)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
