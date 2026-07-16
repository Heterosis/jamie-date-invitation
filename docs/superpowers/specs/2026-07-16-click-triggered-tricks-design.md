# Click-Triggered Trick Lifecycle Design

**Date:** 2026-07-16
**Status:** Approved interaction design
**Scope:** The ten playful NO tricks and their input, animation, persistence, cancellation, and testing behavior.

## 1. Summary

Every playful trick will be triggered only by an explicit activation of the NO button. Mouse clicks, touch taps, and keyboard Enter or Space activations will share one native `click` path. Hover may retain a small cosmetic lift, but it will never draw a trick, increment an attempt, arm a click guard, or change invitation state.

Each accepted early-attempt NO activation, from one through eight, will run as one transaction: accept the click, draw one non-repeating trick, mark the runner busy, animate, commit any persistent end state, clean transient artifacts, and become ready for the next activation. Extra NO activations while busy will be ignored rather than queued. After the eighth transaction settles, the next accepted NO activation is the separate genuine-refusal action and opens confirmation without drawing or counting a ninth trick. YES will remain immediately available and will cancel the active trick before showing the success result.

This specification replaces the trigger, motion, and persistence descriptions in section 6 of `2026-07-15-jamie-date-invitation-design.md`. It also replaces the section 6.1 clauses about consuming a previous pointer event, converting pointer proximity to a first-tap touch interaction, and giving keyboard activation non-spatial trick variants. The original rules that semantic controls determine actions, tricks cannot invoke YES, and controls cannot change the meaning of an in-flight activation remain in force. The genuine-refusal flow in section 5.4 remains in force, with this document adding the requirement that trick eight settles before the refusal action is revealed.

## 2. Goals

- Make every trick the result of a deliberate NO activation.
- Guarantee one accepted early-attempt activation produces exactly one attempt and one trick.
- Give mouse, touch, and keyboard users the same interaction model.
- Prevent rapid clicks from overlapping animations or unlocking refusal too quickly.
- Let selected motion tricks remain in a safe, amusing end pose.
- Keep position, scale, button order, disguise, and transient theater independently composable.
- Preserve explicit-consent guarantees: no trick may activate YES, and YES always requires its own activation.
- Keep every final control visible, reachable, focusable, and clear of important content from 320px upward.
- Preserve the existing eight-trick limit and two-step genuine refusal flow.

## 3. Non-goals

- Do not add more than ten trick identifiers.
- Do not change the shuffle-bag rule or allow repeats within one bag.
- Do not queue rapid clicks.
- Do not add server state, persistence across reloads, analytics, sound, or vibration.
- Do not change the success, Calendar, Telegram, or final refusal destinations.
- Do not make every visual effect permanent; only explicitly listed state layers persist.

## 4. Input and attempt contract

### 4.1 Accepted early-attempt activation

The NO button's native `click` event is the only NO-action entry point. While attempts are below eight, the controller routes an accepted click to the trick path. This naturally includes:

- mouse click;
- touch or pen tap that produces a click;
- keyboard Enter or Space activation.

The controller will remove the NO `pointerenter` listener, pointer throttling, the stage capture guard, and the logic that consumes a click after hover. CSS `:hover` may still provide a non-stateful two-pixel lift.

An accepted early NO activation increments `attempts` once and draws one trick. The first eight accepted early-attempt activations show eight non-repeating tricks. The eighth trick must finish before the visible control changes to `Okay, I'll behave…`. The next accepted activation is routed to genuine refusal and opens the existing confirmation dialog without incrementing `attempts` or drawing from the trick deck.

### 4.2 Busy behavior

While a trick transaction is busy:

- another NO activation does not draw, increment, interrupt, or queue;
- the polite status region announces that the current trick must finish first;
- the button remains focusable and is not given the native `disabled` attribute;
- YES remains active and may cancel the trick immediately.

