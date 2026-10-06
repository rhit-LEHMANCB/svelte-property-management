# Spec Delta

## ADDED Requirements

### Requirement: Tenant-only routes
The system SHALL redirect admins who open `/maintenance`, `/insurance`, `/payment` or any page under `/payment` to `/admin`, and SHALL NOT error.

#### Scenario: Admin opens a tenant page
- **WHEN** an admin loads `/payment`, `/maintenance` or `/insurance`
- **THEN** the response is a 303 redirect to `/admin`

#### Scenario: Tenant opens a tenant page
- **WHEN** a tenant with one property loads `/payment`
- **THEN** the page loads as before

## RENAMED Requirements

- FROM: `### Requirement: Admin route enforcement (not yet implemented)`
- TO: `### Requirement: Admin route enforcement`

## MODIFIED Requirements

### Requirement: Admin route enforcement
The system SHALL deny non-admins access to `/admin/*` pages, including `/admin` itself, on the server and not only in the admin API.

#### Scenario: Tenant opens an admin URL
- **WHEN** a tenant navigates to `/admin/users`
- **THEN** the server rejects with 401

#### Scenario: Tenant opens the admin home
- **WHEN** a tenant navigates to `/admin`
- **THEN** the server rejects with 401
