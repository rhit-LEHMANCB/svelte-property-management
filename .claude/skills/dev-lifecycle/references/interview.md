# Interview guide

Goal: remove ambiguity before anything is proposed, without asking what the code or specs already answer.

## Before asking
1. Read `openspec/config.yaml` and the specs in `openspec/specs/` that the request touches (`openspec list --specs`, then `openspec show <spec> --type spec`).
2. Read the code the change would touch. Skim the open issues (`gh issue list`) for related ones.
3. Write down what you already know and what you assume. Only ask about the rest.

## How to ask
- Use `AskUserQuestion`, at most 4 questions per round, each with 2 to 4 concrete options and your recommended option first. Offer free-text only where options do not fit.
- Prefer questions that change the design or the acceptance criteria. Skip questions whose answer would not change what gets built; make an assumption and record it.
- After each round, say what you learned and what is still open. Stop when nothing material is open.

## Topics to cover (skip any that do not apply)
- **Goal and scope:** the problem, who has it, what "done" looks like, what is explicitly out of scope.
- **Roles:** which of admin and tenant (`permissions: admin | user`) can do what; what an unauthenticated user sees.
- **Data:** new or changed Firestore collections or fields, who writes them, migrations for existing documents, storage paths, Stripe objects.
- **Behavior and edge cases:** empty states, limits, concurrent edits, failure of Stripe, SendGrid or Firebase calls, partial failures.
- **Security and privacy:** access rules, what must not leak between tenants, secrets, email content.
- **UI:** which pages, forms and navigation entries; reuse of existing components.
- **Acceptance:** concrete WHEN/THEN examples the user would check by hand.
- **Rollout:** environment variables or secrets to add in GitHub environments `develop` and `production`, Stripe or Firebase console changes, anything that must happen before the production deploy.
- **Conflicts:** anything that contradicts an existing spec, a Known Gap, or an open issue.

## Output
A one-page summary: goal, scope, out of scope, roles, data changes, behavior and edge cases, security notes, acceptance criteria, rollout notes, assumptions. Show it and ask for confirmation.
