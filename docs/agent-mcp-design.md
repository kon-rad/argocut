# Agent MCP Design

How an AI agent creates and edits OpenCut projects unattended, and hands a
finished-but-editable project to a human.

## Goal

A skill running in Claude Code assembles a video — generates or collects media,
lays clips on the timeline, cuts, retimes, adds text and audio automation — with
no browser open and no human present. When it finishes it returns a URL. The
human opens that URL, sees a normal OpenCut project with every element editable
and the agent's work sitting in the undo stack, then tweaks or exports it by hand.

Explicitly **not** a goal: agent-driven export. Rendering stays a human action.

## Constraints this design is shaped by

OpenCut classic is entirely client-side. There is no server-side project state.

| State | Location |
|---|---|
| Projects | IndexedDB `video-editor-projects` |
| Media metadata | IndexedDB `video-editor-media-{projectId}` |
| Media binaries | OPFS directory `media-files-{projectId}` |
| Export | In-browser, WebCodecs + WASM/GPU compositor |

So an agent cannot write a project by writing a row somewhere. It has to reach
into a browser origin's storage. The design's central decision follows from that:
**the browser is the runtime.**

## Architecture

Three layers. The agent-facing contract lives inside the web app, not in the
MCP server.

```
Claude Code
  │  skill: script -> media generation -> assembly -> handoff
  ▼
packages/mcp-server/          Bun + @modelcontextprotocol/sdk
  │  owns tool schemas, validation, the Chromium profile, the lockfile
  │  transport: Playwright/CDP -> page.evaluate("__opencutAgent.<op>", args)
  ▼
apps/web/src/agent/           new domain inside the app
  │  AgentAPI: seconds<->MediaTime, targets->ids, ops->Commands,
  │  refused-command->thrown error, registry introspection
  ▼
EditorCore -> CommandManager -> IndexedDB + OPFS
```

### Why the facade lives in `apps/web/src/agent/`

It is the piece that must not drift from the editor. It imports `roundMediaTime`,
`elementParamRegistry`, `resolveTrackPlacement`, `InsertElementCommand` — the
app's own vocabulary. In-tree, it type-checks against the editor on every build
and breaks loudly when the editor changes. The MCP server only ever handles JSON,
which is also what would let a future non-browser transport reuse the tool schema
unchanged.

### Four rules inside the facade

**1. Time is seconds at the boundary, ticks inside.**
`MediaTime` is a branded integer tick count whose only legal constructor is
`roundMediaTime`. MCP tools take and return float seconds. The facade is the sole
conversion point; nothing outside the browser ever handles a tick.

**2. Refused commands throw.**
Commands such as `InsertElementCommand` return `undefined` on validation failure
and call `toast(...)`. Headless, that is a silent no-op — the worst possible agent
behaviour. Every op is wrapped: a refused command becomes a thrown error carrying
the reason. This is the single most important correctness detail in the design.

**3. One agent action, one undo step.**
`BatchCommand` already composes commands with correct reverse-order undo. Every
mutating call executes a single `BatchCommand`, so a human pressing Cmd-Z rolls
back a whole agent operation rather than a third of one.

**4. Params are introspected, never hardcoded.**
`getElementParams({ element })` yields key, type, default, min/max and keyframable
for every element type. The facade exposes that directly, so `set_params` and
`add_keyframe` work for anything the editor supports — including effects, graphics
definitions, and params added later — with no schema to re-sync.

### Placement is delegated

`InsertElementCommand` accepts `{ mode: "auto", trackType, insertIndex }` and runs
`resolveTrackPlacement` and `validateElementTrackCompatibility`. "Append this clip
to the main video track" is one call; the agent never does track arithmetic.
`SplitElementsCommand` likewise already handles retimed clips and splits keyframe
animations at the cut. Wrapping these is cheap; reimplementing them is a bug farm.

## Tool surface

Ten tools. Nine are thin; one does the work.

