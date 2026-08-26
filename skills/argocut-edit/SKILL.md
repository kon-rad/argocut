---
name: argocut-edit
description: "Assemble a video on an ArgoCut timeline by driving the ArgoCut MCP server, then hand the project back to a human to tweak visually. Use when the user wants an agent to cut, trim, retime, caption or arrange clips into an edit — a vlog, a drone reel, a livestream recap — rather than doing it by hand. Works from source footage on disk: probes the clips, transcribes speech, decides the cuts from the transcript, then applies the whole assembly as one atomic batch. Triggers on 'argocut', 'edit this footage', 'assemble a rough cut', 'build me a timeline', or 'make an edit from these clips'."
---

# ArgoCut Edit

Drives the `argocut` MCP server to build a real, editable timeline from footage on
disk, then hands back a URL. The human does the taste pass in the GUI; the agent
does the mechanical assembly.

**This skill never exports.** Rendering stays a human action — that is a design
decision, not a gap.

## Before anything: the two things that break this

1. **The web app must be running with the agent flag.** `window.__argocutAgent`
   is only installed when it is on:
   ```bash
   NEXT_PUBLIC_OPENCUT_AGENT_API=1 bun dev:web
   ```
   Without it every tool call fails at the readiness check. Check first:
   `curl -s localhost:3000/api/health`.

2. **The agent has its own browser profile.** It is `~/ArgoCut/profile`, not the
   user's daily Chrome. A project the user made by hand in their own browser is
   **invisible to the agent** — ArgoCut is client-side, so there is no shared
   server-side state to reach for. The agent builds its own project and hands it
   back. If the user points at a project URL from their own browser, say so
   plainly rather than trying to open it.

**Watch it work.** Set `OPENCUT_AGENT_HEADED=1` to run the agent's browser
visibly. For a first run on unfamiliar footage, prefer this — the user sees each
batch land and can stop you early.

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
  ├─ 5. create_project + import_media
  ├─ 6. apply_edits    one atomic batch
  └─ 7. hand_off       → editor URL
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

This is the step that deserves thought. Read every transcript in full, then write
`edit-plan.md` next to the footage before touching the MCP:

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

## Step 5 — Create and import

```
create_project  { name, fps, canvasSize }
import_media    { paths: [...] }
```

**Read the import result per file.** `import_media` returns one entry per path —
either a `mediaId` or the reason it was skipped. A file can be silently rejected
for an unsupported codec or insufficient storage. Never build a timeline against
a `mediaId` you did not receive. If any file was skipped, stop and tell the user
which and why; do not assemble a partial edit and present it as complete.

GoPro `.MP4` files are usually HEVC. If the browser refuses one, transcode first:
```bash
ffmpeg -i in.MP4 -c:v libx264 -crf 18 -c:a aac out.mp4
```

## Step 6 — Assemble

One `apply_edits` call for the whole cut. Not one per segment — batching is what
makes the undo stack usable and what makes the run atomic.

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

Useful before setting any parameter: `describe_params { elementId }` lists the
real keys, types and ranges. Do not guess key names; the registry is the truth.

## Step 7 — Hand off

```
hand_off {}
```

Saves, closes the headless context, relaunches the same profile in a visible
window at the project, and returns the URL. Give the user the URL and a short
summary of what you built — segment count, runtime, and anything you were unsure
about and left for them.

## Durability — say this once, when it matters

Projects and media live in the agent browser profile at `~/ArgoCut/profile`
(IndexedDB and OPFS). They survive laptop restarts and are untouched by
`docker compose down` — Postgres holds only accounts and feedback, never edits.

What they do **not** survive is a deleted profile directory. `get_project`
reports `storage.persisted`; if it is `false`, the browser may evict the data
under disk pressure. Report that to the user rather than staying quiet about it.

## References

- `references/ops.md` — the full op vocabulary with worked examples.
- Design: `docs/agent-mcp-design.md` in this repo.
