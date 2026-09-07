# T2W Cloud setup on Windows

This edition is built for Supabase PostgreSQL and Supabase Auth, with the existing Node/Express T2W application running in a Cloudflare Container.

The database schema and the original T2W CSV data are packaged with the app. On the first Cloudflare start, T2W automatically applies the database migrations, loads a clean project baseline if the database is empty, and creates the first administrator account.

## 1. Create the Supabase project

Sign in to Supabase and create a new project. Use a name such as `T2W Production` and choose the closest Australian region available to you.

Keep the database password somewhere secure. You will need it only for the database connection string.

In the Supabase project, collect these four values:

1. Project URL, saved as `SUPABASE_URL`.
2. Publishable API key, saved as `SUPABASE_PUBLISHABLE_KEY`.
3. Secret API key, saved as `SUPABASE_SECRET_KEY`.
4. PostgreSQL Session pooler connection string, saved as `DATABASE_URL`.

Use the Session pooler connection string on port 5432. It is the appropriate connection mode for a persistent backend such as the T2W Node container. Copy the complete connection string from Supabase's Connect dialog rather than typing it manually.

Do not put the secret API key or database connection string into source files.


## Fast path: guided deployment script

If you prefer, after creating the Supabase project and collecting its four values, run this from PowerShell in the T2W folder:

```powershell
.\scripts\deploy-cloudflare.ps1
```

The script checks Node and Docker, verifies the build, signs you in to Cloudflare if necessary, securely prompts for the six Cloudflare secrets and deploys the app. It does not write those secret values into the source folder.

## 2. Install the two programs needed on your Windows PC

Install Node.js 22 LTS or later and Docker Desktop.

After Docker Desktop starts, open PowerShell and check:

```powershell
node --version
docker info
```

Both commands need to succeed before the first Cloudflare deployment.

## 3. Open the T2W folder

Extract `T2W_Cloud_Supabase.zip`, then open PowerShell in the extracted `T2W_WebApp` folder.

Run:

```powershell
npm install
npm run verify
```

The verification command checks the Node files and confirms the crew plant/labour, Save day placement, historical dropdown and negative-profit protection are present.

## 4. Sign in to Cloudflare from Wrangler

Cloudflare Containers require the Workers Paid plan. In PowerShell run:

```powershell
npx wrangler login
```

Your browser opens. Approve the Cloudflare connection and return to PowerShell.

## 5. Add the six production secrets to Cloudflare

Run each command separately. Wrangler asks you to paste the value without writing it into the source code.

```powershell
npx wrangler secret put DATABASE_URL
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put T2W_SESSION_SECRET
npx wrangler secret put T2W_ADMIN_PASS
```

For `T2W_SESSION_SECRET`, use a long random value. For `T2W_ADMIN_PASS`, choose the password you want to use for the first T2W administrator login.

The first username is `admin`. You can change the non-secret username and display name in `wrangler.jsonc` before deployment if you want.

## 6. Deploy T2W

Run:

```powershell
npm run deploy
```

Wrangler builds the Docker image, uploads it to Cloudflare and deploys the Worker that routes requests to the T2W container.

The first Container deployment can take several minutes before it is ready.

Check its state with:

```powershell
npx wrangler containers list
```

Wrangler prints the `workers.dev` address during deployment. Open that address in your browser.

## 7. What happens automatically on the first start

T2W connects to Supabase, applies every SQL file in `supabase/migrations`, loads the original asset register, rates and project setup if the database is empty, clears runtime progress for the production baseline, saves that baseline for future resets, and creates the first administrator in Supabase Auth.

The source project setup is retained. Runtime day records start clean.

## 8. Sign in and create the other users

Open the T2W site and sign in with:

```text
Username: admin
Password: the value you used for T2W_ADMIN_PASS
```

Open `Admin` in the top menu. From there you can create users with one of three roles:

* Administrator: full access including users and project reset.
* Editor: normal field entry and editing.
* Viewer: read only.

Each user is created in Supabase Auth and gets a matching T2W profile.

## 9. Project reset

The Admin page contains `Reset project progress`.

It requires typing `RESET` before the button enables. It clears daily progress, crew movement, plant and labour, safety, hold points and profit records, then restores the saved project baseline. Asset register, rates, drawings, project setup and user accounts remain.

This is the safe way to repeat testing without rebuilding the database.

## 10. Custom domain

The `workers.dev` address is enough for testing.

When you are ready for a permanent address, add a custom domain to the deployed Worker in Cloudflare. A typical result would be something such as `t2w.yourdomain.com`. Cloudflare manages HTTPS for the Worker route.

## 11. Local Cloudflare testing before a production deploy

Copy `.dev.vars.example` to `.dev.vars` and enter test Supabase credentials. Never commit `.dev.vars`.

Then run:

```powershell
npm run dev:cloudflare
```

This runs the Worker and Container locally through Wrangler. Use a separate Supabase development project if you want complete separation from production data.

## 12. Updating T2W later

When the code changes, leave the Supabase database in place and run:

```powershell
npm install
npm run verify
npm run deploy
```

Cloudflare rolls out the new application image. Existing project records remain in Supabase.

New database changes are added as numbered SQL migrations, so the app can upgrade the schema without wiping production data.

## 13. Power BI

The migration creates these reporting views:

```text
rpt_daily_profit
rpt_daily_progress
rpt_crew_plant_labour
rpt_asset_status
rpt_safety
```

Power BI can connect to the Supabase PostgreSQL database using a database account with read-only access to these views. Do not use the T2W Supabase secret API key inside a Power BI report.

## 14. Troubleshooting

If deployment says Docker is unavailable, open Docker Desktop and wait until its engine reports Running.

If the site shows a database error, recheck `DATABASE_URL` and use the Supabase Session pooler URL.

If login fails on the first start, inspect Cloudflare logs and confirm both Supabase API keys and `T2W_ADMIN_PASS` were set before deploying.

If you change a Cloudflare secret, redeploy or restart the container so a new instance receives the changed environment value.
