/**
 * Single source of truth for the legal identity and dates shown on the public
 * Privacy Policy and Terms of Service pages.
 *
 * Both pages are pre-rendered at build time (src/entry-server.tsx) and are
 * indexable, so anything here ships to search engines. Keep it factual.
 *
 * LEGAL_POSTAL_ADDRESS is intentionally empty — the owner chose to omit the
 * controller's postal address for now, so the Contact sections render the
 * company name and email only. GDPR Art. 13 does expect a postal address, so
 * this is a known, deliberate gap rather than an oversight: set the constant
 * and both pages pick it up with no other edit.
 */

/** The company. Confirmed 2026-09-22: Play Plot Digital Solutions Ltd. */
export const LEGAL_ENTITY = 'Play Plot Digital Solutions Ltd';

/** Country of establishment. Confirmed 2026-09-22 by the owner. */
export const LEGAL_COUNTRY = 'United States';

/** Governing law. Confirmed 2026-09-22: Michigan. */
export const LEGAL_JURISDICTION = 'the State of Michigan, United States';

/** Deliberately empty for now; Contact sections omit the address line. */
export const LEGAL_POSTAL_ADDRESS = '';

/**
 * Public contact address for both legal pages. This is the GDPR contact point
 * and Privacy §11 promises a reply within 30 days, so it must be monitored.
 * Matches `config.resend.feedbackTo` on the backend.
 */
export const LEGAL_EMAIL = 'support@benchbook.app';

/** Bump whenever either page changes in substance. */
export const LEGAL_LAST_UPDATED = 'September 2026';

/** Aggregate liability cap, in USD. Benchbook is free, so this is the floor. */
export const LEGAL_LIABILITY_CAP_USD = 100;

/** Share links expire after this many days — migration 005. Keep in sync. */
export const SHARE_LINK_EXPIRY_DAYS = 90;