The stage exposes logical busy state through a data attribute and `aria-busy`. Busy state must always be cleared by normal completion, cancellation, or a fallback timeout.

### 4.3 Consent and terminal transitions

The click has already resolved to NO before any button moves, swaps, shrinks, or changes appearance. No movement can reinterpret that click as YES. A new, explicit activation of the semantic YES button is always required.

If YES is activated during any animation or persistent trick state, the active run is cancelled, all trick artifacts are cleared, and the existing success flow runs. The same complete cleanup happens before the genuine declined result is shown.

## 5. Architecture

### 5.1 Controller

The invitation controller owns input and state-machine transitions. It decides whether a NO click is an early attempt, an ignored busy activation, or the genuine-refusal action. It does not own individual animation details.

For an early attempt the controller will:

1. reject the activation if a transaction is already busy;
2. clear a persisted Tiny Disguise when appropriate;
3. draw one trick and transition `NO_ATTEMPT` once;
4. start the lifecycle runner;
5. await completion before exposing the next NO action;
6. reveal `Okay, I'll behave…` after the eighth run settles.

The controller associates each transaction with an identity token. After an await, it may expose the next action only when that token is still current and the invitation is still in the asking state; cancellation by YES, terminal refusal, or teardown invalidates the token so a late completion cannot rewrite terminal UI.

### 5.2 Lifecycle runner

The runner provides one active-run boundary with these responsibilities:

- start a trick from the current rendered state;
- retain handles for every Web Animation or transient CSS class it creates;
- expose one completion promise and an idempotent cancel operation;
- commit a persistent state patch without a visual snap-back;
- remove transient animation classes and generated decoration;
- handle both animation completion and animation cancellation;
- use a per-trick fallback deadline so busy state cannot become permanent.

Geometry-driven motion should use owned Web Animation handles because they provide explicit completion and cancellation. Decorative effects may remain CSS animations when the runner can still observe and clean them reliably.

### 5.3 Persistent visual state

Persistent state is modeled independently from transient animation:

- `noPose`: one safe NO translation and optional resting rotation;
- `yesScale`: the retained YES scale, with a configured upper bound;
- `noScale`: the retained NO scale, with a configured lower bound;
- `swapped`: the retained semantic button order;
- `disguised`: whether Tiny Disguise remains visible until the next accepted NO activation.

Position tricks replace `noPose`; they never add an unbounded transform on top of the previous position. Scale and order are separate layers and may coexist with the current pose. The renderer applies the committed state through dedicated CSS variables or data attributes, while the active animation is a temporary layer.

The renderer stores `noPose` in letter-local coordinates rather than as an offset tied to the button's current flex position. Before settling any patch that changes `noPose`, `yesScale`, `noScale`, or `swapped`, it measures the fully composed post-patch rectangles and rebases or clamps `noPose` to a safe letter-local target. Seat Swap uses the pre- and post-layout rectangles for its crossing animation, so changing order cannot silently move the pose's coordinate origin. The safe composed patch is committed before temporary animation styles are removed, preventing snap-back.

### 5.4 Safe geometry

Spatial tricks calculate their destination from the current letter, action area, YES, NO, and protected-content rectangles. A valid resting pose must:

- remain at least 8 CSS pixels inside the letter's padding box so the 3-pixel focus outline and 4-pixel outline offset remain visible;
- remain horizontally inside the viewport, allowing no more than the existing 1 CSS pixel rounding tolerance, and remain vertically reachable through normal document scrolling;
- keep the NO hit-test rectangle at least 44 by 44 CSS pixels even when its visual presentation shrinks;
- avoid the protected text elements `.eyebrow`, `[data-question]`, `[data-note]`, `.date-ticket`, and `[data-signature]`, each expanded by an 8 CSS pixel exclusion gap;
- avoid the semantic YES hit-test rectangle, expanded by a 12 CSS pixel exclusion gap;
- avoid the decorative `.tape` and `.wax-seal` rectangles, each expanded by an 8 CSS pixel exclusion gap;
- account for the current swap and scale state;
- choose a different slot when the current slot is still valid but would show no movement.

