# Architecture

## High-level design

The application uses a frontend SPA architecture with Supabase as BaaS.

- Presentation layer: route-driven page modules and reusable components
- Application layer: client-side services (`auth`, `session`, `catalog`, `i18n`, `storage`)
- Data layer: Supabase Postgres + Auth + Storage + Edge Functions
- Delivery layer: Netlify static hosting and redirect-based SPA routing

## Frontend structure

- `src/main.js` starts app bootstrap.
- `src/app.js` handles rendering lifecycle and auth-aware route guard checks.
- `src/router/routes.js` centralizes routes and required roles.
- `src/pages/*` contains feature pages with `render` and `afterRender` behavior.
- `src/components/*` contains shared UI shell components (header/footer).

## Security model

- Authentication is handled by Supabase Auth.
- Authorization is role-based through `public.user_roles`.
- Row-level security policies restrict writes and sensitive reads by owner/role.
- Helper functions (`has_role`, `has_any_role`) are used by RLS policies.

## Server-side logic

Edge Functions under `supabase/functions` implement privileged workflows:

- `book-guest`: create/update bookings, create users when needed, notify by email
- `create-user`: admin-managed user creation flow
- `delete-user`: admin-managed user deletion flow

## Routing model

- Browser URL paths are normalized and matched to lazy-loaded route modules.
- Unknown paths resolve to the home route.
- Netlify rewrite rule (`/* -> /index.html`) supports direct deep links.

## Internationalization

- Translation dictionary and locale functions are in `src/services/i18n.js`.
- Pages/components call `translateRoot` after rendering.
