# Click-Triggered NO Tricks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox ('- [ ]') syntax for tracking.

**Goal:** Rebuild all ten playful NO tricks so one deliberate NO activation runs one owned transaction, selected visual state persists safely, busy clicks are ignored, YES can cancel immediately, and genuine refusal unlocks only after trick eight settles.

**Architecture:** Keep invitation consent and attempt counting in the existing controller/state machine, then add three focused layers below it: a pure persistent-state model, a deterministic safe-geometry engine, and a single-active-run lifecycle runner. Stable seat, motion, semantic button, and visual-face DOM layers prevent pose, FLIP animation, focus/hit target, scale, and hover from competing for one transform.

**Tech Stack:** TypeScript 7, native DOM and Web Animations API, CSS custom properties/data attributes, Vitest 4 in Node, Playwright 1.61 on desktop/mobile Chromium, Vite 8.

---

## Working context and stopping rule

- Approved design: 'docs/superpowers/specs/2026-07-16-click-triggered-tricks-design.md'.
- Isolated branch: 'codex/click-triggered-tricks'.
- Isolated worktree: 'C:\Users\a3817\Documents\Codex\2026-07-15\new-chat\.worktrees\click-triggered-tricks'.
- Baseline at 'ec1c542': 74 Vitest tests passed; 74 Playwright tests passed and 4 project-gated tests skipped; typecheck and Vite build passed.
- This is one cohesive subsystem. Input routing, trick visuals, lifecycle, geometry, and their tests change together; Calendar, Telegram, Maker, URL parsing, and the domain state machine remain outside the implementation scope.
- Stop and investigate if a task requires changing 'src/domain/invitation-machine.ts', 'src/domain/trick-deck.ts', URL fields, integration behavior, or dependencies. Those areas already satisfy the approved contract.

## Final file structure

| File | Responsibility |
| --- | --- |
| Create 'src/ui/trick-state.ts' | Pure immutable persistent-layer model and bounds. |
| Create 'src/ui/trick-state.test.ts' | Replacement/composition/bounds tests for that model. |
| Create 'src/ui/trick-geometry.ts' | Letter-local rectangles, deterministic landing slots, DOM measurement, preview/revalidation, and safe rendering. |
| Create 'src/ui/trick-geometry.test.ts' | Exact 8/12/44/1-pixel invariant tests and deterministic selection tests. |
| Create 'src/ui/trick-runner.ts' | One active transaction, owned animation/artifact registry, fallback, cancellation, reset, resize handling, and busy exposure. |
| Create 'src/ui/trick-runner.test.ts' | Completion/cancel/fallback/reduced-motion/idempotence tests with fake animations and timers. |
| Modify 'src/ui/trick-effects.ts' | Replace fire-and-forget effects with ten lifecycle-aware definitions returning validated state requests. |
| Modify 'src/ui/trick-effects.test.ts' | Exhaustive registry and per-trick patch/artifact/announcement tests. |
| Modify 'src/ui/invitation-view.ts' | Expose action seats/motion layers/faces/labels and move the live status outside the busy subtree. |
| Modify 'src/ui/invitation-controller.ts' | Use native click-only async transactions, runner busy checks, token invalidation, and terminal reset. |
| Create 'src/ui/invitation-controller.test.ts' | Deterministic controller tests through injected deck/runner dependencies. |
| Modify 'src/styles/invitation.css' | Stable choice-seat/button/face layout with a minimum 44-by-44 semantic target. |
| Replace 'src/styles/tricks.css' | Persistent variables, FLIP/motion layers, artifacts, costume, and cosmetic-only hover. |
| Create 'tests/e2e/trick-helpers.ts' | Deterministic deck order, accepted activation, idle wait, geometry, residue, and error helpers. |
| Rewrite 'tests/e2e/no-tricks.spec.ts' | Hover/click/busy/eight-trick/refusal and swap/spotlight regressions. |
| Create 'tests/e2e/trick-catalog.spec.ts' | Browser-level behavior for all ten tricks and Tiny Disguise edges. |
| Create 'tests/e2e/trick-geometry.spec.ts' | Viewport, long-copy, zoom, resize, composition, and overflow matrix. |
| Modify 'tests/e2e/accessibility.spec.ts' | Enter/Space/touch parity, focus, stable semantic nodes, announcements, and Reduced Motion. |
| Modify 'tests/e2e/choice-flows.spec.ts' | YES-during-busy cancellation and complete terminal cleanup. |
| Modify 'README.md' | State that hover never counts and every trick requires a NO activation. |
| Modify 'docs/superpowers/specs/2026-07-15-jamie-date-invitation-design.md' | Point superseded section 6 behavior to the approved delta specification. |

Dependency direction must remain acyclic:

- 'trick-state.ts' has no UI imports.
- 'trick-geometry.ts' imports state types/functions.
- 'trick-runner.ts' imports state, geometry, and view contracts.
- 'trick-effects.ts' imports state/geometry and runner contracts with erased 'import type' declarations.
- 'invitation-controller.ts' imports runner plus the concrete effect registry and passes that registry to 'createTrickRunner'.

'trick-runner.ts' must not import the concrete registry. This prevents a runtime import cycle and gives unit tests a clean fake-registry seam.

## Cross-cutting invariants

- The original '[data-yes]' and '[data-no]' button nodes live for the full asking flow; no trick replaces them.
- One ready native NO click draws once and advances the domain state once. Hover draws zero times.
- Check 'runner.busy' before checking 'state.canRefuse'; attempt eight is internally refusable while its animation is still running.
- The live status is outside the element carrying 'aria-busy', so ignored-click announcements are not delayed.
- Every generated visual has 'data-trick-artifact' and 'pointer-events: none'.
- Every Web Animation handle, deadline timer, animation-frame request, temporary class, and generated node is registered with the active run.
- A run's public promise always resolves to 'completed', 'fallback', or 'cancelled'; expected animation cancellation never rejects it.
- Persistent state is committed before temporary motion is removed. Terminal reset synchronously returns every layer to its initial value.
- Geometry uses letter-local coordinates only. Convert viewport DOM rectangles once at the measurement boundary.
- Safe-layout constants are 8 CSS pixels at letter/protected content, 12 around semantic YES, 44 by 44 for the semantic NO target, and 1 pixel maximum horizontal rounding overflow.

### Task 1: Add the pure persistent trick-state model

**Files:**
- Create: 'src/ui/trick-state.test.ts'
- Create: 'src/ui/trick-state.ts'

- [ ] **Step 1: Write the failing state-model tests**

Create 'src/ui/trick-state.test.ts':

~~~ts
import { describe, expect, it } from "vitest";
import {
  applyTrickVisualPatch,
  INITIAL_TRICK_VISUAL_STATE,
  MAX_YES_SCALE,
  MIN_NO_FACE_SCALE,
} from "./trick-state";

describe("applyTrickVisualPatch", () => {
  it("replaces a previous pose instead of adding offsets", () => {
    const first = applyTrickVisualPatch(INITIAL_TRICK_VISUAL_STATE, {
      noPose: { centerX: 100, centerY: 220, rotation: -4 },
    });
    const second = applyTrickVisualPatch(first, {
      noPose: { centerX: 260, centerY: 340, rotation: 6 },
    });

    expect(second.noPose).toEqual({ centerX: 260, centerY: 340, rotation: 6 });
  });

  it("composes pose, scale, order, and disguise independently", () => {
    const pose = applyTrickVisualPatch(INITIAL_TRICK_VISUAL_STATE, {
      noPose: { centerX: 150, centerY: 300, rotation: 0 },
    });
    const composed = applyTrickVisualPatch(pose, {
      yesScale: 1.3,
      noScale: 0.8,
      swapped: true,
      disguised: true,
    });

    expect(composed).toEqual({
      noPose: { centerX: 150, centerY: 300, rotation: 0 },
      yesScale: 1.3,
      noScale: 0.8,
      swapped: true,
      disguised: true,
    });
  });

  it("clamps configured scale bounds and freezes emitted state", () => {
    const state = applyTrickVisualPatch(INITIAL_TRICK_VISUAL_STATE, {
      yesScale: 99,
      noScale: -1,
    });

    expect(state.yesScale).toBe(MAX_YES_SCALE);
    expect(state.noScale).toBe(MIN_NO_FACE_SCALE);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(INITIAL_TRICK_VISUAL_STATE)).toBe(true);
  });
});
~~~

- [ ] **Step 2: Run the focused test and verify RED**

Run:

~~~powershell
npm test -- src/ui/trick-state.test.ts
~~~

Expected: FAIL because './trick-state' does not exist.

- [ ] **Step 3: Implement the immutable state contract**

Create 'src/ui/trick-state.ts':

~~~ts
export interface NoPose {
  readonly centerX: number;
  readonly centerY: number;
  readonly rotation: number;
}

export interface TrickVisualState {
  readonly noPose: NoPose | null;
  readonly yesScale: number;
  readonly noScale: number;
  readonly swapped: boolean;
  readonly disguised: boolean;
}

export type TrickVisualPatch = Partial<TrickVisualState>;

export const MAX_YES_SCALE = 1.5;
export const MIN_NO_FACE_SCALE = 0.68;

export const INITIAL_TRICK_VISUAL_STATE: Readonly<TrickVisualState> = Object.freeze({
  noPose: null,
  yesScale: 1,
  noScale: 1,
  swapped: false,
  disguised: false,
});

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function freezePose(pose: NoPose | null): NoPose | null {
  if (!pose) return null;
  return Object.freeze({
    centerX: finite(pose.centerX, 0),
    centerY: finite(pose.centerY, 0),
    rotation: finite(pose.rotation, 0),
  });
}

