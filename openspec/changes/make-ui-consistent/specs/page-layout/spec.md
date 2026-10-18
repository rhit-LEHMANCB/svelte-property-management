# Spec Delta

## Purpose

Defines the shared structure every page follows (content width, cards, section headings, auth cards, notices, form actions, button sizes and breadcrumbs) so pages look and behave the same and new pages inherit the same layout.

## ADDED Requirements

### Requirement: Signed-in pages share one centered width
The system SHALL render the content of every signed-in page centered in the content area, at most 1024px wide, with the same side padding on every page, and without horizontal scrolling at 360px wide.

#### Scenario: Wide screen
- **WHEN** any signed-in page is opened in a 1600px-wide window
- **THEN** its content is at most 1024px wide and centered between the sidebar and the window edge

#### Scenario: List and form pages match
- **WHEN** the Users list and the Profile page are opened at the same window size
- **THEN** their content starts at the same left edge and has the same maximum width

#### Scenario: Phone width
- **WHEN** any signed-in page is opened at 360px wide in light or dark mode
- **THEN** the page does not scroll horizontally

### Requirement: Cards share one padding and hold their section heading
The system SHALL render content cards on page backgrounds with the same padding on every page (16px, 24px from the small breakpoint up). A card's section heading, when it has one, SHALL be its first child, inside the padding. Forms in a card SHALL sit inside the same padding.

#### Scenario: Two pages' cards
- **WHEN** the Profile "Contact Info" card and the Maintenance "Add Maintenance Request" card are compared at the same window size
- **THEN** they have the same padding and each heading is inside its card as the first element

#### Scenario: Dashboard and admin home
- **WHEN** the tenant dashboard lease card and an admin home tile are compared
- **THEN** they have the same padding

### Requirement: Auth pages share one card
The system SHALL render Sign in, Forgot password and Reset password in the same centered card: the same width, padding and shadow, fields spaced evenly, and a full-width submit button the same distance below the last field.

#### Scenario: Compare auth pages
- **WHEN** `/signin`, `/forgot` and a valid `/reset` link are opened at the same window size
- **THEN** the three cards have the same width, padding, field spacing and submit button placement

### Requirement: Notices share one style
The system SHALL render tonal warning, error and info boxes (for example the maintenance "no property" notice, lease warnings and form-level errors) with the same padding. Warning and info notices SHALL be announced politely (status), except a warning that stopped the user's action, which is announced assertively (alert); error notices SHALL be announced assertively (alert).

#### Scenario: Warning notice
- **WHEN** a tenant with no property opens Maintenance
- **THEN** the notice has the shared notice padding and a role of status

#### Scenario: Warning that stops a save
- **WHEN** an admin saves a lease whose dates overlap another lease
- **THEN** the overlap warning has the shared notice padding and a role of alert

#### Scenario: Form error notice
- **WHEN** Sign in is submitted with a wrong password
- **THEN** the message is shown in an error notice above the submit button with a role of alert

### Requirement: Forms end with one action row
The system SHALL place the submit and secondary buttons of every form on a page in an action row at the end of the form with the same top spacing and gap on every form. Dialog footers keep the dialog's own right-aligned layout. Form submits and page-level actions SHALL use the regular button size; the small size SHALL be used only for actions inside list rows and page or card headers.

#### Scenario: Form submits match
- **WHEN** the Profile, Insurance, Maintenance and property forms are compared
- **THEN** each submit button has the regular size and the same spacing from the last field

#### Scenario: Row actions
- **WHEN** an admin views the maintenance list
- **THEN** actions inside a list row use the small button size

### Requirement: Nested pages show breadcrumbs
The system SHALL show breadcrumbs above the page title on pages nested below a section, and only there: New property (Properties › New property), Property edit (Properties › *property title*), New lease and Edit lease (Properties › *property title* › New lease or Edit lease), and Payment success (Payment › Success). Every crumb but the last SHALL link to its page.

#### Scenario: Edit lease
- **WHEN** an admin opens the Edit lease page for a lease on "Maple House"
- **THEN** the breadcrumbs read Properties › Maple House › Edit lease, "Properties" links to the properties list and "Maple House" links to that property's edit page

#### Scenario: Top-level page
- **WHEN** a user opens Profile, Payment, Maintenance, Insurance, the dashboard or any admin list page
- **THEN** no breadcrumbs are shown

#### Scenario: Long title on a phone
- **WHEN** a nested page for a property with a 60-character title is opened at 360px wide
- **THEN** the breadcrumbs stay on screen without horizontal scrolling and the long crumb is shortened with an ellipsis

### Requirement: Field errors show under each field
The system SHALL show, after a form or dialog is submitted with invalid values, each invalid field with an error outline and its first error message directly below it. No field SHALL show an error before the first submit. After the first submit, a field's error SHALL disappear as soon as its value is valid. An error that belongs to no single field SHALL be shown in an error notice above the form's action row.

#### Scenario: Missing required field
- **WHEN** the Profile form is submitted with an empty first name
- **THEN** the first-name input has an error outline and the message is shown directly below it

#### Scenario: Fixing the field
- **WHEN** the user then types a first name
- **THEN** the outline and the message disappear without another submit

#### Scenario: Untouched form
- **WHEN** a user opens the New lease page and has not submitted
- **THEN** no field shows an error outline or message

#### Scenario: Dialog field
- **WHEN** the Make a Payment dialog is submitted with an amount above the balance
- **THEN** the amount field has an error outline and the message is shown directly below it

#### Scenario: Without scripts
- **WHEN** the Forgot password page is submitted with an email the server rejects while JavaScript is unavailable
- **THEN** the returned page shows "Please enter a valid email." under the email field with an error outline

#### Scenario: Sign-in errors stay form-level
- **WHEN** Sign in is submitted with an unknown email or a wrong password
- **THEN** the message is shown in the error notice, not under either field, so it does not reveal which one was wrong

### Requirement: Page content sits in cards
The system SHALL place everything below a signed-in page's header (breadcrumbs, title, an optional one-line subtitle and header actions) inside cards or notices. No heading, paragraph, list or table SHALL sit directly on the page background.

#### Scenario: Maintenance lists
- **WHEN** a tenant opens `/maintenance`
- **THEN** the request lists are inside a titled card, not under a heading on the page background

#### Scenario: Every signed-in page
- **WHEN** each signed-in page is checked for headings, paragraphs, lists and tables outside cards and notices, below the page header
- **THEN** none is found

### Requirement: Svelte 4 event directives are rejected
The project's lint check SHALL fail when a component uses a Svelte 4 event directive (`on:click`, `on:submit` and so on), so handlers use the Svelte 5 attribute form only.

#### Scenario: Old syntax
- **WHEN** a component containing `on:click` is linted
- **THEN** `npm run lint` fails and names the file and line
