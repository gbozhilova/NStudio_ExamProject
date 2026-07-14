# Development Workflow

## Vision at a glance

NStudio Burgas is being built as the digital operating system of a real salon business, combining operations, customer engagement, and future personalization in one platform.

Contributor priorities:

- Keep booking, catalog, and staff workflows simple and reliable for non-technical users.
- Build features that support personalization through quizzes and customer preference signals.
- Preserve a growth-ready design so new categories (including future bioenergy sessions) can be added without major rewrites.
- Prefer changes with measurable business impact (occupancy, repeat bookings, basket size, loyalty).

## Daily loop

1. Pull latest changes from main branch.
2. Create a feature/fix branch.
3. Run local server (`npm run dev`).
4. Implement changes in focused modules.
5. Run production build check (`npm run build`).
6. Open a PR with screenshots and testing notes.

## Change guidelines

- Keep edits scoped to one feature area when possible.
- Prefer shared styles/variables over one-off overrides.
- Maintain route/page modular boundaries.
- Keep Supabase changes in migrations, not manual dashboard edits.

## Data and auth workflow

- Frontend reads/writes through `src/services/*` wrappers.
- Role-aware behavior should be enforced in both UI guards and RLS policies.
- For privileged operations, use Supabase Edge Functions.

## Testing checklist

- Build passes without errors.
- Route navigation works for deep links and browser back/forward.
- Login and role-based route access work as expected.
- Core booking flow completes including slot selection and confirmation.
- Admin actions behave correctly for authorized users.

## Deployment workflow

- Keep site linked to the intended repository.
- Ensure Netlify env vars are set before deploy.
- Deploy to production and verify bundle hash update.
- Validate key pages and one protected route on live URL.

## Documentation workflow

When architecture, schema, or folder layout changes:

1. Update docs in `docs/` in the same PR.
2. Keep `README.md` links accurate.
3. Include migration references for schema-impacting changes.
