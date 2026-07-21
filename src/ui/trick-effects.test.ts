import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRICK_IDS, type TrickId } from "../domain/trick-deck";
import type { InvitationView } from "./invitation-view";
import { TRICK_EFFECTS } from "./trick-effects";
import type {
  Point,
  SpatialIntent,
  TrickVisualController,
  VisualPreview,
} from "./trick-geometry";
import { createTrickRunner, type TrickEffectContext } from "./trick-runner";
import {
  applyTrickVisualPatch,
  INITIAL_TRICK_VISUAL_STATE,
  MAX_YES_SCALE,
  MIN_NO_FACE_SCALE,
  type NoPose,
  type TrickVisualPatch,
  type TrickVisualState,
} from "./trick-state";

function rect(left: number, top: number, width: number, height: number): DOMRectReadOnly {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRectReadOnly;
}

class FakeStyle {
  readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? "";
  }
}

class FakeDocument {
  readonly created: FakeElement[] = [];
  animationFactory: ((
    element: FakeElement,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options: KeyframeAnimationOptions,
  ) => Animation) | null = null;

  createElement(_tagName: string): HTMLElement {
    const element = new FakeElement(this);
    this.created.push(element);
    return element as unknown as HTMLElement;
  }

  createElementNS(_namespace: string, _qualifiedName: string): SVGElement {
    const element = new FakeElement(this);
    this.created.push(element);
    return element as unknown as SVGElement;
  }
}

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly style = new FakeStyle();
  readonly addEventListener = vi.fn();
  readonly removeEventListener = vi.fn();
  className = "";
  textContent: string | null = "";
  parent: FakeElement | null = null;
  removed = false;

  readonly animate = vi.fn((
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options: KeyframeAnimationOptions,
  ): Animation => {
    if (!this.ownerDocument.animationFactory) throw new Error("No animation factory configured");
    return this.ownerDocument.animationFactory(this, keyframes, options);
  });

  readonly remove = vi.fn((): void => {
    this.removed = true;
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  });

  constructor(
    readonly ownerDocument: FakeDocument,
    private currentRect: DOMRectReadOnly = rect(0, 0, 100, 48),
  ) {}

  append(...elements: FakeElement[]): void {
    for (const element of elements) {
      element.parent = this;
      this.children.push(element);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  getBoundingClientRect(): DOMRectReadOnly {
    return this.currentRect;
  }
}

const SAFE_POSE: NoPose = Object.freeze({ centerX: 470, centerY: 500, rotation: -7 });
const LEFT_SAFE_POSE: NoPose = Object.freeze({ centerX: 250, centerY: 500, rotation: 5 });
const ROTATED_SAFE_POSE: NoPose = Object.freeze({ centerX: 600, centerY: 250, rotation: 7 });
const PREVIOUS_ROTATED_POSE: NoPose = Object.freeze({ centerX: 404, centerY: 456, rotation: -4 });

interface AnimationCall {
  readonly element: unknown;
  readonly keyframes: Keyframe[] | PropertyIndexedKeyframes;
  readonly options: KeyframeAnimationOptions;
}

interface EffectFixture {
  readonly context: TrickEffectContext;
  readonly document: FakeDocument;
  readonly elements: Record<keyof InvitationView, FakeElement>;
  readonly choosePose: ReturnType<typeof vi.fn>;
  readonly preview: ReturnType<typeof vi.fn>;
  readonly animate: ReturnType<typeof vi.fn>;
  readonly trackArtifact: ReturnType<typeof vi.fn>;
  readonly animationCalls: AnimationCall[];
  readonly trackedArtifacts: FakeElement[];
}

function fakeEffectFixture(options: {
  readonly state?: Readonly<TrickVisualState>;
  readonly pose?: NoPose | null;
  readonly activation?: Point;
  readonly reducedMotion?: boolean;
  readonly letterRect?: DOMRectReadOnly;
  readonly leftYes?: DOMRectReadOnly;
  readonly rightYes?: DOMRectReadOnly;
  readonly leftNo?: DOMRectReadOnly;
  readonly rightNo?: DOMRectReadOnly;
  readonly clampedYesScale?: number;
} = {}): EffectFixture {
  const document = new FakeDocument();
  const state = options.state ?? Object.freeze({
    ...INITIAL_TRICK_VISUAL_STATE,
    yesScale: 1.2,
    noScale: 0.9,
  });
  const leftYes = options.leftYes ?? rect(120, 430, 112, 52);
  const rightYes = options.rightYes ?? rect(348, 430, 112, 52);
  const leftNo = options.leftNo ?? rect(120, 430, 104, 52);
  const rightNo = options.rightNo ?? rect(352, 430, 104, 52);
  const beforeYes = state.swapped ? rightYes : leftYes;
  const beforeNo = state.swapped ? leftNo : rightNo;

  const element = (value = rect(0, 0, 100, 48)): FakeElement => new FakeElement(document, value);
  const elements = {
    stage: element(rect(0, 0, 760, 720)),
    letter: element(options.letterRect ?? rect(60, 80, 640, 580)),
    askingPanel: element(),
    actions: element(rect(100, 400, 500, 100)),
    yesSeat: element(beforeYes),
    noSeat: element(beforeNo),
    yesMotion: element(beforeYes),
    noMotion: element(beforeNo),
    yesFace: element(beforeYes),
    noFace: element(beforeNo),
    noLabel: element(rect(beforeNo.left, beforeNo.top, 80, beforeNo.height)),
    noCostume: element(),
    yesButton: element(beforeYes),
    noButton: element(beforeNo),
    successPanel: element(),
    calendarLink: element(),
    telegramLink: element(),
    declinedPanel: element(),
    dialog: element(),
    actuallyYesButton: element(),
    confirmNoButton: element(),
    status: element(),
  } satisfies Record<keyof InvitationView, FakeElement>;
  elements.noLabel.textContent = "NO, SORRY";
  elements.stage.append(elements.letter);
  elements.letter.append(elements.actions);
  elements.actions.append(elements.yesSeat, elements.noSeat);

  const choosePose = vi.fn((_intent: SpatialIntent) => options.pose === undefined
    ? SAFE_POSE
    : options.pose);
  const preview = vi.fn((patch: TrickVisualPatch): VisualPreview => {
    const requestedTarget = applyTrickVisualPatch(state, patch);
    const target = options.clampedYesScale === undefined
      ? requestedTarget
      : applyTrickVisualPatch(requestedTarget, { yesScale: options.clampedYesScale });
    let afterYes = target.swapped ? rightYes : leftYes;
    let afterNo = target.swapped ? leftNo : rightNo;
    if (patch.noPose) {
      afterNo = rect(
        patch.noPose.centerX - beforeNo.width / 2,
        patch.noPose.centerY - beforeNo.height / 2,
        beforeNo.width,
        beforeNo.height,
      );
    }
    if (patch.swapped === undefined) afterYes = beforeYes;
    return { previous: state, target, beforeYes, beforeNo, afterYes, afterNo };
  });
  const animationCalls: AnimationCall[] = [];
  const animate = vi.fn((
    animatedElement: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    animationOptions: KeyframeAnimationOptions,
  ): Animation => {
    animationCalls.push({ element: animatedElement, keyframes, options: animationOptions });
    return {} as Animation;
  });
  const trackedArtifacts: FakeElement[] = [];
  const trackArtifact = vi.fn((artifact: HTMLElement): HTMLElement => {
    const fake = artifact as unknown as FakeElement;
    fake.dataset.trickArtifact = "true";
    trackedArtifacts.push(fake);
    return artifact;
  });
  const tracksOwnedArtifact: TrickEffectContext["trackArtifact"] = <ElementType extends HTMLElement>(
    artifact: ElementType,
  ): ElementType => {
    trackArtifact(artifact);
    return artifact;
  };

  const context: TrickEffectContext = {
    view: elements as unknown as InvitationView,
    attempt: 3,
    state,
    activation: options.activation ?? { x: 310, y: 370 },
    reducedMotion: options.reducedMotion ?? false,
    choosePose,
    preview,
    animate,
    trackArtifact: tracksOwnedArtifact,
  };

  return {
    context,
    document,
    elements,
    choosePose,
    preview,
    animate,
    trackArtifact,
    animationCalls,
    trackedArtifacts,
  };
}

function fakeEffectContext(): TrickEffectContext {
  return fakeEffectFixture().context;
}

function keyframesOf(call: AnimationCall): Keyframe[] {
  expect(Array.isArray(call.keyframes)).toBe(true);
  return call.keyframes as Keyframe[];
}

function transformAt(keyframes: Keyframe[], index: number): string {
  const resolvedIndex = index < 0 ? keyframes.length + index : index;
  return String(keyframes[resolvedIndex]?.transform);
}

function polygonPointCount(value: unknown): number {
  const match = String(value).match(/^polygon\((.*)\)$/);
  if (!match) throw new Error(`Expected polygon clip path, received: ${String(value)}`);
  return match[1]!.split(",").length;
}

function polygonPoints(value: unknown): readonly Point[] {
  const match = String(value).match(/^polygon\((.*)\)$/);
  if (!match) throw new Error(`Expected polygon clip path, received: ${String(value)}`);
  return match[1]!.split(",").map((entry) => {
    const coordinates = entry.trim().split(/\s+/);
    if (coordinates.length !== 2) throw new Error(`Expected polygon point: ${entry}`);
    return {
      x: Number.parseFloat(coordinates[0]!),
      y: Number.parseFloat(coordinates[1]!),
    };
  });
}

function interpolatedPolygonWidth(from: unknown, to: unknown, progress: number): number {
  const starts = polygonPoints(from);
  const ends = polygonPoints(to);
  expect(ends).toHaveLength(starts.length);
  const xValues = starts.map((start, index) => (
    start.x + (ends[index]!.x - start.x) * progress
  ));
  return Math.max(...xValues) - Math.min(...xValues);
}

interface ParsedMotionTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

function parseMotionTransform(value: string): ParsedMotionTransform {
  const translation = value.match(/translate\(\s*([^,]+),\s*([^)]+)\)/);
  if (!translation) throw new Error(`Missing translate() in motion transform: ${value}`);
  const rotation = value.match(/rotate\(\s*([-+\d.eE]+)deg\s*\)/);
  return {
    x: Number.parseFloat(translation[1]!),
    y: Number.parseFloat(translation[2]!),
    rotation: rotation ? Number.parseFloat(rotation[1]!) : 0,
  };
}

