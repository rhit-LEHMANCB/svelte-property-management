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

Node 22 is required (`.nvmrc`; run `nvm use`). `package.json` `engines.node` pins the Cloud Function runtime to the same version.

## Firebase rules and indexes

`firestore.rules`, `storage.rules` and `firestore.indexes.json` are the single source for both Firebase
projects, and the e2e emulator loads the same rules. `.firebaserc` defines the aliases `dev`
(`lehman-realty-dev`) and `prod` (`lehman-realty`) and has no default, so always pass `--project`.

- Firestore denies all client access: the app reads and writes through the Admin SDK, which ignores
  rules. Storage allows public `get` (photo URLs are unsigned) and no writes or listing.
- CI deploys them to the project in the GitHub environment's `FB_PROJECT_ID` on every push to `develop`
  and `production` (`.github/workflows/firebase-hosting-merge.yml`), before the Hosting deploy. The
  service account in `FIREBASE_SERVICE_ACCOUNT_LEHMAN_REALTY` needs at least the Firebase Rules Admin and Cloud
  Datastore Index Admin roles in each project.
- Rules are not rolled back automatically if a later deploy step fails; restore the previous ruleset
  from the Firebase console history. A deploy never deletes indexes that exist only in the console,
  so check the console if you suspect extras.
- To deploy by hand: `npx firebase deploy --only firestore,storage --project dev` (add `--dry-run` to check).
- If someone adds an index in the console, re-export it with
  `npx firebase firestore:indexes --project dev > firestore.indexes.json` and commit the result (run it
  from Git Bash: PowerShell 5.1 would write UTF-16).

## Stripe

Dev and local environments use Stripe test-mode keys; only production may use a live key. The server
checks this at startup (a live key outside production fails, a test key in production logs a
warning). Setup steps for the dev sandbox, the webhooks and going live are in
[docs/stripe-setup.md](docs/stripe-setup.md).

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

After a production release, the archive workflow opens a pull request into `develop` with the archived OpenSpec changes. GitHub holds the checks of a pull request opened with the built-in token until someone approves them, so the workflow approves that run itself and turns on auto-merge, and GitHub merges the pull request when `tests` and `build_and_preview` are green. If a check fails, or the approval could not be given, the pull request stays open (open it and click "Approve and run workflows" if the checks never started).

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
