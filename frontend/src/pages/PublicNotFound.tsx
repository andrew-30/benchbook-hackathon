import { Link } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';

/**
 * Static "page not found" served with a real 404 status for any URL that is
 * neither a public page nor an app route. Pre-rendered to dist/404.html
 * without the app bundle, so it never redirects away.
 */
export function PublicNotFound() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-md">
        <Link to="/" aria-label="Benchbook home" className="inline-flex">
          <BrandMark />
        </Link>
        <div className="bb-card mt-8 p-8 text-center">
          <h1 className="font-display text-2xl text-ink">Page not found</h1>
          <p className="mt-2 text-sm text-muted">
            This page doesn't exist or has moved.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/" className="bb-btn-primary">
              Go to homepage
            </Link>
            <Link to="/login" className="bb-btn-ghost">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
