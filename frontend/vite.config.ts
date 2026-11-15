import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Emits a copy of the built index.html as app.html, marked noindex. The
 * pre-render step (scripts/prerender.mjs) replaces index.html with the static
 * landing page, so every app route (vercel.json rewrites) and the service
 * worker's offline fallback use app.html instead — a signed-in user never sees
 * landing-page markup before the app boots.
 */
function appShellHtml(): Plugin {
  return {
    name: 'benchbook-app-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') return;
      const source = String(index.source).replace(
        '</head>',
        '    <meta name="robots" content="noindex, nofollow" />\n  </head>',
      );
      this.emitFile({ type: 'asset', fileName: 'app.html', source });
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  // The SSR build (src/entry-server.tsx) only renders the public pages at
  // build time — it needs neither the PWA nor the app shell copy.
  plugins: isSsrBuild
    ? [react()]
    : [
        react(),
        appShellHtml(),
        VitePWA({
          // Prompt-to-reload: a new build waits and we surface a "reload" toast
          // (ReloadPrompt) rather than yanking someone reloaded mid-experiment.
          registerType: 'prompt',
          // EMERGENCY KILL-SWITCH. Off by default (normal offline PWA). To un-stick
          // everyone from a bad service worker, set the PWA_SELF_DESTROY=true build
          // env var (e.g. a Vercel Environment Variable) and redeploy: this ships a
          // worker that unregisters itself, clears caches, and reloads clients. No
          // code edit needed under pressure. Unset it + redeploy to restore. See
          // the "Service worker / PWA" note in CLAUDE.md.
          selfDestroying: process.env.PWA_SELF_DESTROY === 'true',
          // We register + surface updates via useRegisterSW ourselves.
          injectRegister: false,
          includeAssets: ['favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png'],
          manifest: {
            name: 'Benchbook',
            short_name: 'Benchbook',
            description: 'Turn protocols into reproducible experiments.',
            theme_color: '#6366f1',
            background_color: '#ffffff',
            display: 'standalone',
            scope: '/',
            // "/" is the public landing page; the installed app opens the
            // dashboard (RequireAuth sends signed-out users to /login).
            start_url: '/dashboard',
            categories: ['productivity', 'medical', 'education'],
            icons: [
              { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
              {
                src: 'pwa-maskable-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
          },
          workbox: {
            // Precache the built app shell so the app opens with zero network. The
            // Phase-1 TanStack cache handles the *data* — together = offline cold
            // start on a lab tablet.
            globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
            // The 489 KB universities list is lazy-loaded on onboarding only — keep
            // it out of the up-front precache; cache it on demand below instead.
            // index.html becomes the pre-rendered landing page after this build,
            // so only the app.html shell is precached.
            globIgnores: ['**/universities.json', 'index.html'],
            navigateFallback: 'app.html',
            navigateFallbackDenylist: [/^\/api/],
            cleanupOutdatedCaches: true,
            maximumFileSizeToCacheInBytes: 3_500_000,
            runtimeCaching: [
              {
                urlPattern: /universities\.json$/,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'benchbook-universities',
                  expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 30 },
                },
              },
            ],
          },
          // Never run the service worker in `npm run dev` — it caches stale assets
          // and makes HMR miserable.
          devOptions: { enabled: false },
        }),
      ],
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: isSsrBuild
      ? {}
      : {
          output: {
            // Split the two big libraries off into their own chunks. The Statistics
            // page is the only consumer of Recharts, so it can stream in lazily;
            // @supabase is loaded on every page but rarely changes. Cleaner cache
            // behaviour for repeat visits.
            manualChunks: {
              recharts: ['recharts'],
              supabase: ['@supabase/supabase-js'],
            },
          },
        },
  },
}));
