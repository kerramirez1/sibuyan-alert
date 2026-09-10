# Sibuyan Alert 🚨

Road Accident Alert and Mapping System for Sibuyan Island, Romblon. Citizens report road accidents; municipal admins and MDRRMO responders verify, dispatch, and track them in real time on operational maps.

A React 18 + Vite frontend with MapLibre GL operational maps, Socket.IO real-time coordination, and HttpOnly session authentication.

## Tech Stack

| Layer    | Technologies |
|----------|--------------|
| Client   | React 18, Vite, Tailwind CSS, MapLibre GL (self-hosted PMTiles), Socket.IO client, wouter, Vitest + Testing Library |
| Server   | Node.js, Express, Socket.IO, MongoDB (Mongoose + GridFS), JWT sessions, Web Push, Vitest + Supertest |
| Deploy   | Heroku (single dyno serves both API and built SPA) |

## Project Structure

```
├── client/               # Vite + React SPA
│   └── src/
│       ├── components/   # UI, map, incident details, admin workspaces
│       ├── pages/        # Route-level views
│       ├── hooks/        # Reusable React hooks
│       ├── context/      # Socket and global providers
│       ├── router/       # Custom wouter wrapper (open-redirect safe)
│       ├── services/     # API clients
│       └── utils/        # Pure functions (map, evidence, export)
├── server/               # Express API
│   ├── routes/           # Endpoint definitions + rate limits
│   ├── controllers/      # Request handling
│   ├── services/         # Business logic (sockets, push, evidence, geocoding)
│   ├── models/           # Mongoose schemas
│   ├── middleware/       # Auth, CSRF, role check, validation, upload, rate limiting
│   ├── config/           # DB connection, runtime config validation
│   └── tests/            # Integration tests (Supertest)
├── docs/                 # Architecture and diagrams (local only)
└── Procfile              # Heroku start command
```

## Getting Started

### Prerequisites

- Node.js 24.x and npm 11.x
- A MongoDB instance (local or Atlas)

### Installation

```bash
# Install dependencies for all workspaces
npm install

# Configure the server
cp server/.env.example server/.env
#   Fill in MONGODB_URI and JWT_SECRET at minimum.

# Configure the client
cp client/.env.example client/.env
```

### Running

```bash
# Server: http://localhost:5000 (from server/)
npm run dev

# Client dev server: http://localhost:5173 (from client/)
npm run dev
```

In production the server serves the built client and client-side routes; in development Vite runs independently with an API proxy.

## Commands

All commands can be run from the repository root:

| Command              | Description                                  |
|----------------------|----------------------------------------------|
| `npm run lint`       | oxlint (`--deny-warnings`) on client + server |
| `npm test`           | Run the full Vitest suite (client + server)   |
| `npm run test:client`| Client tests only                             |
| `npm run test:server`| Server tests only                             |
| `npm run build`      | Production build of the client                |
| `npm start`          | Start the production server                   |

## Security Model

- **Sessions**: HttpOnly cookies with short-lived access JWTs and rotating refresh sessions — no bearer tokens in localStorage.
- **CSRF**: Double-submit token middleware with origin validation.
- **Rate limiting**: Dedicated limiters for auth, password reset, report creation, geocoding proxy, and push subscriptions.
- **Uploads**: Multer memory storage with magic-number MIME validation and size limits.
- **Privacy**: Evidence images pass through face-detection redaction derivatives; access is authorization-matrix enforced.
- **Fail-fast config**: `server/config/runtimeConfig.js` refuses to start in production without required secrets.
- **Headers**: `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS (production).

Real credentials are never committed. Seed accounts are provisioned via `SEED_*_JSON` environment variables — see `ACCOUNTS.example.md`.

## Design Decisions (Intentional, Not Gaps)

- **No super-admin account.** Each `municipal_admin` is sovereign over their own municipality. There is deliberately no cross-municipality override account. Inter-municipality coordination happens only through the two-step transfer flow (transfer + acknowledge), so both offices consent.
- **Unverified reporters cannot submit reports.** Reporting requires manual `verifyReporter` approval by a municipal admin. `ordinary` accounts cannot file reports or open individual reports. This verified-reporters-only gate is the system's core anti-spam and accountability mechanism.

## Deployment

Deployed on Heroku — see [HEROKU_DEPLOYMENT.md](HEROKU_DEPLOYMENT.md).

## Additional Documentation

- [AGENTS.md](AGENTS.md) — coding agent configuration and command reference
- [HEROKU_DEPLOYMENT.md](HEROKU_DEPLOYMENT.md) — deployment guide
- [ACCOUNTS.example.md](ACCOUNTS.example.md) — account provisioning reference
