# Server-Backed Storage

Moving ArgoCut projects out of the browser profile and onto a database, so one
project is reachable from any window, any machine, and a Linux server.

## The problem, precisely

ArgoCut classic is entirely client-side.

| State | Where it lives today |
|---|---|
| Projects and scenes | IndexedDB `video-editor-projects` |
| Media metadata | IndexedDB `video-editor-media-{projectId}` |
| Media binaries | OPFS `media-files-{projectId}` |
| Saved sounds | IndexedDB `video-editor-saved-sounds` |

Every one of those is scoped to a **browser profile**. That single fact produces
all the symptoms:

- A project made in one browser is invisible in another. Not a permissions
  problem — the second browser's database has never held the row.
- The agent needs its own profile, so it cannot see work done by hand and the
  human needs a second browser window.
- A cleared profile destroys everything. There is no other copy.
- Nothing can run on a server, because the storage is the browser.

Postgres already runs in `docker-compose.yml`, but it holds only `users`,
`sessions`, `accounts`, `feedback` and `verifications`. **No edit has ever
touched it.**

## The seam already exists

`apps/web/src/services/storage/types.ts`:

```ts
export interface StorageAdapter<T> {
	get(key: string): Promise<T | null>;
	set(args: { key: string; value: T }): Promise<void>;
	remove(key: string): Promise<void>;
	list(): Promise<string[]>;
	clear(): Promise<void>;
}
```

Five methods. `IndexedDBAdapter<T>` and `OPFSAdapter` implement it, and
`StorageService` uses exactly four adapter instances. Swapping the backend means
writing two new implementations of that interface — not rewriting the editor.

One small blocker: `StorageService` declares its fields as the concrete
`IndexedDBAdapter<T>` rather than `StorageAdapter<T>`. Widening three type
annotations is the whole structural change.

## Recommended architecture

```
   Browser (any, anywhere)              Server (Ubuntu, Docker)
┌───────────────────────────┐        ┌──────────────────────────────┐
│ EditorCore + CommandManager│        │  Next route handlers         │
│   ↓ validated commands     │        │    /api/projects/*           │
│ StorageService             │        │    /api/media/*              │
│   ↓                        │  HTTP  │    ↓                         │
│ HttpAdapter<T>       ──────┼───────▶│  Postgres (drizzle)  JSONB   │
│ HttpBlobAdapter      ──────┼───────▶│  Object store (files / S3)   │
└───────────────────────────┘        └──────────────────────────────┘
```

**The editor stays the writer.** This is the part that matters and the part an
earlier version of this plan got wrong. `docs/agent-mcp-design.md` rejected
server storage because it assumed the agent would write `SerializedProject` JSON
straight to the database, bypassing `EditorCore` and every invariant its commands
enforce. That objection is about **who writes**, not **where bytes land**. Swap
only the adapter and the objection evaporates: commands still validate, undo
still works, and the agent still drives a browser.

### Two adapters

**`HttpAdapter<T>`** — JSON documents: projects, media metadata, saved sounds.
Maps the five methods onto `GET/PUT/DELETE /api/{collection}/{key}` and
`GET /api/{collection}`. Postgres stores the document as `jsonb` with an `id`,
`owner_id`, `updated_at` and `version`.

Keeping the payload as a JSON document rather than a normalised schema is
deliberate: `SerializedProject` is the editor's own shape and it changes as the
editor changes. A normalised schema would need a migration for every timeline
feature. Index the columns worth querying (`owner_id`, `updated_at`, `name`) and
leave the body opaque.

**`HttpBlobAdapter`** — media binaries, implementing `StorageAdapter<File>`.
`PUT` streams the file, `GET` returns it, `list()` returns ids.

**Media does not go in Postgres.** The five proxies for vlog 443 are 1.2 GB; a
single 4K source is 900 MB. `bytea` in Postgres for that is wrong on every axis —
backup size, memory, streaming. Write to a filesystem path behind the API for the
single-server case, and swap in S3-compatible object storage (MinIO self-hosted,
or R2/S3) when there is more than one server. The adapter interface hides which.

### What this buys

| Want | How it lands |
|---|---|
| One database across windows | Any browser hitting the same server sees the same projects |
| Agent and human in one place | The MCP drives a headless browser against the same API; no second profile, no lockfile |
| Resilient | `pg_dump` plus an object-store copy is a real backup. Today there is none |
| Cross-platform | The browser becomes a client. Linux, macOS, Windows, a tablet |
| Ubuntu server | Already containerised; storage was the only thing pinning it to a desktop |

## What this costs — read before committing

**Concurrency becomes real.** Two windows on one project will clobber each
other. `SerializedProject` already carries a `version` field: have `PUT` reject a
stale version with `409`, and have the client reload and re-apply. Without this,
the last save silently wins — worse than today, where two windows could not see
each other at all.

**Latency on every save.** `SaveManager` autosaves on a timer against what is
currently a local write. Over HTTP that is a network round trip carrying the
whole project document. Mitigations: debounce, and send only the changed scene
rather than the whole project once the shape allows it.

**Offline editing is lost** unless IndexedDB is kept as a write-through cache.
Worth doing eventually; not worth doing first.

**Auth stops being optional.** Projects need an `owner_id`, and better-auth is
already wired for it. A server on the open internet with unowned projects is a
public file host.

**Upload is the slow path.** A 900 MB source over the network is a different
experience from OPFS. Chunked/resumable upload matters as soon as the server is
not localhost.

## Build order

Each phase is shippable and each is useful alone.

1. **Widen the seam.** Change `StorageService`'s three field annotations to
   `StorageAdapter<T>`, and select the implementation from config. No behaviour
   change; IndexedDB stays the default. This is the commit that makes everything
   after it small.
2. **`HttpAdapter<T>` plus project routes.** `projects` table: `id`, `owner_id`,
   `data jsonb`, `version`, `updated_at`. Optimistic concurrency from the start —
   retrofitting it is much harder than including it.
3. **`HttpBlobAdapter` plus media routes.** Filesystem-backed first, behind an
   interface that S3 can implement later. Range requests so seeking does not pull
   whole files.
4. **Storage mode switch.** `NEXT_PUBLIC_STORAGE_MODE=local|server`. Both work;
   local stays the default until server is proven.
5. **Migration tool.** Read every project out of a browser profile and POST it to
   the server. Without this, existing work is stranded — including vlog 443.
6. **Point the MCP at the server.** The agent's profile stops mattering, since
   the profile no longer holds anything. `open_editor.mjs` and the lockfile can
   be deleted.

Phases 1–4 are the honest minimum for "one database, many windows". Phase 5 is
what makes it not a fresh start. Phase 6 is what removes the second browser.

## The alternative worth naming

**CDP attach** — launch the human's own Chrome with `--remote-debugging-port`
and have the MCP connect to it instead of running its own profile. About an hour
of work, and it collapses the two-browser problem immediately.

It does **not** give durability, cross-machine access, or a server. It makes one
desktop pleasant. If the goal is "stop juggling two browsers this week", do that.
If the goal is the one stated here — lasting, resilient, cross-platform, runs on
Ubuntu — CDP is a detour and the adapter work is the answer.

They are not mutually exclusive: CDP now, server storage next, and CDP becomes
unnecessary once storage moves.

## Open questions

- Single-tenant (one user, self-hosted) or multi-tenant from the start? It
  changes how much auth work phase 2 carries.
- Is offline editing a requirement, or acceptable to lose? Decides whether
  IndexedDB stays as a cache layer.
- Object storage: filesystem-only for the foreseeable future, or design for S3
  from day one? Cheap to allow now, expensive to retrofit.
