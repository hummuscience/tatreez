# Tatreez Stitch Planner

A cross-stitch path planner for **tatreez**, the Palestinian embroidery
tradition. Given a chart, the planner produces a stitch sequence with a
neat back of work — minimising thread restarts and diagonal back-travel
using a Chinese Postman Problem solver.

The library ships with **971 patterns** from the
[Tirazain Archive](https://tirazain.com/archive/), preserving the source
URL, region, and Arabic name for each. See `NOTICE.md` for full attribution.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173/
```

## Common tasks

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the engine + UI test suite |
| `npm run typecheck` | Type-check without emitting |
| `npm run import-tirazain` | Re-bake `src/patterns/tirazainArchive.json` from `resources/tirazain/` |

## Refreshing the Tirazain archive

The pattern data lives in `src/patterns/tirazainArchive.json` (3.3 MB,
checked in). To regenerate it from new downloads:

```bash
# Index pass — builds resources/tirazain/manifest.json
python3 scripts/scrape_tirazain_index.py

# Download pass — pulls .oxs + .png from each pattern's Drive folder
# (requires rclone configured with a "gdrive" remote)
python3 scripts/download_tirazain_files.py

# Bake into the app
npm run import-tirazain
```

Per-pattern files in `resources/tirazain/<slug>/` are gitignored; only the
manifest and the generated JSON are tracked.

## Architecture

- **`src/engine/`** — pattern types, region extraction, scoring, the optimal CPP
  solver, and a stable Step IR for plans
- **`src/patterns/`** — built-in patterns + canonical ground truths +
  the imported Tirazain archive
- **`src/ui/`** — React components: Library, Editor, Import, Plans, Ground Truth
- **`src/oxs/`** — Open X-Stitch (`.oxs`) parser
- **`src/detect/`** — pattern detection from images (used by the Import tab)
- **`scripts/`** — Python helpers for the Tirazain pipeline + Node scripts
  for code generation

## Deploying

The repo includes a GitHub Actions workflow at
`.github/workflows/deploy.yml` that builds the Vite project and publishes
`dist/` to GitHub Pages on every push to `main`.

To enable: in the repo's settings → Pages → Source, choose **GitHub Actions**.
The site will publish to `https://<user>.github.io/<repo>/`.

If you fork or rename the repo, update `base` in `vite.config.ts` to match
the new path. Without that, asset URLs will 404 under Pages.

## License

Code: MIT (see `LICENSE`).
Pattern data: see `NOTICE.md` for the Tirazain attribution.
