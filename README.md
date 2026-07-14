# NStudio Exam Project

A single-page beauty salon web application built with Vite, Bootstrap, and Supabase.

## Business context

NStudio Burgas is a real beauty salon business.

- The salon currently maintains these service categories: Hair, Nail, Make Up, and Massages.
- Hair services are provided by two hairdressers.
- The owner plans to expand the portfolio with bioenergy sessions.
- The salon also sells beauty products from multiple brands.

The app is designed to support day-to-day salon operations so the owner and colleagues can:

- Manage service and product catalogs
- Manage booking operations
- Extend the product in future with gamification and dedicated quizzes

The planned quiz module will target personal customer preferences and improve product/service recommendations.

## Vision

NStudio Burgas will become the digital operating system of the salon, helping the business deliver personalized service at scale while keeping daily work simple for the owner and team.

The platform will unify service and product catalog management, booking operations, and customer engagement in one place. It will support current core categories and remain flexible for expansion into new offerings, including bioenergy sessions.

Beyond operations, NStudio will evolve into a guided customer experience engine. Through gamified quizzes and preference-driven insights, the app will help match each customer with the most relevant services and products to improve satisfaction, retention, and revenue.

## Strategic direction

1. Operational excellence first: keep booking, catalog, and staff workflows reliable and easy for non-technical salon users.
2. Personalization second: use customer data and quiz responses to drive better service and product recommendations.
3. Growth-ready platform: design data and features so new categories, staff roles, and engagement mechanics can be added without major rewrites.
4. Measurable business impact: prioritize improvements in occupancy, repeat bookings, basket size, and loyalty.

## What is in this repository

- Public pages: home, services, products, booking, contact
- Authentication and profile pages
- Staff/admin pages: calendar, customers, admin panel
- Supabase schema migrations and Edge Functions
- Netlify deployment configuration

## Tech stack

- Frontend: Vite, vanilla JavaScript modules, Bootstrap 5, Bootstrap Icons
- Backend services: Supabase Auth, Postgres, Storage, Edge Functions
- Hosting: Netlify

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` in project root:

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Build and preview production:

   ```bash
   npm run build
   npm run preview
   ```

## Documentation index

- [Project Overview](docs/project-overview.md)
- [Architecture](docs/architecture.md)
- [Schema Guide](docs/schema.md)
- [Folder Map](docs/folder-map.md)
- [Setup Guide](docs/setup-guide.md)
- [Development Workflow](docs/development-workflow.md)

## Deployment notes

- Netlify config is defined in `netlify.toml`.
- Required Netlify environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

