# Tasks

## 1. Prove the library and set the theme

- [x] 1.1 Read the installed `@skeletonlabs/skeleton-svelte` 5.0.1 type declarations for Dialog, Toast (`createToaster`), Menu, Tabs, Combobox, Pagination, Avatar and Navigation, and record the real anatomy and props in a short "Library API notes" section appended to `design.md`; verify a throwaway page renders one Dialog, one Toast and one Menu (delete the page afterwards)
- [x] 1.2 Replace `src/theme.css` and `data-theme="my-custom-theme"` with the chosen built-in preset (start with `cerberus`) in `app.css` and `src/app.html`; verify `npm run build` passes and the sign-in page renders with the new colors
- [x] 1.3 Add an axe-core scan helper to `tests/e2e/support/` and an `appearance` spec that scans sign-in, the admin home and the tenant home in light mode; verify it passes, and if not, switch to the next candidate preset and record the choice in `design.md`

## 2. Dark mode

- [x] 2.1 Add the pre-paint inline script to `src/app.html` (reads `localStorage['theme']` and `prefers-color-scheme`, sets the `dark` class on `<html>`, wrapped in try/catch) and a `@media (prefers-color-scheme: dark)` fallback in `app.css` for no-script; verify with a Playwright check that a dark system preference renders dark with no first-paint light frame and that disabling JavaScript still follows the system setting
- [x] 2.2 Add a labeled theme toggle (`aria-pressed`, `data-needs-hydration`) in a `ThemeToggle.svelte` component; verify e2e: toggle, reload keeps the choice, override of the system preference, keyboard Enter/Space, and that blocked `localStorage` does not throw
- [x] 2.3 Extend the axe scan to dark mode on the same pages; verify it passes in both modes

## 3. Modal and toast stores on the library

- [x] 3.1 Reimplement `ModalHost`/`ModalDialog` on skeleton-svelte `Dialog` keeping the `ModalSettings` API (`alert`, `confirm`, `prompt`, `component`, queued modals, callback runs after the modal leaves the queue, backdrop press-and-release dismissal); verify the existing `app-platform` and `data-integrity` dialog e2e specs pass unchanged
- [x] 3.2 Give every dialog a title and a described body (`aria-labelledby`, `aria-describedby`), and a visible title on the user-info dialog; verify with a handler/component test and a Playwright role check
- [x] 3.3 Reimplement `ToastHost` on `createToaster` and `Toast.Group` keeping `ToastSettings`, with polite status for success and assertive alert for error and a keyboard-dismissible close button; verify success and error toasts are announced with the right roles and still auto-dismiss
- [x] 3.4 Add keyboard e2e specs for dialogs (focus moves in, Tab wraps, Escape closes without confirming, focus returns to the opener) in `tests/e2e/specs/app-platform.spec.ts`; verify they pass

## 4. App shell and navigation

- [x] 4.1 Build `AppShell` from App Bar, a navigation rail/sidebar at `lg` and a Dialog-based drawer on phones; move `Navigation.svelte` onto the library's navigation parts with `aria-current="page"` and the same role-based entries; verify admin and tenant entries match the previous lists in e2e
- [x] 4.2 Drawer behavior: labeled menu button, focus moves in, Escape or a link click closes it and returns focus, page behind does not scroll; verify with a keyboard e2e at 390px
- [x] 4.3 Restyle the sign-in and reset layouts and the authenticated layout (app bar with welcome text, theme toggle, sign out); verify no horizontal scroll at 390, 768 and 1280px on every top-level page via an e2e loop

## 5. Shared list components

- [x] 5.1 Build `RowMenu` on the library `Menu` (keyboard open, arrow keys, Escape, focus return, expanded state) and replace `PopupMenu`/`PopupMenuItem`; verify keyboard e2e for a users-row menu and update the popup e2e specs to roles and names without loosening assertions
- [x] 5.2 Build `DataList` (table at `md`+, cards below via CSS, sort header and a sort select for cards, labeled search, `Pagination` with a labeled page-size select, empty and no-result states, loading placeholders); verify component-level unit tests for search, case-insensitive sort and page clamping pass
- [x] 5.3 Migrate the users list (`UsersListView`, `admin/users`) to `DataList`/`RowMenu`/`Avatar` with separate row-open and action controls; verify the e2e for users still passes and add search, sort ("better" before "Lehman") and empty-state checks
- [x] 5.4 Migrate the properties list and the tenants list on the property edit page, rebuilding the tenant row without a button inside a button; verify a new e2e for #86 (cancel and confirm show only the confirm dialog, the row still opens user info)
- [x] 5.5 Migrate the admin and tenant maintenance request lists; verify the maintenance e2e passes and empty and loading states are shown

