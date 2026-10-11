# Spec Delta

## Purpose
Defines how the app's long lists (properties, users and maintenance requests) are laid out for the screen size, searched, sorted and paged in the browser, and what they show while loading or when there is nothing to show.

## ADDED Requirements

### Requirement: Responsive list layout
The system SHALL show the properties, users and maintenance request lists as a table at 768px and wider and as stacked cards below that width, with the same information and the same row actions in both layouts and no horizontal page scroll.

#### Scenario: Desktop table
- **WHEN** an admin opens the users list at 1280px wide
- **THEN** the users appear as table rows with name, email, phone and an actions menu

#### Scenario: Phone cards
- **WHEN** an admin opens the same list at 390px wide
- **THEN** each user appears as a card with the same details and actions, and the page does not scroll horizontally

### Requirement: Search lists in the browser
The system SHALL let a user filter a list by typing in a labeled search field, matching case-insensitively against the visible text of the rows already loaded, without a new server request.

#### Scenario: Filter users
- **WHEN** an admin types part of a last name into the users search
- **THEN** only matching users are listed, the page resets to the first page, and the page count reflects the matches

#### Scenario: Clear search
- **WHEN** the admin clears the field
- **THEN** all rows are listed again

### Requirement: Sort lists in the browser
The system SHALL let a user sort a table by a column header, toggling ascending and descending, with the sorted column and direction exposed to assistive technology, and sorting names without regard to capitalization.

#### Scenario: Sort by last name
- **WHEN** an admin sorts the users by last name
- **THEN** names are ordered alphabetically regardless of capitalization, so "better" sorts before "Lehman"

#### Scenario: Sort on cards
- **WHEN** the list is shown as cards on a phone
- **THEN** the user can still choose the sort column and direction from a labeled control

### Requirement: Empty and no-result states
The system SHALL show a message that says what is missing, and where useful the action that fixes it, when a list has no rows or when a search matches none.

#### Scenario: No rows
- **WHEN** an admin has no properties
- **THEN** the properties page shows an empty state with an "Add property" action instead of a blank area

#### Scenario: No matches
- **WHEN** a search matches no rows
- **THEN** the list shows "No results" with the search text and a way to clear it

### Requirement: Loading placeholders
The system SHALL show placeholder rows or cards while a list page is navigating or its data is being refreshed, and replace them with the content without a layout jump.

#### Scenario: Navigating to a list
- **WHEN** a user follows a link to a list page and the data has not arrived
- **THEN** placeholders are shown until the rows render

### Requirement: Pagination of lists keeps working
The system SHALL keep paginating lists in the browser with the existing page sizes, preserving the current page when a row action completes and refreshes the data.

#### Scenario: More than one page
- **WHEN** a list has more rows than the page size and the user selects the next page
- **THEN** the next rows are shown and the page indicator updates
