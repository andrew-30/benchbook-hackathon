/**
 * PDF text extraction for protocol import.
 *
 * Uses `unpdf`, which wraps a PDF.js build compiled for serverless runtimes.
 * Chosen over `pdf-parse`/`pdfjs-dist` for one reason that matters here: it has
 * ZERO runtime dependencies and treats `@napi-rs/canvas` as an *optional* peer
 * (needed only for image rendering, which we don't do). No native binaries —
 * the trap that killed the old serverless Chromium path.
 *
 * `unpdf` is imported lazily inside the function, matching the convention in
 * routes/runs.ts: a loader failure then surfaces as an error on this one route
 * instead of taking the container down at boot, and cold starts for non-PDF
 * requests don't pay for a PDF.js bundle they never touch.
 *
 * This layer only decides whether we have usable text. Length limits stay with
 * the caller (MAX_INPUT_CHARS in routes/import.ts), which applies equally to
 * .docx and pasted text.
 */

/**
 * Page ceiling for a single import.
 *
 * NOT derived from the context window — a 100-page SOP is only ~47k input
 * tokens, a few percent of the model's window. The binding constraint is wall
 * clock: generating ~350 output tokens per step for hundreds of steps takes
 * minutes, against the function's duration limit.
 *
 * 20 is a deliberately conservative starting point: the largest document anyone
 * has actually imported is ~8 pages (measured from `ai_usage`), and the largest
 * output ever produced was ~13.7k tokens. 20 pages is ~1.5x that output, so it
 * is a small extrapolation from something known to work rather than a guess.
 *
 * TO RAISE THIS: time one real 20-page import end to end. If it lands well
 * inside the deadline, this can go up — and if the function's maxDuration is
 * raised from 300s to the 800s available on Vercel Pro, 40-60 is plausible.
 * Change this constant and the user-facing copy follows automatically.
 */
export const MAX_PDF_PAGES = 20;

/**
 * Below this many characters per page, we treat the PDF as having no usable
 * text layer — i.e. a scan — and refuse rather than send Claude a few hundred
 * characters of noise and bill the user for an empty extraction.
 *
 * NEEDS CALIBRATION against real documents. 100 is a defensible default: a
 * genuinely sparse text page (a title page, a signature sheet) still carries a
 * few hundred characters, while an image-only page yields single digits.
 */
export const MIN_CHARS_PER_PAGE = 100;

/** The PDF is password-protected; we can't read it without the password. */
export class PdfEncryptedError extends Error {
  constructor() {
    super(
      'This PDF is password-protected, so it cannot be read. Remove the ' +
        'password and upload it again, or paste the procedure text instead.',
    );
    this.name = 'PdfEncryptedError';
  }
}

/** The bytes aren't a readable PDF (truncated download, renamed file, damage). */
export class PdfUnreadableError extends Error {
  constructor() {
    super(
      'This PDF could not be read — it may be damaged or not actually a PDF. ' +
        'Try re-exporting it, or paste the procedure text instead.',
    );
    this.name = 'PdfUnreadableError';
  }
}

/** Over MAX_PDF_PAGES. Refused before any Claude call. */
export class PdfTooManyPagesError extends Error {
  constructor(public readonly pages: number) {
    super(
      `This PDF is ${pages} pages and we can import up to ${MAX_PDF_PAGES} at ` +
        'once, so nothing was saved. Split it into one procedure per file, or ' +
        'paste just the procedure you need.',
    );
    this.name = 'PdfTooManyPagesError';
  }
}

/**
 * Parsed fine but carries essentially no text — a scanned document. Refused
 * before any Claude call, with copy that says what's actually wrong rather
 * than "we couldn't find any steps", which would send the user looking for a
 * problem in their protocol.
 */
export class PdfNoTextLayerError extends Error {
  constructor(public readonly pages: number) {
    super(
      'This looks like a scanned PDF — it contains page images rather than ' +
        'selectable text, so there is nothing for us to read yet. Upload a PDF ' +
        'exported from Word (or similar), or paste the procedure text instead.',
    );
    this.name = 'PdfNoTextLayerError';
  }
}

export interface PdfExtraction {
  /** Page texts joined with blank lines, so the caller's header/footer
   *  de-duplication can still see page boundaries. */
  text: string;
  totalPages: number;
  /** Mean characters per page — the signal behind PdfNoTextLayerError. */
  charsPerPage: number;
}

/** PDF.js reports these by `name`; match defensively on the message too, since
 *  the wrapper may surface a plain Error. */
function isPasswordError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return name === 'PasswordException' || msg.includes('password');
}

/**
 * Extract text from an uploaded PDF buffer.
 *
 * Throws PdfEncryptedError / PdfUnreadableError / PdfTooManyPagesError /
 * PdfNoTextLayerError. Order is deliberate: page count is checked before the
 * text-layer test, because "split this 80-page binder" is more actionable than
 * "this looks scanned" when both are true.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtraction> {
  const { extractText } = await import('unpdf');

  let totalPages: number;
  let pages: string[];
  try {
    // Copy into a plain Uint8Array: PDF.js takes ownership of the buffer it is
    // given, and a Node Buffer is a view onto a possibly-pooled ArrayBuffer.
    const result = await extractText(new Uint8Array(buffer), { mergePages: false });
    totalPages = result.totalPages;
    pages = result.text;
  } catch (err) {
    if (isPasswordError(err)) throw new PdfEncryptedError();
    throw new PdfUnreadableError();
  }

  if (totalPages > MAX_PDF_PAGES) {
    throw new PdfTooManyPagesError(totalPages);
  }

  const text = pages.join('\n\n').trim();
  // Guard the divide: a 0-page PDF should read as "no text", not NaN/Infinity.
  const charsPerPage = totalPages > 0 ? text.length / totalPages : 0;

  if (charsPerPage < MIN_CHARS_PER_PAGE) {
    throw new PdfNoTextLayerError(totalPages);
  }

  return { text, totalPages, charsPerPage };
}