Candidate landing slots are deterministic for a given attempt so geometry does not consume shuffle randomness. Every boundary and exclusion above is a hard invariant. If no alternate slot satisfies them at a narrow width, the runner retains the safe current or normal-flow origin and skips persistent travel; it never commits an unsafe fallback merely to make the trick move. Scale patches are reduced to the nearest safe bounded value when needed. The pose is revalidated before each transaction, after resize or orientation changes, and while composing every scale, order, or pose patch.

## 6. Trick catalog

| Trick | Click reaction | Committed or transient result |
|---|---|---|
| Runaway RSVP | NO hops away after the click has resolved. | Replaces `noPose` with a different safe resting slot. |
| Growing Feelings | YES blooms larger while NO becomes slightly smaller. | Commits bounded `yesScale` and `noScale`. |
| Seat Swap | YES and NO cross to exchange their visible seats using a layout-aware transition. | Toggles and retains `swapped`. |
| Cupid Magnet | NO is pulled toward the current semantic YES from either side. | Replaces `noPose` with a safe adjacent pose that does not overlap YES. |
| Paper Plane | NO folds, flies across the letter, and lands. | Replaces `noPose` with a safe landing slot instead of returning to origin. |
| Yes Garden | Flowers and miniature YES marks bloom from the accepted click. | Generated decoration fades and is removed; persistent layers are unchanged. |
| Dramatic Excuse | A speech bubble asks, `BUT WHAT IF THERE'S DESSERT?` | Bubble fades and is removed; the button label and layout do not reflow. |
| Spotlight | The letter dims and the light follows the current semantic YES center. | Overlay fades and is removed; persistent layers are unchanged. |
| Tiny Disguise | NO puts on glasses or a moustache and pretends to be YES. | Commits `disguised` until the next accepted NO activation. |
| Return to Sender | NO receives a stamp and slides toward a safe letter edge. | Replaces `noPose` with a safe returned-corner pose. |

### 6.1 Tiny Disguise edge cases

When `disguised` is active, the next accepted NO activation first removes the costume and then uses that same activation to draw and count the next trick. Ignored busy activations do not remove it. YES removes it during success cleanup.

Before the eighth attempt, the visual button copy may read `🥸 DEFINITELY YES`, but its accessible name must remain explicit that this is the disguised NO button. Activating it still follows the NO path and can never produce consent.

If Tiny Disguise is the eighth trick, the real-refusal label `Okay, I'll behave…` takes text priority while the costume remains visible. The next activation removes the costume and opens the genuine-refusal confirmation instead of drawing a ninth trick.

## 7. Completion, cancellation, and failure handling

Completion is idempotent. A trick may settle only once even if an animation event and fallback deadline arrive close together. The completion path commits its state patch before releasing temporary animation styles, preventing a jump back to the origin.

Cancellation is also idempotent. YES, a terminal result, or teardown cancels all owned animations, timers, generated nodes, and transient classes. Expected animation cancellation does not surface as an unhandled rejection.

Each trick declares a bounded fallback deadline based on its intended duration. If an animation never reports completion, a persistent trick commits its already validated target while a transient trick discards its unfinished visual. Both paths clean transient artifacts, announce a stable status, and release busy state. A failed geometry calculation falls back to the current clamped pose rather than blocking the flow.

Reduced Motion skips long travel and commits the safe end state immediately or within a near-zero transition. It still announces the trick and preserves the same attempt count, persistent state, and cleanup semantics.

## 8. Accessibility

