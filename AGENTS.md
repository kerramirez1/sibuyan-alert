# Kilo Agent Configuration

## Project Overview

**Sibuyan Alert** — Accident Alert and Mapping System for Sibuyan Island. A React 18 + Vite frontend with MapLibre GL operational maps, Socket.IO real-time coordination, and HttpOnly session authentication.

- **Client**: `client/` (Vite + React 18 + Tailwind CSS + MapLibre GL)
- **Server**: `server/` (Node.js + Express + Socket.IO + MongoDB)

## Commands

Run workspace-orchestrated commands from the repository root:

| Command              | Description                                        |
|----------------------|----------------------------------------------------|
| `npm test`           | Full Vitest suite (client + server)                |
| `npm run test:client`| Client tests only (`--run`)                        |
| `npm run test:server`| Server tests only                                  |
| `npm run lint`       | oxlint (`--deny-warnings`) on client + server      |
| `npm run build`      | Production build of the client                     |
| `npm start`          | Start the production server                        |

Per-workspace dev commands:

| Directory  | Command         | Description                         |
|------------|-----------------|-------------------------------------|
| `client/`  | `npm run dev`   | Start Vite dev server (port 5173)   |
| `client/`  | `npm run preview`| Preview production build           |
| `server/`  | `npm run dev`   | Start API with nodemon (port 5000)  |

## Architecture Notes

- **Routing**: Custom `wouter` wrapper (`src/router/index.jsx`) with URL normalization to prevent open-redirect vulnerabilities.
- **Auth**: Axios interceptors handle JWT token refresh and CSRF double-submit. Sessions are HttpOnly cookies — no localStorage bearer tokens.
- **Maps**: MapLibre GL with optional self-hosted PMTiles. All map utilities are pure functions in `src/utils/`.
- **Notifications**: Web Push API + Service Worker (`public/sw.js`). Socket.IO events are deduplicated by persistent notification ID.