function rotateVector(value: Point, degrees: number): Point {
  const radians = degrees * Math.PI / 180;
  return {
    x: value.x * Math.cos(radians) - value.y * Math.sin(radians),
    y: value.x * Math.sin(radians) + value.y * Math.cos(radians),
  };
}

function letterAxesDelta(transform: string, targetRotation: number): Point {
  const local = parseMotionTransform(transform);
  return rotateVector(local, targetRotation);
}

function centerDelta(from: DOMRectReadOnly, to: DOMRectReadOnly): Point {
  return {
    x: from.left + from.width / 2 - to.left - to.width / 2,
    y: from.top + from.height / 2 - to.top - to.height / 2,
  };
}

function expectMotionInLetterAxes(
  transform: string,
  targetRotation: number,
  expectedLetterDelta: Point,
  expectedLocalRotation?: number,
): void {
  const local = parseMotionTransform(transform);
  const reconstructed = rotateVector(local, targetRotation);
  expect(reconstructed.x).toBeCloseTo(expectedLetterDelta.x, 6);
  expect(reconstructed.y).toBeCloseTo(expectedLetterDelta.y, 6);
  if (expectedLocalRotation !== undefined) {
    expect(local.rotation).toBeCloseTo(expectedLocalRotation, 6);
  }
}

