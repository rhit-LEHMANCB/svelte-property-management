# Spec Delta

## MODIFIED Requirements

### Requirement: Menus, autocompletes, tabs and pagination keep working
The system SHALL keep popup menus, any autocomplete inputs, tab groups and paginated lists operable by mouse and keyboard, with the same options and results as before the upgrade. Since leases take tenant emails, no autocomplete input remains; this applies to any that is added.

#### Scenario: Autocomplete selection
- **WHEN** an admin types in an autocomplete input and picks a suggestion
- **THEN** the chosen value fills the field and is submitted with the form

#### Scenario: Paginated list
- **WHEN** a list has more rows than one page and the user moves to the next page
- **THEN** the next rows are shown and the page indicator updates

#### Scenario: Tabs
- **WHEN** a user selects another tab on a page that has tabs
- **THEN** that tab's content is shown and the others are hidden
