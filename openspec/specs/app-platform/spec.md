# app-platform Specification

## Purpose
Defines the runtime the app is built and deployed on, and the guarantee that the app's interactive UI and core flows keep working across framework and dependency upgrades.

## Requirements

### Requirement: Supported server runtime
The system SHALL build in CI and run its server-side rendering backend on a Node.js runtime that is supported by its hosting provider.

#### Scenario: CI and deploy use the supported runtime
- **WHEN** CI checks run or a deploy to the dev or production hosting project completes
- **THEN** the Node version in use is 22 or later and the deploy log shows no deprecated-runtime warning for the backend function

#### Scenario: Toolchain works on that runtime
- **WHEN** a developer runs lint, type-check, tests and build on Node 22
- **THEN** all of them pass

### Requirement: Modal dialogs keep working
The system SHALL present confirmation, form and detail dialogs that open on the triggering action, block the page behind them, and close on confirm, cancel or dismiss.

#### Scenario: Admin confirms a destructive action
- **WHEN** an admin starts deleting a user or property and confirms in the dialog
- **THEN** the dialog closes, the action completes and the list updates

#### Scenario: Admin cancels a dialog
- **WHEN** an admin opens a dialog and cancels it
- **THEN** the dialog closes and nothing changes

### Requirement: Notifications keep working
The system SHALL show a success or error notification after submitting forms and actions, and the notification SHALL go away on its own or on dismiss.

#### Scenario: Success notification
- **WHEN** a tenant submits a valid maintenance request
- **THEN** a success notification appears and the request is listed

#### Scenario: Error notification
- **WHEN** a form submission is rejected by validation
- **THEN** an error message is shown and the entered values are kept

### Requirement: Menus, autocompletes, tabs and pagination keep working
The system SHALL keep popup menus, autocomplete inputs, tab groups and paginated lists operable by mouse and keyboard, with the same options and results as before the upgrade.

#### Scenario: Autocomplete selection
- **WHEN** an admin types in an autocomplete input (for example choosing a tenant or an address) and picks a suggestion
- **THEN** the chosen value fills the field and is submitted with the form

#### Scenario: Paginated list
- **WHEN** a list has more rows than one page and the user moves to the next page
- **THEN** the next rows are shown and the page indicator updates

#### Scenario: Tabs
- **WHEN** a user selects another tab on a page that has tabs
- **THEN** that tab's content is shown and the others are hidden

### Requirement: Navigation shell and theme preserved
The system SHALL keep the app shell (header, navigation, sidebar or drawer) and the custom color theme, so each role sees the same navigation entries and brand colors as before.

#### Scenario: Role-based navigation
- **WHEN** an admin and a tenant each sign in
- **THEN** each lands on their usual home page and sees only the navigation entries their role had before the upgrade

#### Scenario: Small screens
- **WHEN** the app is opened at phone width
- **THEN** the navigation remains reachable and pages do not scroll horizontally

### Requirement: Core flows unchanged
The system SHALL keep sign-in, sign-out, maintenance requests, property management, tenant assignment, user management, profile editing, renters insurance and rent payment behaving as described in their specifications.

#### Scenario: Regression suites
- **WHEN** the unit, handler and end-to-end suites run after the upgrade
- **THEN** they pass without changes to their expected behavior

#### Scenario: Payment start
- **WHEN** a tenant starts a rent payment on the dev site in Stripe test mode
- **THEN** they are sent to the hosted checkout with the correct amount

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