function expectSettledMotion(transform: string): void {
  const settled = parseMotionTransform(transform);
  expect(settled.x).toBeCloseTo(0, 8);
  expect(settled.y).toBeCloseTo(0, 8);
  expect(settled.rotation).toBeCloseTo(0, 8);
  expect(transform).toContain("rotate(0deg)");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TRICK_EFFECTS lifecycle registry", () => {
  it("implements every trick exactly once", () => {
    const ids = Object.keys(TRICK_EFFECTS);

    expect(ids).toHaveLength(TRICK_IDS.length);
    expect(new Set(ids).size).toBe(TRICK_IDS.length);
    expect(ids.sort()).toEqual([...TRICK_IDS].sort());
  });

  it.each(TRICK_IDS)("gives %s an announcement and bounded fallback", (id) => {
    const context = fakeEffectContext();
    const result = TRICK_EFFECTS[id](context);

    expect(result.message.trim().length).toBeGreaterThan(0);
    expect(result.fallbackMs).toBeGreaterThan(0);
    expect(result.fallbackMs).toBeLessThanOrEqual(2_300);
    expect(result.preview.previous).toEqual(context.state);
  });

  it("Runaway RSVP previews one runaway pose and owns a two-hop landing", () => {
    const fixture = fakeEffectFixture();
    const result = TRICK_EFFECTS["runaway-rsvp"](fixture.context);

    expect(fixture.choosePose).toHaveBeenCalledOnce();
    expect(fixture.choosePose).toHaveBeenCalledWith("runaway");
    expect(fixture.preview).toHaveBeenCalledWith({ noPose: SAFE_POSE });
    const motion = fixture.animationCalls.find((call) => call.element === fixture.elements.noMotion);
    expect(motion).toBeDefined();
    const keyframes = keyframesOf(motion!);
    expect(keyframes.length).toBeGreaterThanOrEqual(3);
    expectSettledMotion(transformAt(keyframes, -1));
    expect(result.persistence).toBe("commit-target");
    expect(result.preview.target.noPose).toEqual(SAFE_POSE);
  });

  it("Growing Feelings animates from the prior absolute scales without exceeding safe YES", () => {
    const fixture = fakeEffectFixture();
    const result = TRICK_EFFECTS["growing-feelings"](fixture.context);

    expect(fixture.preview).toHaveBeenCalledWith({
      yesScale: MAX_YES_SCALE,
      noScale: MIN_NO_FACE_SCALE,
    });
    expect(fixture.animationCalls.map(({ element }) => element)).toEqual([
      fixture.elements.yesFace,
      fixture.elements.noFace,
    ]);
    const yesFrames = keyframesOf(fixture.animationCalls[0]!);
    const noFrames = keyframesOf(fixture.animationCalls[1]!);
    expect(Number(yesFrames[0]?.scale)).toBeCloseTo(
      result.preview.previous.yesScale / result.preview.target.yesScale,
      8,
    );
    expect(yesFrames.every(({ scale }) => Number(scale) <= 1)).toBe(true);
    expect(yesFrames).toContainEqual(expect.objectContaining({ offset: 0.55, scale: "1" }));
    expect(yesFrames.at(-1)?.scale).toBe("1");
    expect(Number(noFrames[0]?.scale)).toBeCloseTo(
      result.preview.previous.noScale / result.preview.target.noScale,
      8,
    );
    expect(noFrames).toContainEqual(expect.objectContaining({ offset: 0.55, scale: ".76" }));
    expect(noFrames.at(-1)?.scale).toBe("1");
    expect(fixture.animationCalls.map(({ options }) => options.duration)).toEqual([650, 650]);
    expect(result.fallbackMs).toBe(850);
    expect(result.persistence).toBe("commit-target");
  });

  it("Growing Feelings rebases its first frame on the geometry-clamped YES target", () => {
    const fixture = fakeEffectFixture({ clampedYesScale: 1.37 });
    const result = TRICK_EFFECTS["growing-feelings"](fixture.context);
    const yesAnimation = fixture.animationCalls.find(
      ({ element }) => element === fixture.elements.yesFace,
    )!;
    const firstMultiplier = Number(keyframesOf(yesAnimation)[0]?.scale);

    expect(result.preview.target.yesScale).toBe(1.37);
    expect(firstMultiplier).toBeCloseTo(
      result.preview.previous.yesScale / result.preview.target.yesScale,
      8,
    );
    expect(firstMultiplier * result.preview.target.yesScale).toBeCloseTo(
      result.preview.previous.yesScale,
      8,
    );
    expect(firstMultiplier).not.toBeCloseTo(
      result.preview.previous.yesScale / MAX_YES_SCALE,
      8,
    );
  });

  it("Seat Swap previews inverse order and FLIPs both motion wrappers", () => {
    const fixture = fakeEffectFixture();
    const result = TRICK_EFFECTS["seat-swap"](fixture.context);

    expect(fixture.preview).toHaveBeenCalledWith({ swapped: true });
    const yesCall = fixture.animationCalls.find((call) => call.element === fixture.elements.yesMotion);
    const noCall = fixture.animationCalls.find((call) => call.element === fixture.elements.noMotion);
    expect(yesCall).toBeDefined();
    expect(noCall).toBeDefined();
    expect(transformAt(keyframesOf(yesCall!), 0)).not.toBe("translate(0px, 0px)");
    expect(transformAt(keyframesOf(noCall!), 0)).not.toBe("translate(0px, 0px)");
    expect(transformAt(keyframesOf(yesCall!), -1)).toBe("translate(0, 0)");
    expectSettledMotion(transformAt(keyframesOf(noCall!), -1));
    expect(result.preview.target.swapped).toBe(true);
    expect(result.persistence).toBe("commit-target");
  });

  it.each([false, true])(
    "Cupid Magnet travels toward the current semantic YES when swapped=%s",
    (swapped) => {
      const state = Object.freeze({ ...INITIAL_TRICK_VISUAL_STATE, swapped });
      const fixture = fakeEffectFixture({ state });
      const result = TRICK_EFFECTS["cupid-magnet"](fixture.context);

      expect(fixture.choosePose).toHaveBeenCalledOnce();
      expect(fixture.choosePose).toHaveBeenCalledWith("magnet");
      expect(fixture.preview).toHaveBeenCalledWith({ noPose: SAFE_POSE });
      const motion = fixture.animationCalls.find((call) => call.element === fixture.elements.noMotion);
      expect(motion).toBeDefined();
      const keyframes = keyframesOf(motion!);
      const yesCenter = {
        x: result.preview.beforeYes.left + result.preview.beforeYes.width / 2,
        y: result.preview.beforeYes.top + result.preview.beforeYes.height / 2,
      };
      const targetCenter = {
        x: result.preview.afterNo.left + result.preview.afterNo.width / 2,
        y: result.preview.afterNo.top + result.preview.afterNo.height / 2,
      };
      expectMotionInLetterAxes(
        transformAt(keyframes, 1),
        SAFE_POSE.rotation,
        { x: yesCenter.x - targetCenter.x, y: yesCenter.y - targetCenter.y },
      );
      expectSettledMotion(transformAt(keyframes, -1));
      expect(result.preview.target.noPose).toEqual(SAFE_POSE);
      expect(result.persistence).toBe("commit-target");
    },
  );

  it("Paper Plane owns two crease layers and folds before direction-aware flight", () => {
    const fixture = fakeEffectFixture();
    const result = TRICK_EFFECTS["paper-plane"](fixture.context);

    expect(fixture.choosePose).toHaveBeenCalledWith("plane");
    expect(fixture.trackArtifact).toHaveBeenCalledTimes(2);
    const fold = fixture.trackedArtifacts.find(
      ({ className }) => className === "trick-plane-fold",
    );
    expect(fold?.className).toBe("trick-plane-fold");
    expect(fold?.getAttribute("aria-hidden")).toBe("true");
    expect(fixture.elements.noFace.children).toContain(fold);
    expect(fold?.children.map(({ className }) => className)).toEqual([
      "trick-plane-crease trick-plane-crease--one",
      "trick-plane-crease trick-plane-crease--two",
    ]);
    const [creaseOne, creaseTwo] = fold!.children;

    const motion = fixture.animationCalls.find(({ element }) => element === fixture.elements.noMotion)!;
    const face = fixture.animationCalls.find(({ element }) => element === fixture.elements.noFace)!;
    const label = fixture.animationCalls.find(({ element }) => element === fixture.elements.noLabel)!;
    const motionFrames = keyframesOf(motion);
    const faceFrames = keyframesOf(face);
    const labelFrames = keyframesOf(label);
    expect(faceFrames.every(({ clipPath }) => polygonPointCount(clipPath) === 4)).toBe(true);
    expect(motionFrames[1]?.offset).toBe(0.30);
    expect(transformAt(motionFrames, 1)).toBe(transformAt(motionFrames, 0));
    expect(motionFrames[3]?.offset).toBe(0.80);
    expectSettledMotion(transformAt(motionFrames, 3));
    expectSettledMotion(transformAt(motionFrames, -1));
    expect(faceFrames[1]).toMatchObject({
      offset: 0.16,
      clipPath: "polygon(0 14%, 100% 0, 100% 100%, 0 86%)",
    });
    expect(faceFrames[2]?.offset).toBe(0.30);
    expect(faceFrames[3]?.offset).toBe(0.80);
    expect(faceFrames[2]?.clipPath).toBe("polygon(0 0, 100% 50%, 0 100%, 24% 50%)");
    expect(faceFrames[3]?.clipPath).toBe(faceFrames[2]?.clipPath);
    expect(faceFrames[1]?.clipPath).not.toBe(faceFrames[2]?.clipPath);
    expect(faceFrames[4]).toMatchObject({
      offset: 0.90,
      clipPath: faceFrames[1]?.clipPath,
    });
    expect(faceFrames.at(-1)).toMatchObject({
      clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
      borderRadius: "999px",
      rotate: "0deg",
      scale: "1",
    });
    expect(labelFrames[1]).toMatchObject({ offset: 0.28, opacity: 0 });
    expect(labelFrames[2]).toMatchObject({ offset: 0.82, opacity: 0 });
    expect(labelFrames.at(-1)).toMatchObject({ opacity: 1, scale: "1" });
    const creaseAnimations = [creaseOne, creaseTwo].map((crease) => (
      fixture.animationCalls.find(({ element }) => element === crease)!
    ));
    const creaseOneFrames = keyframesOf(creaseAnimations[0]!);
    const creaseTwoFrames = keyframesOf(creaseAnimations[1]!);
    expect(creaseOneFrames[1]).toMatchObject({ offset: 0.18, opacity: 1 });
    expect(creaseOneFrames[2]).toMatchObject({ offset: 0.80, opacity: 1 });
    expect(creaseOneFrames[3]).toMatchObject({ offset: 0.90, opacity: 0 });
    expect(creaseTwoFrames[2]).toMatchObject({ offset: 0.30, opacity: 1 });
    expect(creaseTwoFrames[3]).toMatchObject({ offset: 0.80, opacity: 1 });
    for (const creaseAnimation of creaseAnimations) {
      expect(creaseAnimation.options.duration).toBe(1_500);
      expect(creaseAnimation.options.easing).toBe("cubic-bezier(.3,.1,.2,1)");
      expect(creaseAnimation.options.fill).toBe("both");
      expect(keyframesOf(creaseAnimation).at(-1)).toMatchObject({
        opacity: 0,
        rotate: "0deg",
      });
    }
    expect(motion.options.duration).toBe(1_500);
    expect(face.options.duration).toBe(1_500);
    expect(label.options.duration).toBe(1_500);
    expect(result.fallbackMs).toBe(1_750);
    expect(result.preview.target.noPose).toEqual(SAFE_POSE);
  });

  it.each([
    ["right", SAFE_POSE, "2,2 98,50 2,98 25,50"],
    ["left", LEFT_SAFE_POSE, "98,2 2,50 98,98 75,50"],
  ] as const)("Paper Plane renders a visible %s-facing outer contour", (_name, pose, points) => {
    const fixture = fakeEffectFixture({ pose });
    TRICK_EFFECTS["paper-plane"](fixture.context);

    const outline = fixture.elements.noButton.children.find(
      ({ className }) => className === "trick-plane-outline",
    );
    expect(outline).toBeDefined();
    expect(outline?.getAttribute("aria-hidden")).toBe("true");
    expect(outline?.style.getPropertyValue("--plane-base-scale"))
      .toBe(String(fixture.context.state.noScale));

    const [svg] = outline!.children;
    const [polygon] = svg!.children;
    expect(svg?.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(polygon?.getAttribute("points")).toBe(points);
    expect(polygon?.getAttribute("stroke")).toBe("currentColor");

    const outlineAnimation = fixture.animationCalls.find(
      ({ element }) => element === outline,
    );
    expect(outlineAnimation).toBeDefined();
    expect(keyframesOf(outlineAnimation!)).toEqual(expect.arrayContaining([
      expect.objectContaining({ offset: 0.30, opacity: 1, scale: ".78" }),
      expect.objectContaining({ offset: 0.80, opacity: 1, scale: ".78" }),
    ]));
  });

  it.each([
    ["right", SAFE_POSE, 1, "polygon(0 0, 100% 50%, 0 100%, 24% 50%)"],
    ["left", LEFT_SAFE_POSE, -1, "polygon(100% 0, 0 50%, 100% 100%, 76% 50%)"],
  ] as const)("Paper Plane points %s along its actual flight", (_name, pose, direction, polygon) => {
    const fixture = fakeEffectFixture({ pose });
    const result = TRICK_EFFECTS["paper-plane"](fixture.context);
    const start = centerDelta(result.preview.beforeNo, result.preview.afterNo);
    const motion = fixture.animationCalls.find(({ element }) => element === fixture.elements.noMotion)!;
    const face = fixture.animationCalls.find(({ element }) => element === fixture.elements.noFace)!;

    const motionFrames = keyframesOf(motion);
    expect(keyframesOf(face)[2]?.clipPath).toBe(polygon);
    expectMotionInLetterAxes(
      transformAt(motionFrames, 2),
      pose.rotation,
      { x: start.x * 0.42, y: start.y * 0.36 - 96 },
    );
    const horizontal = motionFrames.map((_, index) => (
      letterAxesDelta(transformAt(motionFrames, index), pose.rotation).x
    ));
    for (let index = 1; index < horizontal.length; index += 1) {
      expect(direction * (horizontal[index]! - horizontal[index - 1]!))
        .toBeGreaterThanOrEqual(-1e-6);
    }
    expectSettledMotion(transformAt(motionFrames, -1));
  });

  it("Paper Plane keeps meaningful width while the left-facing face folds and unfolds", () => {
    const fixture = fakeEffectFixture({ pose: LEFT_SAFE_POSE });
    TRICK_EFFECTS["paper-plane"](fixture.context);
    const face = fixture.animationCalls.find(
      ({ element }) => element === fixture.elements.noFace,
    )!;
    const frames = keyframesOf(face);
    const foldWidths = [0.25, 0.5, 0.75].map((progress) => (
      interpolatedPolygonWidth(frames[0]?.clipPath, frames[1]?.clipPath, progress)
    ));
    const unfoldWidths = [0.25, 0.5, 0.75].map((progress) => (
      interpolatedPolygonWidth(frames[4]?.clipPath, frames[5]?.clipPath, progress)
    ));

    expect(Math.min(...foldWidths)).toBeGreaterThanOrEqual(50);
    expect(Math.min(...unfoldWidths)).toBeGreaterThanOrEqual(50);
  });

  it("Paper Plane uses a vertical fold-and-hop when no safe pose exists", () => {
    const fixture = fakeEffectFixture({ pose: null });
    TRICK_EFFECTS["paper-plane"](fixture.context);
    const motion = fixture.animationCalls.find(
      ({ element }) => element === fixture.elements.noMotion,
    )!;
    const motionFrames = keyframesOf(motion);

    expect(transformAt(motionFrames, 1)).toBe(transformAt(motionFrames, 0));
    expectMotionInLetterAxes(transformAt(motionFrames, 2), 0, { x: 0, y: -36 });
    expectSettledMotion(transformAt(motionFrames, 3));
  });

  it("Runaway converts its two-hop arc into the rotated target seat axes", () => {
    const state = Object.freeze({ ...INITIAL_TRICK_VISUAL_STATE, noPose: PREVIOUS_ROTATED_POSE });
    const fixture = fakeEffectFixture({ state, pose: ROTATED_SAFE_POSE });
    const result = TRICK_EFFECTS["runaway-rsvp"](fixture.context);
    const motion = fixture.animationCalls.find((call) => call.element === fixture.elements.noMotion)!;
    const keyframes = keyframesOf(motion);
    const start = centerDelta(result.preview.beforeNo, result.preview.afterNo);

    expectMotionInLetterAxes(
      transformAt(keyframes, 0),
      ROTATED_SAFE_POSE.rotation,
      start,
      PREVIOUS_ROTATED_POSE.rotation - ROTATED_SAFE_POSE.rotation,
    );
    expect(keyframes[1]?.offset).toBe(0.32);
    expectMotionInLetterAxes(
      transformAt(keyframes, 1),
      ROTATED_SAFE_POSE.rotation,
      { x: start.x * 0.78, y: start.y * 0.62 - 48 },
      (PREVIOUS_ROTATED_POSE.rotation - ROTATED_SAFE_POSE.rotation) * 0.78,
    );
    expect(keyframes[2]?.offset).toBe(0.68);
    expectMotionInLetterAxes(
      transformAt(keyframes, 2),
      ROTATED_SAFE_POSE.rotation,
      { x: start.x * 0.42, y: start.y * 0.28 - 30 },
      (PREVIOUS_ROTATED_POSE.rotation - ROTATED_SAFE_POSE.rotation) * 0.42,
    );
    expectSettledMotion(transformAt(keyframes, -1));
    expect(motion.options.duration).toBe(900);
    expect(result.fallbackMs).toBe(1_100);
  });

  it("Runaway keeps the farther two-hop gesture when no safe pose exists", () => {
    const fixture = fakeEffectFixture({ pose: null });
    const result = TRICK_EFFECTS["runaway-rsvp"](fixture.context);
    const motion = fixture.animationCalls.find(
      ({ element }) => element === fixture.elements.noMotion,
    )!;
    const keyframes = keyframesOf(motion);

    expectMotionInLetterAxes(transformAt(keyframes, 1), 0, { x: -12, y: -18 }, -4);
    expectMotionInLetterAxes(transformAt(keyframes, 2), 0, { x: 12, y: -10 }, 4);
    expectSettledMotion(transformAt(keyframes, -1));
    expect(result.preview.target).toEqual(fixture.context.state);
  });

  it("Seat Swap converts the NO FLIP delta into its rotated seat axes", () => {
    const targetPose = Object.freeze({ centerX: 482, centerY: 286, rotation: 7 });
    const state = Object.freeze({ ...INITIAL_TRICK_VISUAL_STATE, noPose: targetPose });
    const fixture = fakeEffectFixture({
      state,
      leftNo: rect(120, 520, 104, 52),
      rightNo: rect(430, 260, 104, 52),
    });
    const result = TRICK_EFFECTS["seat-swap"](fixture.context);
    const motion = fixture.animationCalls.find((call) => call.element === fixture.elements.noMotion)!;
    const keyframes = keyframesOf(motion);

    expectMotionInLetterAxes(
      transformAt(keyframes, 0),
      targetPose.rotation,
      centerDelta(result.preview.beforeNo, result.preview.afterNo),
      0,
    );
    expectSettledMotion(transformAt(keyframes, -1));
  });

  it.each([false, true])(
    "Cupid Magnet converts travel toward semantic YES when rotated and swapped=%s",
    (swapped) => {
      const state = Object.freeze({
        ...INITIAL_TRICK_VISUAL_STATE,
        noPose: PREVIOUS_ROTATED_POSE,
        swapped,
      });
      const fixture = fakeEffectFixture({ state, pose: ROTATED_SAFE_POSE });
      const result = TRICK_EFFECTS["cupid-magnet"](fixture.context);
      const motion = fixture.animationCalls.find((call) => call.element === fixture.elements.noMotion)!;
      const keyframes = keyframesOf(motion);
      const targetCenter = {
        x: result.preview.afterNo.left + result.preview.afterNo.width / 2,
        y: result.preview.afterNo.top + result.preview.afterNo.height / 2,
      };
      const yesCenter = {
        x: result.preview.beforeYes.left + result.preview.beforeYes.width / 2,
        y: result.preview.beforeYes.top + result.preview.beforeYes.height / 2,
      };

      expectMotionInLetterAxes(
        transformAt(keyframes, 0),
        ROTATED_SAFE_POSE.rotation,
        centerDelta(result.preview.beforeNo, result.preview.afterNo),
        PREVIOUS_ROTATED_POSE.rotation - ROTATED_SAFE_POSE.rotation,
      );
      expectMotionInLetterAxes(
        transformAt(keyframes, 1),
        ROTATED_SAFE_POSE.rotation,
        { x: yesCenter.x - targetCenter.x, y: yesCenter.y - targetCenter.y },
      );
      expectSettledMotion(transformAt(keyframes, -1));
    },
  );

  it("Paper Plane converts its delayed arc into rotated target-seat axes", () => {
    const state = Object.freeze({ ...INITIAL_TRICK_VISUAL_STATE, noPose: PREVIOUS_ROTATED_POSE });
    const fixture = fakeEffectFixture({ state, pose: ROTATED_SAFE_POSE });
    const result = TRICK_EFFECTS["paper-plane"](fixture.context);
    const motion = fixture.animationCalls.find((call) => call.element === fixture.elements.noMotion)!;
    const frames = keyframesOf(motion);
    const start = centerDelta(result.preview.beforeNo, result.preview.afterNo);
    const rotationDelta = PREVIOUS_ROTATED_POSE.rotation - ROTATED_SAFE_POSE.rotation;
    const direction = 1;

    expectMotionInLetterAxes(
      transformAt(frames, 0),
      ROTATED_SAFE_POSE.rotation,
      start,
      rotationDelta,
    );
    expect(frames[1]?.offset).toBe(0.30);
    expect(transformAt(frames, 1)).toBe(transformAt(frames, 0));
    expectMotionInLetterAxes(
      transformAt(frames, 2),
      ROTATED_SAFE_POSE.rotation,
      { x: start.x * 0.42, y: start.y * 0.36 - 96 },
      rotationDelta * 0.38 - direction * 18,
    );
    expect(frames[3]?.offset).toBe(0.80);
    expectSettledMotion(transformAt(frames, 3));
    expectSettledMotion(transformAt(frames, -1));
  });

  it("Return to Sender converts its travel into the rotated target seat axes", () => {
    const state = Object.freeze({ ...INITIAL_TRICK_VISUAL_STATE, noPose: PREVIOUS_ROTATED_POSE });
    const fixture = fakeEffectFixture({ state, pose: ROTATED_SAFE_POSE });
    const result = TRICK_EFFECTS["return-to-sender"](fixture.context);
    const motion = fixture.animationCalls.find((call) => call.element === fixture.elements.noMotion)!;
    const keyframes = keyframesOf(motion);

    expectMotionInLetterAxes(
      transformAt(keyframes, 0),
      ROTATED_SAFE_POSE.rotation,
      centerDelta(result.preview.beforeNo, result.preview.afterNo),
      PREVIOUS_ROTATED_POSE.rotation - ROTATED_SAFE_POSE.rotation,
    );
    expectMotionInLetterAxes(
      transformAt(keyframes, 1),
      ROTATED_SAFE_POSE.rotation,
      { x: -12, y: 8 },
    );
    expectSettledMotion(transformAt(keyframes, -1));
  });

  it("Yes Garden tracks exactly eight decorative artifacts from letter-local activation", () => {
    const fixture = fakeEffectFixture({
      activation: { x: 35, y: 70 },
      letterRect: rect(160, 240, 640, 580),
    });
    const result = TRICK_EFFECTS["yes-garden"](fixture.context);

    expect(fixture.preview).toHaveBeenCalledWith({});
    expect(fixture.trackArtifact).toHaveBeenCalledTimes(8);
    expect(fixture.trackedArtifacts).toHaveLength(8);
    for (const artifact of fixture.trackedArtifacts) {
      expect(artifact.className).toBe("trick-garden-item");
      expect(artifact.dataset.trickArtifact).toBe("true");
      expect(artifact.getAttribute("aria-hidden")).toBe("true");
      expect(artifact.style.getPropertyValue("--garden-x")).toBe("35px");
      expect(artifact.style.getPropertyValue("--garden-y")).toBe("70px");
    }
    expect(fixture.animationCalls.map(({ options }) => options.delay)).toEqual([
      0, 45, 90, 135, 180, 225, 270, 315,
    ]);
    for (const call of fixture.animationCalls) {
      const frames = keyframesOf(call);
      expect(call.options.duration).toBe(1_800);
      expect(frames[1]?.offset).toBe(0.25);
      expect(frames[1]?.opacity).toBe(1);
      expect(frames[2]?.offset).toBe(0.82);
      expect(frames[2]?.opacity).toBe(1);
    }
    expect(result.fallbackMs).toBe(2_300);
    expect(result.preview.target).toEqual(fixture.context.state);
    expect(result.persistence).toBe("transient");
  });

  it("Yes Garden removes stagger so reduced-motion animations beat the 50ms deadline", () => {
    const fullMotion = fakeEffectFixture({ reducedMotion: false });
    const reducedMotion = fakeEffectFixture({ reducedMotion: true });

    TRICK_EFFECTS["yes-garden"](fullMotion.context);
    TRICK_EFFECTS["yes-garden"](reducedMotion.context);

    expect(fullMotion.animationCalls.map(({ options }) => options.delay)).toEqual([
      0, 45, 90, 135, 180, 225, 270, 315,
    ]);
    expect(reducedMotion.animationCalls.map(({ options }) => options.delay)).toEqual(
      Array.from({ length: 8 }, () => 0),
    );
    const normalizedCompletionTimes = reducedMotion.animationCalls.map(({ options }) =>
      Number(options.delay ?? 0) + 1 + Number(options.endDelay ?? 0));
    expect(Math.max(...normalizedCompletionTimes)).toBeLessThan(50);
  });

  it("Yes Garden completes through the reduced-motion runner before fallback", async () => {
    const fixture = fakeEffectFixture();
    const animations: Array<{
      readonly options: KeyframeAnimationOptions;
      readonly animation: Animation;
      readonly resolve: () => void;
      readonly element: FakeElement;
    }> = [];
    fixture.document.animationFactory = (element, _keyframes, options) => {
      let resolve!: () => void;
      const finished = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise;
      });
      const animation = {
        finished,
        pause: vi.fn(),
        play: vi.fn(),
        cancel: vi.fn(),
      } as unknown as Animation;
      animations.push({ options, animation, resolve, element });
      return animation;
    };

    let committed = fixture.context.state;
    const visuals: TrickVisualController = {
      get state() {
        return committed;
      },
      choosePose: vi.fn(() => null),
      preview: (patch) => fixture.context.preview(patch),
      stage: vi.fn(),
      commit: vi.fn((state) => {
        committed = state;
      }),
      clearDisguise: vi.fn(),
      setRefusalReady: vi.fn(),
      revalidate: vi.fn(),
      reset: vi.fn(),
    };
    const runner = createTrickRunner(fixture.context.view, TRICK_EFFECTS, {
      visuals,
      reducedMotion: () => true,
    });

    const run = runner.start("yes-garden", 1, { x: 35, y: 70 });

    expect(animations).toHaveLength(8);
    expect(animations.every(({ options }) => options.duration === 1)).toBe(true);
    expect(animations.every(({ options }) => options.delay === 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    animations.forEach(({ resolve }) => resolve());

    await expect(run.finished).resolves.toEqual({ id: "yes-garden", outcome: "completed" });
    expect(fixture.elements.status.textContent).toBe(
      "A tiny garden of YES bloomed around the letter.",
    );
    expect(animations.every(({ animation }) => vi.mocked(animation.cancel).mock.calls.length === 1))
      .toBe(true);
    expect(animations.every(({ element }) => element.removed)).toBe(true);
    expect(runner.busy).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Dramatic Excuse owns a bubble without changing NO copy or semantic width", () => {
    const fixture = fakeEffectFixture();
    const previousLabel = fixture.elements.noLabel.textContent;
    const previousWidth = fixture.elements.noButton.getBoundingClientRect().width;
    const result = TRICK_EFFECTS["dramatic-excuse"](fixture.context);

    expect(fixture.preview).toHaveBeenCalledWith({});
    expect(fixture.trackArtifact).toHaveBeenCalledOnce();
    const [bubble] = fixture.trackedArtifacts;
    expect(bubble?.className).toBe("trick-excuse");
    expect(bubble?.textContent).toBe("BUT WHAT IF THERE'S DESSERT?");
    expect(bubble?.dataset.trickArtifact).toBe("true");
    expect(bubble?.getAttribute("aria-hidden")).toBe("true");
    expect(fixture.elements.noLabel.textContent).toBe(previousLabel);
    expect(fixture.elements.noButton.getBoundingClientRect().width).toBe(previousWidth);
    expect(result.persistence).toBe("transient");
  });

  it("Spotlight owns a full-letter overlay centered on semantic YES", () => {
    const fixture = fakeEffectFixture();
    const yesRect = fixture.elements.yesButton.getBoundingClientRect();
    const letterRect = fixture.elements.letter.getBoundingClientRect();
    const result = TRICK_EFFECTS.spotlight(fixture.context);

    expect(fixture.preview).toHaveBeenCalledWith({});
    expect(fixture.trackArtifact).toHaveBeenCalledOnce();
    const [overlay] = fixture.trackedArtifacts;
    expect(overlay?.className).toBe("trick-spotlight-overlay");
    expect(overlay?.style.getPropertyValue("--spotlight-x")).toBe(
      `${yesRect.left + yesRect.width / 2 - letterRect.left}px`,
    );
    expect(overlay?.style.getPropertyValue("--spotlight-y")).toBe(
      `${yesRect.top + yesRect.height / 2 - letterRect.top}px`,
    );
    expect(overlay?.dataset.trickArtifact).toBe("true");
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    expect(fixture.elements.letter.children).toContain(overlay);
    expect(result.persistence).toBe("transient");
  });

  it.each([
    ["dramatic-excuse", "trick-excuse", 1_800, 0.20, 0.84, 2_050],
    ["spotlight", "trick-spotlight-overlay", 1_900, 0.18, 0.50, 2_150],
    ["return-to-sender", "trick-return-stamp", 1_800, 0.22, 0.84, 2_050],
  ] as const)(
    "%s keeps its decoration through the approved hold window",
    (id, className, duration, visibleAt, heldThrough, fallbackMs) => {
      const fixture = fakeEffectFixture();
      const result = TRICK_EFFECTS[id](fixture.context);
      const artifact = fixture.trackedArtifacts.find((item) => item.className === className)!;
      const animation = fixture.animationCalls.find(({ element }) => element === artifact)!;
      const frames = keyframesOf(animation);

      expect(animation.options.duration).toBe(duration);
      expect(frames.some(({ offset, opacity }) => offset === visibleAt && opacity === 1)).toBe(true);
      expect(frames.some(({ offset, opacity }) => offset === heldThrough && opacity === 1)).toBe(true);
      expect(frames.at(-1)?.opacity).toBe(0);
      expect(result.fallbackMs).toBe(fallbackMs);
    },
  );

  it("Tiny Disguise requests persistent disguise without a timer", () => {
    const context = fakeEffectContext();
    const result = TRICK_EFFECTS["tiny-disguise"](context);

    expect(context.preview).toHaveBeenCalledWith({ disguised: true });
    expect(context.animate).toHaveBeenCalledTimes(1);
    expect(result.persistence).toBe("commit-target");
    expect(result.preview.target.disguised).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Return to Sender persists a safe pose while its stamp stays runner-owned", () => {
    const fixture = fakeEffectFixture({ letterRect: rect(160, 240, 640, 580) });
    const result = TRICK_EFFECTS["return-to-sender"](fixture.context);

    expect(fixture.choosePose).toHaveBeenCalledOnce();
    expect(fixture.choosePose).toHaveBeenCalledWith("returned");
    expect(fixture.preview).toHaveBeenCalledWith({ noPose: SAFE_POSE });
    expect(fixture.trackArtifact).toHaveBeenCalledOnce();
    const [stamp] = fixture.trackedArtifacts;
    expect(stamp?.className).toBe("trick-return-stamp");
    expect(stamp?.dataset.trickArtifact).toBe("true");
    expect(stamp?.getAttribute("aria-hidden")).toBe("true");
    expect(stamp?.style.getPropertyValue("left")).toBe(`${SAFE_POSE.centerX}px`);
    expect(stamp?.style.getPropertyValue("top")).toBe(`${SAFE_POSE.centerY}px`);
    const noMotion = fixture.animationCalls.find(
      ({ element }) => element === fixture.elements.noMotion,
    )!;
    const stampAnimation = fixture.animationCalls.find(({ element }) => element === stamp)!;
    expect(noMotion.options.duration).toBe(900);
    expect(stampAnimation.options.easing).toBe("ease-in-out");
    expect(result.preview.target.noPose).toEqual(SAFE_POSE);
    expect(result.persistence).toBe("commit-target");
  });

  it.each([
    ["runaway-rsvp", { noPose: SAFE_POSE }, "commit-target", 1_100],
    [
      "growing-feelings",
      { yesScale: MAX_YES_SCALE, noScale: MIN_NO_FACE_SCALE },
      "commit-target",
      850,
    ],
    ["seat-swap", { swapped: true }, "commit-target", 900],
    ["cupid-magnet", { noPose: SAFE_POSE }, "commit-target", 1_050],
    ["paper-plane", { noPose: SAFE_POSE }, "commit-target", 1_750],
    ["yes-garden", {}, "transient", 2_300],
    ["dramatic-excuse", {}, "transient", 2_050],
    ["spotlight", {}, "transient", 2_150],
    ["tiny-disguise", { disguised: true }, "commit-target", 750],
    ["return-to-sender", { noPose: SAFE_POSE }, "commit-target", 2_050],
  ] as const)(
    "%s owns only its declared persistent patch",
    (id, patch, persistence, fallbackMs) => {
      const fixture = fakeEffectFixture();
      const result = TRICK_EFFECTS[id](fixture.context);

      expect(fixture.preview).toHaveBeenCalledOnce();
      expect(fixture.preview).toHaveBeenCalledWith(patch);
      expect(result.persistence).toBe(persistence);
      expect(result.fallbackMs).toBe(fallbackMs);
    },
  );

  it.each(["runaway-rsvp", "cupid-magnet", "paper-plane", "return-to-sender"] as const)(
    "%s falls back to an empty preview when no safe pose exists",
    (id) => {
      const fixture = fakeEffectFixture({ pose: null });
      const result = TRICK_EFFECTS[id](fixture.context);

      expect(fixture.choosePose).toHaveBeenCalledOnce();
      expect(fixture.preview).toHaveBeenCalledWith({});
      expect(result.preview.target).toEqual(fixture.context.state);
      expect(fixture.animationCalls.length).toBeGreaterThan(0);
    },
  );

  it.each(TRICK_IDS)("%s creates no definition-owned timers or listeners", (id: TrickId) => {
    const fixture = fakeEffectFixture();

    TRICK_EFFECTS[id](fixture.context);

    expect(vi.getTimerCount()).toBe(0);
    const allElements = [
      ...Object.values(fixture.elements),
      ...fixture.document.created,
    ];
    expect(allElements.every((element) => element.addEventListener.mock.calls.length === 0)).toBe(true);
  });
});
