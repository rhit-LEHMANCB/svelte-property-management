# Design

## Context

- Every signed-in page renders inside `<main class="overflow-y-auto">` in `src/routes/(authenticated)/+layout.svelte`. Each page then adds its own wrapper (`space-y-4 p-4 sm:p-6` in most), and three pages cap themselves at `max-w-2xl` in different places.
- `PageHeader` (in `src/lib/Components/Shell`) already renders each page's single `h1`, with an optional slot for controls. Nested pages put a "back" button in that slot.
- Forms are superforms with `zodClient` validators (Profile, Insurance, Maintenance, Property, Lease, Reset). Most only toggle `input-error` on the input. `LeaseForm` alone prints messages and sets `aria-invalid`, and it does that inline for each field.
- Sign in and Forgot are plain form actions that return `{ email, error }`. They work without JavaScript.
- The Make a Payment dialog (`PaymentDialog`) validates by hand and already shows one message under the amount.
- Add user and the autopay amount use the generic `prompt` modal in `src/lib/ui/ModalDialog.svelte`. They validate only after the modal has closed, and show the result as a toast.
- `eslint-plugin-svelte` 3 has no rule for Svelte 4 event directives. `svelte-eslint-parser` exposes them as `SvelteDirective` nodes with `kind: "EventHandler"`.

## Goals / Non-Goals

**Goals:**
- One component per standard, so a page cannot drift without visibly bypassing the component.
- Move the pages over with no change to their behaviour, their data, or the server code.

**Non-Goals:**
- A generic form framework. `Field` wraps markup only; each form keeps its own superform.
- Re-theming: the colours, presets and `cerberus` theme stay as they are.

## Decisions

1. **`PageBody` owns padding and width; the layout stays as is.** `PageBody` renders `mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6`, and every signed-in page wraps its content in it, replacing its own wrapper.
   - The cap goes in a component rather than in the layout's `<main>` so that `PagePlaceholder` and any future full-bleed page can opt out.
   - *Alternative:* add the cap to `<main>`. That is simpler, but it would also cap the loading placeholder, and nothing would force a page's own padding to match.
2. **`Card` takes an optional `title` and `actions` snippet.**
   - It renders `card bg-surface-100-900 p-4 sm:p-6 space-y-4`.
   - With a `title`, the first child is a header row: an `h2.h4` plus an optional actions snippet for header buttons (`btn-sm`).
   - Pages pass extra classes through `class` for layout only (flex or grid), never for padding.
   - The heading level stays `h2`, because pages have one `h1` from `PageHeader`.
3. **`AuthCard` takes a `title`, the form body and an optional footer snippet.** It renders `card bg-surface-100-900 w-full max-w-sm p-6 shadow-xl sm:p-8`, centered the way the current auth pages are. Reset moves from `max-w-md` to `max-w-sm`.
4. **`Notice` takes `tone: 'warning' | 'error' | 'info'`.**
   - It renders `card preset-tonal-<tone> p-4 space-y-2`, with `role="alert"` for errors and `role="status"` otherwise.
   - The `preset-tonal-primary` dashboard alert becomes `info`. `info` uses `preset-tonal-primary`, so its look does not change.
   - `urgent` makes a warning an alert, for warnings that stopped a save (the lease overlap and failed welcome emails), which were alerts before.
