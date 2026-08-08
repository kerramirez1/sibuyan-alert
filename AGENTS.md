# Kilo Agent Configuration

## Project Overview

**Sibuyan Alert** — Accident Alert and Mapping System for Sibuyan Island. A React 18 + Vite frontend with MapLibre GL operational maps, Socket.IO real-time coordination, and HttpOnly session authentication.

- **Client**: `client/` (Vite + React 18 + Tailwind CSS + MapLibre GL)
- **Server**: `server/` (Node.js + Express + Socket.IO + MongoDB)

## Commands

Run all commands from the `client/` directory.

| Command     | Description                          |
|-------------|--------------------------------------|
| `npm run dev`   | Start Vite dev server (port 5173)  |
| `npm run build` | Production build                          |
| `npm run preview` | Preview production build               |
| `npm test`      | Run Vitest test suite                   |
| `npm run lint`  | Run oxlint with `--deny-warnings`       |

## Architecture Notes

- **Routing**: Custom `wouter` wrapper (`src/router/index.jsx`) with URL normalization to prevent open-redirect vulnerabilities.
- **Auth**: Axios interceptors handle JWT token refresh and CSRF double-submit. Sessions are HttpOnly cookies — no localStorage bearer tokens.
- **Maps**: MapLibre GL with optional self-hosted PMTiles. All map utilities are pure functions in `src/utils/`.
- **Notifications**: Web Push API + Service Worker (`public/sw.js`). Socket.IO events are deduplicated by persistent notification ID.
