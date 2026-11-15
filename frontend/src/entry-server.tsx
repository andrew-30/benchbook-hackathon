import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { About } from './pages/About';
import { WhyBenchbook } from './pages/WhyBenchbook';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { PublicNotFound } from './pages/PublicNotFound';

/**
 * Build-time renderer for the public marketing pages, consumed by
 * scripts/prerender.mjs after `vite build --ssr`. Only pages that render
 * without auth, data fetching or browser APIs belong here. The browser still
 * boots the full app with createRoot, which replaces this markup.
 */
export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/why-benchbook" element={<WhyBenchbook />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<PublicNotFound />} />
      </Routes>
    </StaticRouter>,
  );
}

export { HOME_FAQ } from './pages/Home';
export {
  DEFAULT_DESCRIPTION,
  OG_IMAGE,
  PUBLIC_PAGES,
  SITE_NAME,
  SITE_URL,
  canonicalUrl,
  homeStructuredData,
} from './seo/site';
