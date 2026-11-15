import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Icon } from './Icon';

/**
 * Shown only while the browser reports no connection. Reassures the researcher
 * that their in-progress work is held on the device and reads are coming from
 * the last synced snapshot.
 *
 * `variant="bench"` styles for the dark run-execution screen; the default is a
 * light strip for the rest of the app. Renders nothing when online, so it's
 * safe to drop in anywhere without reserving layout.
 */
export function OfflineBanner({
  variant = 'default',
  className = '',
}: {
  variant?: 'default' | 'bench';
  className?: string;
}) {
  const online = useOnlineStatus();
  if (online) return null;

  const bench = variant === 'bench';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 rounded-card border px-3 py-2 text-sm ${
        bench
          ? 'border-white/15 bg-[rgba(251,191,36,0.12)]'
          : 'border-warning/30 bg-warning/10'
      } ${className}`}
    >
      <Icon name="alert" size={16} className={`shrink-0 ${bench ? 'text-[#fbbf24]' : 'text-warning'}`} />
      <span className={bench ? 'text-[#f2e9cf]' : 'text-ink/80'}>
        {bench
          ? "You're offline — your timer keeps running and your last saved data is shown. Reconnect to sync your progress."
          : "You're offline — showing your last saved data."}
      </span>
    </div>
  );
}
