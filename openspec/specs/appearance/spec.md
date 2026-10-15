# appearance Specification

## Purpose
Defines the app's color theme, its contrast guarantees, and how light and dark mode are chosen and remembered, so the app is readable on every page in both modes.

## Requirements

### Requirement: Accessible color theme
The system SHALL use Skeleton 5's built-in `cerberus` theme on every page, with body text and links on page, card and dialog backgrounds meeting WCAG 2.2 AA (4.5:1, 3:1 for large text) in light and dark mode. Filled color controls keep the theme's own text pairing.

#### Scenario: Contrast in light mode
- **WHEN** text contrast is measured on the sign-in page, the main admin and tenant pages, and open menus, dialogs and toasts in light mode
- **THEN** no text or link outside a filled color control is below AA

#### Scenario: Contrast in dark mode
- **WHEN** the same measurement runs in dark mode
- **THEN** no text or link outside a filled color control is below AA

#### Scenario: Filled color controls are an accepted exception
- **WHEN** a filled button, badge, toast or the current navigation entry uses the theme's filled colors
- **THEN** it keeps cerberus's own text color even where that is below 4.5:1, as accepted by the owner

### Requirement: Dark mode follows the system by default
The system SHALL render in dark mode when the visitor's operating system prefers dark and no choice has been saved, and in light mode otherwise.

#### Scenario: System prefers dark
- **WHEN** a first-time visitor whose system prefers dark opens any page
- **THEN** the page is dark

#### Scenario: No flash
- **WHEN** a page is loaded with a dark preference
- **THEN** it is never first painted light and then switched to dark after hydration

### Requirement: Manual dark mode toggle
The system SHALL offer a labeled control in the app bar that switches between light and dark, overrides the system setting, and is remembered in the visitor's browser across reloads and sign-in sessions.

#### Scenario: Toggle and reload
- **WHEN** a user switches to dark mode and reloads the page
- **THEN** the page is still dark

#### Scenario: Override the system
- **WHEN** the system prefers dark and the user switches to light
- **THEN** the app stays light after reload until the user changes it back

#### Scenario: Toggle by keyboard
- **WHEN** a user focuses the toggle and presses Enter or Space
- **THEN** the mode changes and the control's state is exposed to assistive technology

### Requirement: Pages without scripts stay readable
The system SHALL render sign-in and other server-rendered pages legibly when JavaScript is unavailable, using the system dark-mode preference.

#### Scenario: No scripts
- **WHEN** a page is loaded with JavaScript disabled
- **THEN** its text and controls are legible in the mode the system prefers
