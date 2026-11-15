/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        success: '#16a34a',
        warning: '#d97706',
        danger: '#dc2626',
        // Modern Confident palette. Crisp near-white ground; white cards are
        // separated by a soft lilac hairline (`line`) rather than by a warm
        // canvas. `ink` / `muted` are chosen neutrals with a faint indigo bias,
        // not flat greys.
        canvas: '#ffffff',
        ink: '#17132a',
        muted: '#6f6b81',
        line: '#ece7f2',
      },
      borderRadius: {
        // Rounder, airier cards.
        card: '20px',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Serif display face for headings — the editorial voice of the
        // Modern Confident direction. Georgia ships on every platform, so no
        // webfont/CDN dependency (which the CSP would block anyway).
        display: ['Georgia', 'Iowan Old Style', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};
