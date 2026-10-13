# Tasks

## 1. Remove the lookup from the property form

- [x] 1.1 In `src/lib/Components/Forms/PropertyForm.svelte`, remove the Address Lookup label and input, the `getGoogle` and `onMount` imports, the `autocomplete`/`addressLookupField` variables, the `onMount` loader and `fillInAddress`. Keep the Address heading and every named field. Verify with `grep -n -i "google\|lookup\|autocomplete" src/lib/Components/Forms/PropertyForm.svelte`, which should return nothing
- [x] 1.2 Delete `src/lib/google.ts` and run `npm uninstall google-maps`. Verify that `grep -rn "google-maps\|\$lib/google" src package.json` returns nothing and that `package-lock.json` no longer lists `node_modules/google-maps` or `node_modules/@types/googlemaps`
- [x] 1.3 Verify `npm run lint`, `npm run check` and `npm run build` pass

## 2. Tests

- [x] 2.1 Remove the `maps.googleapis.com` route aborts (and their comments) from `tests/e2e/specs/*.spec.ts`. Verify that `grep -rn "maps.googleapis" tests` returns only the new check from 2.2
- [x] 2.2 In `tests/e2e/specs/property.spec.ts`, add a scenario that records every request to `maps.googleapis.com` while an admin opens the add page and an existing property's edit page. Assert that none were made, that no Address Lookup field is shown, and that the Street Address, Apartment Info, City, State and Zip fields are visible. Verify it passes under `npm run test:e2e`
- [x] 2.3 Verify the existing create and invalid-zip scenarios in `property.spec.ts` still pass without the stubs, and that the full `npm test` and `npm run test:e2e` suites pass

## Workflow follow-up

- The production PR body says it closes #134 and notes that a lookup can come back later as a new change (provider notes are in #134).
