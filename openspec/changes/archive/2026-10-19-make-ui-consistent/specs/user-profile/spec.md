# Spec Delta

## MODIFIED Requirements

### Requirement: Request password reset
The system SHALL let a user trigger the reset email from the profile page.

#### Scenario: Reset button
- **WHEN** the user clicks "Send reset link" in the Password card
- **THEN** `PUT /api/signin/reset` is called and a success or error toast shows
