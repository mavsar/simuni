# Simuni

A web application scaffolded as an npm-workspaces monorepo (React + Node + SQLite),
following the same structure and stack as `my-finances` and `shopping-list`.

## Structure

```
apps/
  server/   Express + better-sqlite3 API, serves the built web app in production
  web/      Vite + React 19 + Tailwind v4 single-page app
packages/   Shared packages (empty for now)
```

## Requirements

- Node.js >= 22

## Getting started

```bash
npm install
npm run dev
```

This runs both the API server and the web dev server concurrently:

- Web: http://localhost:5190
- API: http://localhost:3300 (proxied under `/api` from the web dev server)

## Scripts

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Run server + web in watch mode               |
| `npm run build`      | Build the web app, then the server           |
| `npm run start`      | Start the production server (serves web)     |
| `npm run typecheck`  | Type-check both workspaces                   |
| `npm run format`     | Format the repo with Prettier                |

## Production

```bash
npm run build
npm run start
```

Or with Docker:

```bash
docker compose up --build
```

## Deploy on CasaOS

A CasaOS AppStore-style package lives in [`casaos/Apps/Simuni`](casaos/Apps/Simuni).
It pulls a pinned image from GHCR (`ghcr.io/mavsar/simuni`) and persists data in
`/DATA/AppData/simuni/data`.

Quick install: open CasaOS → **App Store** → **Custom Install**, then paste the
contents of [`casaos/Apps/Simuni/docker-compose.yml`](casaos/Apps/Simuni/docker-compose.yml).

A default admin (`admin` / `admin`) is seeded on first run — change it from the
Družine page right after logging in. See the
[package README](casaos/Apps/Simuni/README.md) for full details.

Container images are published automatically to GHCR by the
[`publish-ghcr`](.github/workflows/publish-ghcr.yml) workflow whenever a `v*` tag
is pushed.
