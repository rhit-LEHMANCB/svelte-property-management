# property-management Specification

## Purpose
Admins maintain the rental property catalog: details and photos.

## Requirements

### Requirement: Create property
The system SHALL let an admin create a property from validated basic info.

#### Scenario: Valid property
- **WHEN** the form passes validation
- **THEN** a `properties` document is created and its id returned to the page

#### Validation rules
- Title 1 to 500 characters; description 1 to 10,000.
- Bedrooms a positive integer; bathrooms positive; square feet a positive integer; rent positive.
- Street address 1 to 50 characters; apartment info up to 50; city 1 to 50.
- State exactly 2 characters; zip `12345` or `12345-6789`.

### Requirement: Edit property
The system SHALL let an admin update basic info for an existing property.

#### Scenario: Update
- **WHEN** a valid form is submitted for an existing property
- **THEN** the document is updated

#### Scenario: Unknown property
- **WHEN** the property id does not exist
- **THEN** the page fails with 500 "Error retrieving property"

### Requirement: Property photos
The system SHALL store photos at `properties/{id}/images/{index}-{timestamp}.{ext}`, record `{id, photoUrl}` entries on the property, and keep their order.

#### Scenario: Upload
- **WHEN** one or more non-empty files are uploaded
- **THEN** they are saved to storage and added to `photos`

#### Scenario: Reorder
- **WHEN** an admin saves a new order via `POST .../photos`
- **THEN** the `photos` array is replaced with the supplied order

#### Scenario: Delete photo
- **WHEN** an admin deletes a photo
- **THEN** it is removed from `photos` and from storage

### Requirement: Delete property
The system SHALL let an admin delete a property and everything that hangs off it, and SHALL finish all of that cleanup before reporting success.

#### Scenario: Cascade
- **WHEN** a property is deleted
- **THEN** its document, its maintenance requests, its `payment_history` subcollections, its leases with their `payment_history` and `recorded_invoices` subcollections, its storage files and its leases' documents are removed
- **AND** the response is sent only after every removal has finished

#### Scenario: Large property
- **WHEN** a property has more than 500 documents to remove
- **THEN** all of them are removed

#### Scenario: Failure
- **WHEN** any removal fails
- **THEN** the response is 500 and repeating the delete finishes the cleanup

### Requirement: Property directory
The system SHALL list all properties to admins ordered by title.

#### Scenario: List
- **WHEN** an admin opens `/admin/properties`
- **THEN** all properties appear ordered by `title`

### Requirement: Cleanup of tenant links on delete
The system SHALL remove a property's leases, and any `junction_user_property` rows left from before leases, when the property is deleted.

#### Scenario: Deleted property with tenants
- **WHEN** a property with a current lease is deleted
- **THEN** no lease or junction row references it
- **AND** that lease's tenants can load the app without an error and are shown as having no property

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

## Known Gaps
- Photo endpoints do not check that the property exists.
