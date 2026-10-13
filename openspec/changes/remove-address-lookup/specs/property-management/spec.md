# Spec Delta

## ADDED Requirements

### Requirement: Manual address entry
The system SHALL have admins enter a property's address by hand in the Street Address, Apartment Info, City, State and Zip fields of the property form. The form SHALL NOT offer an address lookup and SHALL NOT load a third-party maps or places service.

#### Scenario: Form fields
- **WHEN** an admin opens the add property page or the edit page of an existing property
- **THEN** the Street Address, Apartment Info, City, State and Zip fields are shown
- **AND** no Address Lookup field is shown

#### Scenario: Typed address is saved
- **WHEN** an admin types a valid address into those fields and saves
- **THEN** the property is saved with exactly the typed address

#### Scenario: No third-party lookup requests
- **WHEN** the property form loads and the admin fills it in
- **THEN** the browser makes no request to `maps.googleapis.com`
