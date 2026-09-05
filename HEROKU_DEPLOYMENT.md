# Single-app Heroku deployment

The repository is configured as one npm workspace. Heroku builds the Vite
client, then starts the Express/Socket.IO server, which serves the generated
client from the same origin.

## Information required before the first deploy

1. A unique Heroku app name, for example `sibuyan-alert-testing`.
2. A production MongoDB connection string.
3. A new random JWT secret containing at least 32 characters.
4. SMTP credentials if password reset must work in the test deployment.
5. A VAPID key pair if browser push notifications must work.
6. Seed JSON for municipal administrators and responders when using a fresh
   database.

Never commit these values. Store them as Heroku config vars.

## Required config vars

```text
MONGODB_URI
JWT_SECRET
CLIENT_URL=https://<app-name>.herokuapp.com
```

Heroku sets `NODE_ENV=production` and `PORT` automatically. Do not set `PORT`.
For a combined deployment, leave `VITE_API_URL` and `VITE_SOCKET_URL` unset so
the client uses `/api` and the current HTTPS origin.

## Feature-specific config vars

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS

VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_EMAIL
VITE_VAPID_PUBLIC_KEY

SEED_MUNICIPAL_ADMINS_JSON
SEED_RESPONDER_ACCOUNTS_JSON
SEED_LEGACY_EMAILS_JSON
```

`VITE_VAPID_PUBLIC_KEY` is embedded during the client build and must be set
before deploying. It must exactly match `VAPID_PUBLIC_KEY`. The private VAPID
key remains server-only. After deployment, a signed-in user enables browser
notifications explicitly from **Profile Settings**; the application never
opens a permission prompt without a user action.

## Fresh database preparation

The verified barangay polygons are persisted in MongoDB and are not included
in the public web bundle. Before testing location verification against a fresh
database, run the boundary import from `server/` using the same production
`MONGODB_URI`:

```text
npm run import:barangay-boundaries
```

The local source file must exist at
`server/data/psa-georisk-sibuyan-barangays.geojson`, or
`SIBUYAN_BOUNDARIES_FILE` must identify its absolute path.

## Deploy and verify

```text
heroku create <app-name>
heroku config:set MONGODB_URI="..." JWT_SECRET="..." CLIENT_URL="https://<app-name>.herokuapp.com" --app <app-name>
git push heroku main
heroku logs --tail --app <app-name>
```

After deployment, verify:

```text
https://<app-name>.herokuapp.com/
https://<app-name>.herokuapp.com/api/health
```

The health endpoint returns HTTP 200 only after MongoDB is connected. Test a
direct client route such as `/login`, an API request, a media URL, and a live
Socket.IO update before sharing the deployment. For Web Push, enable browser
notifications in Profile Settings and use **Send test**. Confirm delivery and
that clicking it opens `/profile`; then repeat with the application tab closed.
Browser push requires HTTPS, which Heroku provides.

## Scaling note (MVP: 1 dyno)

One web dyno is appropriate for testing and MVP pilot. Rate limits
(`server/middleware/rateLimiter.js`) and Socket.IO rooms are in-process memory.
Before scaling to multiple web dynos, add a shared store such as Redis
(`REDIS_URL`) for rate limiting + a Socket.IO adapter, and configure Heroku
session affinity.

## Dependency security status

The root `package-lock.json` is the authoritative lockfile for the client and
server workspaces. Do not recreate nested workspace lockfiles because they can
retain stale packages and produce misleading deployment audit results.

The deprecated npm `xlsx` package was removed. Analytics are exported as an
Excel-compatible UTF-8 CSV with spreadsheet-formula neutralization and stable
columns for empty datasets.

The vulnerable React Router dependency chain was removed. Client navigation
now uses a small Wouter-backed compatibility layer that validates every
programmatic target as an internal absolute path. Routing, role protection,
redirect handling, and direct-route behavior are covered by regression tests.

Legacy ESLint/Jest dependency chains were replaced by Oxlint and Vitest. Both
the complete dependency audit and the production-only audit report zero known
vulnerabilities as of July 28, 2026.
