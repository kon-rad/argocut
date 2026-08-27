# ArgoCut devlog

Running record of what changed, why, and what it cost. Newest first.

---

## 2026-08-27 — Postgres, Brands, and the rebrand

Three things landed together: editor documents moved into Postgres, a Brands
feature was built on top of that, and the fork was renamed from OpenCut to
ArgoCut throughout.

### The Postgres migration was not what the last commit claimed

Worth recording plainly, because the repo said one thing and the intent was
another.

`feec00d` ("server-backed storage on the local filesystem", 2026-08-27) moved
projects and media out of the browser profile — but onto **plain files on disk**,
not Postgres. Its commit message argued the point explicitly: *"Plain files
rather than Postgres: for a single-user local tool that is the more resilient
choice."* Postgres was running in `docker-compose.yml` the whole time and held
only `users`, `sessions`, `accounts`, `verifications` and `waitlist`. No edit had
ever touched it.

Two further things were quietly broken and had to be fixed before any of this
worked:

| Problem | Fix |
|---|---|
| `drizzle.config.ts` pointed `schema` at `./src/lib/db/schema.ts`, a path that does not exist — the schema is at `./src/db/schema.ts`. `db:generate` had therefore never run | Corrected the path |
| The database was **empty**. Migration `0000` had never been applied, so even the auth tables did not exist | Applied `0000` and the new `0001` |

### What is in Postgres now, and what is not

The split is the design, not an accident of where things happened to end up.

| What | Where | Why |
|---|---|---|
| Projects, media metadata, saved sounds | Postgres `storage_docs` (`jsonb`) | Listed, sorted, joined. The body stays opaque so a timeline feature needs no migration |
| Brands, brand assets, active brand | Postgres `brands`, `brand_assets`, `app_settings` | Ours, stable shape, queried by name and kind |
| Media binaries | Disk, `$ARGOCUT_DATA_DIR/blob/` | A 900 MB source as `bytea` is wrong on backup size, memory and streaming |
| Style guides, brand assets | The user's own brand folder | So Obsidian, Finder, git and agents can read them |

The client did not change. `HttpAdapter` still talks to `/api/storage/doc/*`;
only what answers has moved, via `services/storage/server/doc-store.ts`, which
dispatches to `pg-store.ts` or the old `file-store.ts` on `ARGOCUT_DOC_STORE`.
Keeping the file store reachable is what makes migrating old documents possible
rather than a fresh start.

`storage_docs` is keyed `(collection, key)` with a `version` counter that
increments on write, plus an expression index on
`data -> 'metadata' ->> 'name'` so sorting the projects page does not deserialise
every document.

**Verified:** `NEXT_PUBLIC_STORAGE_MODE=server`, opened the editor, and watched
`PUT /api/storage/doc/projects/…` land as a row with `version` climbing to 4.

### Brands

A brand is a folder on the machine running the server. The row in Postgres is an
**index over that folder, not the owner of it** — the folder is the truth for
content. That single decision drives everything else:

- The style guide stays a real `.md` you can edit in Obsidian or diff in git.
  Editing it in the app writes the file.
- Assets are added by putting files in the folder. There is deliberately no
  upload button, because two ways to add a file raises the question of which one
  is authoritative.
- `rescanBrand` **replaces** the asset index rather than merging, so a file
  deleted on disk disappears. A merge would keep it forever.
- **Deleting a brand deletes nothing on disk.** An app that removes your logos
  because a row was dropped is an app you cannot trust with a folder path.

Assets are classified from their filenames, since people already name files
`logo-dark.svg` and `title-card.png` — honouring that means an existing folder
imports with no renaming. One ordering bug found and fixed in testing:
`watermark` and `wordmark` both contain `mark`, so checking emblem terms first
filed every watermark as an emblem. Logo terms now win, and bare `mark` matches
only as a whole word.

Dimensions are read from file headers (PNG IHDR, JPEG SOF, GIF, WebP VP8X, SVG
`width`/`height` or `viewBox`) rather than adding an image dependency for what is
a convenience label.

Access is server-side by absolute path, chosen over the browser's directory
picker so the MCP server and skills can resolve a brand's assets by path too. The
picker would have been invisible to the agent.

**Verified end to end** against `Areas/argo`: import found 17 assets and read PNG
dimensions correctly; create scaffolded a folder with a starter style guide and
parsed its front matter into tokens; the style guide round-tripped to disk and
repainted the palette; delete left the folder untouched; and the error paths all
return the reason rather than a generic failure — relative path, duplicate
folder, and a refusal to use `$HOME` as a brand root because scanning it would
walk the whole machine.

### Rebrand

106 files carried the OpenCut name. A guarded rewrite handled 74 of them, with
two things deliberately left alone:

- **`opencut-wasm` keeps its name.** It is published to npm and consumed by
  version range (`^0.2.10`); renaming the crate here would not rename the package
  on the registry. `rust/` and `Cargo.*` are excluded entirely.
- **The LICENSE keeps OpenCut's copyright**, as MIT requires, with the fork's
  line added beneath it.

The mechanical pass also invented things that do not exist — `argocut.app`,
`@argocutapp`, `oss@argocut.app`, `ArgoCut-app/ArgoCut` — and carried over
OpenCut's Discord invite and its "40k+" star count. All replaced with real
values: the repo at `kon-rad/argocut`, GitHub issues as the contact route, and
`SITE_URL` now reading `NEXT_PUBLIC_SITE_URL` (default `localhost:3000`) rather
than a hardcoded domain the project does not own.

The logo set was generated from the Argo emblem — a pointy-top hexagon ring of
twelve gold facets, in the documented Argo palette (`#F5C842`, `#DFAE35`,
`#C08A2E`, ink `#1B1526`). All 22 PWA icons and `favicon.ico` were regenerated
from it. The `invert dark:invert-0` class had to come off the header and footer
marks: it existed because OpenCut's logo was monochrome, and it wrecks gold.

### Environment gotcha worth knowing

A Postgres running on the host binds `127.0.0.1:5432` and **silently wins** over
Docker's `0.0.0.0:5432`. The app then connects to the wrong database and reports
`role "argocut" does not exist`, which reads like a credentials problem and is
not. The compose port is now `${ARGOCUT_DB_PORT:-5432}` so it can be moved
without editing the file.

### Known and unfixed

- **Concurrent saves are last-write-wins.** `storage_docs.version` increments but
  nothing rejects a stale write. Two windows on one project will clobber each
  other. Retrofitting a `409` is harder than including it was, so this is a real
  debt.
- **Auth is not wired to the editor.** `owner_id` exists and is nullable on
  `storage_docs` and `brands`, so multi-tenant is a filter rather than a
  migration — but today anything served on a network is unowned and open.
- **Offline editing is gone** in server mode. IndexedDB as a write-through cache
  would fix it; not attempted.
- **Pre-existing, untouched:** 12 TypeScript errors and 5 failing tests, all
  present before this work (verified against a clean tree). Plus a hydration
  mismatch in `components/theme-toggle.tsx`, which renders theme-dependent text
  during SSR.
- The `logo.svg` and `text.svg` wordmarks set type with `<text>` and a font
  stack rather than outlined paths, so they render differently where Newsreader
  is absent. The emblem-only files have no such problem, and they are what the
  header, footer and icons actually use.
