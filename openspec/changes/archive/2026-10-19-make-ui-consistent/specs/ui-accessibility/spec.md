# Spec Delta

## ADDED Requirements

### Requirement: Field errors are announced
The system SHALL mark an invalid field with `aria-invalid="true"` and associate its error message with the field through `aria-describedby`, so a screen reader announces the message when the field is focused. A valid field SHALL carry neither.

#### Scenario: Focus an invalid field
- **WHEN** a screen reader user submits the Insurance form with an empty policy number and focuses that field
- **THEN** the field is announced as invalid together with its error message

#### Scenario: Field fixed
- **WHEN** the user enters a valid policy number
- **THEN** the field no longer has `aria-invalid` or a description pointing to an error

### Requirement: Breadcrumbs are a labeled landmark
The system SHALL render breadcrumbs as a navigation landmark named "Breadcrumb", with the crumbs in an ordered list and the last crumb marked as the current page and not a link.

#### Scenario: Landmark navigation
- **WHEN** a screen reader user lists landmarks on the Edit lease page
- **THEN** a navigation landmark named "Breadcrumb" is listed, and its last item is announced as the current page
