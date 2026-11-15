import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

export function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bb-card p-8 max-w-md text-center">
        <div className="text-5xl">🔍</div>
        <h1 className="mt-3 text-xl font-semibold text-neutral-900">Page not found</h1>
        <p className="text-sm text-neutral-600 mt-1">
          This page does not exist or has been moved.
        </p>
        <Link to="/dashboard" className="bb-btn-primary mt-5 inline-flex">
          Go to Dashboard →
        </Link>
      </div>
    </div>
  );
}
