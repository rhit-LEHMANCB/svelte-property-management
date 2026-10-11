# Design

## Context

- `src/lib/ui/` holds 11 hand-written components. Pages reach them through `getModalStore`, `getToastStore`, `getDrawerStore`, `use:popup`, `Paginator`, `Autocomplete`, `TabGroup` and `Avatar`. About 25 files outside it import from there, and `src/lib/Hooks/{modals,toasts}.ts` wrap the stores.
- `@skeletonlabs/skeleton-svelte` 5.0.1 is installed (Zag-based, Svelte 5, anatomy-style parts such as `Dialog.Content`, `Toast.Group`, `Menu.Trigger`, plus `createToaster`, `useDialog`). The app's code is Svelte 4 syntax (`export let`, `on:click`, slots), which still compiles; the runes rewrite is out of scope, but new and rewritten files may use runes where the library needs it.
- Dark mode in Skeleton 5 is the `dark` class (`@variant dark`); `app.css` already declares `@custom-variant dark`. The theme is selected by `data-theme` on `<body>` in `src/app.html`.
- Buttons that need client scripts carry `data-needs-hydration`; CSS in `app.css` and a `<noscript>` override in `app.html` implement the spec's hydration gating and must keep working.
- E2E specs use role-based locators (`getByRole('dialog')`, button names), so most survive a component swap, but the popup-menu specs depend on the old `data-popup` markup.
- See proposal.md for motivation and scope; the specs define the behavior.

## Goals / Non-Goals

**Goals:**
- Land the whole change (components, layout, theme, dark mode, lists) in one reviewable branch whose commits are ordered so that every commit builds and passes the checks.
- Keep the imperative call style (`modalStore.trigger`, `toastStore.trigger`) so pages are not rewritten twice.
- Make accessibility testable: every requirement in `ui-accessibility` maps to a Playwright check.

**Non-Goals:**
- New data, API, route or Firestore changes; server load functions are untouched.
- The Svelte 5 runes rewrite of existing pages; tenant dashboard; #88 leftovers.
- Server-side search, sort or paging; all of it stays in the browser over the rows already loaded.

## Decisions

1. **Keep thin store wrappers over skeleton-svelte, delete the rest of `src/lib/ui/`.**
   `getModalStore().trigger(settings)` and `getToastStore().trigger(settings)` stay as the app's API (typed `ModalSettings`, `ToastSettings`), implemented by a small `ModalHost` that renders the front queued modal in `Dialog` parts and a toaster built on `createToaster` and `Toast.Group`. Alternative: rewrite each call site to declarative `Dialog.Root` triggers. Rejected: 25 files change for no user benefit and the imperative confirm/prompt flows (response callbacks that may open another modal) fit stores better. The drawer, popup, Autocomplete, Paginator, Tab, TabGroup and Avatar files are deleted outright and replaced by direct use of `Dialog`, `Menu`, `Combobox`, `Pagination`, `Tabs`, `Avatar` at call sites or in the shared components below.

2. **Shared components for the three recurring shapes.**
   `DataList` (table at `md` and up, cards below, sort header or sort select, search field, `Pagination`, empty and loading slots), `RowMenu` (a `Menu` of row actions, replacing `PopupMenu`/`PopupMenuItem`) and `AppShell` (app bar, rail, drawer). Pages pass columns and row snippets. This is where search, sort and responsive layout live, so the `list-browsing` behavior is implemented and tested once. Alternative: per-page markup. Rejected: three lists would drift.

3. **Responsive switch with CSS, not JavaScript.** Render both layouts' markup from one row snippet and show the right one with `hidden md:block` / `md:hidden`. This works on the server and without JavaScript, avoids a hydration flash, and Playwright can assert both widths. Cost: the row markup is rendered twice; rows are at most a few dozen so this is acceptable. Alternative: `matchMedia` in JavaScript. Rejected for the flash and no-script behavior.