- The semantic YES and NO buttons remain the same DOM elements throughout the asking flow.
- Moving NO does not replace focus; the visible focus outline moves with the button.
- The status region announces the selected trick, ignored busy activations, genuine-refusal availability, and terminal results.
- Busy state is exposed without removing the button from keyboard order.
- Every persistent pose is keyboard reachable at 200% browser zoom and supported mobile widths; focusing the button may scroll vertically but never requires horizontal scrolling.
- Color and animation are never the only way a state change is communicated.
- Reduced Motion preserves the narrative through short state changes and status text.

## 9. Testing strategy

Implementation follows test-driven development. Required regression coverage includes:

### 9.1 Input semantics

- Repeated mouse hover leaves attempts at zero and does not draw from the deck.
- While attempts are below eight and the runner is ready, mouse click, touch tap, Enter, and Space each produce one accepted early attempt.
- A busy NO activation is ignored and does not queue or increment.
- YES during busy cancels the active run and reaches success exactly once.

### 9.2 Attempt and refusal flow

- Eight accepted early-attempt activations yield eight distinct trick identifiers.
- The genuine-refusal label appears only after the eighth run completes.
- The next activation opens the existing confirmation dialog.
- Confirmation and `Actually, yes` remain reachable after persistent trick states.

### 9.3 Lifecycle and persistence

- Every trick completes or cancels without residual animation classes, timers, or generated nodes.
- Runaway, Magnet, Paper Plane, and Return to Sender remain at their committed pose.
- A later position trick replaces rather than adds to the previous pose.
- Growing and Seat Swap coexist with every position pose.
- Tiny Disguise survives idle time, disappears on the next accepted activation, and handles the eighth-trick edge case.
- Tiny Disguise's accessible name continues to identify the semantic NO action.
- Missing `animationend` and explicit `animationcancel` both release busy state.

### 9.4 Geometry and combinations

- Resting controls satisfy every boundary, 44-by-44 target, and protected-element gap at 320x760, 390x844, 768x1024, 1280x720, 1440x900, and 1920x1080 CSS-pixel viewports at 100% zoom.
- The same assertions run at 200% browser zoom from a 1280x900 viewport, allowing normal vertical scrolling but no horizontal scrolling.
- Geometry cases cover both default copy and valid maximum-length URL copy.
- Seat Swap is tested before Cupid Magnet, Paper Plane, and Spotlight.
- Growing Feelings and Seat Swap each trigger post-patch pose revalidation without snap-back.
- Spotlight remains centered on semantic YES with and without swap.
- Resize and orientation changes revalidate the current pose.
- No persistent combination causes horizontal overflow.

### 9.5 Modes and cleanup

- Desktop mouse, mobile touch, keyboard-only, and Reduced Motion complete the full eight-attempt flow.
- Success and genuine refusal remove position, scale, swap, disguise, spotlight, garden, and temporary status artifacts.
- Console and page errors remain empty during rapid activation and cancellation cases.

## 10. Documentation impact

- Update the original design specification's trick descriptions and pointer-safety rules to reference this document.
- Update the README to state that hover does not count and every trick requires an explicit NO activation.
- Keep the existing URL, Maker, Calendar, Telegram, privacy, and fallback documentation unchanged.

## 11. Acceptance criteria

1. Hover never consumes a trick or attempt.
2. One accepted early-attempt NO activation produces exactly one non-repeating trick; the genuine-refusal activation produces none.
3. Busy NO activations are ignored without being queued or counted.
4. YES remains immediately actionable during every trick.
5. The eighth completed trick unlocks, but does not automatically execute, genuine refusal.
6. Selected motion tricks visibly remain in a safe end pose.
7. New position tricks replace the old pose while scale and order remain independently composable.
8. Tiny Disguise remains until the next accepted activation, including the eighth-trick exception.
9. All controls satisfy the specified 8/12-pixel exclusion gaps, 44-by-44 CSS-pixel target, horizontal-overflow tolerance, viewport matrix, and zoom conditions across supported input modes.
10. Completion, cancellation, Reduced Motion, and fallback timeout paths all release busy state and leave no transient residue.
