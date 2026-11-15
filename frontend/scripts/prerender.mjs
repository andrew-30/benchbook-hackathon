// Build step 3 of 3 — runs after `vite build` (client) and
// `vite build --ssr src/entry-server.tsx --outDir dist-ssr`.
//
// Writes static HTML for every public page so search engines and link-preview
// bots (which don't run JavaScript) get real content and per-page tags, plus
// 404.html, robots.txt and sitemap.xml. The app shell for signed-in routes is
// dist/app.html (emitted by the vite build), so overwriting dist/index.html
// with the landing page never affects the app.
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');

const {
  render,
  PUBLIC_PAGES,
  HOME_FAQ,
  SITE_NAME,
  SITE_URL,
  OG_IMAGE,
  canonicalUrl,
  homeStructuredData,
} = await import(pathToFileURL(path.join(ssrDir, 'entry-server.js')).href);

/** Paths the app serves from app.html — kept out of crawling. /shared/ is
 *  deliberately NOT disallowed: link-preview bots honour robots.txt, and those
 *  pages carry noindex instead. */
const APP_PATHS = [
  '/dashboard',
  '/protocols',
  '/reagents',
  '/import',
  '/runs',
  '/statistics',
  '/settings',
  '/onboarding',
];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const template = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>')) {
  throw new Error('prerender: dist/index.html has no empty #root — was it already pre-rendered?');
}

function buildPage({ body, title, description, canonical, robots, jsonLd = [], withScripts = true }) {
  const tags = [
    `<meta name="robots" content="${robots}" />`,
    canonical && `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    canonical && `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Benchbook — turn laboratory protocols into reproducible experiments" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    ...jsonLd.map(
      (block) =>
        `<script type="application/ld+json">${JSON.stringify(block).replace(/</g, '\\u003c')}</script>`,
    ),
  ]
    .filter(Boolean)
    .join('\n    ');

  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('</head>', `    ${tags}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);

  if (!withScripts) {
    html = html
      .replace(/<script type="module"[^>]*><\/script>\s*/g, '')
      .replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
      .replace(/<link rel="manifest"[^>]*>/g, '');
  }
  return html;
}

function outputFile(pagePath) {
  return pagePath === '/' ? 'index.html' : `${pagePath.slice(1)}.html`;
}

// --- Public pages -----------------------------------------------------------
for (const page of PUBLIC_PAGES) {
  const body = render(page.path);
  if (body.length < 500 || !body.includes('<h1')) {
    throw new Error(`prerender: ${page.path} rendered suspiciously little markup (${body.length} chars)`);
  }
  const html = buildPage({
    body,
    title: page.title,
    description: page.description,
    canonical: canonicalUrl(page.path),
    robots: 'index, follow',
    jsonLd: page.path === '/' ? homeStructuredData(HOME_FAQ) : [],
  });
  await writeFile(path.join(dist, outputFile(page.path)), html);
  console.log(`[prerender] ${page.path} → dist/${outputFile(page.path)} (${body.length} chars of markup)`);
}

// --- 404 (no app bundle, so it never redirects) -----------------------------
await writeFile(
  path.join(dist, '404.html'),
  buildPage({
    body: render('/__not-found__'),
    title: 'Page not found | Benchbook',
    description: 'This page does not exist or has moved.',
    canonical: null,
    robots: 'noindex, follow',
    withScripts: false,
  }),
);
console.log('[prerender] 404 → dist/404.html');

// --- robots.txt + sitemap.xml -----------------------------------------------
await writeFile(
  path.join(dist, 'robots.txt'),
  ['User-agent: *', 'Allow: /', ...APP_PATHS.map((p) => `Disallow: ${p}`), '', `Sitemap: ${SITE_URL}/sitemap.xml`, ''].join(
    '\n',
  ),
);

// <lastmod> comes from each page's own `lastmod` in seo/site.ts, NOT from the
// build clock — stamping the build date made every page look freshly edited on
// every deploy, so crawlers learned to ignore the signal.
const urls = PUBLIC_PAGES.map(
  (p) =>
    `  <url>\n    <loc>${canonicalUrl(p.path)}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority.toFixed(1)}</priority>\n  </url>`,
).join('\n');
await writeFile(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log(`[prerender] robots.txt + sitemap.xml (${PUBLIC_PAGES.length} URLs)`);

// The SSR bundle is only a build-time tool — never ship it.
await rm(ssrDir, { recursive: true, force: true });
