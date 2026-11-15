import { Icon } from './Icon';

interface Props {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

/**
 * Friendly error card used in place of raw `error.message` text. The original
 * error message is surfaced only as muted secondary text so the page never
 * dumps a stack trace at the user.
 */
export function ErrorCard({ title = "Something didn't load", message, onRetry }: Props) {
  return (
    <div className="bb-card p-6 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <Icon name="alert" size={22} />
      </span>
      <h3 className="mt-3 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-muted">
        We couldn't fetch the data this time — please try again in a moment.
      </p>
      {message && (
        <p className="mt-2 text-xs text-muted/70 break-words max-w-md mx-auto">{message}</p>
      )}
      {onRetry && (
        <button onClick={onRetry} className="bb-btn-primary mt-4">
          Try Again
        </button>
      )}
    </div>
  );
}
