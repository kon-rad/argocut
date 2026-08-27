# @argocut/mcp-server

An MCP server that lets an agent create and edit ArgoCut projects unattended, then
hand a finished-but-editable project to a human in a browser.

Design: [`docs/agent-mcp-design.md`](../../docs/agent-mcp-design.md).

## How it works

ArgoCut classic is entirely client-side — projects live in IndexedDB and media in
OPFS, so there is no server-side row to write. **The browser is the runtime.** This
server drives a persistent headless Chromium profile with Playwright and calls a
typed facade (`apps/web/src/agent/`) that the web app installs on
`window.__argocutAgent`. That facade wraps `EditorCore`'s command layer, so agent
edits carry the same validation and the same undo history a human's edits do.

## Running it

The web app must be up with the agent API enabled:

```bash
NEXT_PUBLIC_ARGOCUT_AGENT_API=1 bun dev:web
```

Then, from an MCP client:

```json
{
  "command": "bun",
  "args": ["run", "/path/to/argocut/packages/mcp-server/src/index.ts"]
}
```

The browser launches lazily on the first tool call, so the process starts even
when the dev server is down; the first call then reports that clearly.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ARGOCUT_BASE_URL` | `http://localhost:3000` | Where the web app is served |
| `ARGOCUT_AGENT_HOME` | `~/.argocut-agent` | Profile and lockfile root |
| `ARGOCUT_AGENT_HEADED` | unset | Set to `1` to watch the agent work |

A lockfile enforces single-writer access to the profile: two contexts on one
profile corrupt IndexedDB, so a second session refuses to start and says so.

## Tools

| Tool | Purpose |
|---|---|
| `list_projects` | id, name, duration, updatedAt |
| `create_project` | new project, optional name/fps/canvas → `projectId` |
| `open_project` | make a project active |
| `import_media` | local paths → mediaIds, with probed metadata |
| `get_project` | settings, scenes, media, duration, storage headroom |
| `get_timeline` | tracks → elements, `compact` or `full` |
| `find_elements` | by type / name / time / track → element refs |
| `describe_params` | param definitions, read from the editor's registry |
| `apply_edits` | typed op array, executed as one atomic batch |
| `hand_off` | save, relaunch headed, return the editor URL |

`apply_edits` does the work; the rest are thin. A forty-clip assembly is one call
and one undo step. Ops are validated before any executes, and a refusal rolls the
whole batch back with the failing index — the agent never reasons about a
half-applied edit.

Two details worth knowing when writing ops:

- **Times are seconds** at this boundary. The editor stores integer ticks; the
  facade is the only conversion point.
- **Target elements by `{ elementId }`, `{ name }`, `{ track, index }`, or
  `{ ref: <opIndex> }`** — the last addresses something an earlier op in the same
  batch created.

## Not included

No export tool: rendering stays a human action. Transitions do not exist in the
editor, so there is nothing to bind. Fades and ducking are `add_keyframe` on
`opacity` and `volume`, because the editor does not special-case them either.
