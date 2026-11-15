/**
 * Robust JSON extractor for LLM responses.
 *
 * Claude (and any LLM) routinely returns JSON that JSON.parse refuses:
 *   - wrapped in ```json fences, sometimes with prose preamble
 *   - truncated mid-object when max_tokens runs out (the most common failure
 *     mode for big 28-page SOP imports)
 *   - postamble like "Hope this helps!" after the closing brace
 *
 * Strategy, in order:
 *   1. Strip markdown fences + leading preamble before the first `{`.
 *   2. Try a direct JSON.parse.
 *   3. Walk the string with a bracket-tracking scanner to find the longest
 *      balanced object (handles trailing chatter after `}`).
 *   4. If still failing, attempt a structural repair: close any open string,
 *      drop incomplete trailing key/values, then balance the open brackets.
 *      Retry parsing while progressively dropping the last incomplete element.
 *
 * On total failure we log head + tail of the cleaned text and the cleaned
 * length so Railway logs show exactly what Claude returned — far easier to
 * diagnose than the previous "Could not extract valid JSON" with no context.
 */
export function safeParseJSON<T = unknown>(text: string): T {
  if (!text || typeof text !== 'string') {
    throw new Error(
      'Could not extract valid JSON from Claude response: empty response',
    );
  }

  // 1. Strip markdown fences. Handles ```json, ```JSON, plain ```, and
  //    fences that appear mid-response (sometimes Claude opens a second
  //    fence inside its own example).
  let clean = text
    .replace(/```(?:json|JSON)?\s*/g, '')
    .replace(/```/g, '')
    .trim();

  // Strip conversational preamble before the first opening brace.
  const firstBrace = clean.indexOf('{');
  if (firstBrace === -1) {
    logFailure('no opening brace', clean);
    throw new Error(
      'Could not extract valid JSON from Claude response: no JSON object found',
    );
  }
  clean = clean.slice(firstBrace);

  // 2. Direct parse — fast path for well-behaved responses.
  try {
    return JSON.parse(clean) as T;
  } catch {
    /* fall through to recovery */
  }

  // 3. Longest balanced prefix (handles trailing chatter after `}`).
  const balanced = extractBalancedJson(clean);
  if (balanced) {
    try {
      return JSON.parse(balanced) as T;
    } catch {
      /* fall through to repair */
    }
  }

  // 4. Repair truncated JSON.
  const repaired = repairTruncatedJson(clean);
  if (repaired) {
    try {
      return JSON.parse(repaired) as T;
    } catch (err) {
      console.error(
        '[safeParseJSON] repair attempt failed:',
        (err as Error).message,
      );
    }
  }

  logFailure('all strategies exhausted', clean);
  throw new Error('Could not extract valid JSON from Claude response');
}

/**
 * Scan for the longest balanced top-level `{ ... }` block, respecting strings
 * and escapes. Returns the substring including both braces, or null if no
 * balanced object exists.
 */
function extractBalancedJson(text: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Repair JSON that was truncated mid-output (the dominant failure mode for
 * large SOP imports). Closes an unterminated string, drops obvious trailing
 * partial elements (a key with no value, a number being typed, a dangling
 * comma), then appends the right number of `}` and `]` to balance the stack.
 *
 * Tries up to N progressive trims — each iteration walks back to the previous
 * complete element and re-balances. Returns the first variant that JSON.parse
 * accepts, or null if no variant parses.
 */
function repairTruncatedJson(text: string): string | null {
  // Track bracket stack as we walk, plus whether we end inside a string.
  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === '{' || c === '[') {
      stack.push(c);
    } else if (c === '}' || c === ']') {
      stack.pop();
    }
  }

  let body = text;
  if (inString) body += '"';

  // Try progressively trimming back to a clean boundary, then balancing.
  for (let attempt = 0; attempt < 20; attempt++) {
    let candidate = body;

    // Drop trailing whitespace and commas.
    candidate = candidate.replace(/[\s,]+$/, '');

    // Drop a dangling key with no value: `"foo":` or `"foo": ` at end.
    candidate = candidate.replace(/"[^"\\]*(?:\\.[^"\\]*)*"\s*:\s*$/, '');

    // Drop a value that's mid-number/literal (no quotes, no closer after).
    // Example tail: `"step_order": 3, "title": "Mix",   "instr` — the inString
    // branch already closed it; here we catch raw partial numbers like
    // `"step_order": 3` -> safe; `"step_order":` -> handled above; partial
    // unquoted token like `tru` (for `true`) trimmed below.
    candidate = candidate.replace(/,\s*[A-Za-z][A-Za-z0-9_]*\s*$/, '');

    candidate = candidate.replace(/[\s,]+$/, '');

    // Append the right closers in reverse stack order.
    let closed = candidate;
    for (let j = stack.length - 1; j >= 0; j--) {
      closed += stack[j] === '{' ? '}' : ']';
    }

    try {
      JSON.parse(closed);
      return closed;
    } catch {
      // Trim back to the previous complete element and retry.
      const lastComma = lastTopLevelComma(body, stack.length);
      if (lastComma === -1) break;
      body = body.slice(0, lastComma);
    }
  }
  return null;
}

/**
 * Find the index of the comma that separates the last complete element at
 * the outermost still-open level. We do a fresh scan because the repair loop
 * mutates `body` between iterations.
 */
function lastTopLevelComma(text: string, _targetDepth: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastComma = -1;
  // We want the deepest still-open container's last comma — that's where
  // the truncation lives. Track depth and remember the *deepest* comma seen
  // at the current depth as we ascend.
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === '{' || c === '[') {
      depth++;
    } else if (c === '}' || c === ']') {
      depth--;
    } else if (c === ',' && depth > 0) {
      lastComma = i;
    }
  }
  return lastComma;
}

function logFailure(reason: string, clean: string): void {
  const head = clean.slice(0, 500);
  const tail = clean.length > 1000 ? clean.slice(-500) : '';
  console.error(
    `[safeParseJSON] parse failed (${reason}). Cleaned length: ${clean.length}`,
  );
  console.error('[safeParseJSON] head:', head);
  if (tail) console.error('[safeParseJSON] tail:', tail);
}
