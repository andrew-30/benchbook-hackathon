// Generates the PWA / home-screen icon set from the app's flask mark, so the
// installed app is branded consistently with the in-app logo. Run from the
// frontend package root:  node scripts/gen-pwa-icons.mjs
//
// Outputs into public/:
//   pwa-192x192.png, pwa-512x512.png      — standard "any" icons (rounded)
//   pwa-maskable-512x512.png              — full-bleed for Android adaptive masks
//   apple-touch-icon.png (180)            — iOS home screen
//   favicon-32x32.png, favicon.svg        — browser tab
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const INDIGO = '#6366f1';

// The flask glyph from src/components/Icon.tsx, on a 24-unit grid.
const FLASK = `
    <g fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 3h6"/>
      <path d="M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/>
      <path d="M7.5 14h9"/>
    </g>`;

/** Indigo square (rounded for "any", full-bleed for maskable) + centered flask. */
function iconSvg({ size, scale, radius, strokeW }) {
  const glyph = size * scale;
  const off = (size - glyph) / 2;
  const bg =
    radius > 0
      ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${INDIGO}"/>`
      : `<rect width="${size}" height="${size}" fill="${INDIGO}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg}
    <g transform="translate(${off} ${off}) scale(${glyph / 24})" stroke-width="${strokeW}">${FLASK}
    </g>
  </svg>`;
}

async function png(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(OUT, file));
  console.log('wrote', file);
}

// "any" purpose — rounded square, flask ~52%
await png(iconSvg({ size: 512, scale: 0.52, radius: 112, strokeW: 1.6 }), 512, 'pwa-512x512.png');
await png(iconSvg({ size: 192, scale: 0.52, radius: 42, strokeW: 1.6 }), 192, 'pwa-192x192.png');
// maskable — full bleed, flask ~44% (inside Android's ~80% safe zone)
await png(iconSvg({ size: 512, scale: 0.44, radius: 0, strokeW: 1.7 }), 512, 'pwa-maskable-512x512.png');
// apple touch — iOS applies its own rounding; full square bg
await png(iconSvg({ size: 180, scale: 0.52, radius: 0, strokeW: 1.6 }), 180, 'apple-touch-icon.png');
// favicon
await png(iconSvg({ size: 32, scale: 0.6, radius: 7, strokeW: 1.9 }), 32, 'favicon-32x32.png');
writeFileSync(join(OUT, 'favicon.svg'), iconSvg({ size: 32, scale: 0.6, radius: 7, strokeW: 1.9 }));
console.log('wrote favicon.svg');
