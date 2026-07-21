# Implementation Plan: Cupid Magnet Visual

## Overview

Implement the approved temporary `🧲` artifact beside the semantic YES button during the existing `cupid-magnet` trick. The feature keeps the current NO motion, 880 ms duration, 1,050 ms fallback, message, and persistent landing state unchanged while adding an accessible, runner-owned visual accent that cleans itself up on every lifecycle exit.

Approved design: `docs/superpowers/specs/2026-07-21-cupid-magnet-visual-design.md`

## Architecture decisions

- Create the magnet inside `TRICK_EFFECTS["cupid-magnet"]` with the existing `ownedArtifact()` helper so the runner owns all cleanup.
- Append the artifact to `view.yesSeat`, the positioned wrapper that follows the semantic YES button through Seat Swap.
- Choose the left/right modifier from `preview.beforeNo` and `preview.beforeYes`, not from DOM order, so earlier NO movement and Seat Swap are handled by current geometry.
- Animate the magnet through `context.animate()` for exactly 880 ms with the approved six key moments; leave the existing NO animation untouched.
- Use CSS only for fixed placement, 24 px glyph sizing, 12 px gap, layering, and pointer isolation. Do not add static markup, persistent state, or a second cleanup path.
- Build tests before production code. Unit tests define artifact ownership and motion; Playwright defines visible placement, semantics, layout stability, and cleanup.

## Dependency graph

```text
Task 0: Verify baseline
  -> Task 1: Add failing unit contract
    -> Task 2: Add failing browser contract
      -> RED checkpoint
        -> Task 3: Implement artifact and styling
          -> GREEN checkpoint
            -> Task 4: Run responsive and release verification
```

The work is intentionally sequential because the implementation must satisfy independently observed RED tests. Parallel edits to the same Cupid effect and catalog tests would add merge risk without reducing the critical path.

## Task 0: Verify the Cupid Magnet baseline

**Description:** Confirm implementation starts from the approved specification commits, a clean tracked worktree, and passing existing Cupid behavior.

**Acceptance criteria:**

- [ ] Design commits `682a74b` and `60f5b14` are present in branch history.
- [ ] Existing Cupid Magnet unit tests pass without a visual artifact.
- [ ] Existing desktop Cupid Magnet geometry tests pass before any feature code changes.
- [ ] No unrelated tracked changes are present.

**Verification:**

- [ ] Run `git log -5 --oneline --decorate`.
- [ ] Run `npm test -- src/ui/trick-effects.test.ts -t "Cupid Magnet"`.
- [ ] Run `npx playwright test tests/e2e/trick-catalog.spec.ts --project=desktop-chromium -g "Cupid Magnet"`.
- [ ] Run `git status --short`.

**Dependencies:** None.

**Files likely touched:** None; verification only.

**Estimated scope:** XS.

## Task 1: Add the failing unit artifact contract

**Description:** Extend the existing Cupid Magnet unit cases to specify artifact ownership, semantic YES attachment, geometry-based direction, exact motion keyframes, and preservation of current effect state.

**Acceptance criteria:**

- [ ] Swapped and unswapped fixtures each require exactly one tracked `trick-cupid-magnet` artifact containing `🧲`, appended to `yesSeat`, and marked `aria-hidden="true"`.
- [ ] Explicit left/right geometry cases require the modifier facing the current NO center.
- [ ] The magnet animation requires the approved six offsets and opacity, scale, translation, and rotation values over 880 ms.
- [ ] Existing assertions continue to require the same NO target pose, semantic YES travel point, message, fallback, and `commit-target` persistence.

**Verification:**

- [ ] Run `npm test -- src/ui/trick-effects.test.ts -t "Cupid Magnet"` and confirm RED because the current effect creates no magnet artifact or animation.
- [ ] Confirm the failure is an unmet feature expectation, not a fixture, syntax, or type error.

**Dependencies:** Task 0.

**Files likely touched:**

- `src/ui/trick-effects.test.ts`

**Estimated scope:** S.

## Task 2: Add the failing browser lifecycle contract

**Description:** Extend the Seat Swap matrix in the catalog test to observe the magnet before, during, and after the real Cupid animation without waiting past the artifact lifecycle.

**Acceptance criteria:**

- [ ] Both original and swapped button order require zero magnets before activation and exactly one visible magnet at 55% animation progress.
- [ ] The magnet must be vertically centered beside semantic `[data-yes]`, separated by the approved 12 px gap, and placed on the side facing NO's pre-animation center.
- [ ] The YES center and accessible name remain unchanged while the artifact is present, and the magnet's computed `pointer-events` value is `none`.
- [ ] Resuming to idle removes the magnet and leaves zero `[data-trick-artifact]` nodes while existing safe-landing assertions still pass.

**Verification:**

- [ ] Run `npx playwright test tests/e2e/trick-catalog.spec.ts --project=desktop-chromium -g "Cupid Magnet"` and confirm RED because `.trick-cupid-magnet` is absent.
- [ ] Confirm the existing Cupid safe-landing assertions still reach their expected state when the new mid-animation observation is removed or isolated.

**Dependencies:** Task 1.

**Files likely touched:**

