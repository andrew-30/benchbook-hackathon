// Regenerates `public/universities.json` from the open world-universities
// dataset (the same data that backs the Hipolabs API), self-hosted so no
// flaky third-party call sits on the onboarding path.
//
// Output is a compact array of [name, country] tuples (no repeated object
// keys), deduped and sorted by name — small enough to lazy-load client-side
// and filter in the browser.
//
// Run from the frontend package root:  node scripts/build-universities.mjs
import { writeFileSync } from 'node:fs';

const SOURCE =
  'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json';

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
const raw = await res.json();

const seen = new Set();
const out = [];
for (const u of raw) {
  if (!u.name || !u.country) continue;
  const key = `${u.name}|${u.country}`;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push([u.name.trim(), u.country.trim()]);
}
out.sort((a, b) => a[0].localeCompare(b[0]));

const dest = new URL('../public/universities.json', import.meta.url);
writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${out.length} universities to public/universities.json`);
