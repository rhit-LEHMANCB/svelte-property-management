# Tasks

## 1. Malformed ID token (#182)

- [ ] 1.1 Catch the `verifyIdToken` error in `src/lib/server/session.ts` and throw 401 "Invalid ID token"
- [ ] 1.2 Add a handler test in `tests/handlers/authentication.test.ts` for the "Malformed ID token" scenario (401, no cookie)

## 2. Reset password submit (#183)

- [ ] 2.1 In `src/routes/(ignorebase)/reset/+page.svelte`, move the handler to the form's `onsubmit` and give "Change Password" `type="submit"`
- [ ] 2.2 Check the existing reset e2e spec still applies; add an Enter-key submit check there

## 3. Unknown property on edit (#152)

- [ ] 3.1 Throw 404 "Property not found" in the edit page load
- [ ] 3.2 Update or add the "Unknown property" handler test in `tests/handlers/property-management.test.ts`

## 4. Wrap-up

- [ ] 4.1 Run lint, check, tests and build
