import {
  applyTrickVisualPatch,
  INITIAL_TRICK_VISUAL_STATE,
} from "./trick-state";
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

function insetLetterBoundary(snapshot: GeometrySnapshot): Rect {
  return rect(
    snapshot.letterPaddingBox.left + LETTER_INSET,
    snapshot.letterPaddingBox.top + LETTER_INSET + 2,
    snapshot.letterPaddingBox.width - LETTER_INSET * 2,
    snapshot.letterPaddingBox.height - LETTER_INSET * 2 - 2,
  );
}

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

function normalizedIndex(value: number, length: number): number {
  const integer = Number.isFinite(value) ? Math.trunc(value) : 0;
  return ((integer % length) + length) % length;
}

interface SlotCandidate {
  readonly point: Point;
  readonly tieOrder: number;
}

function squaredDistance(first: Point, second: Point): number {
  const x = first.x - second.x;
  const y = first.y - second.y;
  return x * x + y * y;
}

export function chooseSafeNoPose(
  snapshot: GeometrySnapshot,
  query: PoseQuery,
): NoPose | null {
  const boundary = insetLetterBoundary(snapshot);
  const current = center(snapshot.currentNo);
  const currentYes = center(snapshot.yes);
  const offset = normalizedIndex(
    query.attempt + INTENT_SEED[query.intent],
    SLOT_FACTORS.length,
  );
  const slots = SLOT_FACTORS.map(([xFactor, yFactor]) => ({
    point: {
      x: boundary.left + boundary.width * xFactor,
      y: boundary.top + boundary.height * yFactor,
    },
  }));
  const rotated = [...slots.slice(offset), ...slots.slice(0, offset)]
    .map((candidate, tieOrder): SlotCandidate => ({ ...candidate, tieOrder }));

  rotated.sort((first, second) => {
    let difference: number;
    switch (query.intent) {
      case "runaway":
        difference = squaredDistance(second.point, current) - squaredDistance(first.point, current);
        break;
      case "magnet":
        difference = squaredDistance(first.point, currentYes) - squaredDistance(second.point, currentYes);
        break;
      case "plane":
        difference = Math.abs(second.point.x - current.x) - Math.abs(first.point.x - current.x);
        break;
      case "returned": {
        const firstEdge = Math.min(
          first.point.x - boundary.left,
          boundary.right - first.point.x,
          first.point.y - boundary.top,
          boundary.bottom - first.point.y,
        );
        const secondEdge = Math.min(
          second.point.x - boundary.left,
          boundary.right - second.point.x,
          second.point.y - boundary.top,
          boundary.bottom - second.point.y,
        );
        difference = firstEdge - secondEdge;
        break;
      }
    }
    return difference || first.tieOrder - second.tieOrder;
  });

  for (const [candidateIndex, candidate] of rotated.entries()) {
    const pose: NoPose = {
      centerX: candidate.point.x,
      centerY: candidate.point.y,
      rotation: ROTATIONS[normalizedIndex(
        query.attempt + candidateIndex,
        ROTATIONS.length,
      )]!,
    };
    if (Math.hypot(pose.centerX - current.x, pose.centerY - current.y) >= 24
      && isSafeNoRect(snapshot, poseRect(pose, snapshot.noHitSize))) {
      return pose;
    }
  }

  const fallbackPose: NoPose = {
    centerX: current.x,
    centerY: current.y,
    rotation: query.currentRotation,
  };
  if (isSafeNoRect(snapshot, poseRect(fallbackPose, snapshot.noHitSize))) return fallbackPose;
  return null;
}

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

const PROTECTED_SELECTOR = ".eyebrow, [data-question], [data-note], .date-ticket, [data-signature], .tape, .wax-seal";
const NORMAL_NO_LABEL = "NO, SORRY";
const DISGUISED_NO_LABEL = "DEFINITELY YES";
const REFUSAL_NO_LABEL = "Okay, I'll behave…";
const DISGUISED_ARIA_LABEL = "NO option, wearing a DEFINITELY YES disguise";
const REFUSAL_ARIA_LABEL = "NO refusal option: Okay, I'll behave…";