5. **`Field` wraps one control.**
   - It takes `label`, an optional `hint`, `errors` (a string array or undefined) and a `children` snippet. The snippet receives `{ attrs, invalid }`: `attrs` (`id`, `aria-invalid`, `aria-describedby`) is spread onto the page's own input, textarea or `DateInput`, and `invalid` sets `input-error`.
   - The label is a `<label for>` and the error sits outside it, so the message is the control's description, not part of its name.
   - `describedBy` adds help text that always describes the control (the Reset page's password rules).
   - The error line is `<p id="{id}-error" class="text-error-700-300 text-sm">`. The `-700-300` shade passes the contrast check on card backgrounds; `text-error-600-400` (used today in `LeaseForm`) is replaced.
   - *Alternative:* `Field` renders the `<input>` itself. This was rejected because forms mix inputs, selects, textareas, `DateInput` and money inputs with prefixes.
6. **Errors stay hidden until the first submit, then update live.**
   - `errorsAfterSubmit(posted)` in `src/lib/forms/errorsAfterSubmit.ts` is created before the superform. Its `markSubmitted` is the form's `onSubmit`, and `shown(errors)` returns a store that is empty until the first submit, then follows `$errors`.
   - It starts as submitted when the server already answered a post (`posted`), so a page reloaded without scripts shows the server's errors.
   - Superforms' default `validationMethod: 'auto'` stays. It validates fields on blur and input, but its errors are not shown before the submit, and after it a fixed field clears as it is typed.
   - `customValidity: true` is removed from every form, because it routes errors into the browser's own bubbles instead of the page.
   - Maintenance calls `reset()` after a successful save, since the form is cleared for the next request.
7. **Form-level errors go to an error `Notice` above the action row.**
   - Sign in: every error stays form-level. It never says which field was wrong. The browser-side failure, which was a toast, now goes to the same notice as the no-scripts server error (`authentication` delta).
   - Forgot: maps its "Please enter a valid email." to the email `Field`, rendered from the action's returned `form`, so it works without scripts.
   - Superforms forms: `$message` or `$errors._errors` go in the notice.
   - Success messages stay toasts.
8. **Native validation is switched off where the app's messages exist.**
   - Superforms forms add `novalidate`, so the browser's bubble does not pre-empt the app's message. `LeaseForm` and `PaymentDialog` already do this.
   - Sign in and Forgot keep `required` and `type="email"`, because without scripts the browser check is the only client-side check.
9. **Prompt modals get an optional `validate`.**
   - `ModalSettings` gains `validate?: (value: string) => string | undefined`.
   - On confirm, `ModalDialog` calls it. If it returns a message, the dialog stays open and shows the message under the input through the same `Field` markup, and focus returns to the input.
   - Add user (`emailSchema`) and the autopay amount (`parseAmount`) move their checks into `validate`, so their error toasts go away.
   - `PaymentDialog` moves its existing message into `Field`.
10. **`FormActions` renders the action row.** It renders `<div class="flex flex-wrap gap-2 pt-2">`, and every form ends with it. All `mt-5`/`mt-3` on submit buttons are removed. Submit buttons are regular size; row and header actions keep `btn-sm`.
11. **`Breadcrumbs` takes `items: { label: string; href?: string }[]`.**
    - It renders `<nav aria-label="Breadcrumb"><ol class="flex flex-wrap items-center gap-1 text-sm">`. Each crumb but the last is an `anchor` link, separated by an `aria-hidden` chevron. The last crumb is a `<span aria-current="page">`.
    - Each crumb truncates at `max-w-[16rem]`, with the full text in `title`.
    - `PageHeader` gains an optional `breadcrumbs` prop and renders the trail above the `h1`.
    - The nested pages pass their trail from data they already load (the property title). Their back buttons are removed.
12. **`SortablePhotos` moves to Svelte 5 too.** Its drag handlers used `on:` with modifiers, which the issue's count missed. It takes an `onsort` callback and a `children(item, index)` snippet in place of `on:sort` and `let:` slot props.
13. **Component tests render on the server.** Vitest gains the plain Svelte plugin (still not the SvelteKit one). Tests render components with `svelte/server` and parse the HTML with `happy-dom`, a new dev dependency used only by the tests.
14. **A lint rule enforces Svelte 5 events.** `eslint.config.js` adds `'no-restricted-syntax': ['error', { selector: 'SvelteDirective[kind="EventHandler"]', message: 'Use Svelte 5 event attributes (onclick), not on:click.' }]` for `.svelte` files. A unit test lints a fixture string with `ESLint.lintText` and checks that the rule fires, so a config edit cannot silently drop it.

## Risks / Trade-offs

- **Many page diffs at once** → e2e tests catch any lost behaviour. The work is split into one task group per page family, and each group runs its e2e specs before the next starts.
- **Removed back buttons break e2e selectors** (`leases.spec.ts`, `data-integrity.spec.ts`) → update those specs to click the breadcrumb link. The page they navigate to stays the same.
- **Wider forms (672px to 1024px) can look stretched** → inside a form, two-column field grids (`grid sm:grid-cols-2`) already exist on Profile, Insurance and Property; reuse them where a single field would span 1024px.
- **`oninput` validation runs zod on every keystroke after the first submit** → the schemas are small; no measurable cost.
- **Contrast** → the contrast e2e check runs on every changed page in light and dark mode, including a page with a visible field error.

## Migration Plan

No data or configuration changes. Ship through `develop` as usual; rollback is a revert.
