<div align="center">
  <img src="apps/web/public/logos/argocut/symbol.svg" width="88" alt="ArgoCut" />
  <h1>ArgoCut</h1>
  <p><strong>A video editor in your browser, scoped to your brand.</strong></p>
</div>

ArgoCut is a fork of [OpenCut](https://github.com/OpenCut-app/OpenCut) with two
things added:

- **Brands.** A brand is a folder on your machine — a style guide and a set of
  logos, emblems and title cards. Select one and everything you create belongs
  to it, so projects, exports and agent workflows all know which brand they are
  working in.
- **Server-backed storage.** Projects and brands live in Postgres; media and
  markdown live on disk. One database, every window, and it runs headless on a
  Linux box.

It also ships an [MCP server](packages/mcp-server) so an agent can drive the
timeline directly — see [`skills/argocut-edit`](skills/argocut-edit).

## Where things are stored

The split is deliberate, and it is the thing to understand before changing
anything about persistence.

| What | Where | Why |
|---|---|---|
| Projects, media metadata, saved sounds | Postgres, `storage_docs` (`jsonb`) | Listed, sorted and joined. The body stays opaque so a timeline feature does not need a migration |
| Brands, brand assets, active brand | Postgres — `brands`, `brand_assets`, `app_settings` | Real records with a stable shape, queried by name and kind |
| Media binaries | Disk, `$ARGOCUT_DATA_DIR/blob/` | A 900 MB source as `bytea` is wrong on backup size, memory and streaming |
| Style guides and brand assets | Your own brand folder | So Obsidian, Finder, git and any agent can read them. The database indexes this folder, it does not own it |

A brand's folder is never written to except when you create one (which scaffolds
a starter style guide) or edit the style guide in the app. **Removing a brand
forgets the row and leaves every file on disk.**

## Project structure

- `apps/web/` — Next.js web application
- `apps/web/src/brands/` — the Brands feature: folder scanning, queries, UI
- `apps/desktop/` — native desktop app built with GPUI (in progress)
- `packages/mcp-server/` — MCP server so an agent can drive the editor
- `rust/` — GPU compositor, effects, masks, and WASM bindings
- `docs/` — architecture and subsystem documentation, including the [devlog](docs/devlog.md)

## Getting started

### Prerequisites

- [Bun](https://bun.sh/docs/installation)
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose — **required**,
  since projects and brands live in Postgres

### Setup

1. Clone the repository.

2. Copy the environment file:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

3. Start Postgres and Redis:

   ```bash
   docker compose up -d db redis serverless-redis-http
   ```

   > If something already holds port 5432 on your machine — a host Postgres
   > binds `127.0.0.1` and silently wins over Docker's bind — set
   > `ARGOCUT_DB_PORT=5434` in a root `.env` and point `DATABASE_URL` at the same
   > port. The symptom otherwise is `role "argocut" does not exist`.

4. Create the tables:

   ```bash
   cd apps/web && bun run db:migrate
   ```

5. Install dependencies and start the dev server:

   ```bash
   bun install
   bun dev:web
   ```

Available at [http://localhost:3000](http://localhost:3000).

### Adding your first brand

Open **Brands** in the header, then either:

- **New** — give it a name and a folder path. The folder is created along with
  `style-guide.md` and `assets/`.
- **Import folder** — point at a folder you already keep brand assets in.
  Nothing is written; the style guide and assets directory are found by name.

Assets are classified from their filenames, so `argo-watermark.svg` files as a
logo and `title-card.png` as a title card. Drop files into the folder and press
**Rescan**.

Colours and type are read from the style guide's YAML front matter:

```yaml
---
colors:
  primary: "#F5C842"
  ink: "#1B1526"
fonts:
  display: Newsreader
---
```

### Storage modes

`NEXT_PUBLIC_STORAGE_MODE` selects where the editor keeps projects:

- `server` (default) — Postgres for documents, disk for media
- `local` — the browser profile (IndexedDB + OPFS), per-browser and not shareable

`ARGOCUT_DOC_STORE=files` makes the API read documents written by the older
filesystem store, which is how you migrate them across.

### Local WASM development

Only needed if you are editing `rust/wasm`. The package is still published as
`opencut-wasm` and consumed by version range, so it keeps the upstream name.

```bash
bun run build:wasm
cd rust/wasm/pkg && bun link
cd apps/web && bun link opencut-wasm
bun dev:wasm
```

Switch back to the published package with `bun add opencut-wasm`.

### Self-hosting with Docker

```bash
docker compose up -d
```

Available at [http://localhost:3100](http://localhost:3100).

## Credits

ArgoCut is a fork of [OpenCut](https://github.com/OpenCut-app/OpenCut) by the
OpenCut authors, MIT licensed. The editor core, timeline and rendering are
theirs; the brand system and Postgres storage are this fork's.

Thanks to [Vercel](https://vercel.com/oss) and [fal.ai](https://fal.ai) for
their support of the upstream project.

## License

[MIT](LICENSE)