| Tool | Purpose |
|---|---|
| `list_projects` | id, name, duration, updatedAt |
| `create_project` | name, fps, canvas size or preset, background -> `projectId` |
| `open_project` | make a project active in the runtime |
| `import_media` | local paths -> mediaIds, with probed metadata |
| `get_project` | settings, scenes, media assets, duration, storage headroom |
| `get_timeline` | tracks -> elements, `format: "compact" \| "full"` |
| `find_elements` | by type / name substring / time / track -> element refs |
| `describe_params` | param definitions from `elementParamRegistry` |
| `apply_edits` | typed op array, executed as one batch |
| `hand_off` | save, relaunch profile headed at `/editor/{id}`, return URL |

### `apply_edits` operations

```
add_clip     { mediaId, track, startTime?, trimStart?, trimEnd?, name? }
add_text     { text, startTime, duration, track?, params? }
split        { target, atTime, retain?: "both" | "left" | "right" }
trim         { target, trimStart?, trimEnd? }
retime       { target, rate, maintainPitch? }
move         { target, startTime, track? }
delete       { target }
duplicate    { target, startTime? }
set_params   { target, params }
add_keyframe { target, param, time, value, interpolation? }
add_effect   { target, effectType, params? }
add_mask     { target, maskType, params? }
add_track    { type, name? }
```

`target` accepts `{ elementId }`, `{ name }`, or `{ track, index }` — so the agent
can address something it just created or something a human named by hand.

`maskType` is one of the nine registered in `masksRegistry` — `split`,
`cinematic-bars`, `rectangle`, `ellipse`, `heart`, `diamond`, `star`, `text`,
`freeform` — and its params come from `BASE_MASK_PARAM_DEFINITIONS` plus the
per-mask definition, read through `describe_params` like everything else.

### Why one batching tool rather than fifteen

A forty-clip assembly becomes one CDP round trip and one `BatchCommand`, which is
also what makes undo behave. Fifteen tool schemas would sit in context on every
turn for an operation the agent almost always emits in bulk. The cost is a less
pinpointed error on a malformed op, repaid by validating every op before executing
any and returning the failing index and reason.

### `apply_edits` is atomic

Two passes. Resolve and validate all targets and arguments; then execute. If a
command refuses mid-batch, undo the batch and return `{ failedAt: n, reason }`.
The agent never reasons about a half-applied edit — which matters far more when
nobody is watching.

### Every mutating call forces a save

`SaveManager` autosaves on a timer; headless, a handoff can outrun it. The facade
calls `editor.project.saveCurrentProject()` at the end of each batch so disk state
always matches what the agent believes it did.

## Media import

The MCP writes nothing into storage itself. It calls `page.setInputFiles` against
a hidden input owned by the agent facade, so files land in
`processMediaAssets({ files })` — the same function the upload UI uses. That buys
mediabunny probing, thumbnails, duration/fps/dimension extraction, and the fps
ratchet in `ratchetFpsForImportedMedia`.

That path has the toast problem in its sharpest form: `processMediaAssets`
`continue`s past unsupported types and past over-quota files, toasting each. A
ten-file import silently becomes seven and the agent then builds a timeline
referencing three assets that do not exist. So `import_media` returns a per-file
result — `{ path, mediaId }` or `{ path, skipped: reason }` — and the facade reads
back the actual asset list to confirm rather than trusting the call.

### Quota

`navigator.storage.estimate()` against a persistent profile yields roughly 60% of
free disk, and video in OPFS is not small. `get_project` reports headroom, and
`import_media` fails loudly rather than half-importing when a batch will not fit.

## Browser lifecycle

The MCP server owns one persistent Chromium profile at `~/.opencut-agent/profile`.
It launches headless on the first tool call and keeps the context alive for the
session.

`hand_off` forces a save, closes the headless context, relaunches the same profile
headed at `/editor/{id}`, and returns the URL. All state is on disk in the profile,
so the relaunch is lossless.

