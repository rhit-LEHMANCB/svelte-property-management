# Proposal

## Why

The Address Lookup on the admin property form has stopped working (#134). The Google Cloud project behind the key has no Places API enabled, and the legacy Places widget the form uses is no longer offered to new projects. Admins add or edit properties only rarely, so a third-party lookup isn't worth the setup, billing account and upkeep right now. Removing it gets rid of a dead field and a silent failure.

## What Changes

- Remove the Address Lookup input from the property form used on the add and edit property pages. Admins type the address into the existing Street Address, Apartment Info, City, State and Zip fields, which keep their current validation.
- Stop loading the Google Maps JavaScript API on those pages. Delete the loader module and the `google-maps` dependency.
- E2E: drop the `maps.googleapis.com` route stubs that only existed for the lookup, and assert that the property form makes no request to Google Maps.
- Update the app-platform autocomplete requirement, which names "an address" as an example autocomplete input.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `property-management`: add a requirement that property addresses are entered by hand and the property form loads no third-party address lookup.
- `app-platform`: the "Menus, autocompletes, tabs and pagination keep working" autocomplete scenario no longer lists an address as an example.

## Impact

- Code: `src/lib/Components/Forms/PropertyForm.svelte`, `src/lib/google.ts` (deleted).
- Dependencies: `google-maps` removed from `package.json` and the lockfile.
- Tests: `tests/e2e/specs/*.spec.ts` (route stubs removed, a no-Maps-request check added).
- No data, rules, env var, secret or Google Cloud console changes. `PUBLIC_FB_API_KEY` stays because Firebase uses it.
- Closes #134. A lookup can come back later as a new change; the investigation and provider comparison are recorded in this change's `lifecycle.md`, which is archived with it.
