# Spec Delta

## MODIFIED Requirements

### Requirement: Navigation shell and theme preserved
The system SHALL present the app shell as an app bar plus navigation (a rail or sidebar on wide screens, a drawer on phones), with each role seeing the same navigation entries as before the redesign. The color theme and dark mode are defined by the appearance capability.

#### Scenario: Role-based navigation
- **WHEN** an admin and a tenant each sign in
- **THEN** each lands on their usual home page and sees only the navigation entries their role had before the redesign

#### Scenario: Small screens
- **WHEN** the app is opened at phone width
- **THEN** the navigation remains reachable and pages do not scroll horizontally

#### Scenario: Current page is indicated
- **WHEN** a user is on a page that has a navigation entry
- **THEN** that entry is visibly marked and exposed to assistive technology as the current page
