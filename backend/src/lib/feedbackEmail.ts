import { config } from '../config.js';

/**
 * Feedback email sender (Resend). Builds a branded HTML notification and posts
 * it to the Resend REST API. Kept dependency-free (global fetch) — it's a
 * single endpoint. Never throws to the caller: returns a typed result the route
 * maps to a clean HTTP status.
 */

export interface FeedbackPayload {
  message: string;
  /** Best reply address — submitter-entered, or the signed-in account email. */
  email: string | null;
  name: string | null;
  page: string | null;
  /** Signed-in identity, if a valid token was attached (soft auth). */
  accountId: string | null;
  accountEmail: string | null;
  userAgent: string | null;
  submittedAt: string; // ISO
}

type SendResult = { ok: true } | { ok: false; status: number; error: string };

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Brand palette — mirrors the app's Modern Confident tokens.
const INK = '#17132a';
const MUTED = '#6f6b81';
const LINE = '#ece7f2';
const INDIGO = '#6366f1';
const SOFT = '#faf9fc';
const PAGE = '#f4f2f8';

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 0;color:${MUTED};font-size:12px;white-space:nowrap;vertical-align:top;width:110px;">${esc(label)}</td>
      <td style="padding:6px 0;color:${INK};font-size:13px;vertical-align:top;">${value}</td>
    </tr>`;
}

function buildHtml(p: FeedbackPayload): string {
  const when = new Date(p.submittedAt).toUTCString();
  const account = p.accountId
    ? `Signed in${p.accountEmail ? ` — ${esc(p.accountEmail)}` : ''}<br><span style="color:${MUTED};font-size:11px;font-family:monospace;">${esc(p.accountId)}</span>`
    : `<span style="color:${MUTED};">Anonymous / not signed in</span>`;

  const metaRows = [
    row('From', p.email ? `<a href="mailto:${esc(p.email)}" style="color:${INDIGO};text-decoration:none;">${esc(p.email)}</a>` : `<span style="color:${MUTED};">not provided</span>`),
    p.name ? row('Name', esc(p.name)) : '',
    row('Account', account),
    p.page ? row('Page', `<span style="word-break:break-all;">${esc(p.page)}</span>`) : '',
    row('Submitted', esc(when)),
    p.userAgent ? row('Device', `<span style="color:${MUTED};font-size:11px;">${esc(p.userAgent)}</span>`) : '',
  ].join('');

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${PAGE};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">

        <!-- Header -->
        <tr><td style="background:${INDIGO};padding:20px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">
              <span style="display:inline-block;width:34px;height:34px;background:#ffffff;border-radius:9px;text-align:center;line-height:34px;font-size:18px;">&#129514;</span>
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <div style="color:#ffffff;font-family:Georgia,serif;font-size:19px;font-weight:700;line-height:1;">Benchbook</div>
              <div style="color:#dcdcff;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-top:4px;">New feedback</div>
            </td>
          </tr></table>
        </td></tr>

        <!-- Message -->
        <tr><td style="padding:24px 24px 8px;">
          <div style="color:${MUTED};font-size:12px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px;">Message</div>
          <div style="background:${SOFT};border:1px solid ${LINE};border-radius:10px;padding:16px;color:${INK};font-size:14.5px;line-height:1.6;white-space:pre-wrap;">${esc(p.message)}</div>
        </td></tr>

        <!-- Metadata -->
        <tr><td style="padding:8px 24px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${metaRows}</table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 24px;border-top:1px solid ${LINE};background:${SOFT};">
          <div style="color:${MUTED};font-size:12px;line-height:1.5;">
            ${p.email ? `Just hit <b style="color:${INK};">Reply</b> to respond to ${esc(p.email)} directly.` : 'No reply address was provided.'}
          </div>
        </td></tr>

      </table>
      <div style="color:#b4b0c2;font-size:11px;margin-top:14px;">Sent by Benchbook · feedback form</div>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendFeedbackEmail(p: FeedbackPayload): Promise<SendResult> {
  if (!config.resend.apiKey) {
    console.warn('[feedback] RESEND_API_KEY not set — cannot send feedback email.');
    return { ok: false, status: 503, error: 'Feedback is temporarily unavailable. Please try again later.' };
  }

  const subject = `New Benchbook feedback${p.email ? ` — ${p.email}` : ''}`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.resend.feedbackFrom,
        to: [config.resend.feedbackTo],
        ...(p.email ? { reply_to: p.email } : {}),
        subject,
        html: buildHtml(p),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[feedback] Resend send failed:', res.status, body.slice(0, 300));
      return { ok: false, status: 502, error: 'Could not send your feedback right now. Please try again later.' };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[feedback] Resend request threw:', err);
    return { ok: false, status: 502, error: 'Could not send your feedback right now. Please try again later.' };
  }
}
