# Lifecycle: remove-address-lookup

- Branch: `remove-address-lookup`
- Stage: **complete (archived automatically on 2026-10-15 after the production release `0cf0dc3`)**
- Renamed from `fix-maps-address-autocomplete` on 2026-10-13 when the scope changed (see interview summary)
- Review round: 1 of 5 (skill updated to 5 rounds by #135 mid-run)
- QA cycle: 1 of 3
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
| Production PR | **Gap (resolved):** release PR #129 (develop -> production) was open at preflight, so the plan was to post this change's QA report on #129. #129 was merged at 03:06 UTC, before #136 reached `develop` at 03:08, so this change did not ship with it. A QA comment was posted on #129 in error and has been corrected; this change gets its own production PR |

## Review rounds
- Round 1 (2026-10-13, fresh Explore/Sonnet reviewer): blockers 0, majors 0, minors 2, nits 2. Fixed both minors (create test now asserts streetAddress and zip; the no-Maps test also types into Street Address). Fixed the lifecycle.md-reference nit by rewording the proposal/tasks. The e2e-cleanup nit needs no change: `emulators:exec` starts empty emulators on every run, and other specs seed fixed ids the same way. Review loop exited.

## Deferred findings
- None from review.
- Environment: Playwright 1.63 expects chromium build 1243, but the cloud image ships 1194. Worth a cloud setup fix (pin or install matching browsers) so a local override config is not needed.

## QA report
Evidence branch: `qa-evidence/remove-address-lookup` (screenshots in `openspec/changes/remove-address-lookup/qa/screenshots/`, spec in `tests/qa/remove-address-lookup/address-lookup.spec.ts`).

- Deployed commit: `090c17c` on `develop` (dev site: https://lehman-realty-dev.web.app), deploy run 83 succeeded
- QA cycle: 1 of 3, fresh Sonnet agent given only the dev URL, proposal, delta specs and QA guide
- Run at: 2026-10-13 ~03:15 UTC
- Result: **PASS** (final run 7/7; two earlier runs failed on test bugs in the agent's own selectors, which it fixed; no app bugs)

| Capability | Scenario | Result | Evidence |
|---|---|---|---|
| property-management | Form fields (add page): five address fields shown, no Address Lookup | pass | [property-management-form-fields-add](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/remove-address-lookup/openspec/changes/remove-address-lookup/qa/screenshots/property-management-form-fields-add.png?raw=true) |
| property-management | Form fields (edit page of a `qa-` property) | pass | [property-management-form-fields-edit](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/remove-address-lookup/openspec/changes/remove-address-lookup/qa/screenshots/property-management-form-fields-edit.png?raw=true) |
| property-management | Typed address is saved (22 QA Test Ave / Apt 3B / Terre Haute / IN / 47803, matched after reload) | pass | [property-management-typed-address-saved](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/remove-address-lookup/openspec/changes/remove-address-lookup/qa/screenshots/property-management-typed-address-saved.png?raw=true) |
| property-management | No third-party lookup requests (load + typing on add and edit: 0 requests to maps.googleapis.com or maps.gstatic.com, 0 Maps console messages, 0 Maps script tags) | pass | [property-management-no-third-party-lookup-requests](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/remove-address-lookup/openspec/changes/remove-address-lookup/qa/screenshots/property-management-no-third-party-lookup-requests.png?raw=true) |
| app-platform | Autocomplete selection (tenant picker opens, suggests, filters, fills; Add not clicked to avoid changing a real tenant) | pass (partial) | [app-platform-autocomplete-selection](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/remove-address-lookup/openspec/changes/remove-address-lookup/qa/screenshots/app-platform-autocomplete-selection.png?raw=true) |
| regression | Admin top-level pages load, no page errors or 5xx | pass | [regression-admin-pages](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/remove-address-lookup/openspec/changes/remove-address-lookup/qa/screenshots/regression-admin-pages.png?raw=true) |
| regression | Tenant top-level pages load, no page errors or 5xx | pass | [regression-tenant-pages](https://github.com/rhit-LEHMANCB/svelte-property-management/blob/qa-evidence/remove-address-lookup/openspec/changes/remove-address-lookup/qa/screenshots/regression-tenant-pages.png?raw=true) |

Cleanup: the `qa-` property was deleted and confirmed gone. Screenshots were masked (tenant email; user list emails, phone, avatar) before publishing.

Observations outside the specs:
- Low, pre-existing: `/admin/properties/<deleted id>/edit` returns HTTP 500 instead of a 404/redirect. This is the current spec'd "Unknown property" behavior (property-management: fails with 500 "Error retrieving property"), so not a bug in this change. Worth a follow-up issue if a friendlier page is wanted.
- Environment: the Playwright 1.63 / Chromium 1194 mismatch in the cloud image (already listed under Deferred findings).

Not covered by automation: submitting the tenant picker (would change real tenant data); visual layout on phones; keyboard and screen reader use; anything on production.

## Verification checklist for the human
Ranked high to low risk. Included in the production PR body.

1. **Production property form after the #129 deploy** (high): on the production site, open Admin > Properties > Add Property with dev tools open (Network + Console). Expect no Address Lookup field, no requests to `maps.googleapis.com`, no console errors; type an address and save; it saves. Why a person: QA never touches production.
2. **Tenant picker end to end** (high): on a throwaway property, Tenants tab, pick a tenant, choose the move-in month, click Add. Expect a success toast and the tenant listed; then remove them. Why a person: it changes real tenant data, so QA stopped before Add.
3. **Address with apartment and ZIP+4** (medium): add a property with an apartment number and a zip like `47803-1234`, save, reopen. Expect values exactly as typed, and the list shows street, city and state. Why a person: data-quality judgement.
4. **Phone layout** (medium): add and edit pages at ~375 px wide. Expect the Address section stacks cleanly with no gap where the lookup was. Why a person: visual judgement.
5. **Keyboard entry** (low): tab from Title to Save on the add page. Expect a logical order and no orphaned focus stop. Why a person: accessibility judgement.

Production-only risks: none from this change (no env vars, secrets, Stripe, domain or runtime changes). Optional: once you are sure the lookup will not come back soon, you can leave the Google Cloud Maps APIs as they are; nothing calls them now.

## Halted
(only if the run halted: stage, reason, evidence, next step for a human)

## Archive
Archived automatically on 2026-10-15 after the production release `0cf0dc3` ([workflow run](https://github.com/rhit-LEHMANCB/svelte-property-management/actions/runs/38659779211)). That marks this lifecycle complete.