function asDomRect(value: Rect): DOMRectReadOnly {
  const json = {
    x: value.left,
    y: value.top,
    left: value.left,
    top: value.top,
    right: value.right,
    bottom: value.bottom,
    width: value.width,
    height: value.height,
  };
  return Object.freeze({
    ...json,
    toJSON: () => ({ ...json }),
  }) as DOMRectReadOnly;
}

function rectFromDom(value: DOMRectReadOnly): Rect {
  return rect(value.left, value.top, value.width, value.height);
}

function unionRects(values: readonly Rect[]): Rect {
  const first = values[0];
  if (!first) return rect(0, 0, 0, 0);
  let left = first.left;
  let top = first.top;
  let right = first.right;
  let bottom = first.bottom;
  for (const value of values.slice(1)) {
    left = Math.min(left, value.left);
    top = Math.min(top, value.top);
    right = Math.max(right, value.right);
    bottom = Math.max(bottom, value.bottom);
  }
  return rect(left, top, right - left, bottom - top);
}

function localRect(value: Rect, letterRect: Rect): Rect {
  return rect(
    value.left - letterRect.left,
    value.top - letterRect.top,
    value.width,
    value.height,
  );
}

function borderWidth(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface Measurement {
  readonly snapshot: GeometrySnapshot;
  readonly yesVisual: DOMRectReadOnly;
  readonly noVisual: DOMRectReadOnly;
}

interface ValidatedTarget {
  readonly state: Readonly<TrickVisualState>;
  readonly measurement: Measurement;
}

function isSafeYesRect(snapshot: GeometrySnapshot): boolean {
  const boundary = insetLetterBoundary(snapshot);
  const candidate = snapshot.yes;
  return candidate.left >= boundary.left
    && candidate.right <= boundary.right
    && candidate.top >= boundary.top
    && candidate.bottom <= boundary.bottom
    && candidate.left >= snapshot.viewport.left - VIEWPORT_TOLERANCE
    && candidate.right <= snapshot.viewport.right + VIEWPORT_TOLERANCE
    && snapshot.protectedRects.every(
      (protectedRect) => !overlaps(candidate, expandRect(protectedRect, PROTECTED_GAP)),
    );
}

function isSafeMeasurement(measurement: Measurement): boolean {
  return isSafeNoRect(measurement.snapshot, measurement.snapshot.currentNo)
    && isSafeYesRect(measurement.snapshot);
}

export function createTrickVisualController(
  elements: TrickRenderElements,
): TrickVisualController {
  let committed: Readonly<TrickVisualState> = INITIAL_TRICK_VISUAL_STATE;
  let refusalReady = false;

  function renderCopy(state: Readonly<TrickVisualState>): void {
    elements.noLabel.textContent = refusalReady
      ? REFUSAL_NO_LABEL
      : state.disguised ? DISGUISED_NO_LABEL : NORMAL_NO_LABEL;
    elements.noCostume.textContent = state.disguised ? "🥸" : "";
    elements.noCostume.hidden = !state.disguised;

    if (!state.disguised) {
      elements.noButton.removeAttribute("aria-label");
    } else {
      elements.noButton.setAttribute(
        "aria-label",
        refusalReady ? REFUSAL_ARIA_LABEL : DISGUISED_ARIA_LABEL,
      );
    }
  }

  function clearPoseProperties(): void {
    elements.noSeat.style.removeProperty("--no-pose-x");
    elements.noSeat.style.removeProperty("--no-pose-y");
    elements.noSeat.style.removeProperty("--no-rotation");
  }

  function render(state: Readonly<TrickVisualState>): void {
    elements.yesFace.style.setProperty("--yes-scale", String(state.yesScale));
    elements.noFace.style.setProperty("--no-scale", String(state.noScale));
    elements.stage.toggleAttribute("data-swapped", state.swapped);
    elements.stage.toggleAttribute("data-disguised", state.disguised);
    renderCopy(state);
    clearPoseProperties();

    if (state.noPose) {
      const letterBox = rectFromDom(elements.letter.getBoundingClientRect());
      const anchorBox = rectFromDom(elements.noSeat.getBoundingClientRect());
      const anchor = center(localRect(anchorBox, letterBox));
      elements.noSeat.style.setProperty(
        "--no-pose-x",
        `${state.noPose.centerX - anchor.x}px`,
      );
      elements.noSeat.style.setProperty(
        "--no-pose-y",
        `${state.noPose.centerY - anchor.y}px`,
      );
      elements.noSeat.style.setProperty("--no-rotation", `${state.noPose.rotation}deg`);
    }
  }

  function measure(): Measurement {
    const letterViewportBox = rectFromDom(elements.letter.getBoundingClientRect());
    const readLocalBox = (element: Element): Rect => localRect(
      rectFromDom(element.getBoundingClientRect()),
      letterViewportBox,
    );
    const yesSeatBox = readLocalBox(elements.yesSeat);
    const yesButtonBox = readLocalBox(elements.yesButton);
    const yesFaceBox = readLocalBox(elements.yesFace);
    const noSeatBox = readLocalBox(elements.noSeat);
    const noButtonBox = readLocalBox(elements.noButton);
    const noFaceBox = readLocalBox(elements.noFace);
    const protectedBoxes = Array.from(
      elements.letter.querySelectorAll(PROTECTED_SELECTOR),
      readLocalBox,
    );
    const computed = getComputedStyle(elements.letter);
    const borderLeft = borderWidth(computed.borderLeftWidth);
    const borderRight = borderWidth(computed.borderRightWidth);
    const borderTop = borderWidth(computed.borderTopWidth);
    const borderBottom = borderWidth(computed.borderBottomWidth);
    const yesProtected = unionRects([yesButtonBox, yesFaceBox]);
    const yesVisual = unionRects([yesSeatBox, yesButtonBox, yesFaceBox]);
    const noVisual = unionRects([noSeatBox, noButtonBox, noFaceBox]);

    return {
      snapshot: {
        letterPaddingBox: rect(
          borderLeft,
          borderTop,
          letterViewportBox.width - borderLeft - borderRight,
          letterViewportBox.height - borderTop - borderBottom,
        ),
        viewport: {
          left: -letterViewportBox.left,
          right: window.innerWidth - letterViewportBox.left,
        },
        currentNo: noVisual,
        noHitSize: {
          width: elements.noButton.offsetWidth,
          height: elements.noButton.offsetHeight,
        },
        yes: yesProtected,
        protectedRects: protectedBoxes,
      },
      yesVisual: asDomRect(yesVisual),
      noVisual: asDomRect(noVisual),
    };
  }

  function renderAndMeasureIfSafe(
    state: Readonly<TrickVisualState>,
  ): ValidatedTarget | null {
    render(state);
    const measurement = measure();
    return isSafeMeasurement(measurement)
      ? { state, measurement }
      : null;
  }

  function clampYesTowardSafe(
    state: Readonly<TrickVisualState>,
  ): ValidatedTarget | null {
    let scale = state.yesScale;
    while (true) {
      const candidate = scale === state.yesScale
        ? state
        : applyTrickVisualPatch(state, { yesScale: scale });
      const validated = renderAndMeasureIfSafe(candidate);
      if (validated) return validated;
      if (scale <= 1) return null;
      scale = Math.max(1, Number((scale - 0.01).toFixed(10)));
    }
  }

  function validate(
    requested: Readonly<TrickVisualState>,
    fallback: ValidatedTarget,
  ): ValidatedTarget {
    let candidate = requested;
    let validated = clampYesTowardSafe(candidate);
    if (validated) return validated;

    if (candidate.noPose) {
      candidate = applyTrickVisualPatch(candidate, { noPose: null });
      validated = clampYesTowardSafe(candidate);
      if (validated) return validated;
    }

    if (candidate.swapped) {
      candidate = applyTrickVisualPatch(candidate, { swapped: false });
      validated = clampYesTowardSafe(candidate);
      if (validated) return validated;
    }

    candidate = applyTrickVisualPatch(candidate, { yesScale: 1 });
    render(candidate);
    const originMeasurement = measure();
    const rebasedPose = chooseSafeNoPose(originMeasurement.snapshot, {
      intent: "returned",
      attempt: 0,
      currentRotation: requested.noPose?.rotation ?? 0,
    });
    if (rebasedPose) {
      const rebased = applyTrickVisualPatch(candidate, { noPose: rebasedPose });
      validated = renderAndMeasureIfSafe(rebased);
      if (validated) return validated;
    }

    if (isSafeMeasurement(fallback.measurement)) return fallback;

    throw new Error("Unable to produce a safe trick visual state");
  }

  function validateCopyReflow(
    requested: Readonly<TrickVisualState>,
  ): ValidatedTarget {
    let validated = renderAndMeasureIfSafe(requested);
    if (validated) return validated;

    const unposed = requested.noPose
      ? applyTrickVisualPatch(requested, { noPose: null })
      : requested;
    if (unposed !== requested) {
      validated = renderAndMeasureIfSafe(unposed);
      if (validated) return validated;
    }

    render(unposed);
    const measurement = measure();
    const rebasedPose = chooseSafeNoPose(measurement.snapshot, {
      intent: "returned",
      attempt: 0,
      currentRotation: requested.noPose?.rotation ?? 0,
    });
    if (rebasedPose) {
      const rebased = applyTrickVisualPatch(unposed, { noPose: rebasedPose });
      validated = renderAndMeasureIfSafe(rebased);
      if (validated) return validated;
    }

    throw new Error("Unable to rebase the NO pose after copy reflow");
  }

  const transitionElements = [
    elements.actions,
    elements.yesSeat,
    elements.noSeat,
    elements.yesMotion,
    elements.noMotion,
    elements.yesButton,
    elements.noButton,
    elements.yesFace,
    elements.noFace,
  ] as const;

  function suppressTransitions(): () => void {
    const previous = transitionElements.map((element) => (
      element.style.getPropertyValue("transition")
    ));
    transitionElements.forEach((element) => {
      element.style.setProperty("transition", "none");
    });
    return () => {
      transitionElements.forEach((element, index) => {
        const value = previous[index];
        if (value) element.style.setProperty("transition", value);
        else element.style.removeProperty("transition");
      });
    };
  }

  function previewInternal(
    patch: TrickVisualPatch,
    preservePersistentLayers = false,
  ): VisualPreview {
    const previous = committed;
    const restoreTransitions = suppressTransitions();
    try {
      render(previous);
      const before = measure();
      const requested = applyTrickVisualPatch(previous, patch);
      const after = preservePersistentLayers
        ? validateCopyReflow(requested)
        : validate(requested, { state: previous, measurement: before });
      return Object.freeze({
        previous,
        target: after.state,
        beforeYes: before.yesVisual,
        beforeNo: before.noVisual,
        afterYes: after.measurement.yesVisual,
        afterNo: after.measurement.noVisual,
      });
    } finally {
      render(previous);
      restoreTransitions();
    }
  }

  function isCopyOnlyPatch(patch: TrickVisualPatch): boolean {
    return patch.disguised !== undefined
      && patch.noPose === undefined
      && patch.yesScale === undefined
      && patch.noScale === undefined
      && patch.swapped === undefined;
  }

  const controller: TrickVisualController = {
    get state(): Readonly<TrickVisualState> {
      return committed;
    },

    choosePose(intent: SpatialIntent, attempt: number): NoPose | null {
      render(committed);
      const current = measure();
      return chooseSafeNoPose(current.snapshot, {
        intent,
        attempt,
        currentRotation: committed.noPose?.rotation ?? 0,
      });
    },

    preview(patch: TrickVisualPatch): VisualPreview {
      return previewInternal(patch, isCopyOnlyPatch(patch));
    },

    stage(state: Readonly<TrickVisualState>): void {
      render(state);
    },

    commit(state: Readonly<TrickVisualState>): void {
      render(state);
      committed = state;
    },

    clearDisguise(): void {
      const next = previewInternal({ disguised: false }, true);
      controller.commit(next.target);
    },

    setRefusalReady(ready: boolean): void {
      refusalReady = ready;
      const next = previewInternal({}, true);
      controller.commit(next.target);
    },

    revalidate(): void {
      const next = previewInternal({});
      controller.commit(next.target);
    },

    reset(): void {
      refusalReady = false;
      controller.commit(INITIAL_TRICK_VISUAL_STATE);
    },
  };

  render(committed);
  return controller;
}