export function applyTrickVisualPatch(
  current: Readonly<TrickVisualState>,
  patch: TrickVisualPatch,
): Readonly<TrickVisualState> {
  return Object.freeze({
    noPose: patch.noPose === undefined ? current.noPose : freezePose(patch.noPose),
    yesScale: Math.min(
      MAX_YES_SCALE,
      Math.max(1, finite(patch.yesScale ?? current.yesScale, current.yesScale)),
    ),
    noScale: Math.min(
      1,
      Math.max(MIN_NO_FACE_SCALE, finite(patch.noScale ?? current.noScale, current.noScale)),
    ),
    swapped: patch.swapped ?? current.swapped,
    disguised: patch.disguised ?? current.disguised,
  });
}
~~~

- [ ] **Step 4: Run the focused test and typecheck**

Run:

~~~powershell
npm test -- src/ui/trick-state.test.ts
npm run typecheck
~~~

Expected: 3 state tests pass; typecheck exits 0.

- [ ] **Step 5: Commit the state model**

~~~powershell
git add src/ui/trick-state.ts src/ui/trick-state.test.ts
git commit -m "feat: model persistent trick layers"
~~~

### Task 2: Build deterministic safe geometry and composed-state preview

**Files:**
- Create: 'src/ui/trick-geometry.test.ts'
- Create: 'src/ui/trick-geometry.ts'

- [ ] **Step 1: Write exact boundary and deterministic-selection tests**

The test file must define 'rect(left, top, width, height)' and 'safeSnapshot(overrides)' fixtures and include these cases:

~~~ts
it("accepts exact geometry limits and rejects sub-pixel violations", () => {
  const snapshot = safeSnapshot();
  expect(isSafeNoRect(snapshot, rect(8, 200, 44, 44))).toBe(true);
  expect(isSafeNoRect(snapshot, rect(7.9, 200, 44, 44))).toBe(false);

  const exactYesGap = rect(snapshot.yes.right + 12, 200, 44, 44);
  const shortYesGap = rect(snapshot.yes.right + 11.9, 200, 44, 44);
  expect(isSafeNoRect(snapshot, exactYesGap)).toBe(true);
  expect(isSafeNoRect(snapshot, shortYesGap)).toBe(false);

  expect(isSafeNoRect({
    ...snapshot,
    noHitSize: { width: 43.9, height: 44 },
  }, rect(200, 200, 44, 44))).toBe(false);
});

it("uses attempt and intent deterministically without consuming deck randomness", () => {
  const random = vi.spyOn(Math, "random");
  const snapshot = safeSnapshot();
  const query = { intent: "runaway", attempt: 3, currentRotation: 0 } as const;

  expect(chooseSafeNoPose(snapshot, query)).toEqual(chooseSafeNoPose(snapshot, query));
  expect(random).not.toHaveBeenCalled();
});

it("chooses another safe slot when one exists and keeps a safe origin otherwise", () => {
  const roomy = safeSnapshot();
  const moved = chooseSafeNoPose(roomy, {
    intent: "plane",
    attempt: 2,
    currentRotation: 0,
  });
  expect(moved).not.toBeNull();
  expect(Math.hypot(
    moved!.centerX - center(roomy.currentNo).x,
    moved!.centerY - center(roomy.currentNo).y,
  )).toBeGreaterThanOrEqual(24);

  const blocked = safeSnapshot({
    protectedRects: [rect(0, 0, 600, 600)],
  });
  expect(chooseSafeNoPose(blocked, {
    intent: "returned",
    attempt: 5,
    currentRotation: 0,
  })).toBeNull();
});
~~~

Also test:

- exactly 8 pixels from protected copy, tape, and wax seal is accepted while 7.9 is rejected;
- 1 pixel horizontal viewport overflow is accepted while 1.1 is rejected;
- rotated pose bounds are evaluated using their axis-aligned visual rectangle;
- 'runaway', 'magnet', 'plane', and 'returned' rank different safe destinations;
- a later requested pose replaces the current pose;
- a geometry preview rejects unsafe scale/order/pose combinations and restores the previously committed render in a 'finally' path.

- [ ] **Step 2: Run the geometry test and verify RED**

Run:

~~~powershell
npm test -- src/ui/trick-geometry.test.ts
~~~

Expected: FAIL because './trick-geometry' does not exist.

- [ ] **Step 3: Implement the pure rectangle engine**

Create these exact public contracts in 'src/ui/trick-geometry.ts':

~~~ts
import type { NoPose, TrickVisualPatch, TrickVisualState } from "./trick-state";

export const LETTER_INSET = 8;
export const PROTECTED_GAP = 8;
export const YES_GAP = 12;
export const MIN_HIT_TARGET = 44;
export const VIEWPORT_TOLERANCE = 1;

