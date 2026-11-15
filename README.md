# Benchbook

> Every experiment. Perfectly recorded.

Benchbook is an experiment execution platform for PhD students, postdocs and
independent researchers. Import a protocol you already have (Word, PDF or
pasted text) and AI turns it into structured, runnable steps. Run it at the
bench with timers, checklists and measurement capture. Afterwards, Benchbook
writes up a publication-style methods paragraph from what actually happened,
including reagent lot numbers, deviations and run-to-run statistics.

## Live demo

**https://www.benchbook.app**

| | |
|---|---|
| Email | `DEMO_EMAIL` |
| Password | `DEMO_PASSWORD` |

The demo account already has protocols, reagents and completed runs. It is
shared by all judges, so please don't change its password or delete it. You can
also sign up with your own account (Google sign-in is instant). Everything is
free.

A read-only shared run that needs no login: SHARE_LINK

## Try it in 3 minutes

1. **Dashboard:** recent runs, expiring reagents and activity at a glance.
2. **Protocols → BCA Protein Assay:** structured steps with sections, timers
   and the measurements to capture.
3. **Start experiment:** the full-screen execution mode. Tick off materials
   (with lot numbers), step through with live timers, enter measurements and
   flag a deviation.
4. **Runs → any completed run → Generate methods:** AI writes a methods
   paragraph from the run record. **Download PDF** exports the full record.
5. **Statistics:** variance of each measurement across repeated runs.
6. **Import:** upload any file from [`demo/`](./demo) (or paste your own
   protocol) and watch it become a structured protocol.

## Features

- **AI protocol import:** `.docx`, `.pdf`, `.txt` or pasted text is extracted
  into sections, steps, timers, measurement fields and a materials checklist.
  A document containing several procedures is split into separate protocols,
  and each one gets only the materials it uses.
- **Guided execution:** step-by-step run mode with timers, measurement entry
  with tolerance checks, deviation flagging and offline support (installable
  PWA).
- **Reagent library:** manufacturer, catalogue and lot numbers, with expiry
  tracking and warnings when an expired reagent is used in a run.
- **Methods generator:** turns a completed run into publication-ready methods
  prose, using pre-computed statistics and the reagents that were actually
  ticked.
- **Statistics and reproducibility:** measurement variance across runs of the
  same protocol.
- **Sharing and export:** expiring public share links, client-side PDF export,
  and CSV/XLSX export.

## Architecture

```
React 18 + Vite (TanStack Query, Recharts, @react-pdf/renderer, PWA)
        │  Supabase session JWT (Bearer)
        ▼
Express + TypeScript on Vercel serverless (Zod, Helmet, rate limiting)
        │  per-user Supabase client  →  Row Level Security does access control
        ▼
Supabase Postgres + Auth          Anthropic Claude (structured outputs)
```

- **Security:** every request is authenticated, and data access runs through
  the user's own token, so Postgres RLS policies enforce isolation. The service
  key is used only for intentionally public endpoints.
- **AI cost controls:** inputs are hard-capped (4 MB, 20 PDF pages, 40k
  characters) and rejected, never silently truncated, before any model call. On
  top of that: a per-user rate limit, a rolling 24 h quota, a content-hash
  cache so re-importing the same document costs nothing, and a global
  kill-switch that takes effect without a redeploy.
- **Structured outputs:** import extraction is constrained to a JSON schema.
  The methods generator caches its static rules with prompt caching.
- **SEO:** public pages are pre-rendered at build time. App routes are served
  from a separate noindex shell.

```
frontend/             React app (Vite), pre-render scripts, Vercel edge function for share previews
backend/              Express API, AI import + methods generation, migrations runner
supabase/migrations/  Numbered SQL migrations (schema, RLS, grants, rate limits, AI controls)
demo/                 Sample protocols for trying the import
```

## Running locally

Prerequisites: Node 20+, a Supabase project and an Anthropic API key.

```bash
cd backend  && npm install
cd ../frontend && npm install

cp .env.example backend/.env     # fill in Supabase + Anthropic values
cp .env.example frontend/.env

cd backend && npm run migrate    # applies supabase/migrations/*.sql

cd backend  && npm run dev       # http://localhost:3000
cd frontend && npm run dev       # http://localhost:5173 (proxies /api)
```

---

Source shared for hackathon judging only. © Benchbook. All rights reserved; no
license is granted to use, copy, modify or distribute this code.
