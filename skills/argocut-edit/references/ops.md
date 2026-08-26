# `apply_edits` op vocabulary

Every op goes in one batch. Times are **seconds**; the facade is the only place
ticks exist. Ops execute in order, so a later op can address something an earlier
one made via `{ "ref": <opIndex> }`.

## Targeting

| Form | Use when |
|---|---|
| `{ "elementId": "..." }` | You have the id from `find_elements` or a previous batch |
| `{ "name": "..." }` | The user named it; fails loudly if ambiguous |
| `{ "track": "main", "index": 2 }` | Positional, e.g. "the third clip" |
| `{ "ref": 0 }` | The element op 0 created, in this same batch |

Track refs are `main`, `overlay:<n>`, `audio:<n>`, or a raw track id.

## Ops

| Op | Fields |
|---|---|
| `add_clip` | `mediaId`, `track` (default `main`), `startTime?`, `trimStart?`, `trimEnd?`, `name?` |
| `add_text` | `text`, `startTime`, `duration`, `track?`, `params?` |
| `split` | `target`, `atTime`, `retain` — `both` \| `left` \| `right` |
| `trim` | `target`, `trimStart?`, `trimEnd?` |
| `retime` | `target`, `rate` (0 < r ≤ 100), `maintainPitch?` |
| `move` | `target`, `startTime`, `track?` |
| `delete` | `target` |
| `duplicate` | `target`, `startTime?` |
| `set_params` | `target`, `params` |
| `add_keyframe` | `target`, `param`, `time`, `value`, `interpolation?` |
| `add_effect` | `target`, `effectType` |
| `add_mask` | `target`, `maskType` |
| `add_track` | `type`, `name?` |

## Trim is measured from both ends

`trimStart` is seconds cut off the head. `trimEnd` is seconds cut off the **tail**,
not an out-point. To use `[in, out]` from an edit plan:

```
trimStart = in
trimEnd   = sourceDuration - out
```

Get `sourceDuration` from `clips.json` or `get_project`'s media list.

## There are no transition, fade or duck verbs

The editor has no transition primitive, so neither does this API — a hard cut is
the only clip-to-clip join available. Fades and ducking are keyframes, because
that is what they are in the editor too:

```json
{ "op": "add_keyframe", "target": {"ref": 0}, "param": "opacity", "time": 0,   "value": 0 },
{ "op": "add_keyframe", "target": {"ref": 0}, "param": "opacity", "time": 0.5, "value": 100 }
```

`volume` is keyframable and expressed in **dB**, so a duck goes to a negative
value, not to a fraction.

Interpolation is `linear`, `hold`, or `bezier`. There is no `ease`.

## Params are introspected, never guessed

`describe_params { elementId }` returns each param's key, type, default, range and
whether it can be keyframed — read from the editor's own registry, so it stays
correct as the editor grows. Call it before `set_params` or `add_keyframe` rather
than assuming a key name.

Masks are the one rich surface today: nine registered types (`split`,
`cinematic-bars`, `rectangle`, `ellipse`, `heart`, `diamond`, `star`, `text`,
`freeform`). Effects are thin — `blur` is the only definition currently
registered, though `add_effect` reads the registry and will grow with it.

## Failure

Validation runs over the whole batch before anything executes. If a command is
refused mid-run the batch is rolled back and the error names the failing index
and the reason. There is no half-applied state to reason about — fix the one op
and resend the batch.