## 6. Forms, comboboxes and tabs

- [x] 6.1 Replace the local `Autocomplete` with the library `Combobox` in the tenant and address pickers (`PropertyForm`, property edit page, admin maintenance); verify keyboard selection, "No results found." and form submission with the chosen value in e2e
- [x] 6.2 Replace `TabGroup`/`Tab` and the user-info dialog tabs with library `Tabs`; verify tablist roles and arrow-key switching in e2e
- [x] 6.3 Restyle the remaining pages (dashboard, profile, payment and success, insurance, add/edit property, photos, date input) with cards, consistent spacing and labeled controls; verify the existing e2e specs for those pages pass unchanged and the axe scan is clean in both modes

## 7. Remove the old layer

- [x] 7.1 Delete `src/lib/ui/` except the thin store wrappers, `.card`/`.list`/`.list-dl` compat CSS and the `[data-popup]` rules from `app.css`; verify `rg "lib/ui"` shows only the wrapper imports, `npm run check:server`, lint, `npm run check`, all test scripts and `npm run build` pass
- [x] 7.2 Keep hydration gating on every control that needs scripts (menu triggers, theme toggle, drawer button); verify the hydration e2e in `data-integrity.spec.ts` covers them and passes

## 8. Specs, docs and integration

- [x] 8.1 Update the README section on UI and theming (preset, dark mode, how to add a list with `DataList`); verify the documented commands run as written
- [x] 8.2 Run the full local suite once more (`npm run lint`, `npm run check`, `npm run check:server`, `npm test`, `npm run test:e2e`, `npm run build`) and verify all pass, with the full e2e suite run against the production build

## 9. QA cycle 1 fixes

- [x] 9.1 Replace the axe contrast scan with a direct WCAG ratio check (`tests/e2e/support/contrast.ts`), add a self-check that it reports a low-contrast probe, and scan the row menu, confirmation, user-info dialog and error toast states too; verify the self-check passes and the scan fails on the old theme
- [x] 9.2 Switch the theme to `vintage`, the only built-in preset whose filled primary, success, warning and error pairs reach 4.5:1, and color only the icon of destructive menu items; verify the contrast scans pass in light, dark and no-script mode
- [x] 9.3 Rebuild the search field and the tenant combobox control without the `input-group` classes, which Skeleton 5 does not provide; verify the list-browsing and combobox e2e specs pass

## 10. QA cycle 2 fixes

- [x] 10.1 Return focus to the menu button after a drawer link is chosen (SvelteKit resets focus on navigation); verify a new keyboard e2e that fails without the fix and passes with it
- [x] 10.2 Darken light-mode links (`--typo-anchor--color-light` to primary-900) and extend the contrast scan to the user-info dialog's property link and the closed-requests address links; verify the scan reports the old color at 3.39:1 and passes with the fix

## 11. Owner decision: keep cerberus

- [x] 11.1 Switch the theme back to `cerberus` at the owner's request, exempt filled color controls (`preset-filled-*`) from the contrast check, and update the `appearance` spec to match; verify the contrast scans pass in light, dark and no-script mode
- [x] 11.2 Darken light-mode links to primary-700 (cerberus's primary-500 is 4.4:1 on its card surface); verify the closed-requests address link and the user-info property link pass the scan

## 12. Owner feedback after QA: navigation width and cursors

- [x] 12.1 Make sidebar navigation entries span the full width of the sidebar (the wrapping `<nav>` shrank to its text under Skeleton's `align-items: start`); verify a new e2e that fails without the fix
- [x] 12.2 Show the pointer cursor on enabled buttons, menu items, options, tabs and selects (Tailwind 4 gives buttons the default cursor), and keep the arrow on disabled controls; verify a new e2e that fails without the fix

## 13. Owner feedback: add-tenant row

- [x] 13.1 Center the tenant picker's dropdown icon inside its field (Skeleton's base style already applies `translateY(-50%)`, so the extra Tailwind translate moved it up by half its height) and line the Add button and labels up with the fields through a subgrid; verify a new e2e that fails without each part of the fix

## 14. Owner feedback: tenants who share a name

- [x] 14.1 Label each option in the add-tenant picker "First Last (email)", falling back to the name when there is no email, so tenants who share a name can be told apart and found by email; verify a handler test and an e2e with two same-named tenants, both failing without the change

## 15. Owner feedback: move-in month picker

- [x] 15.1 Replace both `<input type="month">` fields (Firefox and desktop Safari show them as text boxes) with a `MonthPicker` of Month and Year selects; default the add row to the current month and put a row back to its stored month when saving fails; verify unit tests for the helpers and e2e for the default, saving and the failure revert