Single-writer is enforced by a lockfile. If the headed window is open, the server
refuses to start a headless session rather than corrupting IndexedDB, and says so.

The server assumes `bun dev:web` is running on `:3000`. It health-checks
`/api/health` and returns a clear "start the dev server" error instead of a
Playwright timeout.

## Testing

There is no browser test harness today; `bun test` runs pure-logic tests only.
Playwright is already a runtime dependency, so it doubles as the test harness.

- **Unit (`bun:test`)** — op to command translation, target resolution,
  seconds/ticks conversion, validation. The parts that do not need `EditorCore`.
- **E2E (Playwright)** — the facade against a real dev server: create, import a
  small fixture, assemble, split, retime, keyframe, reload the page, assert the
  timeline survived the round trip. The reload assertion is the one that proves a
  human will see what the agent built.

## Build order

Each phase is shippable.

1. **`apps/web/src/agent/`** — the facade, `window.__opencutAgent` behind an env
   flag, error-throwing wrappers, `BatchCommand` batching, forced save. Drivable
   from the browser console; no MCP needed to prove it works.
2. **`packages/mcp-server/`** — profile lifecycle, health check, lockfile, and the
   read-only tools. Read-only first means a wrong turn cannot damage a project.
3. **`apply_edits`** — validate-then-execute, atomic rollback, the full op union.
4. **`import_media` + `hand_off`** — end to end: Claude Code builds a project a
   human can open. First point where the whole loop runs.
5. **The skill** — orchestrates script, media generation via existing media
   skills, `apply_edits` assembly, handoff URL.

## Non-goals and known gaps

- **No export tool.** Rendering stays a human action.
- **No transitions.** Classic has no transition primitive at all — grep finds
  "transition" only in UI chrome and the roadmap page. Adding real clip-to-clip
  transitions is an editor feature, not an agent binding, and is out of scope.
- **Effects are thin.** `effects/definitions/` contains one definition: blur.
  `add_effect` is built against the registry so it grows automatically, but there
  is little there to bind today. Masks are the opposite — nine builtin types with
  typed params — and are worth the binding work in v1.
- **Fades and ducking are not special-cased verbs.** They are `add_keyframe` on
  `opacity` and `volume`, because the editor does not special-case them either.
  `volume` is keyframable and expressed in dB.
- **The human reviews in a dedicated browser profile,** not their daily Chrome.
  Accepted cost of the browser-as-runtime approach.

## Relationship to the OpenCut rewrite

`opencut-app/opencut` is a Rust-core rewrite whose README already promises an
Editor API, a plugin-first architecture, headless automation and MCP integration.
It is pre-production and not accepting outside contributions. This design targets
our fork of classic deliberately: classic is production-quality, fully readable,
archived (so nothing upstream conflicts), and already has the command layer this
needs. If the rewrite ships a stable Editor API later, the MCP tool schema is the
part worth porting; the facade is the part that would be rewritten.

## Alternatives considered

**Server-authoritative storage.** Add `HttpAdapter` implementations of the
existing `StorageAdapter<T>` interface plus Next route handlers over the Postgres
and drizzle already in the repo. The MCP becomes pure Node with no browser, and
the human uses their own Chrome. The adapter seam genuinely exists and this is in
the grain of the code. Rejected because the agent would then write
`SerializedProject` JSON directly, bypassing `EditorCore` — every invariant those
commands enforce would be reimplemented in the MCP, a subtly invalid project
breaks the editor, and agent edits would carry no undo history. The chosen v1
scope (params, keyframes, masks, audio automation) is precisely the surface that
is cheap to wrap and expensive to reimplement. Worth revisiting as a second
transport behind the same tool schema.

**Bundle on disk.** The agent writes `project.opencut/` (project.json plus media)
and the app gains import/export. Plain-files, git-diffable. Rejected: it carries
the same duplication problem plus no round trip — once a human edits, the agent's
copy is stale until an explicit re-export, which is the worst fit for "agent edits
an existing project".
