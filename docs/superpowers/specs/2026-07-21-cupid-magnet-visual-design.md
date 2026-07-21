# Cupid Magnet Visual — Design Specification

Date: 2026-07-21

Status: Approved in collaborative review

## 1. Summary

Add a temporary magnet beside the semantic YES button while the `cupid-magnet` trick runs. The magnet fades in, gives a small bounce and playful wiggle, then fades out with the existing 880 ms NO travel animation.

The magnet is decorative. It must follow the real YES button through Seat Swap, stay out of pointer and accessibility behavior, and leave no DOM or visual residue after the trick finishes or is interrupted.

## 2. Goals

- Make the Cupid Magnet idea visually explicit during its animation.
- Keep the magnet beside the current semantic YES button, including after Seat Swap.
- Place it on the side of YES that faces the current NO position.
- Match the existing handmade, playful invitation style without changing the buttons themselves.
- Reuse the trick runner's artifact lifecycle so completion, fallback, reset, and cancellation all clean up safely.
- Preserve current trick geometry, final NO placement, button semantics, and input behavior.

## 3. Non-goals

- No permanent magnet in the invitation markup.
- No change to Cupid Magnet's 880 ms duration, 1,050 ms fallback, status copy, or persistent NO landing state.
- No change to Seat Swap, Growing Feelings, YES handling, refusal flow, or trick selection.
- No new image asset, dependency, sound, vibration, or interactive control.
- No magnet in any trick other than `cupid-magnet`.

## 4. Approved visual behavior

### 4.1 Appearance and placement

Use a single `🧲` glyph as a runner-owned decorative artifact. Render it at 24 px, vertically centered beside the YES seat, with a 12 px gap from the button. The gap leaves room for the existing 3 px focus outline and 4 px outline offset.

Choose its side from the current button geometry at trick start:

- When the center of NO is left of the center of YES, place the magnet on the left of YES.
- Otherwise, place it on the right of YES.

This geometry rule follows the actual semantic buttons rather than assuming their original order, so it remains correct after Seat Swap and after earlier tricks have moved NO.

The magnet must sit above the button surface without covering its label or focus outline. It must not alter the action-row layout or button hit areas.

### 4.2 Motion timeline

Animate the magnet for the same 880 ms as the existing Cupid Magnet travel, using these key moments:

1. At 0%, start at opacity `0`, 65% scale, `translateY(4px)`, and `-16deg` rotation.
2. At 18%, reach opacity `1`, 112% scale, `translateY(-4px)`, and `7deg` rotation.
3. At 42%, settle to 96% scale, `translateY(2px)`, and `-6deg` rotation.
4. At 66%, rebound to 104% scale, `translateY(-1px)`, and `4deg` rotation.
5. At 82%, reach resting scale and position with `0deg` rotation.
6. At 100%, fade to opacity `0` at 90% scale and `-4deg` rotation.

The motion should read as one playful accent rather than continuous shaking. Its positioning remains fixed beside YES while NO is pulled toward YES and then set down.

## 5. Lifecycle and accessibility

Create the magnet inside the `cupid-magnet` effect with the existing `ownedArtifact()` helper and register its animation through `context.animate()`.

Append it to `view.yesSeat`, which is already a positioned wrapper for the semantic YES control and follows Seat Swap. Give the artifact:

- class `trick-cupid-magnet`;
- one direction modifier, `trick-cupid-magnet--left` or `trick-cupid-magnet--right`;
- `data-trick-artifact="true"` through the existing helper;
- `aria-hidden="true"` through the existing helper;
- no event handlers and `pointer-events: none` through the shared artifact rule.

The trick runner remains the sole lifecycle owner. It removes the magnet when the effect completes, falls back, is cancelled by a YES selection, is reset, or is disposed.

With Reduced Motion enabled, the runner keeps its existing behavior of reducing owned animations to 1 ms. The magnet therefore does not add perceptible motion, while creation and cleanup still follow the same lifecycle.

## 6. Implementation boundaries

Modify only the existing Cupid effect, trick styling, and focused tests:

- `src/ui/trick-effects.ts` creates, positions, and animates the magnet.
- `src/styles/tricks.css` supplies absolute placement, layering, glyph sizing, and left/right modifiers.
- `src/ui/trick-effects.test.ts` verifies artifact ownership, semantics, direction, animation, and unchanged Cupid state behavior.
- `tests/e2e/trick-catalog.spec.ts` verifies the visible lifecycle and semantic YES placement in a real browser before and after Seat Swap.

Do not add the magnet to `InvitationView`, persistent trick state, or the static invitation template. Do not introduce a second cleanup mechanism.

## 7. Testing strategy

Follow a red-green sequence.

Unit coverage must prove that Cupid Magnet:

- creates exactly one tracked magnet artifact;
- appends it to `yesSeat` with `aria-hidden="true"`;
- selects the left or right modifier from current YES/NO geometry;
- registers an 880 ms bounce-and-wiggle animation;
- preserves the existing target NO pose, message, fallback, and `commit-target` persistence.

Browser coverage must prove, for both original and swapped button order, that:

- no magnet exists before activation;
- one magnet is attached and visible during the Cupid Magnet animation;
- it is adjacent to the semantic `[data-yes]` control and on the side facing `[data-no]`;
- it does not change the YES accessible name or block interaction;
- it is removed after the trick becomes idle, with no remaining trick artifact.

Existing runner and choice-flow tests continue to guard cancellation, reset, fallback, and YES-during-animation cleanup. Run the focused Cupid tests first, then the complete repository verification gate.

## 8. Acceptance criteria

1. A visible `🧲` appears beside the semantic YES button only while Cupid Magnet is active.
2. The magnet fades in, performs a restrained bounce and wiggle, and fades out within the existing 880 ms timeline.
3. Its side faces the current NO position before and after Seat Swap.
4. The magnet never covers the YES label or focus outline and never changes layout or hit areas.
5. The YES button keeps the accessible name `YES, I'D LOVE TO`; the magnet is hidden from assistive technology and pointer input.
6. Completion, fallback, YES cancellation, reset, and disposal leave no magnet or other new artifact behind.
7. Reduced Motion adds no perceptible magnet animation and preserves cleanup.
8. Cupid Magnet's existing NO path, safe landing, persistent state, timing, and status message remain unchanged.
9. Focused unit and browser tests, the full test suite, type checking, and production build pass.
