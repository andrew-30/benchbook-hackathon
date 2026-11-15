import sanitizeHtml from 'sanitize-html';

/**
 * Strip ALL HTML tags from user input.
 *
 * Defence-in-depth against XSS via stored content. Zod already enforces length
 * + type; this strips any HTML payload before the value reaches the database
 * so the React frontend (which renders user text in JSX, not via
 * dangerouslySetInnerHTML) can't be tricked by an exfiltrated direct DB read
 * either.
 *
 * Returns '' for null / undefined / non-string input so callers can safely
 * `?? null` after.
 */
export function sanitiseText(input: unknown): string {
  if (input == null || typeof input !== 'string') return '';
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();
}

/**
 * Preserve a small set of inline formatting tags. Use for longer free-text
 * fields (step instructions, deviation descriptions) where italic / bold /
 * line-breaks are genuinely useful and currently part of the schema.
 *
 * The frontend renders these as plain text (whitespace-pre-wrap) today, so
 * the tags survive in the DB but render harmlessly. If we later choose to
 * render rich text we already have the safe allowlist in place.
 */
export function sanitiseRichText(input: unknown): string {
  if (input == null || typeof input !== 'string') return '';
  return sanitizeHtml(input, {
    allowedTags: ['b', 'i', 'em', 'strong', 'br'],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();
}

/**
 * Coerce arbitrary input to a finite number, or null. Rejects NaN, ±Infinity,
 * empty strings. Used as a last-line check on numeric fields before they hit
 * Postgres (Zod handles the primary validation).
 */
export function sanitiseNumber(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null;
  const num = Number(input);
  if (!Number.isFinite(num)) return null;
  return num;
}
