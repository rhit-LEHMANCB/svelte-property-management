# ui-accessibility Specification

## Purpose
Defines the keyboard and assistive-technology behavior of the app's interactive building blocks (dialogs, menus, tabs, the navigation drawer, comboboxes, pagination and notifications) so every flow can be completed without a mouse and is announced correctly by screen readers.

## Requirements

### Requirement: Dialogs trap and restore focus
The system SHALL move focus into a dialog when it opens, keep Tab and Shift+Tab inside it while it is open, close it on Escape, and return focus to the control that opened it.

#### Scenario: Open and close by keyboard
- **WHEN** a user activates a control that opens a dialog with the keyboard and presses Escape
- **THEN** focus moves into the dialog on open, the dialog closes without confirming, and focus returns to the opening control

#### Scenario: Focus stays inside
- **WHEN** a dialog is open and the user presses Tab past its last control
- **THEN** focus wraps to the dialog's first control and never reaches the page behind it

### Requirement: Dialogs have an accessible name and description
The system SHALL give every dialog a role of dialog or alertdialog, a visible title that names it, and a description for its body text.

#### Scenario: Confirmation dialog
- **WHEN** a screen reader user opens a delete confirmation
- **THEN** the dialog is announced with its title and its body text

#### Scenario: Detail dialog
- **WHEN** the user-info dialog opens
- **THEN** it has a visible title that identifies the user and an accessible name

### Requirement: Menus are operable by keyboard
The system SHALL let a user open a row's action menu with Enter or Space, move between items with the arrow keys, activate an item with Enter, close the menu with Escape, and return focus to the menu button.

#### Scenario: Menu by keyboard
- **WHEN** a user focuses a row's action button, presses Enter, moves down with the arrow key and presses Enter on "Delete"
- **THEN** the confirmation dialog opens for that row

#### Scenario: Menu state is exposed
- **WHEN** the menu is open or closed
- **THEN** the button exposes that state to assistive technology

### Requirement: Tabs follow the tabs pattern
The system SHALL expose tab groups as a tablist with tabs and tab panels, switch tabs with the arrow keys, and show only the selected tab's panel.

#### Scenario: Arrow keys switch tabs
- **WHEN** a user focuses the selected tab and presses the right arrow key
- **THEN** the next tab becomes selected and its panel is shown

#### Scenario: Roles are exposed
- **WHEN** a screen reader reads a page with tabs
- **THEN** it announces the tablist, each tab with its selected state, and the panel

### Requirement: Comboboxes are operable by keyboard
The system SHALL let a user filter a combobox (for example the tenant or address picker) by typing, move through the options with the arrow keys, choose one with Enter, and dismiss the list with Escape, with the list's expanded state exposed.

#### Scenario: Choose by keyboard
- **WHEN** a user types part of a name, presses the down arrow and Enter
- **THEN** the highlighted option is chosen, the field shows it, and it is submitted with the form

#### Scenario: No matches
- **WHEN** the typed text matches no option
- **THEN** the list shows "No results found."

### Requirement: Navigation drawer manages focus
The system SHALL, on phone widths, open the navigation from a labeled menu button, move focus into it, close it on Escape or after a link is chosen, return focus to the menu button, and not scroll the page behind it.

#### Scenario: Drawer by keyboard
- **WHEN** a user opens the drawer with the keyboard and presses Escape
- **THEN** the drawer closes and focus is back on the menu button

### Requirement: Notifications use the right live-region roles
The system SHALL announce success notifications politely and error notifications assertively, and keep each notification readable long enough to be read and dismissible by keyboard.

#### Scenario: Success notification
- **WHEN** a form succeeds
- **THEN** a status message is announced without moving focus

#### Scenario: Error notification
- **WHEN** a request fails
- **THEN** an alert is announced and can be dismissed with the keyboard

### Requirement: Pagination is operable and labeled
The system SHALL expose pagination as labeled navigation with previous and next controls that are disabled at the ends, the current page announced, and the items-per-page selector labeled.

#### Scenario: Page by keyboard
- **WHEN** a user tabs to Next and presses Enter on a list with more than one page
- **THEN** the next rows are shown and the page indicator updates
