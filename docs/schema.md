# Schema Guide

## Database ownership

Supabase Postgres schema is managed through SQL migrations in `supabase/migrations`.

## Primary entities

### Identity and roles

- `auth.users`: managed by Supabase Auth
- `public.user_roles`: role assignments (`customer`, `staff`, `admin`)
- `public.profiles`: user profile data

### Catalog

- `public.categories`: canonical categories used by services/products
- `public.services`: service catalog
- `public.products`: product catalog

### Booking domain

- `public.bookings`: booking header record
- `public.booking_services`: many-to-one service lines per booking
- `public.booking_blocks`: blocked schedule intervals
- `public.get_available_slots(...)`: slot calculation RPC
- `public.get_staff_list()`: available staff lookup RPC

### Engagement domain

- `public.messages`: customer to admin/staff communication
- `public.quiz_questions`: quiz setup
- `public.quiz_answers`: user answers
- `public.product_recommendations`: recommendation outputs
- `public.favorites`: saved user items
- `public.product_reviews`: review records
- `public.product_review_images`: review image references

## Storage buckets

Migration policies define buckets and access rules for:

- `product-images`
- `profile-images`
- `message-images`
- `booking-files`
- `category-images`
- `product-review-images`

## Integrity and lifecycle conventions

- UUID keys for major entities
- Trigger-driven `updated_at` refresh via `set_updated_at`
- Check constraints for status, quantity, and role/value boundaries
- Unique constraints on role memberships and key relationship pairs

## Migration workflow

- Migrations are timestamped and additive.
- Historical migrations include seed scripts for demo/test users and data.
- Keep schema changes in SQL migrations only, never as manual ad hoc edits.
