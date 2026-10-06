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
The system SHALL let an admin delete a property.

#### Scenario: Cascade
- **WHEN** a property is deleted
- **THEN** its document, its maintenance requests and its storage files are removed

### Requirement: Property directory
The system SHALL list all properties to admins ordered by title.

#### Scenario: List
- **WHEN** an admin opens `/admin/properties`
- **THEN** all properties appear ordered by `title`

### Requirement: Cleanup of tenant links on delete (not yet implemented)
The system SHALL remove `junction_user_property` rows for a property when it is deleted.

#### Scenario: Deleted property with tenants
- **WHEN** a property with assigned tenants is deleted
- **THEN** no junction row references it

## Known Gaps
- Deleting a property leaves dangling junctions; those tenants then fail with 500 "Failed to find property info." on every page.
- Delete steps run in parallel with no transaction; maintenance deletes are not awaited.
- Photo endpoints do not check that the property exists.
- `payment_history` subcollections are not deleted with the property.
