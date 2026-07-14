# Setup Guide

## Prerequisites

- Node.js 18+
- npm 9+
- Supabase project (URL + anon key)
- Optional: Netlify CLI for deploy operations

## 1) Install dependencies

```bash
npm install
```

## 2) Configure environment

Create `.env` in project root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 3) Run locally

```bash
npm run dev
```

Default local URL is configured in `vite.config.js`.

## 4) Production build test

```bash
npm run build
npm run preview
```

## 5) Supabase schema setup

Apply migrations in order from `supabase/migrations` using your preferred Supabase workflow.

Recommended flow:

- Run all schema migrations
- Run seed migrations only for non-production/demo data
- Verify required storage buckets and RLS policies

## 6) Netlify setup

`netlify.toml` already defines:

- Build command: `npm run build`
- Publish directory: `dist`
- SPA rewrite: `/* -> /index.html`

Set Netlify environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 7) Smoke checklist

- Open `/`, `/services`, `/booking`, `/login` directly (deep links)
- Validate login/logout
- Validate role-protected routes (`/admin`, `/calendar`)
- Validate booking and catalog read paths
