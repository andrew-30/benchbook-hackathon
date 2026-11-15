import type { ReactNode, SVGProps } from 'react';

/**
 * Reusable line-icon set for Benchbook (Modern Confident direction).
 *
 * Replaces the emoji icons that rendered differently on every OS. All icons
 * are 24×24, drawn with `currentColor` so they inherit the surrounding text
 * colour, and stroke-based for a cohesive weight. Add new glyphs to `PATHS`
 * and the `IconName` union together.
 */
export type IconName =
  | 'home'
  | 'flask'
  | 'droplet'
  | 'run'
  | 'chart'
  | 'gear'
  | 'check'
  | 'clock'
  | 'alert'
  | 'plus'
  | 'import'
  | 'beaker'
  | 'mail'
  | 'x'
  | 'sparkles'
  | 'file'
  | 'copy'
  | 'arrow-right'
  | 'arrow-left'
  | 'share'
  | 'bulb'
  | 'device'
  | 'atom'
  | 'pulse'
  | 'leaf'
  | 'globe'
  | 'search'
  | 'trash'
  | 'archive'
  | 'unarchive'
  | 'more'
  | 'sort'
  | 'edit'
  | 'chevron-down'
  | 'user'
  | 'table'
  | 'braces'
  | 'log-out'
  | 'play'
  | 'pause'
  | 'reset'
  | 'upload'
  | 'clipboard'
  | 'ruler';

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-5h5v5" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />
      <path d="M7.5 14h9" />
    </>
  ),
  droplet: (
    <>
      <path d="M12 3s6 6.4 6 10.5A6 6 0 0 1 6 13.5C6 9.4 12 3 12 3Z" />
      <path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
  run: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <rect x="7" y="12" width="3" height="5" rx="0.6" />
      <rect x="12.5" y="8" width="3" height="9" rx="0.6" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" strokeWidth={2} />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 2.8 20h18.4L12 4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" strokeWidth={1.9} />,
  import: (
    <>
      <path d="M12 3v11" />
      <path d="M8 10.5 12 14.5 16 10.5" />
      <path d="M4 18.5h16" />
    </>
  ),
  beaker: (
    <>
      <path d="M8 3h8" />
      <path d="M9 3v5l-4 8a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 16l-4-8V3" />
      <path d="M6.5 13h11" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  sparkles: (
    <>
      <path d="M12 3.5 13.4 8 18 9.4 13.4 10.8 12 15.5 10.6 10.8 6 9.4 10.6 8 12 3.5Z" />
      <path d="M19 13.5 19.6 15.5 21.5 16.1 19.6 16.7 19 18.7 18.4 16.7 16.5 16.1 18.4 15.5 19 13.5Z" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
      <path d="M13.5 3.5V8H18" />
      <path d="M9 13h6M9 16.3h6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  'arrow-right': <path d="M4 12h15M13 6l6 6-6 6" />,
  'arrow-left': <path d="M20 12H5M11 6l-6 6 6 6" />,
  share: (
    <>
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="17.5" cy="5.5" r="2.6" />
      <circle cx="17.5" cy="18.5" r="2.6" />
      <path d="M8.3 10.6 15.2 7M8.3 13.4 15.2 17" />
    </>
  ),
  bulb: (
    <>
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.2 1 2.1h5c0-.9.4-1.65 1-2.1A6 6 0 0 0 12 3Z" />
      <path d="M9.5 18.5h5M10 21h4" />
    </>
  ),
  device: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.2" />
      <circle cx="12" cy="18.2" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  atom: (
    <>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
    </>
  ),
  pulse: <path d="M2.5 12H6.5L9 5L13 19L16 9L18 12H21.5" />,
  leaf: (
    <>
      <path d="M19 5c-8 0-14 5-14 14 8 0 14-6 14-14Z" />
      <path d="M6 19c3-4 8-9 13-13" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c3 3 3 14 0 17" />
      <path d="M12 3.5c-3 3-3 14 0 17" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M19.5 19.5 15 15" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" />
      <path d="M6.5 7 7.4 19.4a2 2 0 0 0 2 1.85h5.2a2 2 0 0 0 2-1.85L17.5 7" />
      <path d="M10.3 11v6.3M13.7 11v6.3" />
    </>
  ),
  archive: (
    <>
      <rect x="3.5" y="4" width="17" height="4.2" rx="1.1" />
      <path d="M4.7 8.3v9.9a2 2 0 0 0 2 2h10.6a2 2 0 0 0 2-2V8.3" />
      <path d="M10 13h4" />
    </>
  ),
  unarchive: (
    <>
      <rect x="3.5" y="4" width="17" height="4.2" rx="1.1" />
      <path d="M4.7 8.3v9.9a2 2 0 0 0 2 2h10.6a2 2 0 0 0 2-2V8.3" />
      <path d="M12 17.3v-6.4M9.3 13.6 12 10.9l2.7 2.7" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  sort: (
    <>
      <path d="M7.5 5v14" />
      <path d="M4.5 8 7.5 5 10.5 8" />
      <path d="M16.5 19V5" />
      <path d="M19.5 16 16.5 19 13.5 16" />
    </>
  ),
  edit: <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" />
    </>
  ),
  table: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.6" />
      <path d="M3.5 9.5h17" />
      <path d="M9.3 9.5v10" />
      <path d="M14.8 9.5v10" />
    </>
  ),
  braces: (
    <>
      <path d="M9 4.2c-1.8 0-2.8.9-2.8 2.8v2.5c0 1.3-.5 2.1-1.9 2.3v.4c1.4.2 1.9 1 1.9 2.3v2.5c0 1.9 1 2.8 2.8 2.8" />
      <path d="M15 4.2c1.8 0 2.8.9 2.8 2.8v2.5c0 1.3.5 2.1 1.9 2.3v.4c-1.4.2-1.9 1-1.9 2.3v2.5c0 1.9-1 2.8-2.8 2.8" />
    </>
  ),
  'log-out': (
    <>
      <path d="M9 4H6.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2H9" />
      <path d="M14.5 16l4-4-4-4" />
      <path d="M18.3 12h-10" />
    </>
  ),
  play: <path d="M7 4.5v15l13-7.5Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />,
  pause: (
    <>
      <rect x="6.5" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  reset: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 1 2.4 5.5" />
      <path d="M4.5 17.5v-5h5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 15v3.7a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8V15" />
    </>
  ),
  clipboard: (
    <>
      <rect x="9" y="3.2" width="6" height="3.2" rx="1" />
      <path d="M9 4.8H7.3A1.8 1.8 0 0 0 5.5 6.6v12.6a1.8 1.8 0 0 0 1.8 1.8h9.4a1.8 1.8 0 0 0 1.8-1.8V6.6a1.8 1.8 0 0 0-1.8-1.8H15" />
      <path d="M8.5 11h7M8.5 14.3h7M8.5 17.6h4.3" />
    </>
  ),
  ruler: (
    <>
      <rect x="2.5" y="8.5" width="19" height="7" rx="1.3" />
      <path d="M6.5 8.5v3M10 8.5v3M13.5 8.5v3M17 8.5v3" />
    </>
  ),
};

type IconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: IconName;
  /** Pixel size for width & height. Defaults to 20. */
  size?: number;
};

export function Icon({ name, size = 20, strokeWidth = 1.75, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
