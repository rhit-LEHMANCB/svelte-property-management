# Proposal

## Why

The dependency upgrade moved the app to Skeleton 5 and Tailwind 4 but kept the old look and behavior. Skeleton 5 dropped its Modal, Toast, Drawer, Popup, Tab and Autocomplete, so the app carries 11 hand-written replacements in `src/lib/ui/` (about 635 lines) that were never made accessible: no focus handling beyond native `<dialog>`, no tab or menu roles, no arrow-key navigation (#87). The page markup is still the old structure, with compat CSS (`.card`, `.list`, `.list-dl`), a single orange/black theme, no dark mode and a weak phone experience (#89). Doing the component swap and the layout redesign together avoids rebuilding the same screens twice.

## What Changes

- Replace every component in `src/lib/ui/` with `@skeletonlabs/skeleton-svelte` (Dialog, Toast, Tabs, Menu/Popover, Combobox, Pagination, Avatar, Navigation, App Bar). Delete `src/lib/ui/` except thin wrappers that keep the existing `getModalStore` / `getToastStore` call style for call sites.
- Redesign the app shell: an app bar plus navigation (a rail on desktop, a drawer on phones) with the same entries per role.
- Present properties, users and maintenance requests as tables at 768px and wider and as cards at phone width, with client-side search and sort, empty states and loading placeholders.
- Replace the orange/black theme with a built-in Skeleton 5 preset that passes WCAG AA in light and dark. Add dark mode: it follows the OS setting, with a header toggle that overrides it and is remembered in the browser.
- Keyboard and screen-reader behavior for all dialogs, menus, tabs, the drawer and comboboxes, and toasts announced with the right roles (closes #87).
- Fix the remove-tenant button also opening the user-info dialog (#86).
- Remove the `.card` / `.list` / `.list-dl` compat CSS.
- No data, API, route, Firestore, Stripe or email changes. Out of scope: tenant dashboard (#43), the other P2 bugs, the #88 leftovers, a runes rewrite.

## Capabilities

### New Capabilities
- `ui-accessibility`: keyboard and assistive-technology behavior of dialogs, menus, tabs, the drawer, comboboxes, pagination and toasts.
- `appearance`: the app's color theme, WCAG AA contrast, and light/dark mode selection and persistence.
- `list-browsing`: how long lists (properties, users, maintenance requests) are shown responsively, searched, sorted, paged, and shown when empty or loading.

### Modified Capabilities
- `app-platform`: "Navigation shell and theme preserved" changes: the shell is redesigned (rail on desktop, drawer on phones) with the same role-based entries, and the theme is no longer the old orange/black one.
- `tenant-assignment`: adds a requirement that removing a tenant from the property page shows only the confirm dialog (#86).

## Impact

- Code: `src/lib/ui/*` (removed or reduced), `src/lib/Components/**` (Navigation, PopupMenu, UsersListView, UserInfoModal, Forms/PropertyForm, SortablePhotos, DatePicker), `src/lib/Hooks/{modals,toasts}.ts`, both layouts, all pages under `src/routes/` that use the UI layer (about 25 files), `src/app.css`, `src/theme.css`, `src/app.html`.
- Tests: `tests/e2e/specs/app-platform.spec.ts` and other e2e specs that click popup menus and dialogs may need selector updates (no weakened assertions); new e2e checks for keyboard behavior, dark mode, search/sort and #86.
- Dependencies: `@skeletonlabs/skeleton-svelte` 5.0.1 is already installed; one dev dependency is added for the contrast scan (`@axe-core/playwright`).
- Issues: closes #89, #87 (covered) and #86.
- Rollout: no environment variables or secrets.
