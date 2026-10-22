# Spec Delta

## MODIFIED Requirements

### Requirement: Edit property
The system SHALL let an admin update basic info for an existing property.

#### Scenario: Update
- **WHEN** a valid form is submitted for an existing property
- **THEN** the document is updated

#### Scenario: Unknown property
- **WHEN** the property id does not exist
- **THEN** the page fails with 404 "Property not found" and the app's not-found page is shown