4. **Sorting and searching in the browser, case-insensitively.** Names are compared with `localeCompare(…, undefined, { sensitivity: 'base' })`, which also fixes the casing problem seen in #59 on the client without changing the Firestore query. Search matches a lower-cased string of the visible cells. The page resets to 0 on a new search and is clamped after a refresh.

5. **Theme: one built-in preset.** Start from `cerberus` (neutral surfaces; its primary contrast pairs are defined by Skeleton for both modes); `src/theme.css` is deleted and `app.html` switches `data-theme` to the preset, imported in `app.css`. Contrast is verified in light and dark with an axe scan in Playwright on the main pages; if the scan fails, try the next candidate (`modern`, then `nouveau`) and record the choice and the scan result in this design's Risks. The brand orange is dropped as the primary color by the user's decision.

6. **Dark mode via the `dark` class on `<html>`, set before paint.** An inline script in `app.html` reads `localStorage['theme']` (`light`, `dark`, absent) and `prefers-color-scheme`, then adds or removes `dark` on `<html>` synchronously, so there is no flash. The toggle (a labeled `Switch` or button with `aria-pressed`) writes `localStorage` and updates the class; storage access is wrapped in try/catch. With JavaScript disabled, a `@media (prefers-color-scheme: dark)` rule in `app.css` applies the dark variables, so the system preference still works. Alternative: a cookie read on the server. Rejected: it adds a server dependency and no spec needs it.

7. **Accessibility comes from the library, then is proven.** Dialog (focus trap, Escape, `aria-labelledby`/`describedby`, restore focus), Menu (arrow keys, `aria-expanded`), Tabs (tablist roles, arrow keys), Combobox, Pagination and Toast (`role` and live region) all use Zag machines. We add titles and descriptions to every dialog (the user-info modal gains a visible title), `aria-current="page"` on navigation, and labels on icon-only buttons. Keyboard Playwright specs cover each `ui-accessibility` scenario; they are the proof, not the library claim.

8. **Fix #86 by restructuring rows.** Rows become a container with a separate "open details" button and a sibling actions area, so there is no button in a button and no `stopPropagation` hack. Covered by an e2e test.

9. **Hydration gating is kept.** `data-needs-hydration` stays on every control that needs scripts, including new ones (menu triggers, toggle, drawer button). The `<noscript>` override stays in `app.html`.

10. **Order of work (each commit passes lint, check, tests, build):** (a) shell and theme tokens; (b) store wrappers on skeleton-svelte, delete drawer/popup; (c) shared `DataList`/`RowMenu`; (d) migrate pages one by one; (e) comboboxes, tabs, pagination; (f) dark mode; (g) delete `src/lib/ui` leftovers and compat CSS; (h) e2e and keyboard specs, spec docs.

## Risks / Trade-offs

- [Large diff (~35 files) may not clear three review rounds] → Commit in the order above, keep each commit buildable, and keep behavior changes out of the diff so the reviewer rubric can be applied per area.
- [Existing e2e specs break on popup-menu markup] → Update selectors to roles and names; never loosen an assertion; list every changed spec in the PR description.
- [The first preset fails AA contrast in one mode] → Axe scan in both modes is a task; fall back to the next candidate preset.
- [Row markup rendered twice for table and cards doubles DOM for lists] → Lists are small (pages of 5 to 10 rows); revisit if lists grow.
- [skeleton-svelte API differs from this design (anatomy names, props)] → The first task reads the installed 5.0.1 type declarations and proves one `Dialog`, `Toast` and `Menu` end to end before any page is migrated.
- [Dark mode flash or `localStorage` blocked] → Inline pre-paint script with try/catch; falls back to the system preference.
- [Hydration gating regressions on new controls] → The existing data-integrity e2e covers the pattern; add the new controls to it.

## Migration Plan

No data migration. Deploys through the normal `develop` then `production` flow. Rollback is a revert of the merge commit; stored dark-mode choices in `localStorage` are harmless if the key is ignored.
