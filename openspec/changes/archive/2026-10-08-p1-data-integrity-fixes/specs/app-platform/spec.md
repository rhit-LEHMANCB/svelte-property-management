# Spec Delta

## ADDED Requirements

### Requirement: Controls wait for hydration
The system SHALL show buttons that depend on client-side scripts as disabled with a spinner until the page has hydrated, so that early clicks are not lost.

#### Scenario: Click before hydration
- **WHEN** a user clicks Make a Payment, a request close button, a dialog trigger or Sign in before hydration finishes
- **THEN** the control shows a spinner and does not act, and nothing is silently dropped

#### Scenario: After hydration
- **WHEN** hydration finishes
- **THEN** the spinner is removed and the controls work

#### Scenario: No scripts
- **WHEN** JavaScript is unavailable
- **THEN** the sign-in form still submits