- `tests/e2e/trick-catalog.spec.ts`

**Estimated scope:** S.

## Checkpoint: RED contracts

- [ ] The focused unit contract fails for the missing owned artifact.
- [ ] The focused browser contract fails for the missing visible magnet.
- [ ] Neither failure comes from setup, timing-helper, syntax, or type errors.
- [ ] No production source or stylesheet has changed.

## Task 3: Implement the runner-owned magnet and styling

**Description:** Add the smallest production change that satisfies both RED contracts: create and animate one direction-aware artifact in the Cupid effect, then position it with scoped trick CSS.

**Acceptance criteria:**

- [ ] `cupid-magnet` creates one `ownedArtifact`, assigns the geometry-derived modifier, sets `textContent` to `🧲`, and appends it to `yesSeat`.
- [ ] `context.animate()` applies the approved 880 ms fade, bounce, and wiggle timeline while the existing NO animation remains byte-for-byte behaviorally equivalent.
- [ ] Scoped CSS renders a 24 px, vertically centered glyph 12 px outside the selected YES edge without changing layout, hit areas, label visibility, or focus outline.
- [ ] Runner completion, fallback, cancellation, reset, disposal, and Reduced Motion continue to use existing lifecycle behavior with no new state or cleanup branch.

**Verification:**

- [ ] Run `npm test -- src/ui/trick-effects.test.ts -t "Cupid Magnet"` and confirm GREEN.
- [ ] Run `npx playwright test tests/e2e/trick-catalog.spec.ts --project=desktop-chromium -g "Cupid Magnet"` and confirm GREEN.
- [ ] Run `npm run typecheck`.

**Dependencies:** Task 2 and the RED checkpoint.

**Files likely touched:**

- `src/ui/trick-effects.ts`
- `src/styles/tricks.css`

**Estimated scope:** S.

## Checkpoint: Focused GREEN

- [ ] Both focused tests changed from RED to GREEN for the intended implementation.
- [ ] Existing Cupid geometry, message, timing, fallback, and final state assertions remain green.
- [ ] The implementation adds no static invitation markup, persistent visual state, or separate cleanup mechanism.
- [ ] Type checking passes.

## Task 4: Run responsive, lifecycle, and release verification

**Description:** Verify the completed slice across desktop and mobile browser projects, exercise existing cancellation and Reduced Motion coverage, inspect the animation visually, and run the complete repository gate.

**Acceptance criteria:**

- [ ] Cupid Magnet passes on desktop Chromium and Pixel 7 projects before and after Seat Swap.
- [ ] Existing YES-during-animation, cleanup, fallback, reset, and Reduced Motion tests leave no magnet residue.
- [ ] At desktop and mobile widths, the magnet is visibly beside YES, does not overlap its label or focus outline, and does not introduce action-row layout movement.
- [ ] All unit, browser, type, build, and production-preview checks pass with no unrelated tracked changes.

**Verification:**

- [ ] Run `npx playwright test tests/e2e/trick-catalog.spec.ts -g "Cupid Magnet"`.
- [ ] Run `npx playwright test tests/e2e/choice-flows.spec.ts tests/e2e/accessibility.spec.ts --project=desktop-chromium -g "YES during a busy trick|clears trick visuals|Reduced Motion"`.
- [ ] Inspect the paused 55% animation at 1280 × 900 and Pixel 7 viewports; confirm placement, label/focus clearance, and no layout shift.
- [ ] Run `npm run check`.
- [ ] Run `git diff --check` and `git status --short`.
- [ ] Review `git diff -- src/ui/trick-effects.ts src/styles/tricks.css src/ui/trick-effects.test.ts tests/e2e/trick-catalog.spec.ts` against the approved design.

**Dependencies:** Task 3 and the focused GREEN checkpoint.

**Files likely touched:** None unless verification reveals a defect; any defect first receives a failing regression assertion in the responsible test.

**Estimated scope:** XS.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Emoji glyph metrics vary by operating system | Medium | Give the artifact its own 24 px line box and test the artifact box and gap rather than internal painted pixels. |
| Seat Swap or an earlier NO pose chooses the wrong side | High | Derive direction from current preview geometry and cover swapped plus explicit left/right fixtures. |
| Pausing all trick animations makes the E2E assertion flaky | Medium | Reuse the existing `seekTrickAnimations()` and `resumeTrickAnimations()` helpers that already own artifact animations. |
| Artifact survives cancellation or fallback | High | Use only `ownedArtifact()` and `context.animate()`; rely on existing runner cleanup tests and run the focused lifecycle suite. |
| Magnet overlaps content at mobile width | Medium | Keep it out of flex layout, test both Playwright projects, and visually inspect the Pixel 7 viewport. |

## Open questions

None. Presentation, size, spacing, direction, timeline, lifecycle, accessibility, Reduced Motion behavior, and scope are approved.

## Plan verification

- [x] Every task has acceptance criteria.
- [x] Every task has explicit verification.
- [x] Dependencies are identified and ordered.
- [x] No implementation task touches more than two production files.
- [x] RED and GREEN checkpoints separate contract, implementation, and release verification.
- [x] Human approval received before implementation began.
