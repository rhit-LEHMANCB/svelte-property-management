## MODIFIED Requirements

### Requirement: Handler tests with doubled services
The system SHALL provide tests that call the API handlers, form actions and page loads directly, with Firebase Admin, Stripe and the email provider replaced by in-process doubles.

#### Scenario: Hermetic run
- **WHEN** the handler tests run on a machine with no Firebase, Stripe or email provider credentials and no network
- **THEN** they pass without contacting any external service

#### Scenario: Role and junction rules
- **WHEN** the handler tests run
- **THEN** they cover the admin check on each admin endpoint and the one-property-per-tenant lookup that tenant pages depend on

#### Scenario: Payment and webhook logic
- **WHEN** the handler tests run
- **THEN** they cover the checkout amount, the added transaction fee, the webhook signature check, and the first and later payment of a month
