/**
 * Billing-owned request schemas. Plan/admin-org query schemas live with core
 * (`schemas/admin-user.ts`) because the admin surfaces exist without billing.
 *
 * Stripe checkout/portal requests carry no body (org id comes from the path),
 * so this module currently has no schemas of its own.
 */
export {};
