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

## Hazard Reference Layers

Administrators place high-risk zones by hand, and previously had to guess whether
a pin landed on hazardous ground — the satellite basemap is coarse at its maximum
zoom and showed no hazard reference of any kind.

The zones workspace now renders **DOST Project NOAH hazard polygons** behind the
pins:

| Layer | Source | Classes |
|---|---|---|
| Landslide susceptibility | NOAH Landslide Hazard Maps | medium, high |

- **Derivation:** landslide merges four models (Matterocking, Conefall, SINMAP,
  Flow-R) over 1 m LiDAR and 5 m IfSAR elevation data.
- **Storm surge is deliberately not a layer.** The Project NOAH storm surge
  advisories (SSA 1–4) were unregistered: they are a coastal scenario rather than
  a zone-placement signal, and the hazard overlays are an administrative aid.
  Their geometry stays under `server/data/` but is neither imported nor drawn.
- **Licence:** ODC-ODbL. Attribution travels in the API payload and stays in the
  document even while the layer control's popover is shut — the licence belongs
  to the layer, not to the menu that switches it on.
- **Endpoints:** `GET /api/high-risk-zones/hazards` returns every layer in one
  payload (ETag, 1-day cache); `GET /api/high-risk-zones/hazards/:datasetId`
  returns one; `GET /api/high-risk-zones/hazards/at` resolves the hazards at a
  coordinate. All three require an authenticated `municipal_admin`. The same
  resolution is folded into `POST /api/reports/geocode`, so a zone pin receives
  jurisdiction and hazards in one round-trip.
- **Placement aids:** the zones map carries a metric scale bar and a live cursor
  coordinate readout, and the selected coordinate is shown to six decimals
  (~0.1 m). Previously a 100 m zone radius had no distance reference at all and
  the readout was rounded to ~11 m.
- **Radius is a slider, not a spinner.** 50–5000 m in 10 m steps, default 100 m,
  with the value printed beside its label and the coverage circle redrawn as the
  handle moves. The ceiling is the model's own, so every radius the database
  accepts can be set here; the floor is 50 m rather than the schema's 10 m,
  because below that the circle is smaller than the pin that places it. A zone
  saved below the floor keeps its stored radius: it opens with the handle at the
  bottom of the band, the stored value is shown as it is, and saving without
  touching the slider leaves it alone.
- **Zone type is a dropdown, not a row of three buttons.** The editor is a
  narrow rail, and three labels sharing it could only be kept on one line by
  shrinking the type until it was the smallest text in the form. The field is
  the app's existing `CustomSelect`: one closed line whatever the panel width,
  ordinary-sized options inside the menu, the same colour dots (amber/red/gray)
  and the same values — so the create payload and the guard against withdrawn
  values are untouched. It is stretched to the field width with the fields' 6px
  radius, and it opens upward when the scroll area below it cannot hold the
  menu: a dropdown inside a form is clipped by that scroll area, and clipped
  options are options nobody can click.
- **Where they render:** the admin **Risk Zones** workspace (`/admin/zones`) and
  nowhere else. The public dashboard map neither requests nor draws them — the
  layers are an administrative placement aid, the dashboard is incident-first,
  and ~1.7 MB of reference polygons must not ride along with a view that will not
  show them.
- **How they are switched:** one collapsed **Layers** control in the map header,
  not a row of chips in it. Each switch carries its own colour and its own name,
  so the control *is* the legend — there is no second copy of the same facts to
  drift out of step — and every class is off until it is switched on.

Layers are registry-driven (`server/config/hazardDatasets.js`): adding a hazard
type means adding an entry and a colour ramp, not a new pipeline.

### Accident-prone areas are derived, not published

The second layer on the same map answers a different question, and the difference
is the point: nothing outside this system has drawn an accident-prone area, so it
is computed from the reports the system already holds.

- **Source:** the `reports` collection, grouped into hotspots by distance
  (`server/utils/accidentHotspots.js`). No GIS file, and no hand-placed geometry.
- **What counts:** validated lifecycle states only — `verified`, `transferred`,
  `responding`, `resolved` — inside a rolling 30-day window, with numeric
  coordinates inside the island envelope. `pending` and `rejected` never
  contribute, and a report from another island (or a null island) cannot create a
  hotspot.
