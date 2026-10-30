# Agent Editing Modes

Two different ways an agent can edit an ArgoCut project, and how the MCP server
fits in. Both ultimately call the same facade (`apps/web/src/agent/`, installed
as `window.__argocutAgent`), so edits from either mode carry the same
validation and the same undo history as a human's edits.

## The two modes

| | `skills/argocut-edit` | MCP server (`packages/mcp-server`) |
|---|---|---|
| Transport | `claude-in-chrome` extension driving page JS | MCP tool calls over stdio |
| Browser | The human's own already-open tab | A separate, persistent headless Chromium profile |
| Attended? | Yes — human is looking at it live | No — runs unattended, hands back a URL when done |
| Export | Never. Rendering stays a human action | Never. Same rule |
| Needs a packaged skill? | Yes, this is a Claude Code skill | No — MCP tools are self-describing. Any MCP client (Claude Code, Codex, Hermes, etc.) can call them directly once connected to the server |

**Pick tab-driven** when the human already has the project open and wants to
watch the agent work, or hand off mid-edit.

**Pick MCP** when there's no tab open, the footage lives on disk, and the
agent should assemble the whole thing unattended, then hand back a link.

Only one can hold a given browser profile at a time. The tab-driven skill
explicitly refuses to touch the MCP server's Playwright profile, and vice
versa — they are not meant to run against the same project simultaneously.

## How the MCP server works

```
Claude Code / Codex / Hermes / any MCP client
  │  stdio, tool calls
  ▼
packages/mcp-server/        Bun + Playwright
  │  drives a persistent headless Chromium profile (~/.argocut-agent)
  │  page.evaluate("__argocutAgent.<op>", args)
  ▼
apps/web/src/agent/         window.__argocutAgent facade
  │  wraps EditorCore's command layer — same validation, same undo stack
  ▼
EditorCore → CommandManager → Postgres (docs) + disk (media)
```

The web app must be running with `NEXT_PUBLIC_ARGOCUT_AGENT_API=1` — the
facade only exists in the bundle when that flag was set at build time. A
lockfile enforces single-writer access to the Chromium profile.

Full design: [`agent-mcp-design.md`](agent-mcp-design.md).

### Tools

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

A typical unattended run: probe the footage, transcribe it, decide the cuts
from the transcript, `create_project`, `import_media`, one `apply_edits` call
for the whole assembly, then `hand_off`. The human opens the returned URL and
sees a normal, fully editable project with the agent's work sitting in the
undo stack.

## What other skills exist

Right now, `skills/argocut-edit` is the only packaged skill in this repo. It
covers the tab-driven mode above.

There is no packaged skill for the MCP/headless mode yet — any MCP-capable
agent can already drive it by connecting to `packages/mcp-server` directly,
since the tool schemas describe themselves. A dedicated orchestrating skill
(point it at a folder of raw footage, it runs the whole pipeline and hands
back a URL) is a known gap, tracked as Task 8 in
[`agent-mcp-plan.md`](agent-mcp-plan.md).
