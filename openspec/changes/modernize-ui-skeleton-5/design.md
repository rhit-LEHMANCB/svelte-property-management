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

3. **Responsive switch with CSS, not JavaScript: one table restyled as cards.** Each list renders one `<table>`. Below `md` the header is visually hidden and each row is styled as a card whose cells show their column label. This works on the server and without JavaScript, avoids a hydration flash, and Playwright can assert both widths. Alternatives: render a table and a card list and hide one with CSS. Rejected during implementation: every label, input and text would exist twice in the DOM, so per-row controls (for example a tenant's move-in month) have duplicate labels and text locators become ambiguous. `matchMedia` in JavaScript was rejected for the flash and no-script behavior.

4. **Sorting and searching in the browser, case-insensitively.** Names are compared with `localeCompare(…, undefined, { sensitivity: 'base' })`, which also fixes the casing problem seen in #59 on the client without changing the Firestore query. Search matches a lower-cased string of the visible cells. The page resets to 0 on a new search and is clamped after a refresh.

5. **Theme: one built-in preset, chosen by measured contrast.** `src/theme.css` is deleted; `app.html` sets `data-theme` to the preset and `app.css` imports it. The first choice was `cerberus`, then `modern` and `nouveau`. Independent QA (cycle 1) measured `cerberus`'s filled primary at 3.6:1, and a check of every built-in theme's filled 500 pairs (primary, success, warning, error: the presets the app fills buttons, badges and toasts with) found that only `vintage` reaches 4.5:1 for all four, so the app uses `vintage`. Its primary is an orange, close to the old brand color. Contrast is verified in Playwright by measuring WCAG ratios directly on the main pages and on menu, dialog and toast states in both modes. axe-core was dropped because its color-contrast rule cannot read `oklch()` colors and silently skipped them.

6. **Dark mode via the `dark` class on `<html>`, set before paint.** An inline script in `app.html` reads `localStorage['theme']` (`light`, `dark`, absent) and `prefers-color-scheme`, then adds or removes `dark` on `<html>` synchronously, so there is no flash. The toggle (a labeled `Switch` or button with `aria-pressed`) writes `localStorage` and updates the class; storage access is wrapped in try/catch. With JavaScript disabled, a `@media (prefers-color-scheme: dark)` rule in `app.css` applies the dark variables, so the system preference still works. Alternative: a cookie read on the server. Rejected: it adds a server dependency and no spec needs it.

7. **Accessibility comes from the library, then is proven.** Dialog (focus trap, Escape, `aria-labelledby`/`describedby`, restore focus), Menu (arrow keys, `aria-expanded`), Tabs (tablist roles, arrow keys), Combobox, Pagination and Toast (`role` and live region) all use Zag machines. We add titles and descriptions to every dialog (the user-info modal gains a visible title), `aria-current="page"` on navigation, and labels on icon-only buttons. Keyboard Playwright specs cover each `ui-accessibility` scenario; they are the proof, not the library claim.

8. **Fix #86 by restructuring rows.** Rows become a container with a separate "open details" button and a sibling actions area, so there is no button in a button and no `stopPropagation` hack. Covered by an e2e test.

9. **Hydration gating is kept.** `data-needs-hydration` stays on every control that needs scripts, including new ones (menu triggers, toggle, drawer button). The `<noscript>` override stays in `app.html`.

10. **Order of work (each commit passes lint, check, tests, build):** (a) shell and theme tokens; (b) store wrappers on skeleton-svelte, delete drawer/popup; (c) shared `DataList`/`RowMenu`; (d) migrate pages one by one; (e) comboboxes, tabs, pagination; (f) dark mode; (g) delete `src/lib/ui` leftovers and compat CSS; (h) e2e and keyboard specs, spec docs.

## Risks / Trade-offs

- [Large diff (~35 files) may not clear three review rounds] → Commit in the order above, keep each commit buildable, and keep behavior changes out of the diff so the reviewer rubric can be applied per area.
- [Existing e2e specs break on popup-menu markup] → Update selectors to roles and names; never loosen an assertion; list every changed spec in the PR description.
- [The first preset fails AA contrast in one mode] → Axe scan in both modes is a task; fall back to the next candidate preset. Result: the first implementation used `cerberus` and an axe scan, which passed only because axe skipped the `oklch()` colors. QA cycle 1 caught it (filled primary 3.6:1). The scan now measures ratios directly and has a self-check against a low-contrast probe, and the theme is `vintage`, the only built-in preset whose filled primary, success, warning and error pairs all reach 4.5:1.
- [Table semantics on phones: rows styled as blocks] → Chrome and Firefox keep table roles for restyled table elements; the header stays available to screen readers (visually hidden), and each cell also shows its label.
- [skeleton-svelte API differs from this design (anatomy names, props)] → The first task reads the installed 5.0.1 type declarations and proves one `Dialog`, `Toast` and `Menu` end to end before any page is migrated.
- [Dark mode flash or `localStorage` blocked] → Inline pre-paint script with try/catch; falls back to the system preference.
- [Hydration gating regressions on new controls] → The existing data-integrity e2e covers the pattern; add the new controls to it.

## Migration Plan

No data migration. Deploys through the normal `develop` then `production` flow. Rollback is a revert of the merge commit; stored dark-mode choices in `localStorage` are harmless if the key is ignored.

## Library API notes

Read from the installed `@skeletonlabs/skeleton-svelte` 5.0.1 type declarations (task 1.1):

- Components are compound parts: `Dialog` with `.Trigger`, `.Backdrop`, `.Positioner`, `.Content`, `.Title`, `.Description`, `.CloseTrigger`; `Menu` with `.Trigger`, `.Positioner`, `.Content`, `.Item` (`value`), `.ItemText`; `Tabs` with `.List`, `.Trigger`, `.Indicator`, `.Content` (`value`); `Combobox` with `.Label`, `.Control`, `.Input`, `.Trigger`, `.Positioner`, `.Content`, `.Item` (`item`), `.ItemText`; `Pagination` with `.PrevTrigger`, `.NextTrigger`, `.Item`, `.Ellipsis`, `.Context`; `Avatar` with `.Image`, `.Fallback`; `Navigation` with `.Content`, `.Menu`, `.TriggerAnchor`, `.TriggerText`; `AppBar` with `.Toolbar`, `.Lead`, `.Headline`, `.Trail`; `Portal`.
- Root props are the Zag machine props: `open` and `onOpenChange` (Dialog), `onSelect` on the Menu root (not on items), `value` and `onValueChange` (Tabs), `collection` from `useListCollection`, `inputValue`, `onInputValueChange` with a `reason`, and `onValueChange` with `items` (Combobox), and a 1-based `page` with `onPageChange` (Pagination). `createToaster` is Zag's toast store (`create`, `dismiss`); `Toast.Group` takes it as `toaster`.
- Every part accepts an `element` snippet that receives the computed attributes, which is how a title is rendered as an `h2` (`Dialog.Title` renders a `div`).
- Markup to watch for: `AppBar.Lead` and `AppBar.Trail` render `<nav>`, so the shell uses plain containers inside `AppBar.Toolbar`. `Pagination.Item` renders `<a>` without `href`, so lists use only the Prev/Next triggers with a "Page X of Y" label. `Navigation` parts render `div`s, so the shell adds its own `<nav aria-label="Main">`. The Zag toast root is `role="status"` inside a polite region, and error toasts override it to `role="alert"`.
- The verification was done on the real hosts rather than a throwaway page: the existing dialog and toast e2e scenarios passed on the first build with the new `ModalHost` and `ToastHost`.
