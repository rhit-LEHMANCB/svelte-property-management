# Spec Delta

## Purpose
Defines the app's color theme, its contrast guarantees, and how light and dark mode are chosen and remembered, so the app is readable on every page in both modes.

## ADDED Requirements

### Requirement: Accessible color theme
The system SHALL use one built-in Skeleton 5 color theme on every page, with text and controls meeting WCAG 2.2 AA contrast (4.5:1 for text, 3:1 for large text and control boundaries) in both light and dark mode.

#### Scenario: Contrast in light mode
- **WHEN** an automated accessibility scan runs on the sign-in page and the main admin and tenant pages in light mode
- **THEN** it reports no color-contrast violations

#### Scenario: Contrast in dark mode
- **WHEN** the same scan runs in dark mode
- **THEN** it reports no color-contrast violations

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