export interface Point { readonly x: number; readonly y: number }
export interface Size { readonly width: number; readonly height: number }
export interface Rect extends Size {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type SpatialIntent = "runaway" | "magnet" | "plane" | "returned";

export interface GeometrySnapshot {
  readonly letterPaddingBox: Rect;
  readonly viewport: Pick<Rect, "left" | "right">;
  readonly currentNo: Rect;
  readonly noHitSize: Size;
  readonly yes: Rect;
  readonly protectedRects: readonly Rect[];
}

export interface PoseQuery {
  readonly intent: SpatialIntent;
  readonly attempt: number;
  readonly currentRotation: number;
}

export function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

export function center(value: Rect): Point {
  return { x: value.left + value.width / 2, y: value.top + value.height / 2 };
}

export function expandRect(value: Rect, gap: number): Rect {
  return rect(value.left - gap, value.top - gap, value.width + gap * 2, value.height + gap * 2);
}

export function overlaps(first: Rect, second: Rect): boolean {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

export function poseRect(pose: NoPose, size: Size): Rect {
  const radians = pose.rotation * Math.PI / 180;
  const width = Math.abs(size.width * Math.cos(radians))
    + Math.abs(size.height * Math.sin(radians));
  const height = Math.abs(size.width * Math.sin(radians))
    + Math.abs(size.height * Math.cos(radians));
  return rect(pose.centerX - width / 2, pose.centerY - height / 2, width, height);
}
~~~

Implement 'isSafeNoRect' as hard conjunctions:

~~~ts
export function isSafeNoRect(snapshot: GeometrySnapshot, candidate: Rect): boolean {
  const boundary = rect(
    snapshot.letterPaddingBox.left + LETTER_INSET,
    snapshot.letterPaddingBox.top + LETTER_INSET + 2,
    snapshot.letterPaddingBox.width - LETTER_INSET * 2,
    snapshot.letterPaddingBox.height - LETTER_INSET * 2 - 2,
  );

  return snapshot.noHitSize.width >= MIN_HIT_TARGET
    && snapshot.noHitSize.height >= MIN_HIT_TARGET
    && candidate.left >= boundary.left
    && candidate.right <= boundary.right
    && candidate.top >= boundary.top
    && candidate.bottom <= boundary.bottom
    && candidate.left >= snapshot.viewport.left - VIEWPORT_TOLERANCE
    && candidate.right <= snapshot.viewport.right + VIEWPORT_TOLERANCE
    && !overlaps(candidate, expandRect(snapshot.yes, YES_GAP))
    && snapshot.protectedRects.every(
      (protectedRect) => !overlaps(candidate, expandRect(protectedRect, PROTECTED_GAP)),
    );
}
~~~

Generate a finite slot grid from these normalized factors:

~~~ts
const SLOT_FACTORS = Object.freeze([
  [0.16, 0.86],
  [0.84, 0.86],
  [0.50, 0.90],
  [0.25, 0.74],
  [0.75, 0.74],
  [0.12, 0.58],
  [0.88, 0.58],
  [0.50, 0.80],
] as const);

const ROTATIONS = Object.freeze([-7, 5, -4, 7, 0] as const);
const INTENT_SEED: Readonly<Record<SpatialIntent, number>> = Object.freeze({
  runaway: 0,
  magnet: 2,
  plane: 4,
  returned: 6,
});
~~~

'chooseSafeNoPose' must:

1. inset the letter boundary;
2. rotate the candidate array by '(attempt + INTENT_SEED[intent]) % SLOT_FACTORS.length';
3. rank runaway by descending distance from current NO, magnet by ascending distance to current YES, plane by descending horizontal distance, and returned by ascending distance to the nearest letter edge;
4. assign rotation from 'ROTATIONS[(attempt + candidateIndex) % ROTATIONS.length]';
5. return the first candidate whose 'poseRect' is safe and whose center is at least 24 pixels from the current center;
6. return the current center only when its rectangle remains safe and no alternate exists; otherwise return 'null'.

Export a DOM boundary with these contracts:

~~~ts
export interface TrickRenderElements {
  readonly stage: HTMLElement;
  readonly letter: HTMLElement;
  readonly actions: HTMLElement;
  readonly yesSeat: HTMLElement;
  readonly noSeat: HTMLElement;
  readonly yesMotion: HTMLElement;
  readonly noMotion: HTMLElement;
  readonly yesButton: HTMLButtonElement;
  readonly noButton: HTMLButtonElement;
  readonly yesFace: HTMLElement;
  readonly noFace: HTMLElement;
  readonly noLabel: HTMLElement;
  readonly noCostume: HTMLElement;
}

export interface VisualPreview {
  readonly previous: Readonly<TrickVisualState>;
  readonly target: Readonly<TrickVisualState>;
  readonly beforeYes: DOMRectReadOnly;
  readonly beforeNo: DOMRectReadOnly;
  readonly afterYes: DOMRectReadOnly;
  readonly afterNo: DOMRectReadOnly;
}

export interface TrickVisualController {
  readonly state: Readonly<TrickVisualState>;
  choosePose(intent: SpatialIntent, attempt: number): NoPose | null;
  preview(patch: TrickVisualPatch): VisualPreview;
  stage(state: Readonly<TrickVisualState>): void;
  commit(state: Readonly<TrickVisualState>): void;
  clearDisguise(): void;
  setRefusalReady(ready: boolean): void;
  revalidate(): void;
  reset(): void;
}
~~~

'createTrickVisualController(elements)' must render through these dedicated values:

- measurement converts every 'getBoundingClientRect()' once by subtracting the letter rectangle's left/top; the viewport becomes 'left = -letterRect.left' and 'right = innerWidth - letterRect.left';
- the letter padding box excludes measured border widths; protected rectangles come from '.eyebrow', '[data-question]', '[data-note]', '.date-ticket', '[data-signature]', '.tape', and '.wax-seal';
- the protected YES rectangle is the union of the semantic YES button and scaled YES face; 'noHitSize' uses the untransformed semantic NO button's 'offsetWidth/offsetHeight';
- 'yesFace.style.setProperty("--yes-scale", String(state.yesScale))';
- 'noFace.style.setProperty("--no-scale", String(state.noScale))';
- 'stage.toggleAttribute("data-swapped", state.swapped)';
- 'stage.toggleAttribute("data-disguised", state.disguised)';
- 'noSeat' gets '--no-pose-x', '--no-pose-y', and '--no-rotation' derived from the letter-local pose and the current untransformed seat anchor;
- preview applies the requested state with transitions suppressed, measures actual composed face/button/seat rectangles, reduces unsafe YES growth in 0.01 steps toward the nearest safe value, rebases or clears an unsafe pose after scale/order/label changes, captures target rectangles, and restores the previous rendered state inside 'finally';
- stage renders a validated target into DOM without changing the controller's committed 'state'; the runner uses it underneath paused FLIP animations;
- commit renders the already validated preview target before transient WAAPI transforms are cancelled;
- clearing disguise preserves refusal text when refusal is ready;
- copy priority sets '[data-no-label]' to normal 'NO, SORRY', disguised 'DEFINITELY YES', or refusal-ready 'Okay, I'll behave…'. The separate costume layer supplies the single visible '🥸', so the disguised composite reads '🥸 DEFINITELY YES' without duplicating the emoji. Before refusal, use 'NO option, wearing a DEFINITELY YES disguise' as the aria-label. While refusal-ready, use 'NO refusal option: Okay, I'll behave…' when costume state remains true.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

~~~powershell
npm test -- src/ui/trick-state.test.ts src/ui/trick-geometry.test.ts
npm run typecheck
~~~

Expected: all new state/geometry tests pass and typecheck exits 0.

- [ ] **Step 5: Commit geometry**

~~~powershell
git add src/ui/trick-geometry.ts src/ui/trick-geometry.test.ts
git commit -m "feat: add safe trick geometry"
~~~

### Task 3: Add stable seat, motion, semantic-button, and face DOM layers

**Files:**
- Modify: 'src/ui/invitation-view.ts:4-18'
- Modify: 'src/ui/invitation-view.ts:27-75'
- Modify: 'src/styles/invitation.css:15-20'
- Modify: 'tests/e2e/no-tricks.spec.ts'

- [ ] **Step 1: Add a failing browser contract for the stable layers**

Append a temporary focused test to 'tests/e2e/no-tricks.spec.ts':

~~~ts
test("uses stable semantic buttons inside dedicated visual layers", async ({ page }) => {
  await page.goto("/?to=Jamie");

  const result = await page.locator("[data-actions]").evaluate((actions) => {
    const yes = actions.querySelector<HTMLButtonElement>("[data-yes]")!;
    const no = actions.querySelector<HTMLButtonElement>("[data-no]")!;
    const noRect = no.getBoundingClientRect();
    return {
      yesLayers: Boolean(
        yes.closest("[data-yes-motion]")?.closest("[data-yes-seat]")
        && yes.querySelector("[data-yes-face]"),
      ),
      noLayers: Boolean(
        no.closest("[data-no-motion]")?.closest("[data-no-seat]")
        && no.querySelector("[data-no-face]")
        && no.querySelector("[data-no-label]")
        && no.querySelector("[data-no-costume]"),
      ),
      noWidth: noRect.width,
      noHeight: noRect.height,
    };
  });

  expect(result.yesLayers).toBe(true);
  expect(result.noLayers).toBe(true);
  expect(result.noWidth).toBeGreaterThanOrEqual(44);
  expect(result.noHeight).toBeGreaterThanOrEqual(44);
  expect(await page.locator("[data-stage]").getByRole("status").count()).toBe(0);
});
~~~

- [ ] **Step 2: Run the focused browser test and verify RED**

Run:

~~~powershell
npx playwright test tests/e2e/no-tricks.spec.ts -g "stable semantic buttons" --project=desktop-chromium
~~~

Expected: FAIL because the seat/motion/face elements and '[data-actions]' do not exist.

- [ ] **Step 3: Update the view interface and markup**

Add these fields to 'InvitationView':

~~~ts
readonly actions: HTMLElement;
readonly yesSeat: HTMLElement;
readonly noSeat: HTMLElement;
readonly yesMotion: HTMLElement;
readonly noMotion: HTMLElement;
readonly yesFace: HTMLElement;
readonly noFace: HTMLElement;
readonly noLabel: HTMLElement;
readonly noCostume: HTMLElement;
~~~

Replace the asking action markup with:

~~~html
<div class="actions" data-actions>
  <span class="choice-seat" data-yes-seat>
    <span class="choice-motion" data-yes-motion>
      <button class="button button--yes choice-button" type="button" data-yes aria-label="YES, I'D LOVE TO">
        <span class="choice-face" data-yes-face>YES, I'D LOVE TO</span>
      </button>
    </span>
  </span>
  <span class="choice-seat" data-no-seat>
    <span class="choice-motion" data-no-motion>
      <button class="button button--no choice-button" type="button" data-no aria-label="NO, SORRY">
        <span class="choice-face" data-no-face>
          <span class="choice-costume" data-no-costume aria-hidden="true"></span>
          <span data-no-label>NO, SORRY</span>
        </span>
      </button>
    </span>
  </span>
</div>
~~~

Move the '[data-status]' paragraph immediately after the closing '[data-stage]' section and before the dialog. Add all new 'required' lookups to the returned view.

- [ ] **Step 4: Add compatibility layout styles**

Add to 'src/styles/invitation.css':

~~~css
.desk .choice-seat,
.desk .choice-motion {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.desk .choice-button {
  min-width: 44px;
  min-height: 48px;
}

.desk .choice-face {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.desk .choice-costume:empty {
  display: none;
}
~~~

Keep the current '.button--yes' and '.button--no' styles working in this commit. Transform ownership moves in Task 5.

- [ ] **Step 5: Verify the focused test and existing UI regressions**

Run:

~~~powershell
npx playwright test tests/e2e/no-tricks.spec.ts -g "stable semantic buttons" --project=desktop-chromium
npx playwright test tests/e2e/invitation-render.spec.ts tests/e2e/choice-flows.spec.ts --project=desktop-chromium
npm run typecheck
~~~

Expected: new layer test passes; existing rendering/choice-flow tests pass; typecheck exits 0.

- [ ] **Step 6: Commit stable DOM layers**

~~~powershell
git add src/ui/invitation-view.ts src/styles/invitation.css tests/e2e/no-tricks.spec.ts
git commit -m "refactor: separate trick visual layers"
~~~

### Task 4: Add the single-active-run lifecycle runner

**Files:**
- Create: 'src/ui/trick-runner.test.ts'
- Create: 'src/ui/trick-runner.ts'

- [ ] **Step 1: Write lifecycle tests with controlled animations and timers**

Use 'vi.useFakeTimers()', a 'deferred<T>()' helper, and fake Animation objects with counted 'cancel()' calls. The happy-path test follows this exact arrange-act-assert shape:

~~~ts
it("marks the stage busy synchronously and clears it after completion", async () => {
  const completion = deferred<void>();
  const animation = fakeAnimation(completion.promise);
  const fixture = setupRunner({
    animation,
    persistence: "commit-target",
    patch: { yesScale: 1.2 },
    fallbackMs: 900,
  });

  const run = fixture.runner.start("growing-feelings", 1, { x: 120, y: 300 });
  expect(fixture.elements.stage.dataset.trickBusy).toBe("true");
  expect(fixture.elements.stage.getAttribute("aria-busy")).toBe("true");

  completion.resolve();
  const result = await run.finished;

  expect(result).toEqual({ id: "growing-feelings", outcome: "completed" });
  expect(fixture.visuals.commit).toHaveBeenCalledWith(
    expect.objectContaining({ yesScale: 1.2 }),
  );
  expect(fixture.elements.stage.dataset.trickBusy).toBe("false");
  expect(fixture.elements.stage.getAttribute("aria-busy")).toBe("false");
  expect(vi.getTimerCount()).toBe(0);
});
~~~

Create the remaining tests with these exact actions and assertions:

| Test name | Arrange and act | Required assertions |
| --- | --- | --- |
| commits persistent target state before removing temporary motion | Record call order in fake 'visuals.commit' and 'animation.cancel', resolve 'finished'. | Commit target appears before cancel, and final outcome is completed. |
| settles once when natural completion and fallback race | Resolve the animation and advance fake time to the same deadline in one tick. | Resolver, commit, cleanup, and each cancel run once. |
| cancels every owned animation exactly once and resolves cancelled | Register two animations and one artifact, call 'run.cancel()' twice. | Both animations cancel once, artifact is removed, prior state is restored, outcome is cancelled. |
| consumes expected Animation.finished rejection | Reject the fake finished promise with an AbortError after 'run.cancel()'. | 'run.finished' resolves cancelled and no unhandled rejection is observed. |
| unexpected animation cancellation uses fallback policy | Reject an owned finished promise without calling 'run.cancel()'. | Outcome is fallback; persistent target commits or transient target discards; busy clears. |
| uses fallback to commit a persistent target | Leave finished pending and advance to the deadline. | Outcome is fallback and target state is committed. |
| uses fallback to discard a transient target | Leave finished pending for a transient result and advance to deadline. | Outcome is fallback, previous state remains, artifact is removed. |
| Reduced Motion preserves the target state with near-zero timing | Configure reduced motion and inspect animation options plus deadline. | Duration is 1ms, deadline is at most 50ms, target patch matches full-motion patch. |
| preparation error releases busy with a stable fallback | Make registry definition throw during preview. | Previous render remains, outcome is fallback, status is stable, busy false, no timers/artifacts remain. |
| reset removes every artifact and restores initial state | Start a run, call 'runner.reset()'. | INITIAL_TRICK_VISUAL_STATE is rendered, last-trick is absent, busy is false, artifacts are zero. |
| dispose invalidates late completion and leaves no timers | Start, dispose, then resolve the old animation. | No late commit/status change occurs and timer count is zero. |

The fake registry must call the supplied 'animate' and 'trackArtifact' helpers so tests assert ownership rather than reaching into implementation internals. Every settled test ends with:

~~~ts
expect(vi.getTimerCount()).toBe(0);
expect(elements.stage.dataset.trickBusy).toBe("false");
expect(elements.stage.getAttribute("aria-busy")).toBe("false");
~~~

- [ ] **Step 2: Run runner tests and verify RED**

Run:

~~~powershell
npm test -- src/ui/trick-runner.test.ts
~~~

Expected: FAIL because './trick-runner' does not exist.

- [ ] **Step 3: Define the runner/effect protocol**

Use these exact public contracts:

~~~ts
import type { TrickId } from "../domain/trick-deck";
import type { Point, SpatialIntent, TrickVisualController, VisualPreview } from "./trick-geometry";
import type { TrickVisualPatch, TrickVisualState } from "./trick-state";
import type { InvitationView } from "./invitation-view";

export type TrickRunOutcome = "completed" | "fallback" | "cancelled";

export interface TrickRunResult {
  readonly id: TrickId;
  readonly outcome: TrickRunOutcome;
}

export interface TrickRun {
  readonly id: TrickId;
  readonly finished: Promise<TrickRunResult>;
  cancel(): void;
}

export interface TrickEffectResult {
  readonly message: string;
  readonly preview: VisualPreview;
  readonly fallbackMs: number;
  readonly persistence: "commit-target" | "transient";
}

export interface TrickEffectContext {
  readonly view: InvitationView;
  readonly attempt: number;
  readonly state: Readonly<TrickVisualState>;
  readonly activation: Point;
  readonly reducedMotion: boolean;
  choosePose(intent: SpatialIntent): ReturnType<TrickVisualController["choosePose"]>;
  preview(patch: TrickVisualPatch): VisualPreview;
  animate(
    element: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options: KeyframeAnimationOptions,
  ): Animation;
  trackArtifact<ElementType extends HTMLElement>(element: ElementType): ElementType;
}

export type TrickEffect = (context: TrickEffectContext) => TrickEffectResult;
export type TrickRegistry = Readonly<Record<TrickId, TrickEffect>>;

export interface TrickRunner {
  readonly busy: boolean;
  readonly visualState: Readonly<TrickVisualState>;
  start(id: TrickId, attempt: number, activation: Point): TrickRun;
  clearDisguise(): void;
  setRefusalReady(ready: boolean): void;
  revalidate(): void;
  reset(): void;
  dispose(): void;
}

export interface TrickRunnerOptions {
  readonly visuals?: TrickVisualController;
  readonly reducedMotion?: () => boolean;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
  readonly requestAnimationFrame?: typeof globalThis.requestAnimationFrame;
  readonly cancelAnimationFrame?: typeof globalThis.cancelAnimationFrame;
}

export function createTrickRunner(
  view: InvitationView,
  registry: TrickRegistry,
  options: TrickRunnerOptions = {},
): TrickRunner;
~~~

- [ ] **Step 4: Implement one idempotent settle boundary**

'createTrickRunner(view, registry, options)' creates one active record containing:

- a monotonically increasing token;
- previous committed visual state;
- validated target state from the effect preview;
- owned 'Animation[]';
- owned artifact nodes;
- one deadline timer;
- one promise resolver;
- a 'settled' boolean.

Construction initializes 'data-attempts="0"', 'data-trick-busy="false"', and 'aria-busy="false"' before any input listener can run.

The settle core must follow this order:

~~~ts
if (!active || active.token !== token || active.settled) return;
active.settled = true;

if (outcome === "completed" || (
  outcome === "fallback" && active.persistence === "commit-target"
)) {
  visuals.commit(active.targetState);
} else if (outcome === "cancelled") {
  visuals.commit(active.previousState);
}

clock.clearTimeout(active.deadline);
for (const animation of active.animations) {
  animation.finished.catch(() => undefined);
  animation.cancel();
}
for (const artifact of active.artifacts) artifact.remove();

view.stage.dataset.trickBusy = "false";
view.stage.setAttribute("aria-busy", "false");
if (outcome === "completed") view.status.textContent = active.message;
if (outcome === "fallback") view.status.textContent = "The tiny trick landed safely.";
if (outcome === "cancelled") view.status.textContent = "The tiny trick stopped safely.";
active.resolve({ id: active.id, outcome });
active = null;
~~~

Start order is:

1. throw a descriptive error if another run is active; controller busy logic should make this unreachable;
2. synchronously set 'data-last-trick', 'data-trick-busy="true"', and 'aria-busy="true"';
3. build the effect context, create each Web Animation paused, and call the selected definition;
4. store 'effect.preview.previous', 'effect.preview.target', and the ownership lists;
5. call 'visuals.stage(effect.preview.target)' so the safe final layout sits under the transient animation, then play every owned animation;
6. use 'Promise.allSettled' on every 'Animation.finished';
7. settle 'completed' when every animation finishes; only public 'run.cancel()', reset, disposal, or a terminal controller transition produces 'cancelled'; an unexpected rejected 'Animation.finished' uses the same persistent/transient fallback policy as the deadline;
8. for zero-animation effects, settle through 'queueMicrotask' so controller token ordering remains consistent.

If effect preparation or geometry preview throws synchronously, consume the error, restore the previous committed render, announce a stable fallback message, and settle fallback with busy cleared. Add this as a runner unit case so malformed geometry cannot strand the UI.

Reduced Motion keeps the same effect/patch but normalizes every animation duration to 1 millisecond and caps the fallback at 50 milliseconds.

'reset()' increments the token, settles an active run as cancelled, calls 'visuals.setRefusalReady(false)' and 'visuals.reset()', removes every '[data-trick-artifact]', deletes 'data-last-trick' and 'noButton.dataset.locked', and clears busy state synchronously. 'dispose()' additionally removes resize/orientation listeners and cancels a queued animation frame. A resize/orientation event uses one 'requestAnimationFrame'; if busy, settle by the effect's fallback policy, then call 'visuals.revalidate()'.

- [ ] **Step 5: Run lifecycle tests and typecheck**

Run:

~~~powershell
npm test -- src/ui/trick-runner.test.ts
npm run typecheck
~~~

Expected: all lifecycle tests pass, every timer assertion is zero, and typecheck exits 0.

- [ ] **Step 6: Commit the runner**

~~~powershell
git add src/ui/trick-runner.ts src/ui/trick-runner.test.ts
git commit -m "feat: own trick animation lifecycle"
~~~

### Task 5: Add all ten lifecycle definitions behind a short-lived compatibility adapter

**Files:**
- Modify: 'src/ui/trick-effects.test.ts'
- Modify: 'src/ui/trick-effects.ts'
- Replace: 'src/styles/tricks.css'

- [ ] **Step 1: Replace obsolete effect tests with registry and behavior tests**

Delete the old overlapping-class and temporary-label restoration tests. Keep the exhaustive registry test. Use a table-driven metadata test:

~~~ts
it.each(TRICK_IDS)("gives %s an announcement and bounded fallback", (id) => {
  const context = fakeEffectContext();
  const result = TRICK_EFFECTS[id](context);

  expect(result.message.trim().length).toBeGreaterThan(0);
  expect(result.fallbackMs).toBeGreaterThan(0);
  expect(result.fallbackMs).toBeLessThanOrEqual(1_200);
  expect(result.preview.previous).toEqual(context.state);
});

it("Tiny Disguise requests persistent disguise without a timer", () => {
  const context = fakeEffectContext();
  const result = TRICK_EFFECTS["tiny-disguise"](context);

  expect(context.preview).toHaveBeenCalledWith({ disguised: true });
  expect(context.animate).toHaveBeenCalledTimes(1);
  expect(result.persistence).toBe("commit-target");
  expect(result.preview.target.disguised).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
~~~

Create one focused test per remaining definition using the fake context and these exact assertions:

| Definition test | Required assertions |
| --- | --- |
| Runaway RSVP requests a different persistent pose | 'choosePose("runaway")' called once, preview receives returned pose, NO motion animation has at least three keyframes. |
| Growing Feelings requests bounded independent scales | Preview patch contains min(1.5, current+0.10) and max(0.68, current-0.06), both faces animate. |
| Seat Swap toggles order and animates pre/post rectangles | Preview receives inverse 'swapped'; both motion wrappers animate with non-zero FLIP start deltas. |
| Cupid Magnet resolves against semantic YES on either side | 'choosePose("magnet")' is used and the intermediate keyframe moves toward current semantic YES for both swapped values. |
| Paper Plane requests a safe persistent landing pose | 'choosePose("plane")' is used; seat and face animations are owned; persistence is commit-target. |
| Yes Garden tracks only transient blossom artifacts | Eight nodes are tracked, each has 'data-trick-artifact' and 'aria-hidden', persistence is transient. |
| Dramatic Excuse creates a bubble without changing NO copy | One '.trick-excuse' is tracked, its text is exact, 'noLabel.textContent' and button width remain unchanged. |
| Spotlight centers an owned overlay on semantic YES | One overlay is tracked, coordinates equal semantic YES center relative to letter, persistence is transient. |
| Return to Sender requests a safe edge pose and transient stamp | 'choosePose("returned")' is used, one stamp is tracked, target persists while stamp is transient. |

Use a fake 'TrickEffectContext' that records 'choosePose', 'preview', 'animate', and 'trackArtifact'. Verify this persistent-layer table:

| Tricks | Patch |
| --- | --- |
| Runaway, Cupid Magnet, Paper Plane, Return to Sender | replace 'noPose' |
| Growing Feelings | 'yesScale' and 'noScale' |
| Seat Swap | toggle 'swapped' |
| Tiny Disguise | set 'disguised' |
| Yes Garden, Dramatic Excuse, Spotlight | empty patch and transient persistence |

- [ ] **Step 2: Run effect tests and verify RED**

Run:

~~~powershell
npm test -- src/ui/trick-effects.test.ts
~~~

Expected: FAIL because current effects return 'void', own timers/listeners, and change the NO label.

- [ ] **Step 3: Implement the ten definitions with runner-owned resources**

Export the complete object literal as 'TRICK_EFFECTS' and close the declaration with 'satisfies TrickRegistry'. Every definition must use only 'context.animate' and 'context.trackArtifact'; it must not call 'setTimeout', add animation listeners, or mutate controller state. Every return value includes the 'VisualPreview' produced by 'context.preview'; transient effects use 'context.preview({})'.

For this commit only, rename the current context/effect aliases to 'LegacyTrickContext' and 'LegacyTrickEffect', rename the current fire-and-forget registry to an unexported 'LEGACY_TRICK_EFFECTS: Record<TrickId, LegacyTrickEffect>', and retain 'applyTrick(id, context: LegacyTrickContext)' calling that legacy registry. This lets the not-yet-migrated controller build and keeps baseline E2E flows runnable without colliding with the new runner contract names. Put the removal instruction in this plan only, not a source comment: Task 6 switches the controller and deletes the complete legacy surface in the same commit. New unit tests target only the lifecycle 'TRICK_EFFECTS' registry.

Use these exact effect policies:

| ID | Persistence | Fallback | Motion/result |
| --- | --- | --- | --- |
| 'runaway-rsvp' | commit target | 900ms | Preview runaway pose; animate NO motion wrapper with a two-hop arc to target. |
| 'growing-feelings' | commit target | 700ms | Increase YES by 0.10 up to 1.5; decrease NO by 0.06 down to 0.68; animate both faces. |
| 'seat-swap' | commit target | 900ms | Preview toggled order; FLIP both motion wrappers from old to target rectangles. |
| 'cupid-magnet' | commit target | 1050ms | Preview magnet pose; keyframe passes near current semantic YES, then lands safely. |
| 'paper-plane' | commit target | 1200ms | Preview plane pose; outer motion travels while face folds/rotates, then lands visible. |
| 'yes-garden' | transient | 1000ms | Eight owned flowers/YES marks radiate from activation origin and fade. |
| 'dramatic-excuse' | transient | 1100ms | Owned positioned speech bubble reads 'BUT WHAT IF THERE'S DESSERT?'; button label and layout do not change. |
| 'spotlight' | transient | 1100ms | Owned full-letter overlay uses radial-gradient coordinates from current semantic YES center. |
| 'tiny-disguise' | commit target | 750ms | Preview 'disguised: true'; animate the face wobble; renderer owns persistent costume/copy. |
| 'return-to-sender' | commit target | 1100ms | Preview returned pose; add an owned stamp, slide to target, remove stamp at settle. |

For spatial effects, use 'context.preview({ noPose: context.choosePose(intent) })'. If geometry returns 'null', preview the current state and keep the narrative face animation without unsafe travel.

Use FLIP deltas from preview rectangles:

~~~ts
function flipKeyframes(
  before: DOMRectReadOnly,
  after: DOMRectReadOnly,
): Keyframe[] {
  return [
    {
      transform: "translate(" + (before.left - after.left) + "px, "
        + (before.top - after.top) + "px)",
    },
    { transform: "translate(0, 0)" },
  ];
}
~~~

Garden, excuse, spotlight, and stamp nodes all receive:

~~~ts
artifact.dataset.trickArtifact = "true";
artifact.setAttribute("aria-hidden", "true");
~~~

The spotlight node stores '--spotlight-x' and '--spotlight-y' relative to the letter rectangle; never reuse '.letter::after', which belongs to result decoration.

- [ ] **Step 4: Replace transform-colliding trick CSS**

'src/styles/tricks.css' must assign one owner per layer:

~~~css
.desk [data-yes-seat],
.desk [data-no-seat] {
  position: relative;
  will-change: translate, rotate;
}

.desk [data-no-seat] {
  translate: var(--no-pose-x, 0px) var(--no-pose-y, 0px);
  rotate: var(--no-rotation, 0deg);
}

.desk[data-swapped] [data-yes-seat] { order: 2; }
.desk[data-swapped] [data-no-seat] { order: 1; }

.desk [data-yes-motion],
.desk [data-no-motion] {
  will-change: transform;
}

.desk [data-yes-face] {
  transform: scale(var(--yes-scale, 1));
}

.desk [data-no-face] {
  transform: scale(var(--no-scale, 1));
}

.desk .choice-button:hover [data-yes-face],
.desk .choice-button:hover [data-no-face] {
  translate: 0 -2px;
}

.desk .choice-button,
.desk .choice-button:hover {
  min-width: 44px;
  min-height: 48px;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  box-shadow: none;
  overflow: visible;
  transform: none;
}

.desk .choice-face {
  min-height: 48px;
  padding: 13px 22px;
  border-radius: 999px;
  transition: translate .2s ease;
}

.desk .choice-button.button--yes .choice-face {
  color: #fff;
  background: var(--burgundy);
  box-shadow: 0 5px 0 var(--burgundy-dark);
}

.desk .choice-button.button--no .choice-face {
  color: #78515a;
  background: var(--paper);
  border: 1px dashed #ac7b83;
}

.desk[data-disguised] [data-no-costume] {
  display: inline;
}

.desk[data-disguised] [data-no-costume]::before {
  content: "🥸";
  margin-inline-end: .35em;
}

.desk [data-trick-artifact] {
  pointer-events: none;
}

.trick-excuse,
.trick-return-stamp,
.trick-garden-item,
.trick-spotlight-overlay {
  position: absolute;
  z-index: 6;
}

.trick-spotlight-overlay {
  inset: 0;
  background: radial-gradient(
    circle 120px at var(--spotlight-x) var(--spotlight-y),
    transparent 0 70%,
    rgba(42, 22, 31, .65) 72%
  );
}
~~~

Keep the current legacy class/keyframe block at the end of this file for the Task 5 compatibility adapter, after the new layered rules. Task 6 removes every old '.trick-runaway', '.trick-magnet', '.trick-plane', '.trick-returned', '.trick-growing', '.trick-swapped', and '.trick-spotlight' rule when the controller switches to the runner. Reduced Motion for the new registry is controlled by runner timing; retain only any static high-contrast visual needed to tell the joke.

Also override the existing button-level YES/NO background, border, shadow, and hover transform for '.choice-button'; those visual pill styles now belong to '.choice-face'. This keeps the unscaled semantic button's hit/focus rectangle at least 44 by 44 while the complete visual pill grows or shrinks.

- [ ] **Step 5: Run effect, layout, and build checks**

Run:

~~~powershell
npm test -- src/ui/trick-effects.test.ts src/ui/trick-runner.test.ts
npx playwright test tests/e2e/no-tricks.spec.ts -g "stable semantic buttons" --project=desktop-chromium
npm run build
~~~

Expected: focused unit/browser tests pass and production build succeeds through the compatibility adapter.

- [ ] **Step 6: Commit the definitions and CSS**

~~~powershell
git add src/ui/trick-effects.ts src/ui/trick-effects.test.ts src/styles/tricks.css
git commit -m "feat: add owned trick definitions"
~~~

### Task 6: Route every accepted NO click through one controller transaction

**Files:**
- Create: 'src/ui/invitation-controller.test.ts'
- Modify: 'src/ui/invitation-controller.ts'
- Modify: 'src/ui/trick-effects.ts'
- Modify: 'src/styles/tricks.css'
- Create: 'tests/e2e/trick-helpers.ts'
- Modify: 'tests/e2e/no-tricks.spec.ts'
- Modify: 'tests/e2e/choice-flows.spec.ts'
- Modify: 'tests/e2e/accessibility.spec.ts'

- [ ] **Step 1: Write controller transaction tests through injected dependencies**

Make 'wireInvitation(view, config, dependencies?)' accept:

~~~ts
export interface InvitationDependencies {
  readonly deck?: TrickDeck;
  readonly runner?: TrickRunner;
}
~~~

Use EventTarget-based fake buttons/view, a fake deck with counted 'next()', and a fake runner with controllable 'TrickRun.finished'. The busy-path test must be complete:

~~~ts
it("busy NO clicks do not draw, count, cancel, queue, or clear disguise", async () => {
  const fixture = setupController();
  fixture.setRunnerBusy(true);

  fixture.view.noButton.dispatchEvent(Object.assign(new Event("click"), {
    clientX: 0,
    clientY: 0,
  }));
  await Promise.resolve();

  expect(fixture.deck.next).not.toHaveBeenCalled();
  expect(fixture.runner.start).not.toHaveBeenCalled();
  expect(fixture.runner.clearDisguise).not.toHaveBeenCalled();
  expect(fixture.runner.reset).not.toHaveBeenCalled();
  expect(fixture.controller.getState()).toEqual({
    kind: "asking",
    attempts: 0,
    canRefuse: false,
  });
  expect(fixture.view.noButton.disabled).toBe(false);
  expect(fixture.view.status.textContent).toContain("finish");
});
~~~

Create the remaining controller tests with these exact event sequences and assertions:

| Test | Sequence | Required assertions |
| --- | --- | --- |
| one native NO click draws, advances, and starts exactly once | Dispatch one NO click with ready runner. | Deck and start each called once; attempts is 1; one run token exists. |
| pointerenter never draws or advances | Dispatch mouse pointerenter twice. | Deck/start counts stay zero and attempts stays zero. |
| busy NO remains enabled and announces that the trick must finish | Focus NO, set busy, click. | Focus stays on NO, disabled false, polite text contains finish. |
| keeps the ordinary label until the eighth run settles | Complete seven runs, start deferred eighth. | Internal attempts is 8, label remains 'NO, SORRY'; after resolve, setRefusalReady called once and label becomes refusal copy. |
| opens genuine refusal on click nine without drawing a ninth trick | Settle eight, dispatch one more click. | Dialog opens; deck/start remain at eight calls; attempts remains 8. |
| reopens confirmation after Escape without drawing | Open genuine refusal, close the fake dialog without a state transition, click NO again. | Dialog opens again; deck/start and attempts remain unchanged. |
| clears disguise before the same accepted click starts the next trick | Configure runner visual state disguised and ready, click. | clearDisguise call precedes deck/start; attempts increases once. |
| keeps eighth-trick costume while refusal copy takes priority | Make Tiny Disguise the deferred eighth and resolve it. | visual state remains disguised, setRefusalReady true, visible/accessibility copy is genuine refusal. |
| YES cancels an active run and late completion cannot rewrite success | Start deferred run, click YES, then resolve old run. | reset once; success shown once; refusal label/status is not written late. |
| dispose invalidates a pending transaction | Start deferred run, dispose, resolve. | runner.dispose once, listeners no longer react, no late UI write. |
| confirmed decline resets all visual layers before rendering | Reach dialog and dispatch confirm. | runner.reset occurs before declined panel becomes visible; external links stay hidden. |

Assert runner/deck call counts, exact 'getState().attempts', dialog calls, NO 'disabled === false', and label timing.

- [ ] **Step 2: Run controller tests and verify RED**

Run:

~~~powershell
npm test -- src/ui/invitation-controller.test.ts
~~~

Expected: FAIL because current controller has pointer throttling/capture guards and no runner dependency.

- [ ] **Step 3: Replace pointer routing with one async click handler**

Delete 'lastPointerAttemptAt', 'guardUntil', the stage capture listener, 'fromPointer', every pointer throttle branch, and the NO 'pointerenter' listener.

Delete the Task 5 compatibility surface from 'trick-effects.ts' at the same time: 'LegacyTrickContext', 'LegacyTrickEffect', 'LEGACY_TRICK_EFFECTS', 'applyTrick', 'replay', 'temporaryLabel', and 'temporaryLabelVersions'. The concrete exported surface after this step is only 'TRICK_EFFECTS' plus the types needed by its unit tests.

Delete the matching legacy class/keyframe compatibility block from 'src/styles/tricks.css'. The remaining rules use only seat/motion/face variables, data attributes, and owned artifact classes.

Create the default dependencies once:

~~~ts
const deck = dependencies.deck ?? createTrickDeck();
const runner = dependencies.runner ?? createTrickRunner(view, TRICK_EFFECTS);
let transactionToken = 0;
let disposed = false;
~~~

Implement the NO handler in this order:

~~~ts
const attemptNo = async (event: MouseEvent): Promise<void> => {
  if (disposed) return;
  if (state.kind === "confirmingNo") {
    if (!view.dialog.open) view.dialog.showModal();
    return;
  }
  if (state.kind !== "asking") return;

  if (runner.busy) {
    view.status.textContent = "One tiny trick at a time — let this one finish first.";
    return;
  }

  runner.clearDisguise();

  if (state.canRefuse) {
    state = transition(state, { type: "REAL_NO" });
    if (state.kind === "confirmingNo") view.dialog.showModal();
    return;
  }

  const trick = deck.next();
  state = transition(state, { type: "NO_ATTEMPT" });
  if (state.kind !== "asking") return;

  view.stage.dataset.attempts = String(state.attempts);
  const token = ++transactionToken;
  const buttonRect = view.noButton.getBoundingClientRect();
  const letterRect = view.letter.getBoundingClientRect();
  const activation = event.clientX || event.clientY
    ? { x: event.clientX - letterRect.left, y: event.clientY - letterRect.top }
    : {
        x: buttonRect.left + buttonRect.width / 2 - letterRect.left,
        y: buttonRect.top + buttonRect.height / 2 - letterRect.top,
      };

  const result = await runner.start(trick, state.attempts, activation).finished;
  if (
    disposed
    || token !== transactionToken
    || result.outcome === "cancelled"
    || state.kind !== "asking"
  ) return;

  if (state.canRefuse) {
    view.noButton.dataset.locked = "true";
    runner.setRefusalReady(true);
    view.status.textContent = "A real refusal option is now available.";
  }
};
~~~

Register only:

~~~ts
const noClick = (event: MouseEvent): void => {
  void attemptNo(event);
};
view.noButton.addEventListener("click", noClick);
~~~

- [ ] **Step 4: Make terminal paths invalidate and reset synchronously**

At the beginning of YES and confirmed decline:

~~~ts
transactionToken += 1;
runner.reset();
~~~

Use 'runner.reset()' instead of the old 'cleanupResultTricks'. Preserve existing success, Calendar, Telegram, dialog, focus, and declined-result behavior.

Extend the controller contract:

~~~ts
export interface InvitationController {
  getState(): InvitationState;
  dispose(): void;
}
~~~

'dispose()' sets 'disposed = true', invalidates the token, removes every registered DOM listener, and calls 'runner.dispose()'; runner disposal already performs its own reset, so the controller does not call 'runner.reset()' a second time.

- [ ] **Step 5: Migrate the now-obsolete browser expectations atomically**

Create the first version of 'tests/e2e/trick-helpers.ts':

~~~ts
import { expect, type Page } from "@playwright/test";

export async function waitForTrickIdle(page: Page): Promise<void> {
  const stage = page.locator("[data-stage]");
  await expect(stage).toHaveAttribute("data-trick-busy", "false");
  await expect(stage).toHaveAttribute("aria-busy", "false");
}

export async function activateNoAndWait(
  page: Page,
  mode: "mouse" | "tap" | "enter" | "space" = "mouse",
): Promise<void> {
  const no = page.locator("[data-no]");
  if (mode === "mouse") await no.click();
  if (mode === "tap") await no.tap();
  if (mode === "enter") {
    await no.focus();
    await page.keyboard.press("Enter");
  }
  if (mode === "space") {
    await no.focus();
    await page.keyboard.press("Space");
  }
  await waitForTrickIdle(page);
}

export async function unlockRealNo(page: Page): Promise<void> {
  for (let index = 0; index < 8; index += 1) await activateNoAndWait(page);
}
~~~

Update existing tests in the same commit:

- 'no-tricks.spec.ts': replace the pointerenter/throttle test with hover-inert coverage; make the eight-trick and swap/spotlight sequences await idle after each accepted click; keep Growing hover cosmetic.
- 'choice-flows.spec.ts': import the shared 'unlockRealNo'; replace the pointer-guard test with a minimal YES-during-busy cancellation test; seed '[data-trick-artifact]' and persistent data/CSS variables instead of removed legacy classes.
- 'accessibility.spec.ts': use 'activateNoAndWait' for Enter/touch loops; replace the fixed Reduced Motion translation assertion with same-attempt/same-last-trick plus idle/no-residue assertions.

Delete no coverage in this step without a replacement assertion. These edits are required because ignored busy clicks are the new correct behavior.

- [ ] **Step 6: Run focused, domain, and migrated browser regressions**

Run:

~~~powershell
npm test -- src/ui/invitation-controller.test.ts src/ui/trick-runner.test.ts src/domain/invitation-machine.test.ts src/domain/trick-deck.test.ts
npm run typecheck
npx playwright test tests/e2e/no-tricks.spec.ts tests/e2e/choice-flows.spec.ts tests/e2e/accessibility.spec.ts
~~~

Expected: controller/lifecycle/domain tests pass, migrated browser tests pass on desktop/mobile, and typecheck exits 0.

- [ ] **Step 7: Commit click-only transactions and their baseline E2E migration**

~~~powershell
git add src/ui/invitation-controller.ts src/ui/invitation-controller.test.ts src/ui/trick-effects.ts src/styles/tricks.css tests/e2e/trick-helpers.ts tests/e2e/no-tricks.spec.ts tests/e2e/choice-flows.spec.ts tests/e2e/accessibility.spec.ts
git commit -m "feat: trigger tricks from no clicks"
~~~

### Task 7: Add deterministic browser helpers and verify all ten trick behaviors

**Files:**
- Modify: 'tests/e2e/trick-helpers.ts'
- Modify: 'tests/e2e/no-tricks.spec.ts'
- Create: 'tests/e2e/trick-catalog.spec.ts'
- Modify: 'tests/e2e/choice-flows.spec.ts'

- [ ] **Step 1: Extend the shared helper with deterministic Fisher-Yates and diagnostics**

'forceTrickOrder(page, desired)' computes the same Fisher-Yates swap samples used by 'createTrickDeck' and installs them before navigation; do not add a production query field or global test hook.

~~~ts
export async function forceTrickOrder(
  page: Page,
  desired: readonly TrickId[],
): Promise<void> {
  const source = [...TRICK_IDS];
  const fullOrder = [...desired, ...source.filter((id) => !desired.includes(id))];
  const samples: number[] = [];

  for (let index = source.length - 1; index > 0; index -= 1) {
    const swapIndex = source.indexOf(fullOrder[index]!, 0);
    if (swapIndex > index) throw new Error("Invalid target shuffle");
    samples.push((swapIndex + 0.5) / (index + 1));
    [source[index], source[swapIndex]] = [source[swapIndex]!, source[index]!];
  }

  await page.addInitScript((values) => {
    let cursor = 0;
    Math.random = () => values[cursor++] ?? 0.5;
  }, samples);
}
~~~

Retain Task 6's 'waitForTrickIdle', 'activateNoAndWait', and 'unlockRealNo' unchanged. Add 'capturePageErrors', 'assertNoTrickResidue', and 'buttonIdentityToken' helpers. Residue means no '[data-trick-artifact]', no active descendant animation except the letter arrival/result animation, busy false, initial scale/pose/swap/disguise variables after a terminal result.

- [ ] **Step 2: Rewrite click, busy, and refusal tests**

'tests/e2e/no-tricks.spec.ts' starts with this complete hover regression:

~~~ts
test("hover is cosmetic and leaves all eight attempts available", async ({ page }) => {
  await page.goto("/?to=Jamie");
  const no = page.locator("[data-no]");
  const stage = page.locator("[data-stage]");

  for (let index = 0; index < 5; index += 1) {
    await no.hover();
    await page.mouse.move(0, 0);
  }

  await expect(stage).not.toHaveAttribute("data-last-trick");
  await expect(stage).toHaveAttribute("data-attempts", "0");
  for (let index = 0; index < 8; index += 1) await activateNoAndWait(page);
  await expect(page.locator("[data-no]")).toContainText("Okay, I'll behave…");
});
~~~

Add the remaining tests with these exact assertions:

| Test | Required assertions |
| --- | --- |
| one mouse click accepts exactly one trick | attempts changes 0 to 1, exactly one last-trick ID appears, no success. |
| busy NO activations are ignored without queueing or disabling NO | one long run plus five rapid dispatches ends at attempts 1; NO is enabled/focusable; after idle no deferred run starts. |
| eight completed tricks are distinct and only then reveal genuine refusal | collect one ID after each idle, set size is 8, refusal copy absent before eighth idle and present after. |
| the genuine-refusal click draws no ninth trick | after unlock, click refusal; dialog opens; attempts and last-trick remain unchanged. |
| Growing Feelings retains scale with ordinary hover lift | force Growing, settle, compare scale before/after hover and require about -2px visual Y lift. |
| Spotlight stays centered on semantic YES after Seat Swap | force swap then spotlight; while overlay is visible, YES distance is under 30px and lower than NO distance. |

Delete the old pointerenter/throttle test. Every accepted activation waits for idle; rapid-click tests intentionally do not wait between ignored clicks.

- [ ] **Step 3: Add browser behavior for every catalog entry**

'tests/e2e/trick-catalog.spec.ts' must force each trick and assert:

- Runaway, Magnet, Paper Plane, and Return to Sender have a safe final center different from the roomy-viewport origin and retain it after 150 milliseconds idle.
- A later spatial trick replaces '[data-no-seat]' translation rather than increasing displacement without bound.
- Growing leaves YES visually larger and NO visually smaller while the semantic NO button remains at least 44 by 44.
- Seat Swap reverses visual seats without changing the YES/NO node identity tokens.
- Magnet works both before and after Seat Swap.
- Garden removes all artifacts after settle.
- Dramatic Excuse shows a separate '.trick-excuse'; '[data-no-label]' and NO width do not change.
- Spotlight center is closer to semantic YES than NO before and after swap.
- Tiny Disguise remains after idle, has an accessible name containing 'NO', and the next accepted activation clears it while also running the next trick.
- Tiny Disguise as trick eight keeps the costume, shows genuine-refusal copy, and the next click clears costume and opens the dialog without a ninth trick.
- Return's temporary stamp is removed while its pose remains.

- [ ] **Step 4: Expand the baseline busy-cancellation test with diagnostics and full cleanup**

Replace Task 6's minimal YES-during-busy body with:

~~~ts
test("YES during a busy trick cancels immediately and celebrates once", async ({ page }) => {
  const errors = capturePageErrors(page);
  await forceTrickOrder(page, ["paper-plane"]);
  await page.goto("/?to=Jamie&date=2026-08-08&time=19%3A30");

  await page.locator("[data-no]").click();
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-trick-busy", "true");
  await page.locator("[data-yes]").click();

  await expect(page.getByRole("heading", { name: "It's a date!" })).toBeVisible();
  await assertNoTrickResidue(page);
  expect(errors).toEqual([]);
});
~~~

Update every 'unlockRealNo' call in the file to use the shared async helper. Locate the genuine refusal control by '[data-no]' plus visible label text or an accessible-name regular expression containing 'Okay, I'll behave'; Tiny Disguise's eighth-attempt accessible name intentionally also identifies the NO semantic action. Expand success, confirmed decline, and Actually Yes cleanup assertions to cover pose, scale, order, disguise, spotlight/garden/bubble/stamp artifacts, busy attributes, and active trick animations.

- [ ] **Step 5: Run catalog and flow tests**

Run:

~~~powershell
npx playwright test tests/e2e/no-tricks.spec.ts tests/e2e/trick-catalog.spec.ts --project=desktop-chromium
npx playwright test tests/e2e/choice-flows.spec.ts
~~~

Expected: click/busy/catalog tests pass on desktop; choice flows pass on desktop and mobile; no page or console errors.

- [ ] **Step 6: Commit browser behavior coverage**

~~~powershell
git add tests/e2e/trick-helpers.ts tests/e2e/no-tricks.spec.ts tests/e2e/trick-catalog.spec.ts tests/e2e/choice-flows.spec.ts
git commit -m "test: cover click-triggered trick catalog"
~~~

### Task 8: Prove geometry, input parity, focus, resize, and Reduced Motion

**Files:**
- Create: 'tests/e2e/trick-geometry.spec.ts'
- Modify: 'tests/e2e/trick-helpers.ts'
- Modify: 'tests/e2e/accessibility.spec.ts'
- Modify: 'src/ui/trick-geometry.ts'
- Modify: 'src/ui/trick-runner.ts'
- Modify: 'src/styles/invitation.css'
- Modify: 'src/styles/tricks.css'

- [ ] **Step 1: Add the reusable geometry assertion**

'assertSafeNoGeometry(page)' in 'tests/e2e/trick-helpers.ts' measures:

- letter padding-box boundary and an 8-pixel inset plus 2-pixel hover reserve;
- the union of semantic YES and its visual face, expanded by 12 pixels;
- '.eyebrow', '[data-question]', '[data-note]', '.date-ticket', '[data-signature]', '.tape', and '.wax-seal', each expanded by 8 pixels;
- semantic NO at least 44 by 44;
- strict non-overlap using '<'/'>' so an exact gap passes;
- 'documentElement.scrollWidth - clientWidth <= 1';
- focus NO, allow vertical scrolling, and assert horizontal scroll changes by at most 1 pixel.

- [ ] **Step 2: Write the viewport/copy/zoom/composition matrix**

Use:

~~~ts
const VIEWPORTS = [
  { width: 320, height: 760 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const COPY_CASES = [
  "/?to=Jamie",
  "/?to=" + "W".repeat(40)
    + "&from=" + "W".repeat(40)
    + "&place=" + "W".repeat(100)
    + "&note=" + "W".repeat(240),
] as const;
~~~

For each viewport and copy case, use Reduced Motion for speed, force an order containing all four position tricks plus Growing, Seat Swap, and Tiny Disguise, and call 'assertSafeNoGeometry' after every settled transaction.

Add focused tests with these sequences:

| Test | Sequence and assertion |
| --- | --- |
| models 1280x900 at 200 percent layout zoom without horizontal scroll | Set zoom before tricks, run the persistent sequence, assert effective layout, focus reachability, and overflow after each settle. |
| Seat Swap before Cupid Magnet keeps a safe pose | Force swap then magnet and call the complete geometry assertion after both. |
| Seat Swap before Paper Plane keeps a safe pose | Force swap then plane and call the complete geometry assertion after both. |
| Growing revalidates an existing pose without snap-back | Force Runaway then Growing; compare last animation frame to settled rectangle within 1px. |
| Seat Swap revalidates an existing pose without snap-back | Force Runaway then Swap; compare last animation frame to settled rectangle within 1px. |
| desktop resize revalidates the current pose | Land a spatial trick at 1440x900, resize to 768x1024, wait one frame and assert geometry. |
| mobile portrait-to-landscape resize revalidates the current pose | On mobile project, land at 390x844, resize to 844x390 and assert geometry/focus. |
| persistent layer combinations never create horizontal overflow | Run pose, scale, swap, disguise, and a replacement pose; require overflow at most 1 after each. |

Model the zoom case with Playwright's documented emulation settings in a dedicated describe block:

~~~ts
test.describe("1280x900 physical viewport at 200 percent zoom", () => {
  test.use({
    viewport: { width: 640, height: 450 },
    deviceScaleFactor: 2,
  });

  test("keeps persistent tricks horizontally reflowed and focusable", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop zoom model");
    await page.goto("/?to=Jamie");
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([640, 450]);
    for (let index = 0; index < 8; index += 1) {
      await activateNoAndWait(page);
      await assertSafeNoGeometry(page);
    }
  });
});
~~~

'deviceScaleFactor' models the doubled device-pixel density while the 640-by-450 CSS viewport models the reflow created by 200% zoom on a 1280-by-900 physical viewport. Do not use CSS 'zoom', because it does not exercise the same viewport/media-query contract.

Mark the six-viewport/copy matrix and desktop resize/composition cases desktop-only so the full two-project suite does not duplicate them under the Pixel device descriptor. Keep the explicit mobile orientation case in 'accessibility.spec.ts'.

For no-snap tests, pause the final owned motion animation at its last keyframe, record the semantic button rectangle, finish it, wait two animation frames, and require every edge delta to be at most 1 pixel.

- [ ] **Step 3: Rewrite accessibility input/mode tests**

Keep keyboard YES/focus coverage. Replace rapid keyboard loops with shared accepted-transaction helpers and add:

| Test | Required sequence and assertions |
| --- | --- |
| Enter accepts exactly one NO transaction | Focus NO, press Enter once, wait idle; attempts is 1 and status is nonempty. |
| Space accepts exactly one NO transaction | Focus NO, press Space once, wait idle; attempts is 1 and status is nonempty. |
| one mobile tap accepts exactly one NO transaction | Mobile-only tap; attempts is 1, one ID exists, success hidden. |
| moving and swapping preserve semantic button nodes and NO focus | Save node identity tokens, run move/swap, assert tokens unchanged and NO remains focused. |
| busy NO stays in keyboard order and exposes aria-busy | Start long run, Tab through controls, assert NO reachable, not disabled, and stage busy true. |
| every trick has a polite textual announcement | Force all ten in separate reloads, activate, require status text before settle and 'aria-live="polite"'. |
| keyboard-only completes eight tricks and genuine refusal | Run eight Enter activations with idle waits, activate refusal, confirm with keyboard, final heading focused. |
| mobile touch completes all eight accepted transactions | Mobile-only run eight taps with idle waits, refusal visible and dialog still closed. |
| Reduced Motion completes eight tricks with the same persistent state | Run the same forced order full/reduced, compare final visual-state datasets/variables and attempts. |

Delete the old Reduced Motion assertion for fixed 'translate(14px, -4px)'; new Reduced Motion commits the same validated target as full motion.

- [ ] **Step 4: Run the new matrix and fix only measured failures**

Run:

~~~powershell
npx playwright test tests/e2e/trick-geometry.spec.ts --project=desktop-chromium
npx playwright test tests/e2e/accessibility.spec.ts
~~~

Expected: every geometry and accessibility case passes. If a measurement fails, adjust candidate ranking, scale clamp, letter padding, or artifact placement while preserving the exact hard constants; do not weaken an assertion.

- [ ] **Step 5: Run rapid cancellation/error regressions**

Run:

~~~powershell
npx playwright test tests/e2e/choice-flows.spec.ts -g "busy trick|clears trick visuals"
npm test -- src/ui/trick-geometry.test.ts src/ui/trick-runner.test.ts src/ui/invitation-controller.test.ts
~~~

Expected: no pageerror/console.error events, no runner residue, all focused unit tests pass.

- [ ] **Step 6: Commit geometry and accessibility hardening**

~~~powershell
git add tests/e2e/trick-helpers.ts tests/e2e/trick-geometry.spec.ts tests/e2e/accessibility.spec.ts src/ui/trick-geometry.ts src/ui/trick-runner.ts src/styles/invitation.css src/styles/tricks.css
git commit -m "test: harden trick geometry and input modes"
~~~

### Task 9: Update the superseded docs and run final verification

**Files:**
- Modify: 'README.md:45'
- Modify: 'docs/superpowers/specs/2026-07-15-jamie-date-invitation-design.md:121-145'

- [ ] **Step 1: Update user-facing interaction documentation**

Replace README's current NO paragraph with:

~~~markdown
The first eight deliberate NO activations each run one non-repeating playful trick. Hover is cosmetic and never counts. While one trick is moving, extra NO activations are ignored rather than queued, and YES remains available. After trick eight settles, a genuine refusal option appears; Jamie must activate it and explicitly confirm once more before the refusal is accepted respectfully.
~~~

In the original design specification, keep the ten names but replace the obsolete trigger catalog and section 6.1 pointer rules with a direct reference:

~~~markdown
The click-only trigger contract, lifecycle architecture, persistent-state rules, revised behavior of all ten tricks, accessibility requirements, and geometry thresholds are defined by '2026-07-16-click-triggered-tricks-design.md', which supersedes the original pointer-proximity, first-tap touch, stale-click guard, and keyboard-specific trick behavior in this section.
~~~

- [ ] **Step 2: Scan the implementation for removed pointer/legacy mechanisms**

Run:

~~~powershell
rg -n "pointerenter|lastPointerAttemptAt|guardUntil|fromPointer|temporaryLabel|trick-runaway|trick-magnet|trick-plane|trick-returned" src tests
~~~

Expected: no matches. A cosmetic CSS ':hover' selector is expected and is not included in this search.

- [ ] **Step 3: Run formatting and static checks**

Run:

~~~powershell
git diff --check
npm run typecheck
npm run build
~~~

Expected: no whitespace errors; typecheck and build exit 0.

- [ ] **Step 4: Run the full unit and browser suite**

Run:

~~~powershell
npm test
npm run test:e2e
~~~

Expected: all unit tests pass; all local Playwright tests pass with only the existing live-site/project-gated skips.

- [ ] **Step 5: Run the one-command release gate**

Run:

~~~powershell
npm run check
~~~

Expected: Vitest, desktop/mobile Playwright, typecheck, and Vite production build all pass in sequence.

- [ ] **Step 6: Inspect scope and commit documentation**

Run:

~~~powershell
git status --short
git diff --stat ec1c542..HEAD
~~~

Expected: only the files listed in this plan changed; no 'work/' content, URL/integration modules, dependency files, or build artifacts are tracked.

Then commit:

~~~powershell
git add README.md docs/superpowers/specs/2026-07-15-jamie-date-invitation-design.md
git commit -m "docs: explain click-only no tricks"
~~~

## Final acceptance map

| Approved criterion | Primary proof |
| --- | --- |
| Hover never consumes a trick | Controller unit pointerenter test and 'no-tricks' hover flow. |
| One accepted early click gives one non-repeating trick | Controller call counts, deck test, mouse/touch/keyboard E2E. |
| Busy NO is ignored without queue/count | Runner busy state, deferred controller test, rapid-click E2E. |
| YES remains immediate | Controller token invalidation and busy-cancel choice flow. |
| Trick eight settles before refusal | Deferred eighth-run controller test and eight-click E2E. |
| Spatial tricks retain safe endings | Catalog persistence tests and geometry matrix. |
| Position replaces while scale/order compose | State unit test, geometry preview tests, combination E2E. |
| Tiny Disguise persists and handles the eighth edge | Effect/controller tests and two catalog flows. |
| Exact geometry and hit/focus thresholds | Pure geometry limits plus viewport/copy/zoom/resize matrix. |
| Complete/cancel/fallback/Reduced Motion leave no residue | Runner fake-timer tests, accessibility modes, and terminal cleanup flows. |

## Execution handoff

The selected execution mode is Subagent-Driven. Use a fresh implementation subagent for each numbered task, then run the subagent-driven skill's specification review followed by code-quality review before advancing to the next task. Keep every task on 'codex/click-triggered-tricks' in the isolated worktree above.
