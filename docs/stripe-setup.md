# Stripe setup

The app reads two Stripe values, `STRIPE_API_KEY` and `STRIPE_ENDPOINT_SECRET`. They are set per
environment in GitHub (`develop` and `production` environments) and in `.env` for local work.

## Which key goes where

| Environment   | Firebase project       | `STRIPE_API_KEY`                                                 | Webhook endpoint                                       |
| ------------- | ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| Local / tests | emulator (`demo-*`)    | test-mode (`sk_test_` / `rk_test_`)                              | none (tests use a fake)                                |
| Dev           | `lehman-realty-dev`    | test-mode key from a **separate dev sandbox**                    | `https://lehman-realty-dev.web.app/api/stripe/webhook` |
| Production    | the production project | live-mode key (`sk_live_` / `rk_live_`) once live mode is active | `<production domain>/api/stripe/webhook`               |

`STRIPE_ENDPOINT_SECRET` is the signing secret (`whsec_...`) of the webhook endpoint in the same
Stripe account and mode as the key. Listen for `invoice.payment_succeeded`.

## What the app enforces at startup

`src/lib/server/stripeKeyGuard.ts` looks only at the key prefix and the Firebase project id:

- A live key (`sk_live_`, `rk_live_`) with the dev project or any `demo-*` project: the server fails to
  start with a clear message. The key is never printed.
- A test key in production: the server starts and logs a warning, so the production deploy does not
  break while the account is still in test mode.

## Create a separate Stripe sandbox for dev

Until now dev and production shared one test account, so dev and production payments mixed.

1. In the Stripe dashboard, create a new sandbox account (Account menu, then Create sandbox).
2. In the sandbox, create a secret or restricted key; add it as `STRIPE_API_KEY` in the `develop`
   GitHub environment.
3. Add a webhook endpoint for the dev URL above (event `invoice.payment_succeeded`); add its signing
   secret as `STRIPE_ENDPOINT_SECRET` in the `develop` environment.
4. Customers are per Stripe account. Dev users need `stripeID` values (`cus_...`) created in the
   sandbox; production users' ids from the old shared test account do not exist there.

## Activate the account for live mode

Production payments are test payments until the Stripe account is activated (business details and
bank account in the dashboard). Then:

1. Create a live-mode key and a live-mode webhook endpoint for the production domain.
2. Replace `STRIPE_API_KEY` and `STRIPE_ENDPOINT_SECRET` in the `production` GitHub environment, then
   redeploy. The startup warning stops once the key is live.
3. Customer ids created in test mode do not exist in live mode. Create live customers and replace
   each user's `stripeID` in Firestore before anyone pays.
4. Make one small real payment and confirm it appears in `payment_history`.
