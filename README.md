# create-svelte

Everything you need to build a Svelte project, powered by [`create-svelte`](https://github.com/sveltejs/kit/tree/master/packages/create-svelte).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npm create svelte@latest

# create a new project in my-app
npm create svelte@latest my-app
```

## Environment

Copy `.env.example` to `.env` and fill it in. Every variable in it is required: the app imports them
at build time, so `npm run build` and `npm run dev` fail if one is missing. Use the **dev** Firebase
project for local work, not production. Note that `FB_PRIVATE_KEY` is a JSON string, not a raw PEM;
the example shows the format.

Node 20 is required (`.nvmrc`; run `nvm use`). Tailwind 3's config loader does not work on Node 24.

## Testing

There are three layers. The specs in `openspec/specs/` are the test plan: each WHEN/THEN scenario of
current behavior is a test whose title names the capability and scenario. Behavior listed under a
spec's "Known Gaps", or marked "not yet implemented", is deliberately not asserted.

| Command                 | What it runs                                                                                                               | Needs                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run test:unit`     | Zod schemas and server auth helpers (Vitest)                                                                               | nothing                                                                                                                                          |
| `npm run test:handlers` | API handlers, form actions and page loads, with Firebase Admin, Stripe and SendGrid replaced by in-memory doubles (Vitest) | nothing                                                                                                                                          |
| `npm test`              | Both of the above                                                                                                          | nothing                                                                                                                                          |
| `npm run test:e2e`      | Playwright smoke tests (sign-in, maintenance, property creation, payment) against the Firebase emulators and a fake Stripe | Java 21 or newer, `npx playwright install chromium` once                                                                                         |
| `npm run test:qa`       | Playwright specs in `tests/qa/` against the deployed dev site (used by the `dev-lifecycle` skill)                          | `QA_ADMIN_EMAIL`, `QA_ADMIN_PASSWORD`, `QA_TENANT_EMAIL`, `QA_TENANT_PASSWORD` in the environment or a gitignored `.env.qa`; optional `BASE_URL` |

`develop` is protected by the repository ruleset "Protect develop": changes go in through a pull request, and the `tests` and `build_and_preview` checks must both pass before it can be merged. This applies to everyone, repository admins included, and nobody can push to `develop` directly or delete it. In a real emergency the owner can edit or disable the ruleset under Settings, Rules. `production` keeps its own branch protection.

After a production release, the archive workflow opens a pull request into `develop`. The GitHub Actions bot opens it, and pull requests opened by that bot do not start the checks, so the required checks never run. **Close and reopen that pull request once** to run them, then merge it when they are green.

`tests/qa/` is empty until specs are added for a change; the `dev-lifecycle` skill's QA agent writes them there. The `qa` project does not record traces or video, because those would capture the typed account passwords; failure screenshots are still saved. `test-results/` and `playwright-report/` come from the end-to-end run and are not committed. After a QA run they can still hold failure screenshots and error context, so do not share them. `test:qa` uses POSIX shell syntax for its environment variable, so on Windows run it from WSL or Git Bash.

The unit and handler tests use fixture values for every `$env` variable and never touch the network.
The end-to-end tests build the app in `e2e` mode, serve it with `vite preview`, and set every variable
themselves, so a local `.env` is never used. The pull request check runs all of these in the `tests`
job.

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.
