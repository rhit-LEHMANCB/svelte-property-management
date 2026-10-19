# Spec Delta

## MODIFIED Requirements

### Requirement: Tenant request list
The system SHALL show a tenant the 5 newest open requests (by `dateAdded`) and 5 most recently closed (by `dateClosed`) for their own property, in one "Your requests" card with "Open (n)" and "Closed (n)" tabs, where n is the number shown under that tab.

#### Scenario: View
- **WHEN** a tenant opens `/maintenance`
- **THEN** only requests with their `propertyId` appear

#### Scenario: Switch tabs
- **WHEN** a tenant selects the "Closed" tab
- **THEN** the closed requests replace the open ones in the same card, and the tab is announced as selected

#### Scenario: No current lease
- **WHEN** a tenant without a current lease opens `/maintenance`
- **THEN** the page stays open and, in place of the form and lists, a "Your requests" card says that requests open when their upcoming lease starts (naming its address and start date), or that no property is assigned when there is no upcoming lease

### Requirement: Admin request list
The system SHALL show admins the 5 newest open and 5 most recently closed requests across all properties, in one "Requests" card with "Open (n)" and "Closed (n)" tabs.

#### Scenario: View
- **WHEN** an admin opens `/admin/maintenance`
- **THEN** requests from all properties appear, limited to 5 per status
