// Fake values for `$env/static/private` in unit and handler tests. Never real secrets.
export const FB_CLIENT_EMAIL = 'test@demo-lehman-realty.iam.gserviceaccount.com';
export const FB_PRIVATE_KEY = JSON.stringify({ privateKey: 'not-a-real-key' });
export const RESEND_API_KEY = 're_test';
export const STRIPE_API_KEY = 'sk_test_fixture';
export const STRIPE_ENDPOINT_SECRET = 'whsec_fixture';
