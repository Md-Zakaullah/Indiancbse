# Northstar Academy — Supabase-backed school management app

This version uses Supabase Authentication + PostgreSQL with row-level security (RLS). It is a static frontend plus a hosted database/auth service, so it can be served by GitHub Pages or Vercel. Each signed-in account is restricted to its own school's records by database policies.

## Configure the backend (required before it can connect)

1. Create a Supabase project at https://supabase.com/dashboard.
2. In **SQL Editor**, run the full `supabase/schema.sql` file from this repository.
3. In **Project Settings → API**, copy the Project URL and the **publishable key** (or legacy anon key). Never use a `service_role`/secret key in browser code.
4. Edit `supabase-config.js` and replace the two placeholder values.
5. In **Authentication → URL Configuration**, add your deployed site URL to the allowed redirect URLs. For email/password registration, set up SMTP for production. You can keep email verification enabled; after verifying, sign in and create the school workspace.
6. Deploy `index.html`, `styles.css`, `app.js`, and `supabase-config.js` together. GitHub Pages supports the static UI; Supabase hosts the auth and database.

## Modules

Dashboard, student records, daily attendance, CBSE-style exam results, fees in INR, hostel allocation, staff, notices, CSV export. Create/read/update/delete requests are made against Supabase; data is not stored in localStorage.

## Security and production notes

- RLS is enabled on school and operational tables; users can only access records belonging to their school membership.
- The browser contains only the Supabase publishable/anon key. RLS—not secrecy of that key—protects the data. Never commit a service-role key.
- Use HTTPS, enable email verification, configure SMTP, and invite only trusted staff. This demo currently models one school workspace per account and gives workspace members the admin-level CRUD permissions; implement role-specific policies before giving different staff roles different privileges.
- This is a starter backend, not a fully audited school MIS. Before real student data, review privacy/legal obligations, backups, audit logging, retention, access controls, and payment workflows. Do not treat demo data as real records.

## Local testing

Serve the repository with any static server (for example `python -m http.server 8000`) and open `http://localhost:8000`. Configure the Supabase URL/key and add the local URL to Supabase's allowed URLs. Browser-only `file://` mode may restrict storage/auth behavior.
