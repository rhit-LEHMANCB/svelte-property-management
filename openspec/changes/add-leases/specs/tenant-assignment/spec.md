# Spec Delta

## REMOVED Requirements

### Requirement: Assign tenant
**Reason**: Leases replace tenant assignment as the link between a tenant and a property.
**Migration**: Add the tenant to a lease on the property by email from the property's Leases tab. `POST /api/property/{id}/tenants` is removed.

### Requirement: Remove tenant
**Reason**: Leases replace tenant assignment as the link between a tenant and a property.
**Migration**: Remove the tenant from the lease, or set the lease's end date. `DELETE /api/property/{id}/tenants` is removed.

### Requirement: Assignable users
**Reason**: Leases replace tenant assignment as the link between a tenant and a property.
**Migration**: Lease forms take emails instead of offering a list of unassigned users.

### Requirement: Look up a user's property
**Reason**: Leases replace tenant assignment as the link between a tenant and a property.
**Migration**: A user's property is the property of their current lease. `GET /api/user/{id}/assoc` is removed.

### Requirement: One property per tenant
**Reason**: Leases replace tenant assignment as the link between a tenant and a property.
**Migration**: Replaced by the lease conflict rule: a user cannot be on two leases whose dates overlap.

### Requirement: Move-in month
**Reason**: Leases replace tenant assignment as the link between a tenant and a property.
**Migration**: The lease start date sets the first month of rent. The data migration turns existing move-in months into lease start dates; `PATCH /api/property/{id}/tenants` is removed.
