# AGENTS.md

## Cursor Cloud specific instructions

### What this is
`Hassle Dev Tools` is a **single, dependency-free, client-side static web app** (a GTA:SA / SA-MP map editor: traffic lights, zones, bus routes). Plain HTML/CSS/vanilla JS — no framework, no bundler, no package manager, no build step, and no backend/database. There are no lint or automated-test suites in the repo.

### Running it (dev)
- Must be served over HTTP (do **not** open `index.html` via `file://`): `js/routes.js` calls `fetch('data/checkpoints.json')`, which browsers block on the `file://` scheme.
- Serve the repo root, e.g. `python3 -m http.server 8000`, then open `http://localhost:8000/`. Any static server (`npx serve .`, `php -S`) works too. No env vars or config needed.

### Gotchas
- `assets/Map.png` is ~29 MB; the canvas may take a few seconds to render on first load.
- App state persists in browser `localStorage`, so a fresh browser profile starts with default/seed traffic lights.
- `checkpoint.sql` (root) is a one-off MariaDB dump kept as source data; it is **not** used at runtime and no DB is required.
- JS files load in a dependency-sensitive order (see the comment block at the bottom of `index.html`).
