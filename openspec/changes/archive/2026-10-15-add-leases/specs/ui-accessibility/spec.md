# Spec Delta

## MODIFIED Requirements

### Requirement: Comboboxes are operable by keyboard
The system SHALL let a user filter any combobox by typing, move through the options with the arrow keys, choose one with Enter, and dismiss the list with Escape, with the list's expanded state exposed. Since leases take tenant emails, no combobox remains; this applies to any that is added.

#### Scenario: Choose by keyboard
- **WHEN** a user types part of a name, presses the down arrow and Enter
- **THEN** the highlighted option is chosen, the field shows it, and it is submitted with the form

#### Scenario: No matches
- **WHEN** the typed text matches no option
- **THEN** the list shows "No results found."