- **Spatial rule:** a report joins a hotspot when it lies within **100 m** of that
  hotspot's anchor — the earliest report in it. Anchoring rather than chaining
  keeps every hotspot a bounded area whose drawn circle contains all of its
  members, so the circle on the map is the analysis area rather than an
  illustration of it.
- **Classification:** by the number of validated reports inside one 100 m area —
  **0–2: not classified**, **3–5: Medium**, **6+: High**. The thresholds are
  system configuration (`server/config/accidentHotspots.js`, env-overridable),
  not a safety standard, and they travel in the payload so the map, the layer
  control and the empty-state copy cannot describe a different rule than the data.
- **Privacy:** the payload carries an anchor, a count and a class. Reporter,
  address, title, description and report ids are never selected, so there is no
  shape of this response that leaks one.
- **Endpoint:** `GET /api/high-risk-zones/accident-hotspots` (authenticated
  `municipal_admin`, ETag, no server-side cache — the answer moves as reports are
  verified). Distinct from the older public `GET /api/reports/high-risk-zones`
  aggregation, which counts a narrower set of states.
- **Where they render:** the admin Risk Zones workspace, as two independent
  toggles — **Medium** and **High Accident-Prone Area** — both off by default,
  drawn as circles of the analysis radius (scale-true from ~zoom 12.4 in). A
  class with no qualifying area is offered disabled, with the rule that would
  turn it on printed on it.
- **Expect an empty layer on a quiet island.** With one or two validated reports
  in the window nothing is classified — by design.
- **Not official data.** The control carries the disclaimer and the labels say
  "accident-prone area", never PHIVOLCS's "susceptibility" wording.

The canvas also has a fullscreen button, and it expands the **whole map card**, not
the canvas alone: the card's header is where the layer control lives, and a
fullscreen map that leaves its own controls behind on the page has traded one
problem for another. The card header stays on screen, the map resizes to the
space under it (the workspace's own `ResizeObserver` handles that), and nothing
is duplicated or moved to make it work.

### The workspace is sized to the window, not built out of arbitrary heights

The zones page is a GIS workspace, so it fills the box the app shell gives it
(`MainLayout fitWindow`) rather than growing past it. The map and the Marked Zones
panel are two columns of one stretched grid row — the map taking eight of twelve
at `xl` and seven below it, because the panel's editor has a width floor it cannot
go under — and both end at the same line: the map canvas gets whatever is left
under its own toolbar, and only the zone list scrolls inside the panel. Desktop
therefore has no document-level scrollbar, and the canvas stops being the smallest
thing on the page. The map header holds one line: the inline legend it used to
carry was the reason the canvas lost four rows of height on a narrow window.

### Unknown is never reported as safe

A hazard reading is never collapsed into "safe". `available: false` means the
lookup could not be performed — the dataset is not imported, or the point is
outside the island — and the UI says so explicitly. On a hazard map a missing
layer must not read as a clear location.

The same reasoning explains an absence worth knowing about: **there is no flood
layer**, because NOAH's flood LiDAR covers only the 18 major river basins and
Sibuyan is not one of them. The Romblon flood archive contains zero polygons
inside the Sibuyan bounding box. Shipping it would have produced an empty overlay
that reads as "no flood risk here" — see `server/data/README.md`.

When a pin lands in a class that justifies a zone type, the form suggests it —
`landslide_prone` for high landslide — but only while the form is still on its
default. An explicit choice is never overwritten.

Datasets are committed under `server/data/` and loaded into MongoDB with
`npm run import:hazards --prefix server`. The import verifies known points
against the geospatial index and fails if any resolves to the wrong class.

## Deployment

Deployed on Heroku — see [HEROKU_DEPLOYMENT.md](HEROKU_DEPLOYMENT.md).

## Additional Documentation

- [AGENTS.md](AGENTS.md) — coding agent configuration and command reference
- [HEROKU_DEPLOYMENT.md](HEROKU_DEPLOYMENT.md) — deployment guide
- [ACCOUNTS.example.md](ACCOUNTS.example.md) — account provisioning reference
- [server/data/README.md](server/data/README.md) — source datasets: provenance, licence, and regeneration steps
