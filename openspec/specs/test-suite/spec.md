# test-suite Specification

## Purpose
Defines what the project's automated tests guarantee: which layers exist, that they run without real credentials or network access, that a failing test blocks a pull request, and that the tests follow the behavior specs.

## Requirements

### Requirement: Unit tests for validation and auth helpers
The system SHALL provide fast unit tests, run by a single npm script, for the zod schemas and the server auth helpers.

#### Scenario: Schema rules
- **WHEN** the unit tests run
- **THEN** each validation rule in the specs (password policy, property fields, insurance dates, maintenance limits, profile fields) is checked with an accepting and a rejecting input

#### Scenario: Auth helpers
- **WHEN** the unit tests run
- **THEN** the helpers are checked for an anonymous caller, a non-admin and an admin, and for a missing user document

### Requirement: Handler tests with doubled services
The system SHALL provide tests that call the API handlers, form actions and page loads directly, with Firebase Admin, Stripe and SendGrid replaced by in-process doubles.

#### Scenario: Hermetic run
- **WHEN** the handler tests run on a machine with no Firebase, Stripe or SendGrid credentials and no network
- **THEN** they pass without contacting any external service

#### Scenario: Role and junction rules
- **WHEN** the handler tests run
- **THEN** they cover the admin check on each admin endpoint and the one-property-per-tenant lookup that tenant pages depend on

#### Scenario: Payment and webhook logic
- **WHEN** the handler tests run
- **THEN** they cover the checkout amount, the added transaction fee, the webhook signature check, and the first and later payment of a month

### Requirement: End-to-end smoke tests
The system SHALL provide end-to-end tests that drive the running app in a browser against local Firebase emulators and a local stand-in for Stripe.

#### Scenario: Core flows
- **WHEN** the end-to-end tests run
- **THEN** they cover sign-in, a tenant submitting a maintenance request, an admin closing it, an admin creating a property, and a tenant starting a payment

#### Scenario: Isolation
- **WHEN** the end-to-end tests run
- **THEN** each run starts from freshly seeded emulator data and does not touch the dev or production Firebase projects or Stripe

### Requirement: Pull requests are gated on tests
The system SHALL run all test layers in the pull request check, and SHALL fail the check when any test fails.

#### Scenario: Failing test
- **WHEN** a pull request breaks a covered behavior
- **THEN** the PR check fails before the build step reports success

#### Scenario: Missing secrets
- **WHEN** the PR check runs tests
- **THEN** the tests use fixture configuration and need no repository secrets

### Requirement: Tests follow the behavior specs
The system SHALL name each test after the spec scenario it checks and SHALL assert current behavior only.

#### Scenario: Traceability
- **WHEN** a test checks a scenario from `openspec/specs/`
- **THEN** its title contains the capability and scenario name

#### Scenario: Known gaps are not asserted
- **WHEN** a behavior is listed under a spec's Known Gaps or marked "not yet implemented"
- **THEN** no test asserts the intended behavior, so fixing the gap later does not break the suite
