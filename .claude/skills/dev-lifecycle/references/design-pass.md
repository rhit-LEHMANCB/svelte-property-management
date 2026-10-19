# Design pass

Runs in stage 2, after the proposal validates, only when the change adds or changes UI. Goal: let the human see and approve how the change will look before the unattended stages build it.

## When it applies
Run it if the proposal, delta specs or tasks add or alter any of: a page or route, a form or dialog, a navigation entry, a table, list or card, an empty, loading or error state, or user-visible copy or layout. Skip it for backend-only, Firestore or Stripe logic, rules, CI, config or docs changes. When unsure, run it for the screens the change could affect.

## Steps
1. **Gather the existing UI.** Read the routes and components the change touches (`src/routes/`, `src/lib/`), the shared layout and styling, and any screenshots or specs in `openspec/specs/`. Reuse existing components and patterns; the mockup should look like this app, not a redesign.
2. **Create the design with Claude.** Call `Artifact` with `action: "quickstart"` and `intent: "design"`, then start from the Design type it returns (publish with its `type_url`). Do not use `DesignSync`; that tool only syncs design-system projects. The design stays private.
3. **Cover every affected screen**, for the roles involved (admin and tenant, per the interview), at desktop and phone width. Include the states the specs mention: empty, loading, error, validation failure, success. Mark which parts are new and which are existing.
4. **Use real copy.** Page headings, titles and UI text say "Lehman Family LLC" where the company name appears (see `CLAUDE.md`), never "Lehman Family Realty" or "Lehman Realty". Use the spec's wording for labels and messages.
5. **Write `design-notes.md`** in the change folder: the design link, the screens covered, the components reused or created, layout and copy decisions, and open questions with the assumption taken for each. Keep it short and concrete enough that stages 3 to 6 can build and check against it without asking.
6. **Record it** in `lifecycle.md` under "Design pass": the link, the date, and the decisions.

## At Gate A
Show the design link next to the proposal. If the human wants UI changes, update the same design (same `url`), update `design-notes.md` and, if behavior changed, the specs via `openspec-update-change`, then re-present. Approval of the proposal at Gate A includes approval of the design.

## If the design cannot be made
If the `Artifact` tool or the Design type is unavailable, do not block the run: write `design-notes.md` as a text description of each screen (layout, components, copy, states), record `Design pass: text only (reason)` in `lifecycle.md`, and say so at Gate A.
