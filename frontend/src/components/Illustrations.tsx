// Inline SVG illustrations for empty states. Two-colour, ~80px wide, friendly.

const INDIGO = '#6366f1';
const INDIGO_LIGHT = '#c7d2fe';

interface Props {
  className?: string;
}

export function BeakerIllustration({ className }: Props) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden width="80" height="80">
      <path
        d="M27 14h26v3a2 2 0 0 1-2 2h-1.4L57 50.5a14 14 0 0 1-12.7 19.5H35.7A14 14 0 0 1 23 50.5L30.4 19H29a2 2 0 0 1-2-2v-3Z"
        fill={INDIGO_LIGHT}
      />
      <path
        d="M30.4 19h19.2"
        stroke={INDIGO}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M27 14h26"
        stroke={INDIGO}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="36" cy="52" r="2" fill={INDIGO} />
      <circle cx="44" cy="58" r="1.5" fill={INDIGO} />
      <circle cx="40" cy="46" r="1.2" fill={INDIGO} />
    </svg>
  );
}

export function NotebookIllustration({ className }: Props) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden width="80" height="80">
      <rect x="14" y="14" width="52" height="52" rx="4" fill={INDIGO_LIGHT} />
      <path d="M40 14v52" stroke={INDIGO} strokeWidth="1.5" />
      <path d="M20 26h14M20 34h14M20 42h10" stroke={INDIGO} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M46 26h14M46 34h14M46 42h10" stroke={INDIGO} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="34" cy="56" r="2" fill={INDIGO} />
      <circle cx="52" cy="56" r="2" fill={INDIGO} />
    </svg>
  );
}

export function MicroscopeIllustration({ className }: Props) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden width="80" height="80">
      <rect x="22" y="56" width="36" height="6" rx="2" fill={INDIGO} />
      <rect x="34" y="48" width="12" height="8" fill={INDIGO_LIGHT} />
      <path d="M40 14c8 0 14 6 14 14v6h-8v-6c0-3-2-6-6-6v-8Z" fill={INDIGO_LIGHT} />
      <rect x="36" y="32" width="14" height="18" rx="2" fill={INDIGO} />
      <circle cx="40" cy="14" r="3.5" fill={INDIGO} />
    </svg>
  );
}

export function ChartIllustration({ className }: Props) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden width="80" height="80">
      <rect x="14" y="14" width="52" height="52" rx="4" fill="#ffffff" stroke={INDIGO_LIGHT} strokeWidth="2" />
      <rect x="22" y="44" width="8" height="14" fill={INDIGO_LIGHT} />
      <rect x="36" y="32" width="8" height="26" fill={INDIGO} />
      <rect x="50" y="40" width="8" height="18" fill={INDIGO_LIGHT} />
      <circle cx="58" cy="22" r="3" fill={INDIGO} />
      <circle cx="50" cy="26" r="2" fill={INDIGO} />
      <circle cx="64" cy="28" r="2" fill={INDIGO} />
    </svg>
  );
}
