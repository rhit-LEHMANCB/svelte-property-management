# Lifecycle: remove-address-lookup

- Branch: `remove-address-lookup`
- Stage: 4 Review
- Renamed from `fix-maps-address-autocomplete` on 2026-10-13 when the scope changed (see interview summary)
- Review round: 0 of 3
- QA cycle: 0 of 3
- Started: 2026-10-13
- Issue: #134

## Investigation (2026-10-13)

Probed the key the dev site ships (`PUBLIC_FB_API_KEY`, read from the deployed bundle, never printed) from a real Chromium page served under the `https://lehman-realty-dev.web.app` origin, plus REST calls with that referrer:

| Check | Result |
| --- | --- |
| Maps JavaScript API bootstrap | Loads (v3.66), so the key's referrer and Maps JS API are fine |
| Legacy `google.maps.places.Autocomplete` | Builds, then `ApiNotActivatedMapError`; `gm_authFailure` fires; no suggestions ever appear |
| Legacy Places REST (`place/autocomplete/json`) | `REQUEST_DENIED`: "You're calling a legacy API, which is not enabled for your project" (`LegacyApiNotActivatedMapError`) |
| Places API (New) (`places:autocomplete`, `AutocompleteSuggestion`) | 403 `SERVICE_DISABLED`: not enabled in project 226313058184 |
| Console warning | "As of March 1st, 2025, google.maps.places.Autocomplete is not available to new customers. Please use PlaceAutocompleteElement" |

Root cause: the Google Cloud project behind the key has no Places API enabled. The legacy Places API the code uses is no longer offered to new projects, so it cannot simply be switched back on. Secondary: `src/lib/google.ts` uses the unmaintained `google-maps` loader, and when loading fails the form only logs `console.warn`, so the user sees a dead text box.

Fix needs both a console change (enable Places API (New), billing, key API restrictions) and a code migration to the Places API (New) widget or data API.

## Interview summary
(approved: yes, 2026-10-13; revised scope confirmed by the user the same day)

**Decision history.** A first round settled on moving to Google Places API (New). Before the proposal was written, the user changed course: the lookup is used very rarely, so remove it now and maybe add it back later. The provider comparison (Google Places (New), Geoapify, Mapbox, LocationIQ, Radar/HERE) is kept in the Investigation section and in issue #134 for that later work.

**Goal.** Get rid of the broken Address Lookup on the admin property form (add and edit). Admins type the address into the existing fields.

**Scope.**
- Remove the Address Lookup input and the Google Maps loading code from the property form.
- Delete `src/lib/google.ts` and the `google-maps` dependency.
- Remove the now-pointless `maps.googleapis.com` route aborts from e2e specs, and add one e2e check that the property form makes no request to Google Maps.
- Update the app-platform spec, whose autocomplete scenario names "an address" as an example.

**Out of scope.** Any replacement lookup, geocoding, address validation, and any Google Cloud console changes (the APIs can stay as they are; nothing will call them).

**Roles.** Admin only (`/admin/properties/add`, `/admin/properties/[id]/edit`). Tenants unaffected.

**Data.** No changes. Address fields and their validation stay the same.

**Security.** The app stops loading a third-party script on admin pages. No secrets change; `PUBLIC_FB_API_KEY` stays because Firebase uses it.

**Acceptance (WHEN/THEN).**
1. WHEN an admin opens the add or edit property page THEN there is no Address Lookup field, and the Street Address, Apartment Info, City, State and Zip fields are shown.
2. WHEN the admin types a valid address and saves THEN the property is saved with that address (same as today's manual path).
3. WHEN the property form loads THEN no request goes to `maps.googleapis.com` and no Maps error or warning appears in the console.

**Rollout.** None. No env vars, secrets or console changes. Issue #134 is closed by the PR, with a note that the lookup can come back later (provider notes are in the issue).

**Assumptions.** "Add it again later" means a new change, not a feature flag kept in the code now.

## Gate A
Approved: yes, 2026-10-13 (user: "approve")
Accepted preflight gaps: production PR #129 already open; stage 7 posts the QA report and checklist as a comment on #129. Playwright browser workaround via untracked local config.

## Preflight
Run 2026-10-13. GitHub backend: **GitHub MCP** (`gh` token in GH_TOKEN is invalid; cloud session; `get_me` = rhit-LEHMANCB).

| Check | Result |
| --- | --- |
| git commit and push to origin | OK (pushed `remove-address-lookup`) |
| GitHub backend | MCP (`get_me` OK). `gh`: invalid token |
| Env files | Pulled `.env` and `.env.qa` from 1Password (mode 600, untracked); `.env` targets lehman-realty-dev |
| QA credentials (4 vars in `.env.qa`) | All set |
| Playwright `qa` project | Present in `playwright.config.ts` |
| Playwright browsers | Playwright 1.63 expects chromium 1243; container has 1194. Worked around with an untracked `playwright.local.config.ts` (excluded via `.git/info/exclude`) that sets `executablePath`; `property.spec.ts` e2e: 3 passed |
| Dev deploy `firebase-hosting-merge.yml` on develop | Success (run 80, head cb2f2d7 = this branch's base) |
| `npm run lint` / `npm run check` / `npm test` | OK / 0 errors / 314 passed |
| Java for emulators | Present |
| Secrets for this change | None needed |
| Production PR | **Gap:** release PR #129 (develop -> production) is already open, so GitHub won't accept a second develop -> production PR. Stage 7 adds this change's QA report and checklist as a comment on #129 instead |

## Review rounds
(none yet; one line per round: blockers, majors, fixed, rejected with reason)

## Deferred findings
(minors, nits and known gaps to turn into issues at wrap-up)

## QA report
(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human
(filled in stage 7)

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)
