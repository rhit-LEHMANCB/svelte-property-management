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
- **THEN** the page fails with 404 "Property not found" and the app's not-found page is shown

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
The system SHALL let an admin delete a property and everything that hangs off it, and SHALL finish all of that cleanup before reporting success. The system SHALL refuse to delete a property when any of its leases has a recorded rent, deposit or late-fee payment, and SHALL NOT remove any lease's payment history.

#### Scenario: Cascade
- **WHEN** a property none of whose leases has a recorded payment is deleted
- **THEN** its document, its maintenance requests, its `payment_history` subcollections, its leases with their `recorded_invoices`, `notices`, `late_fees` and `deposit` records, its storage files and its leases' documents are removed
- **AND** the response is sent only after every removal has finished

#### Scenario: Large property
- **WHEN** a property has more than 500 documents to remove
- **THEN** all of them are removed

#### Scenario: Failure
- **WHEN** any removal fails
- **THEN** the response is 500 and repeating the delete finishes the cleanup

#### Scenario: A lease has rent payments
- **WHEN** an admin deletes a property that has a lease with recorded rent payments
- **THEN** the response is 409 and its message says the property has leases with recorded payments and to set an end date on them instead
- **AND** the property, its leases and their payment history, its maintenance requests and its files are all kept

#### Scenario: A lease has only a deposit or late-fee payment
- **WHEN** an admin deletes a property whose only recorded payment is toward a lease's deposit or a lease's late fee
- **THEN** the response is 409 and nothing is removed

#### Scenario: Leases without payments
- **WHEN** an admin deletes a property whose leases have no recorded payments, even if they have unpaid or waived late fees
- **THEN** the property is deleted as in the cascade scenario

#### Scenario: A payment lands during the delete
- **WHEN** a payment is recorded on one of the property's leases after the delete has started and before that lease is removed
- **THEN** the response is 409 and the paid lease and its history are kept
- **AND** leases without payments that were already removed stay removed

#### Scenario: Payment history of other properties
- **WHEN** a property is refused or deleted
- **THEN** the leases and payment history of other properties are untouched

### Requirement: Property directory
The system SHALL list all properties to admins ordered by title.

#### Scenario: List
- **WHEN** an admin opens `/admin/properties`
- **THEN** all properties appear ordered by `title`

### Requirement: Cleanup of tenant links on delete
The system SHALL remove a property's leases, and any `junction_user_property` rows left from before leases, when the property is deleted.

#### Scenario: Deleted property with tenants
- **WHEN** a property with a current lease that has no recorded payments is deleted
- **THEN** no lease or junction row references it
- **AND** that lease's tenants can load the app without an error and are shown as having no property

#### Scenario: Refused delete keeps the tenant links
- **WHEN** the delete of a property is refused because a lease has payments
- **THEN** the leases and any junction rows of that property are kept

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

### Requirement: Property delete error shown to the admin
The system SHALL show an admin who deletes a property from the properties list the reason the server gives when the delete is refused (409), and SHALL show a generic message for any other failure.

#### Scenario: Refused delete
- **WHEN** an admin confirms the delete of a property that has a lease with payments
- **THEN** an error toast shows that the property has leases with recorded payments, and the property stays in the list

#### Scenario: Other failure
- **WHEN** the delete fails for any other reason, with or without a message in the response
- **THEN** the toast reads "Error removing property."

## Known Gaps
- Photo endpoints do not check that the property exists.
