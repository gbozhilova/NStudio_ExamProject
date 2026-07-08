Build only with Vite, Node.js, npm, HTML, CSS, JavaScript, Bootstrap, and Supabase.
Do not introduce TypeScript, React, Vue, or a SPA framework.
Keep the app multipage with separate files for screens and reusable UI fragments.
Use clean URLs without hashes.
Use HTML fragments for shared UI like header and footer.
Put each major UI component in its own folder with separate HTML, CSS, and JS files when reasonable.
Use Supabase Auth for register, login, logout, and session handling.
Use user_roles plus RLS for customer versus staff/admin access control.
Keep schema changes in Supabase migrations and commit them to the repo.
Use Supabase Storage for product and profile images/files.
Keep the code modular, readable, and split into pages, components, services, styles, and utilities.
Favor small, testable increments and validate often.
Keep the waiting-time product discovery flow simple and conversion-focused in v1.
Target Netlify deployment with routing support for direct URL visits and refreshes.
Be concise, pragmatic, and consistent with the existing file structure.