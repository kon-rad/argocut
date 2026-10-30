---
name: argocut-edit
description: "Assemble a video on an ArgoCut timeline by driving the window.__argocutAgent API inside the user's own already-open Chrome tab via the claude-in-chrome extension. Never a separate Playwright browser or agent-only profile. Use when the user wants an agent to cut, trim, retime, caption or arrange clips into an edit — a vlog, a drone reel, a livestream recap — rather than doing it by hand. Works from source footage on disk: probes the clips, transcribes speech, decides the cuts from the transcript, then applies the whole assembly as one atomic batch directly in the tab the user is looking at. Triggers on 'argocut', 'edit this footage', 'assemble a rough cut', 'build me a timeline', or 'make an edit from these clips'."
---

# ArgoCut Edit

Drives `window.__argocutAgent` — the same typed facade ArgoCut's own MCP server
uses — but calls it **inside the user's own already-open Chrome tab** via the
`claude-in-chrome` extension. There is no separate agent browser, no dedicated
Playwright profile, and no project that goes invisible because the user built
it themselves. Whatever project is open in front of the user is the project
being edited, live, in their own browser.

**This skill never exports.** Rendering stays a human action — that is a design
decision, not a gap.

**This skill never launches a second browser.** Do not use the
`@argocut/mcp-server` Playwright server, do not spin up `~/ArgoCut/profile` or
any other dedicated profile, and do not open a headless or off-screen browser
context for this. If those tools happen to be registered in this session,
they are out of scope for this skill — the whole point is that the edit
happens in the tab the human is already looking at.

## Load the browser tools first

Before anything else, load the claude-in-chrome tools this skill needs, in one
`ToolSearch` call:

```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__file_upload,mcp__claude-in-chrome__tabs_create_mcp
```

## Before anything: the two things that break this

1. **The web app must be running with the agent flag.** `window.__argocutAgent`
   is only installed client-side when the server was started with:
   ```bash
   NEXT_PUBLIC_ARGOCUT_AGENT_API=1 bun dev:web
   ```
   Check the server is even up with `curl -s localhost:3000/api/health`. This is
   a `NEXT_PUBLIC_` var, so it is baked into the JS bundle at compile time — a
   tab that was open before the server was (re)started with the flag on is
   running stale JS and will not have the object. **Hard-refresh** that tab (or
   navigate it) after the server comes up with the flag set.

2. **Find the human's tab; never substitute your own.** Use `tabs_context_mcp`
   to locate an ArgoCut tab. If none is open, `navigate` a tab to
   `http://localhost:3000/projects` in the human's own browser and let them
   pick, or create a project there yourself — still in that same browser, still
   visible to them the whole time. Confirm the API is actually live before
   doing anything else:
   ```js
   window.__argocutAgent?.isReady()
   ```
   via `javascript_tool`. `undefined` means the flag isn't baked into that
   page's bundle yet or the tab needs a hard refresh — say so and stop; don't
   guess your way past it.

## Pipeline

```
footage on disk
  │
  ├─ 1. probe          ffprobe: duration, fps, resolution, has-audio, rotation
  ├─ 2. audio          ffmpeg: extract one wav per clip
  ├─ 3. transcript     caption-video skill: .srt + .md + .words.json
  │
  ├─ 4. PLAN THE CUT   ← the actual work; happens on the transcript, not the timeline
  │
  ├─ 5. create/open project + stage & import media   (in the human's tab)
  ├─ 6. apply_edits    one atomic batch               (in the human's tab)
  └─ 7. save           tell the human what changed — they're already looking at it
```

Steps 1–4 need no browser at all. Do them first, always. Deciding cuts by
poking at a timeline is slow and blind; deciding them from a transcript with
timestamps is fast and reviewable.

## Step 1 — Probe the footage

```bash
python3 scripts/probe_clips.py <folder-or-files...>
```

Writes `clips.json` next to the footage and prints a table. Read it before
planning: a clip with no audio track is B-roll, and a clip whose fps differs from
the others will ratchet the project fps on import.

## Step 2–3 — Audio and transcript

Extract audio per clip, then run the **`caption-video`** skill on each clip that
has speech. Transcribe **once**: the first pass writes `.words.json`, and every
later step reuses it rather than re-running whisper.

For a multi-clip shoot, transcribe each clip separately and keep the transcripts
per-clip — timestamps must stay relative to their own source file, because that
is the frame `trimStart`/`trimEnd` are expressed in.

## Step 4 — Plan the cut

**If the footage is a Konrad Gnat personal vlog** (`Areas/konradgnat/vlogs/…`),
read `Areas/konradgnat/style-guide.md` §7 "Cut & Edit Philosophy" **first** — it
overrides the rules below: no reordering, no dropping segments or dead air,
clips concatenate in recording order with hard cuts only at clip boundaries.
The rest of this section is the *general-purpose* default for other footage
(drone reels, livestream recaps, etc).

This is the step that deserves thought. Read every transcript in full, then write
`edit-plan.md` next to the footage before touching the browser:

```markdown
# Edit plan — <slug>
**Source:** 5 clips, 1h 42m total
**Target:** ~8 min

| # | Clip | In | Out | Why it earns its place |
|---|---|---|---|---|
| 1 | GX010772 | 00:04:12 | 00:04:58 | Opens on the question the whole piece answers |
```

Rules that keep a rough cut watchable:

- **Cut on the thought, not the sentence.** End a clip where the idea completes,
  which is usually a beat after the words stop.
- **Drop every restart and false start.** The transcript makes these obvious.
- **Never cut mid-breath.** Leave ~200ms of handle on each side; trim it later in
  the GUI if it drags.
- **State the reason each segment survives.** If you cannot write the "why",
  it does not belong in the cut.

Show the plan to the user before executing when the cut is more than ~10
segments or the footage is over 30 minutes. Below that, proceed.

## Step 5 — Create/open + import, in the tab

If the human already has a project open, reuse it — do not create a new one out
from under them. Otherwise, via `javascript_tool`:

```js
await window.__argocutAgent.createProject({ name: "<slug>" })
```

Read the returned `AgentResult` (`{ ok: true, value }` or
`{ ok: false, error }`) and stop on `ok: false` rather than guessing why.

**Importing media** needs two extension tools working together, because a web
page cannot read local file paths itself — it needs a real file input, and only
the browser (not page JS) can put local files onto one:

1. `javascript_tool` — ensure the hidden staging input exists (idempotent):
   ```js
   (() => {
     const id = "__argocut_agent_file_input";
     if (document.getElementById(id)) return "exists";
     const input = document.createElement("input");
     input.id = id;
     input.type = "file";
     input.multiple = true;
     input.style.position = "fixed";
     input.style.left = "-10000px";
     document.body.appendChild(input);
     return "created";
   })()
   ```
2. `file_upload` — attach the local file paths to `#__argocut_agent_file_input`.
3. `javascript_tool`:
   ```js
   await window.__argocutAgent.importMedia()
   ```

**Read the import result per file.** It returns one entry per staged file —
either a `mediaId` or the reason it was skipped. A file can be silently rejected
for an unsupported codec or insufficient storage. Never build a timeline against
a `mediaId` you did not receive. If any file was skipped, stop and tell the user
which and why; do not assemble a partial edit and present it as complete.

GoPro `.MP4` files are usually HEVC. If the browser refuses one, transcode first:
```bash
ffmpeg -i in.MP4 -c:v libx264 -crf 18 -c:a aac out.mp4
```

## Step 6 — Assemble

One `javascript_tool` call for the whole cut:

```js
await window.__argocutAgent.applyEdits({ ops: [ /* ... */ ] })
```

Not one call per segment — batching is what makes the undo stack usable and
what makes the run atomic. See `references/ops.md` for the full op vocabulary
(it's written against the op array itself, not any particular transport, so it
applies unchanged here).

Per plan row, in order:

```json
{ "op": "add_clip", "mediaId": "<id>", "track": "main",
  "trimStart": <in-seconds>, "trimEnd": <from-end-seconds>, "name": "<slug>" }
```

`trimEnd` is measured **from the end of the source**, not from its start:
`trimEnd = sourceDuration - outPoint`.

Then any titles, keyframed fades, and audio automation in the same batch,
addressing clips created earlier in the batch by `{ "ref": <opIndex> }`.

A refusal rolls the entire batch back and names the failing index. When that
happens, read the reason — it is almost always an incompatible track or an
out-of-range time — fix that one op, and resend the whole batch.

Useful before setting any parameter:
```js
await window.__argocutAgent.describeParams({ elementId })
```
lists the real keys, types and ranges. Do not guess key names; the registry is
the truth.

## Step 7 — Save, don't hand off

There is no relaunch and no URL to hand back — the human has been looking at
the tab the whole time. Just:

```js
await window.__argocutAgent.save()
```

Then tell the user what you built: segment count, runtime, and anything you
were unsure about and left for them to check in the tab that's already open.

## Durability

Projects and media live wherever the human's Chrome profile stores IndexedDB
and OPFS — the same durability as any other site data in their browser:
survives restarts and quits, is wiped by "clear site data" or profile removal,
same as it would be for any other web app. There is no separate agent profile
in this mode, so there is nothing extra to lose track of.

`await window.__argocutAgent.getProject()` reports `storage.persisted`; if
`false`, the browser may evict the data under disk pressure — report that to
the user rather than staying quiet about it.

## References

- `references/ops.md` — the full op vocabulary with worked examples (written
  against the op array; unaffected by driving it through the tab instead of an
  MCP tool call).
- `references/text.md` — text/caption element conventions.
- `scripts/apply_preset.py`, `scripts/srt_to_ops.py`, `scripts/analyze_shots.py`,
  `scripts/make_title_card.py` — all emit ops or assets on disk; none talk to a
  browser, so they're unaffected by transport.
