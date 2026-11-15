/**
 * Serves /shared/:token (via the vercel.json rewrite): the app shell with a
 * per-link title, description and preview tags, so a shared experiment
 * unfurls properly in chat and email — link-preview bots don't run
 * JavaScript. Always noindex: shared research data must never appear in
 * search results. The browser then boots the app, which renders SharedRun.
 */
const SITE_URL = 'https://www.benchbook.app';
const API_URL = process.env.VITE_API_URL || 'https://benchbook-api.vercel.app';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface SharedRunSummary {
  run?: { protocol_name?: string | null; run_started_at?: string | null };
}

async function loadSummary(token: string): Promise<SharedRunSummary | null> {
  if (!/^[a-f0-9]{16,128}$/i.test(token)) return null;
  try {
    const res = await fetch(`${API_URL}/api/shared/${token}`);
    return res.ok ? ((await res.json()) as SharedRunSummary) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  // cleanUrls serves app.html at /app. Forward a preview-protection bypass
  // header when one was sent (only on protected preview deployments), so the
  // shell fetch doesn't get the protection page instead.
  const bypass = request.headers.get('x-vercel-protection-bypass');
  const [shellRes, summary] = await Promise.all([
    fetch(`${url.origin}/app`, bypass ? { headers: { 'x-vercel-protection-bypass': bypass } } : undefined),
    loadSummary(token),
  ]);
  let html = await shellRes.text();

  const protocol = summary?.run?.protocol_name?.trim() || null;
  const started = summary?.run?.run_started_at ? new Date(summary.run.run_started_at) : null;
  const date =
    started && !Number.isNaN(started.getTime())
      ? started.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : null;

  const title = protocol ? `${protocol} — shared experiment | Benchbook` : 'Shared experiment | Benchbook';
  const description = protocol
    ? `Read-only experiment record for "${protocol}"${date ? `, run ${date}` : ''}, shared from Benchbook, the experiment execution platform.`
    : 'A read-only experiment record shared from Benchbook, the experiment execution platform.';

  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="Benchbook" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${SITE_URL}/shared/${esc(token)}" />`,
    `<meta property="og:image" content="${SITE_URL}/og-image.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${SITE_URL}/og-image.png" />`,
  ].join('\n    ');

  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('</head>', `    ${tags}\n  </head>`);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
