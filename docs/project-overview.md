# Project Overview

## Purpose

NStudio is a salon management and customer experience application that combines:

- Public catalog browsing (services/products)
- Guided booking flow with staff/time slot selection
- Customer profile and booking history
- Staff/admin operations (calendar, customers, content management)

## Business context

NStudio Burgas is a real beauty salon business.

- Current service categories are Hair, Nail, Make Up, and Massages.
- Hair services are provided by two hairdressers.
- The owner plans to expand the service portfolio with bioenergy sessions.
- The salon also sells beauty products from multiple brands.

The app is intended to support the owner and colleagues in managing:

- Service catalogs
- Product catalogs
- Booking operations

The roadmap includes gamification through dedicated quizzes that target personal customer preferences for products and services.

## Vision

NStudio Burgas will become the digital operating system of the salon, helping the business deliver personalized service at scale while keeping daily work simple for the owner and team.

The platform will unify service and product catalog management, booking operations, and customer engagement in one place. It will support current core categories and remain flexible for expansion into new offerings, including bioenergy sessions.

Beyond operations, NStudio will evolve into a guided customer experience engine. Through gamified quizzes and preference-driven insights, the app will help match each customer with the most relevant services and products to improve satisfaction, retention, and revenue.

## Strategic direction

1. Operational excellence first: keep booking, catalog, and staff workflows reliable and easy for non-technical salon users.
2. Personalization second: use customer data and quiz responses to drive better service and product recommendations.
3. Growth-ready platform: design data and features so new categories, staff roles, and engagement mechanics can be added without major rewrites.
4. Measurable business impact: prioritize improvements in occupancy, repeat bookings, basket size, and loyalty.

## Core capabilities

- Multi-page SPA navigation with clean URLs
- Role-aware access control (`customer`, `staff`, `admin`)
- Booking lifecycle with status management
- Product reviews and media support
- Contact/messages and quiz/recommendation features

## Runtime model

- Frontend renders pages dynamically via route modules.
- Supabase is the single backend for auth, data, storage, and RPCs.
- Netlify serves static assets and handles SPA fallback routing.

## Key integration points

- Supabase client initialization: `src/services/supabase.js`
- App bootstrap and router rendering: `src/app.js`
- Route definitions and guards: `src/router/routes.js`
- Server-side booking orchestration: `supabase/functions/book-guest/index.ts`

## Non-functional goals

- Clear role boundaries via RLS policies
- Predictable deployment behavior with immutable build assets
- Readable, modular front-end page/component structure
