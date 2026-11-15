// Generates public/og-image.png (1200×630) — the link-preview image used by
// every public page. Run manually after changing the design:
//   node scripts/gen-og-image.mjs
// The PNG is committed, so builds don't depend on local fonts.
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'og-image.png');

const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8eaff"/>
      <stop offset="55%" stop-color="#f5f5ff"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1060" cy="90" r="220" fill="#6366f1" opacity="0.08"/>
  <circle cx="1120" cy="560" r="160" fill="#6366f1" opacity="0.06"/>

  <rect x="96" y="96" width="104" height="104" rx="26" fill="#6366f1"/>
  <g transform="translate(116 116) scale(2.7)" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 3h6"/>
    <path d="M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/>
    <path d="M7.5 14h9"/>
  </g>
  <text x="228" y="168" font-family="${font}" font-size="56" font-weight="700" fill="#1e1b3a">Benchbook</text>

  <text x="96" y="318" font-family="${font}" font-size="64" font-weight="700" fill="#1e1b3a">Turn laboratory protocols</text>
  <text x="96" y="398" font-family="${font}" font-size="64" font-weight="700" fill="#4f46e5">into reproducible experiments</text>

  <text x="96" y="480" font-family="${font}" font-size="30" fill="#55516e">Guided runs · Measurements captured · Reagent lots tracked</text>
  <text x="96" y="560" font-family="${font}" font-size="28" font-weight="600" fill="#6366f1">benchbook.app</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
const meta = await sharp(out).metadata();
console.log(`wrote ${path.relative(root, out)} (${meta.width}×${meta.height})`);
