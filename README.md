# T2W Cloud + Supabase edition

This is the hosted edition of the T2W Pipeline Master Asset Register.

It keeps the existing T2W browser interface and business logic, but replaces the local SQLite file with Supabase PostgreSQL and Supabase Auth. The Node/Express application runs in a Cloudflare Container and sessions are stored in PostgreSQL, so the application does not depend on one laptop remaining switched on.

## Included in this build

* Six independent crew progress tracks across PHW and PWG.
* Plant and labour inside each crew tab.
* Plant and labour dropdowns populated from previous days, rate tables and standing resources.
* Crew-specific carry forward from the latest previous day.
* Save day button below Safety and Hold Points.
* Existing completed ground protected as baseline coverage, preventing a new crew entry from reducing previously earned value.
* Point assets are marked complete before daily earnings are calculated.
* PostgreSQL transactions around end of day writes.
* Supabase Auth with admin, editor and viewer roles.
* PostgreSQL-backed web sessions.
* Admin user management.
* Admin project reset back to the saved baseline.
* Cloudflare Container deployment files.
* Automatic database migration and first-run source seed.
* Power BI reporting views.

## First deployment

Read `SETUP_WINDOWS.md`. The short version is:

```powershell
npm install
npm run verify
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put T2W_SESSION_SECRET
npx wrangler secret put T2W_ADMIN_PASS
npm run deploy
```

On the first start, the app automatically applies the Supabase migrations and loads the clean packaged T2W baseline when the database contains no T2W assets.

## Database commands

For a local/manual database setup:

```powershell
npm run db:migrate
npm run db:setup
```

To deliberately reload the packaged source data and create a clean baseline:

```powershell
npm run db:reload
```

Do not use `db:reload` against a live project unless you genuinely intend to replace its runtime data.

## Security model

The browser never receives the Supabase secret key or database password. The Node server holds those values as Cloudflare secrets. Direct Data API access to the T2W tables is revoked from Supabase `anon` and `authenticated` roles. Users authenticate through Supabase Auth, while application authorization is enforced by the T2W server roles.

## Main files

```text
Dockerfile
wrangler.jsonc
src/worker.mjs
server/db.js
server/auth.js
server/index.js
server/routes.js
server/engine.js
server/crews.js
server/admin.js
server/admin-routes.js
server/migrate.js
server/seed-postgres.js
supabase/migrations/*.sql
public/admin.html
public/end-of-day.html
SETUP_WINDOWS.md
```
