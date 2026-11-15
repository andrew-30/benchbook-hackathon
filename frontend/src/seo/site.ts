/**
 * Single source of truth for public-page SEO: titles, descriptions, sitemap
 * hints and structured data. Used by the build-time pre-renderer
 * (scripts/prerender.mjs via src/entry-server.tsx) and by <RouteMeta /> for
 * client-side navigation, so the two can never drift apart.
 *
 * Copy rule: say "AI" / "AI-assisted" — never name the model or vendor.
 */

/** Canonical origin. The apex benchbook.app redirects here. */
export const SITE_URL = 'https://www.benchbook.app';
export const SITE_NAME = 'Benchbook';
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const DEFAULT_DESCRIPTION =
  'Benchbook is a free electronic lab notebook for running experiments: guided steps at the bench, with measurements, timings, deviations and reagent lots captured as you work.';

export interface PageMeta {
  path: string;
  /** Full <title>, kept under ~60 characters. */
  title: string;
  /** Meta description, kept under ~160 characters. */
  description: string;
  changefreq: 'weekly' | 'monthly' | 'yearly';
  priority: number;
  /**
   * Date this page's CONTENT last changed, as YYYY-MM-DD.
   *
   * Hand-maintained on purpose. The sitemap used to stamp every URL with the
   * build date, which made <lastmod> meaningless — a deploy that only touched
   * the API still told crawlers every page was fresh. Bump this only when the
   * page's actual copy changes, and leave it alone for unrelated deploys.
   */
  lastmod: string;
}

/** Every indexable page. Anything not listed here is noindex. */
export const PUBLIC_PAGES: PageMeta[] = [
  {
    path: '/',
    title: 'Benchbook — Electronic Lab Notebook for Reproducible Runs',
    description:
      'An electronic lab notebook for running experiments: Benchbook guides each step at the bench and captures measurements, timings, deviations and reagent lots.',
    changefreq: 'weekly',
    priority: 1.0,
    lastmod: '2026-09-22',
  },
  {
    path: '/why-benchbook',
    title: 'Why Benchbook — Reproducible Lab Records, No Write-Up',
    description:
      'Why lab records fail and how Benchbook fixes it: capture every step, measurement, deviation and reagent lot as you work, so experiments are reproducible.',
    changefreq: 'monthly',
    priority: 0.8,
    lastmod: '2026-09-22',
  },
  {
    path: '/about',
    title: 'About Benchbook — The Story Behind Our Lab Notebook',
    description:
      'The story behind Benchbook: an electronic lab notebook built to record experiments as they happen, so research is easier to reproduce, share and write up.',
    changefreq: 'monthly',
    priority: 0.6,
    lastmod: '2026-09-22',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy | Benchbook',
    description: 'How Benchbook collects, uses and protects your research data and account information.',
    changefreq: 'yearly',
    priority: 0.3,
    lastmod: '2026-09-22',
  },
  {
    path: '/terms',
    title: 'Terms of Service | Benchbook',
    description: 'The terms that govern your use of Benchbook, the electronic lab notebook.',
    changefreq: 'yearly',
    priority: 0.3,
    lastmod: '2026-09-22',
  },
];

export function findPublicPage(pathname: string): PageMeta | undefined {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PUBLIC_PAGES.find((p) => p.path === clean);
}

export function canonicalUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

const FEATURES = [
  'Step-by-step protocol execution with timers and measurements',
  'Measurement tolerances and deviation recording',
  'Reagent lot number and expiry date tracking',
  'Expired reagent warnings before an experiment starts',
  'Complete per-run records of what was actually done',
  'Statistics across experiment runs',
  'AI protocol import from SOP documents or pasted text',
  'AI-generated methods section drafts',
  'PDF export and read-only share links',
  'Installable app that works on tablets at the bench',
];

/** JSON-LD blocks for the homepage (Organization, WebSite, SoftwareApplication, FAQPage). */
export function homeStructuredData(faq: { question: string; answer: string }[]): object[] {
  const blocks: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/pwa-512x512.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      image: OG_IMAGE,
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Electronic lab notebook',
      operatingSystem: 'Web',
      description: DEFAULT_DESCRIPTION,
      featureList: FEATURES,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ];
  if (faq.length > 0) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }
  return blocks;
}
