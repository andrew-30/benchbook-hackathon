import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_DESCRIPTION, canonicalUrl, findPublicPage } from '../seo/site';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Keeps <head> SEO tags in step with client-side navigation. Pre-rendered
 * public pages already ship these tags in their HTML (scripts/prerender.mjs);
 * this keeps them correct after in-app navigation and marks every app or
 * private route noindex. Rendered after <Routes> so its effect runs after the
 * page's own usePageTitle and wins for public pages.
 */
export function RouteMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = findPublicPage(pathname);
    if (page) {
      const url = canonicalUrl(page.path);
      document.title = page.title;
      setMeta('name', 'description', page.description);
      setMeta('name', 'robots', 'index, follow');
      setMeta('property', 'og:title', page.title);
      setMeta('property', 'og:description', page.description);
      setMeta('property', 'og:url', url);
      setMeta('name', 'twitter:title', page.title);
      setMeta('name', 'twitter:description', page.description);
      setCanonical(url);
    } else {
      setMeta('name', 'description', DEFAULT_DESCRIPTION);
      setMeta('name', 'robots', 'noindex, nofollow');
      setCanonical(null);
    }
  }, [pathname]);
  return null;
}
