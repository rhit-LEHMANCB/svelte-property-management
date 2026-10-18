# Proposal

## Why

The app's pages drifted apart as they were built: cards use three paddings, some pages are capped at `max-w-2xl` and others fill the screen, section headings sit inside cards on some pages and above them on others, the three auth cards differ, button sizes and form-action spacing vary, and ten handlers still use Svelte 4 `on:` syntax (issue #154). Validation errors only turn an input red on most forms, with no message saying what is wrong, and nested admin pages offer only a single back button. Fixing this now, before more pages land, keeps later pages consistent by default.

## What Changes

- **Shared layout components** that carry the standards, so pages stop restyling cards by hand: a page body (centered, at most 1024px wide on every signed-in page), a card (one padding, optional section title inside it), an auth card (Sign in, Forgot, Reset), and a notice (tonal warning, error or info box with one padding and the right live-region role).
- **Every page moved onto them:** all 3 auth pages and 14 signed-in pages, plus the property, lease and lease-billing components. **Page widths change:** list pages (Users, Properties, Maintenance, Payment, Admin home, Dashboard) are capped and centered instead of filling the screen, and form pages grow from 672px to 1024px.
- **Breadcrumbs** on nested pages: Properties › New property; Properties › *property*; Properties › *property* › New lease / Edit lease; Payment › Success. They replace the single "back" buttons in those page headers. Top-level pages have none.
- **Inline field errors** on every form and dialog: after a submit, each invalid field gets a red outline, `aria-invalid`, and its message underneath, linked for screen readers. Errors update as the user fixes them. Errors that belong to no single field show in an error notice above the submit button. No validation rules change.
- **Buttons:** regular size for form submits and page actions, small size only in list rows and headers; every form ends with the same action row.
- **Svelte 5 events only:** the remaining `on:` handlers are replaced, and lint fails on any new `on:` directive.
- **Specs:** the layout standards, breadcrumbs and field errors become requirements, so later changes are reviewed against them.

Out of scope: colours, theme and typography, the sidebar and app bar, dialog layout beyond field errors, new validation rules, page content and data, and the #138 follow-ups.

## Capabilities

### New Capabilities

- `page-layout`: the shared page structure every page follows: content width, cards and section headings, auth cards, notices, form action rows, button sizes and breadcrumbs on nested pages.

### Modified Capabilities

- `ui-accessibility`: adds requirements for accessible field-level validation errors and for the breadcrumb landmark.

## Impact

- **Code:** new components in `src/lib/Components/Shell` (and a field component next to the forms); all `+page.svelte` files under `src/routes`; `PropertyForm`, `LeaseForm`, `LeaseBilling`, `PaymentDialog`, the autopay dialog, the Add user dialog and `DateInput`. Sign in and Forgot move from `export let` to `$props()`.
- **Lint:** `eslint.config.js` gains a rule that rejects Svelte 4 event directives.
- **Tests:** e2e specs that click the removed back buttons or read old markup are updated; new e2e checks cover widths, breadcrumbs and field errors; the contrast check runs on the changed pages.
- **No changes** to server code, Firestore, Storage, Stripe, email, environment variables or deployment.
