# Trick Animation Tuning Design

**Status:** Approved in conversation on 2026-07-21

**Branch:** `codex/tune-trick-animations`

## Objective

Make seven existing NO tricks more legible, playful, and satisfying without adding new tricks or weakening the invitation's geometry, accessibility, cancellation, and cleanup guarantees.

The selected visual direction is **Playful & obvious**: strong enough to read immediately, but not so exaggerated that the animation overwhelms the letter. The selected Paper Plane treatment is a **two-step origami fold** whose pointed nose always faces the actual flight direction.

## Non-negotiable constraints

- Every trick remains click, touch, or keyboard activated; hover remains cosmetic.
- The existing runner continues to own animation completion, cancellation, fallbacks, and artifact cleanup.
- YES remains available while a trick is active and cancels the active trick cleanly.
- NO landing poses must continue through the existing geometry safety checks. No animation may cover protected copy, overlap YES, leave the letter, or create horizontal overflow.
- The NO semantic button and hit target remain intact even when its visual face shrinks or folds.
- Reduced Motion produces the same committed end state while collapsing travel and decorative animation to the runner's near-instant path.
- All animated elements finish at identity/normal visual values so committed position, scale, and seat state do not snap or leave residue.

## Architecture

The current boundaries remain unchanged:

1. `trick-effects.ts` defines the visual timeline and requested persistent patch.
2. `trick-geometry.ts` chooses and validates safe end states.
3. `trick-runner.ts` owns animation lifecycle, cancellation, fallbacks, and temporary artifacts.
4. `trick-state.ts` clamps persistent visual state.

The tuning changes only effect parameters, the allowed Growing scale range, and Paper Plane's owned fold decoration. It does not introduce a second positioning system or duplicate geometry calculations.

## Detailed behavior

### Runaway RSVP

The existing `runaway` pose selection already sorts valid slots by distance and chooses the farthest safe landing. That behavior stays intact. The animation will make the two hops travel farther away from the direct line to that landing:

- Duration: `900ms`; fallback: `1100ms`.
- First hop near offset `0.32`: use roughly `78%` of the starting translation, `62%` of its vertical component minus `48px`, and `78%` of the rotation delta.
- Second hop near offset `0.68`: use roughly `42%` of the starting translation, `28%` of its vertical component minus `30px`, and `42%` of the rotation delta.
- End at `translate(0, 0) rotate(0deg)` so the safe target pose persists.
- If no new safe pose exists, the local two-hop fallback also receives a visibly larger arc while returning to its original position.

### Growing Feelings

- Raise the persistent state limits to YES `1.75` and NO face `0.50`.
- Request YES `1.75` and NO face `0.50` directly so the one non-repeating Growing draw reaches the approved visual intensity. State clamping still enforces those limits.
- Stage the geometry-validated persistent scales, then begin each face animation with a relative multiplier of `previous / target` so the rendered face starts at its true prior absolute size instead of jumping.
- Grow YES to multiplier `1` by offset `0.55`, settle briefly inward near `0.96`, and finish at identity. No YES animation multiplier may exceed `1`, because it composes multiplicatively with the persistent `--yes-scale` transform.
- Shrink NO to multiplier `0.76` by offset `0.55`, then return to identity; only its visual face changes size.
- Duration: `650ms`; fallback: `850ms`.
- Geometry may clamp YES below `1.75` only when the requested scale would overlap protected content or leave the safe region.
- Only the NO visual face shrinks; the button's semantic hit area remains unchanged.

### YES Garden

- Each bloom animates for `1800ms`.
- Stagger normal-motion blooms by `45ms`; remove the stagger under Reduced Motion.
- Fade in by offset `0.25`, remain fully visible through `0.82`, then drift and fade out.
- The last normal-motion bloom finishes by approximately `2115ms`; fallback: `2300ms`.
- All eight blooms remain runner-owned, `aria-hidden`, pointer-event-free artifacts and are removed after completion or cancellation.

### Paper Plane

The button uses the approved two-step origami sequence rather than snapping from a pill directly to a triangular clip:

1. Hold the normal button briefly.
2. Fold the first pair of edges inward and reveal the first crease.
3. Fold into a recognizable plane, reveal the second crease, and fade the visible NO label while leaving its accessible name unchanged.
4. Fly in an arc to the geometry-approved landing pose.
5. Land, reverse the folds, restore the label, and finish as the normal NO button.

Implementation details:

- Duration: approximately `1800ms`; fallback: `2050ms`.
- Use four-point polygons for every clip-path frame so Chromium can interpolate the fold continuously.
- Use direction-aware normal-button polygons whose vertex order matches the first fold. In particular, the left-facing rectangle must be ordered right-to-left so interpolation cannot collapse to a zero-width vertical line.
- Use a runner-owned, `aria-hidden`, pointer-event-free `.trick-plane-fold` decoration with crease layers inside the existing NO face. All crease animations go through `context.animate` so the runner waits, cancels, and cleans them with the rest of the trick.
- Determine heading from the actual safe-pose delta: a landing to the right uses a right-pointing plane polygon; a landing to the left uses its horizontally mirrored polygon. Keep every horizontal flight keyframe between the origin and landing, in monotonic fractions of the remaining delta, so the plane never crosses the target and reverses while its nose still points forward. Put the playful flourish in height, rotation, and scale instead. A near-zero delta defaults right, though the plane intent normally selects a meaningful horizontal displacement.
- Delay the visible flight until folding is complete, keep the plane silhouette through the flight, then unfold only after landing.
- Preserve the existing target preview, rotated-seat coordinate conversion, persistent pose, and final identity transform.

### Dramatic Excuse

- Duration: `1800ms`; fallback: `2050ms`.
- Fade the bubble in by offset `0.20`, hold it fully visible through `0.84`, then fade it out.
- Keep the bubble separate from the NO label so button copy, accessible name, and width never change.

### Spotlight

- Duration: `1900ms`; fallback: `2150ms`.
- Fade in by offset `0.18`, hold through `0.50`, then use a long staged fade (`~0.65` opacity at `0.74`, `~0.28` at `0.90`, zero at the end).
- Continue deriving the focus point from the semantic YES button after all persistent seat swaps and position changes.

### Return to Sender

- Keep the NO travel at `900ms` so the landing still feels responsive.
- Extend the stamp animation to `1800ms`; fallback: `2050ms`.
- Land the stamp by offset `0.22`, hold it fully visible through `0.84`, then fade it out instead of removing an opaque stamp abruptly.
- Remove the temporary stamp after completion while keeping the safe NO landing pose.

## Interaction, failures, and cleanup

Longer decorative timelines keep the runner busy for longer, so extra NO activations remain ignored rather than queued. YES still cancels immediately and transitions to celebration. Any animation exception or timeout follows the existing safe fallback path; no new recovery state is introduced.

Every temporary garden item, bubble, spotlight overlay, stamp, and Paper Plane crease layer remains runner-owned. Completion, cancellation, reset, genuine refusal, and YES celebration must all leave zero trick artifacts, active runner animations, inline transforms, or stale busy state.

## Testing strategy

Implementation follows red-green-refactor:

- Update state tests first to require the new `1.75` / `0.50` clamps.
- Add effect tests that initially fail on the new Runaway arc, Growing patch and pulse, longer hold keyframes, durations, and fallbacks.
- Add Paper Plane unit tests for constant polygon vertex counts, fold-before-flight ordering, left- and right-facing headings, runner-owned crease layers, hidden visual label during flight, restored final visuals, and identity motion at landing.
- Add or update lifecycle tests to accept declared fallbacks through `2300ms` without loosening cleanup requirements.
- Add deterministic browser checks that pause animations inside their hold windows and prove Garden, Dramatic Excuse, Spotlight, and Return stamp remain visible before eventual cleanup.
- Preserve and rerun the existing geometry matrix, seat-swap composition, semantic spotlight, cancellation, genuine-refusal, residue, keyboard/touch, and Reduced Motion coverage.
- Run the complete `npm run check` suite before completion.

## Acceptance criteria

1. Runaway's two-hop path is visibly farther while its landing remains geometry-safe.
2. Growing targets YES `1.75×` and NO face `0.50×`, with safe YES clamping on constrained layouts.
3. Garden, Dramatic Excuse, Spotlight, and Return stamp remain visibly present for their specified longer hold windows and still clean up completely.
4. Paper Plane visibly folds twice before flight, points along both rightward and leftward travel without reversing, lands before it unfolds, and leaves no residue.
5. YES cancellation, real refusal, resize/revalidation, Seat Swap composition, and repeated trick state remain correct.
6. Reduced Motion preserves every logical final state without long waits.
7. The full automated verification suite passes with no new skips.

## Out of scope

- Adding, removing, renaming, or reordering tricks.
- Changing URL parameters, invitation copy, Telegram, Calendar, or maker behavior.
- Relaxing protected-content, viewport, minimum-hit-target, or overlap rules.
- Changing the eight-trick refusal threshold or confirmation flow.
