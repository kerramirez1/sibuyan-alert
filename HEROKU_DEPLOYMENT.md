# Single-app Heroku deployment

The repository is configured as one npm workspace. Heroku builds the Vite
client, then starts the Express/Socket.IO server, which serves the generated
client from the same origin.

## Information required before the first deploy

1. A unique Heroku app name, for example `sibuyan-alert-testing`.
2. A production MongoDB connection string.
3. A new random JWT secret containing at least 32 characters.
4. SMTP credentials if password reset or responder invitations must work in the test deployment.
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

`CLIENT_URL` must be the public client address in any shared deployment — the
server builds emailed responder-invitation and password-reset links from it as
`<CLIENT_URL>/reset-password/<token>`. A `localhost` value passes the boot
check but produces links no recipient can open; the invitation endpoint then
refuses to send and tells the administrator to fix `CLIENT_URL`. Without
`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`, invitation and reset emails are not
attempted at all: responder accounts are still created (inert, no password)
and the admin UI keeps the "Resend invitation" retry for after SMTP is
configured. SMTP acceptance only means the mail server took the message — a
missing or filtered inbox delivery still requires the responder to check
spam/quarantine or the administrator to resend.

### Email deliverability

A message the mail server accepts can still be classified as junk. Two things
are worth knowing before blaming the code:

- **Do not send an invitation repeatedly to the same mailbox while testing.**
  Five near-identical messages carrying a credential-setting link inside 23
  minutes is a bulk-send signature, and it trains the recipient's filter against
  this sender for that mailbox — a reputation that outlives the test. Send once;
  use a separate test address or a provider sandbox if you need more.
- The sender is a `@gmail.com` account while the invitation link points at
  `<app-name>.herokuapp.com`. The From domain and the link domain do not match,
  and neither is a domain this project controls.

The durable fix is a transactional sender on a domain Sibuyan Alert controls:
SPF, DKIM and DMARC configured and aligned to that domain, the invitation link
served from the same domain, bounce and complaint tracking wired to a webhook,
and a gradual volume ramp on a sending subdomain. Do not spoof a Gmail address,
do not try to bypass recipient filters, and do not treat "ask users to whitelist
the sender" as the production answer.

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

Verify readiness before accepting reports:

```text
curl https://<app-name>.herokuapp.com/api/health
```

`boundaries.ready` must be `true` with a non-zero `count`. When `false`,
barangay auto-match is unavailable: interior pins still resolve via municipal
coverage boxes, but border/overlapping pins return `MUNICIPALITY_UNASSIGNED`
(400) for administrator review until the import completes.

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

One web dyno is appropriate for testing and MVP pilot. Without `REDIS_URL`,
rate limits (`server/middleware/rateLimiter.js`) and Socket.IO rooms are
in-process memory.

To scale out:

1. Provision Redis (e.g. `heroku addons:create heroku-redis:mini --app <app-name>`)
   and set `REDIS_URL` (Heroku sets it automatically for the addon).
2. Keep `WEB_CONCURRENCY=1` per dyno unless `REDIS_URL` is set — production
   refuses to boot with `WEB_CONCURRENCY > 1` and no `REDIS_URL`.
3. The server attaches the Socket.IO Redis adapter (`server/config/scaling.js`)
   and a shared `rate-limit-redis` store automatically when `REDIS_URL` is set.
   Required packages (`redis`, `rate-limit-redis`, `@socket.io/redis-adapter`)
   are already in `server/package.json`.
4. Enable session affinity so polling fallbacks stick to one dyno:

```text
heroku features:enable http-session-affinity --app <app-name>
```

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
