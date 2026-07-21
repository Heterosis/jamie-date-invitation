import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTrickVisualPatch,
  INITIAL_TRICK_VISUAL_STATE,
} from "./trick-state";
import {
  center,
  chooseSafeNoPose,
  createTrickVisualController,
  isSafeNoRect,
  poseRect,
  type GeometrySnapshot,
  type Rect,
  type TrickRenderElements,
} from "./trick-geometry";

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function safeSnapshot(overrides: Partial<GeometrySnapshot> = {}): GeometrySnapshot {
  return {
    letterPaddingBox: rect(0, 0, 600, 600),
    viewport: { left: 0, right: 600 },
    currentNo: rect(278, 328, 44, 44),
    noHitSize: { width: 44, height: 44 },
    yes: rect(100, 200, 44, 44),
    protectedRects: [],
    ...overrides,
  };
}

describe("safe NO geometry", () => {
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

  it.each(["protected copy", "tape", "wax seal"])(
    "accepts an exact 8px gap from %s and rejects 7.9px",
    () => {
      const protectedRect = rect(100, 120, 40, 40);
      const snapshot = safeSnapshot({ protectedRects: [protectedRect] });

      expect(isSafeNoRect(snapshot, rect(48, 120, 44, 44))).toBe(true);
      expect(isSafeNoRect(snapshot, rect(48.1, 120, 44, 44))).toBe(false);
    },
  );

  it("allows 1px horizontal viewport overflow but rejects 1.1px", () => {
    const snapshot = safeSnapshot({
      letterPaddingBox: rect(-100, 0, 800, 600),
      viewport: { left: 0, right: 600 },
    });

    expect(isSafeNoRect(snapshot, rect(-1, 200, 44, 44))).toBe(true);
    expect(isSafeNoRect(snapshot, rect(-1.1, 200, 44, 44))).toBe(false);
    expect(isSafeNoRect(snapshot, rect(557, 200, 44, 44))).toBe(true);
    expect(isSafeNoRect(snapshot, rect(557.1, 200, 44, 44))).toBe(false);
  });

  it("uses the axis-aligned visual rectangle of a rotated pose", () => {
    const snapshot = safeSnapshot();
    const unrotated = poseRect(
      { centerX: 38, centerY: 200, rotation: 0 },
      snapshot.noHitSize,
    );
    const rotated = poseRect(
      { centerX: 38, centerY: 200, rotation: 45 },
      snapshot.noHitSize,
    );

    expect(isSafeNoRect(snapshot, unrotated)).toBe(true);
    expect(rotated.width).toBeCloseTo(44 * Math.SQRT2);
    expect(isSafeNoRect(snapshot, rotated)).toBe(false);
  });
});

describe("chooseSafeNoPose", () => {
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

  it("ranks runaway, magnet, plane, and returned toward different destinations", () => {
    const snapshot = safeSnapshot({
      currentNo: rect(278, 328, 44, 44),
      yes: rect(424, 348, 44, 44),
    });
    const poses = (["runaway", "magnet", "plane", "returned"] as const)
      .map((intent) => chooseSafeNoPose(snapshot, {
        intent,
        attempt: 0,
        currentRotation: 0,
      }));

    poses.forEach((pose) => expect(pose).not.toBeNull());
    const destinations = poses.map((pose) => `${pose!.centerX},${pose!.centerY}`);

    expect(new Set(destinations).size).toBe(4);
    expect(poses[0]).toMatchObject({ centerX: 101.44, centerY: 510.52 });
  });

  it("normalizes negative attempts deterministically", () => {
    const snapshot = safeSnapshot();
    const query = { intent: "magnet", attempt: -17, currentRotation: -3 } as const;

    expect(chooseSafeNoPose(snapshot, query)).toEqual(chooseSafeNoPose(snapshot, query));
    expect(chooseSafeNoPose(snapshot, query)?.rotation).toBeGreaterThanOrEqual(-7);
  });

  it("rejects a rotated origin whose visual bounds exceed an exact 44px boundary", () => {
    const snapshot = safeSnapshot({
      letterPaddingBox: rect(0, 0, 60, 62),
      viewport: { left: 0, right: 60 },
      currentNo: rect(8, 10, 44, 44),
      yes: rect(100, 100, 44, 44),
    });

    expect(chooseSafeNoPose(snapshot, {
      intent: "runaway",
      attempt: 0,
      currentRotation: 3,
    })).toBeNull();
  });

  it("preserves a safe origin when a narrow layout has no movable destination", () => {
    const snapshot = safeSnapshot({
      letterPaddingBox: rect(0, 0, 60, 62),
      viewport: { left: 0, right: 60 },
      currentNo: rect(8, 10, 44, 44),
      yes: rect(100, 100, 44, 44),
    });

    expect(chooseSafeNoPose(snapshot, {
      intent: "runaway",
      attempt: 0,
      currentRotation: 0,
    })).toEqual({ centerX: 30, centerY: 32, rotation: 0 });
  });

  it.each(["runaway", "magnet", "plane", "returned"] as const)(
    "nudges %s locally when fixed slots are blocked but nearby space is safe",
    (intent) => {
      const blockedCenters = [
        [101.44, 510.52],
        [498.56, 510.52],
        [300, 533.8],
        [154, 440.68],
        [446, 440.68],
        [78.08, 347.56],
        [521.92, 347.56],
        [300, 475.6],
      ] as const;
      const snapshot = safeSnapshot({
        currentNo: rect(278, 328, 44, 44),
        yes: rect(424, 328, 44, 44),
        protectedRects: blockedCenters.map(([x, y]) => rect(x - 1, y - 1, 2, 2)),
      });
      const current = center(snapshot.currentNo);
      const yes = center(snapshot.yes);

      const pose = chooseSafeNoPose(snapshot, {
        intent,
        attempt: 2,
        currentRotation: 0,
      });

      expect(pose).not.toBeNull();
      expect(Math.hypot(pose!.centerX - current.x, pose!.centerY - current.y))
        .toBeGreaterThanOrEqual(24);
      if (intent === "magnet") {
        expect(Math.hypot(pose!.centerX - yes.x, pose!.centerY - yes.y))
          .toBeLessThan(Math.hypot(current.x - yes.x, current.y - yes.y));
      }
      expect(isSafeNoRect(snapshot, poseRect(pose!, snapshot.noHitSize))).toBe(true);
    },
  );

  it("gives Paper Plane a longer local runway when fixed slots are blocked", () => {
    const blockedCenters = [
      [101.44, 510.52],
      [498.56, 510.52],
      [300, 533.8],
      [154, 440.68],
      [446, 440.68],
      [78.08, 347.56],
      [521.92, 347.56],
      [300, 475.6],
    ] as const;
    const snapshot = safeSnapshot({
      currentNo: rect(278, 328, 44, 44),
      yes: rect(424, 328, 44, 44),
      protectedRects: blockedCenters.map(([x, y]) => rect(x - 1, y - 1, 2, 2)),
    });
    const current = center(snapshot.currentNo);

    const pose = chooseSafeNoPose(snapshot, {
      intent: "plane",
      attempt: 2,
      currentRotation: 0,
    });

    expect(pose).not.toBeNull();
    expect(Math.hypot(pose!.centerX - current.x, pose!.centerY - current.y))
      .toBeGreaterThanOrEqual(64);
    expect(isSafeNoRect(snapshot, poseRect(pose!, snapshot.noHitSize))).toBe(true);
  });
});

class StyleStub {
  private readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? "";
  }

  removeProperty(name: string): string {
    const previous = this.getPropertyValue(name);
    this.values.delete(name);
    return previous;
  }
}

function domRect(value: Rect): DOMRect {
  return {
    ...value,
    x: value.left,
    y: value.top,
    toJSON: () => ({
      x: value.left,
      y: value.top,
      ...value,
    }),
  } as DOMRect;
}

class ElementStub {
  readonly style = new StyleStub();
  readonly attributes = new Map<string, string>();
  textContent = "";
  hidden = false;
  measureCount = 0;
  failAtMeasure: number | null = null;
  measureFailureMessage = "measurement failed";
  protectedChildren: ElementStub[] = [];
  rectProvider: () => Rect = () => rect(0, 0, 0, 0);
  sizeProvider: () => { width: number; height: number } = () => ({ width: 0, height: 0 });
  selectorSeen = "";

  get offsetWidth(): number {
    return this.sizeProvider().width;
  }

  get offsetHeight(): number {
    return this.sizeProvider().height;
  }

  getBoundingClientRect(): DOMRect {
    this.measureCount += 1;
    if (this.measureCount === this.failAtMeasure) {
      throw new Error(this.measureFailureMessage);
    }
    return domRect(this.rectProvider());
  }

  toggleAttribute(name: string, force?: boolean): boolean {
    const present = force ?? !this.attributes.has(name);
    if (present) this.attributes.set(name, "");
    else this.attributes.delete(name);
    return present;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelectorAll(selector: string): ElementStub[] {
    this.selectorSeen = selector;
    return this.protectedChildren;
  }
}

interface Harness {
  readonly controller: ReturnType<typeof createTrickVisualController>;
  readonly elements: TrickRenderElements;
  readonly stage: ElementStub;
  readonly letter: ElementStub;
  readonly yesFace: ElementStub;
  readonly yesSeat: ElementStub;
  readonly yesButton: ElementStub;
  readonly noFace: ElementStub;
  readonly noSeat: ElementStub;
  readonly noButton: ElementStub;
  readonly noLabel: ElementStub;
  readonly noCostume: ElementStub;
  addProtected(value: Rect): void;
}

function numeric(style: StyleStub, name: string): number {
  return Number.parseFloat(style.getPropertyValue(name)) || 0;
}

function rotatedBox(centerX: number, centerY: number, width: number, height: number, degrees: number): Rect {
  const radians = degrees * Math.PI / 180;
  const visualWidth = Math.abs(width * Math.cos(radians))
    + Math.abs(height * Math.sin(radians));
  const visualHeight = Math.abs(width * Math.sin(radians))
    + Math.abs(height * Math.cos(radians));
  return rect(centerX - visualWidth / 2, centerY - visualHeight / 2, visualWidth, visualHeight);
}

function createHarness(protectedRects: readonly Rect[] = []): Harness {
  const letterOrigin = { x: 100, y: 50 };
  const stage = new ElementStub();
  const letter = new ElementStub();
  const actions = new ElementStub();
  const yesSeat = new ElementStub();
  const noSeat = new ElementStub();
  const yesMotion = new ElementStub();
  const noMotion = new ElementStub();
  const yesButton = new ElementStub();
  const noButton = new ElementStub();
  const yesFace = new ElementStub();
  const noFace = new ElementStub();
  const noLabel = new ElementStub();
  const noCostume = new ElementStub();

  const global = (value: Rect): Rect => rect(
    value.left + letterOrigin.x,
    value.top + letterOrigin.y,
    value.width,
    value.height,
  );
  const swapped = (): boolean => stage.hasAttribute("data-swapped");
  const yesCenter = (): { x: number; y: number } => ({
    x: swapped() ? 360 : 260,
    y: 500,
  });
  const noAnchor = (): { x: number; y: number } => ({
    x: swapped() ? 200 : 360,
    y: 500,
  });
  const noSize = (): { width: number; height: number } => ({
    width: noLabel.textContent === "Okay, I'll behave…"
      ? 96
      : noLabel.textContent === "DEFINITELY YES" ? 92 : 88,
    height: 44,
  });
  const noPose = (): { x: number; y: number; rotation: number } => {
    const anchor = noAnchor();
    return {
      x: anchor.x + numeric(noSeat.style, "--no-pose-x"),
      y: anchor.y + numeric(noSeat.style, "--no-pose-y"),
      rotation: numeric(noSeat.style, "--no-rotation"),
    };
  };
  const noRect = (scale: number): Rect => {
    const pose = noPose();
    const size = noSize();
    return global(rotatedBox(
      pose.x,
      pose.y,
      size.width * scale,
      size.height * scale,
      pose.rotation,
    ));
  };
  const yesRect = (scale: number): Rect => {
    const pose = yesCenter();
    return global(rect(
      pose.x - 40 * scale,
      pose.y - 22 * scale,
      80 * scale,
      44 * scale,
    ));
  };

  letter.rectProvider = () => rect(letterOrigin.x, letterOrigin.y, 600, 600);
  letter.sizeProvider = () => ({ width: 600, height: 600 });
  actions.rectProvider = () => global(rect(190, 470, 260, 60));
  actions.sizeProvider = () => ({ width: 260, height: 60 });
  yesSeat.rectProvider = () => yesRect(1);
  yesSeat.sizeProvider = () => ({ width: 80, height: 44 });
  yesMotion.rectProvider = () => yesRect(1);
  yesMotion.sizeProvider = () => ({ width: 80, height: 44 });
  yesButton.rectProvider = () => yesRect(1);
  yesButton.sizeProvider = () => ({ width: 80, height: 44 });
  yesFace.rectProvider = () => yesRect(numeric(yesFace.style, "--yes-scale") || 1);
  yesFace.sizeProvider = () => ({ width: 80, height: 44 });
  noSeat.rectProvider = () => noRect(1);
  noSeat.sizeProvider = noSize;
  noMotion.rectProvider = () => noRect(1);
  noMotion.sizeProvider = noSize;
  noButton.rectProvider = () => noRect(1);
  noButton.sizeProvider = noSize;
  noFace.rectProvider = () => noRect(numeric(noFace.style, "--no-scale") || 1);
  noFace.sizeProvider = noSize;

  const addProtected = (value: Rect): void => {
    const element = new ElementStub();
    element.rectProvider = () => global(value);
    element.sizeProvider = () => ({ width: value.width, height: value.height });
    letter.protectedChildren.push(element);
  };
  protectedRects.forEach(addProtected);

  vi.stubGlobal("window", { innerWidth: 800 });
  vi.stubGlobal("getComputedStyle", vi.fn(() => ({
    borderLeftWidth: "0px",
    borderRightWidth: "0px",
    borderTopWidth: "0px",
    borderBottomWidth: "0px",
  })));

  const elements: TrickRenderElements = {
    stage: stage as unknown as HTMLElement,
    letter: letter as unknown as HTMLElement,
    actions: actions as unknown as HTMLElement,
    yesSeat: yesSeat as unknown as HTMLElement,
    noSeat: noSeat as unknown as HTMLElement,
    yesMotion: yesMotion as unknown as HTMLElement,
    noMotion: noMotion as unknown as HTMLElement,
    yesButton: yesButton as unknown as HTMLButtonElement,
    noButton: noButton as unknown as HTMLButtonElement,
    yesFace: yesFace as unknown as HTMLElement,
    noFace: noFace as unknown as HTMLElement,
    noLabel: noLabel as unknown as HTMLElement,
    noCostume: noCostume as unknown as HTMLElement,
  };

  return {
    controller: createTrickVisualController(elements),
    elements,
    stage,
    letter,
    yesFace,
    yesSeat,
    yesButton,
    noFace,
    noSeat,
    noButton,
    noLabel,
    noCostume,
    addProtected,
  };
}

function transitionElements(harness: Harness): ElementStub[] {
  return [
    harness.elements.actions,
    harness.elements.yesSeat,
    harness.elements.noSeat,
    harness.elements.yesMotion,
    harness.elements.noMotion,
    harness.elements.yesButton,
    harness.elements.noButton,
    harness.elements.yesFace,
    harness.elements.noFace,
  ] as unknown as ElementStub[];
}

function totalRectReads(harness: Harness): number {
  const renderElements = Object.values(harness.elements) as unknown as ElementStub[];
  const measuredElements = new Set([
    ...renderElements,
    ...harness.letter.protectedChildren,
  ]);
  return [...measuredElements].reduce((total, element) => total + element.measureCount, 0);
}

function renderOwnedState(harness: Harness): object {
  return {
    yesScale: harness.yesFace.style.getPropertyValue("--yes-scale"),
    noScale: harness.noFace.style.getPropertyValue("--no-scale"),
    noPoseX: harness.noSeat.style.getPropertyValue("--no-pose-x"),
    noPoseY: harness.noSeat.style.getPropertyValue("--no-pose-y"),
    noRotation: harness.noSeat.style.getPropertyValue("--no-rotation"),
    swapped: harness.stage.getAttribute("data-swapped"),
    disguised: harness.stage.getAttribute("data-disguised"),
    label: harness.noLabel.textContent,
    costume: harness.noCostume.textContent,
    costumeHidden: harness.noCostume.hidden,
    ariaLabel: harness.noButton.getAttribute("aria-label"),
    transitions: transitionElements(harness).map(
      (element) => element.style.getPropertyValue("transition"),
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createTrickVisualController", () => {
  it("returns composed preview rectangles in letter-local coordinates", () => {
    const harness = createHarness();

    const preview = harness.controller.preview({
      yesScale: 1.1,
      noPose: { centerX: 500, centerY: 400, rotation: 0 },
    });

    expect(preview.beforeYes).toMatchObject({
      left: 220,
      top: 478,
      right: 300,
      bottom: 522,
      width: 80,
      height: 44,
    });
    expect(preview.beforeNo).toMatchObject({
      left: 316,
      top: 478,
      right: 404,
      bottom: 522,
      width: 88,
      height: 44,
    });
    expect(preview.afterYes.left).toBeCloseTo(216);
    expect(preview.afterYes.top).toBeCloseTo(475.8);
    expect(preview.afterYes.right).toBeCloseTo(304);
    expect(preview.afterYes.bottom).toBeCloseTo(524.2);
    expect(preview.afterNo).toMatchObject({
      left: 456,
      top: 378,
      right: 544,
      bottom: 422,
      width: 88,
      height: 44,
    });
  });

  it("replaces a committed pose with a later requested pose and keeps render layers separate", () => {
    const harness = createHarness();
    const first = harness.controller.preview({
      noPose: { centerX: 480, centerY: 500, rotation: -4 },
      yesScale: 1.1,
      noScale: 0.8,
      swapped: true,
      disguised: true,
    });
    harness.controller.commit(first.target);

    const laterPose = { centerX: 510, centerY: 410, rotation: 5 };
    const second = harness.controller.preview({ noPose: laterPose });

    expect(second.target.noPose).toEqual(laterPose);
    expect(harness.controller.state).toBe(first.target);
    expect(harness.yesFace.style.getPropertyValue("--yes-scale")).toBe("1.1");
    expect(harness.noFace.style.getPropertyValue("--no-scale")).toBe("0.8");
    expect(harness.stage.hasAttribute("data-swapped")).toBe(true);
    expect(harness.stage.hasAttribute("data-disguised")).toBe(true);
    expect(harness.noSeat.style.getPropertyValue("--no-pose-x")).toBe("280px");
    expect(harness.noSeat.style.getPropertyValue("--no-rotation")).toBe("-4deg");
    expect(harness.noLabel.textContent).toBe("DEFINITELY YES");
    expect(harness.noCostume.textContent).toBe("🥸");
  });

  it("rebases an unsafe pose without discarding safe scale or order layers", () => {
    const harness = createHarness([rect(100, 470, 52, 60)]);

    const preview = harness.controller.preview({
      yesScale: 1.5,
      swapped: true,
      noPose: { centerX: 20, centerY: 500, rotation: 0 },
    });

    expect(preview.target.yesScale).toBe(1.5);
    expect(preview.target.swapped).toBe(true);
    expect(preview.target.noPose).not.toBeNull();
    expect(preview.target.noPose).not.toEqual({ centerX: 20, centerY: 500, rotation: 0 });
    expect(preview.afterYes.width).toBeCloseTo(120);
    expect(harness.controller.state).toBe(INITIAL_TRICK_VISUAL_STATE);
    expect(harness.yesFace.style.getPropertyValue("--yes-scale")).toBe("1");
    expect(harness.stage.hasAttribute("data-swapped")).toBe(false);
    expect(harness.noSeat.style.getPropertyValue("--no-pose-x")).toBe("");
    expect(harness.noLabel.textContent).toBe("NO, SORRY");
  });

  it("bounds layout reads while rebasing an unsafe composed pose", () => {
    const harness = createHarness([rect(100, 470, 52, 60)]);
    const readsBefore = totalRectReads(harness);

    const preview = harness.controller.preview({
      yesScale: 1.5,
      swapped: true,
      noPose: { centerX: 20, centerY: 500, rotation: 0 },
    });
    const previewReads = totalRectReads(harness) - readsBefore;

    expect(preview.target.yesScale).toBe(1.5);
    expect(preview.target.swapped).toBe(true);
    expect(preview.target.noPose).not.toBeNull();
    // The deterministic rebase remains bounded rather than searching the layout indefinitely.
    expect(previewReads).toBeLessThanOrEqual(82);
  });

  it("reduces YES growth to the nearest value clear of protected content", () => {
    const harness = createHarness([rect(170, 470, 30, 60)]);
    const posed = harness.controller.preview({
      noPose: { centerX: 500, centerY: 500, rotation: 0 },
    });
    harness.controller.commit(posed.target);

    const preview = harness.controller.preview({ yesScale: 1.5 });

    expect(preview.target.yesScale).toBeCloseTo(1.3, 8);
    expect(preview.target.noPose).toEqual(posed.target.noPose);
  });

  it("restores committed CSS, attributes, and copy through finally when measurement throws", () => {
    const harness = createHarness();
    harness.yesFace.style.setProperty("transition", "opacity 1s");
    harness.yesFace.failAtMeasure = 2;

    expect(() => harness.controller.preview({
      yesScale: 1.4,
      swapped: true,
      disguised: true,
    })).toThrow("measurement failed");

    expect(harness.controller.state).toBe(INITIAL_TRICK_VISUAL_STATE);
    expect(harness.yesFace.style.getPropertyValue("--yes-scale")).toBe("1");
    expect(harness.noFace.style.getPropertyValue("--no-scale")).toBe("1");
    expect(harness.yesFace.style.getPropertyValue("transition")).toBe("opacity 1s");
    expect(harness.stage.hasAttribute("data-swapped")).toBe(false);
    expect(harness.stage.hasAttribute("data-disguised")).toBe(false);
    expect(harness.noLabel.textContent).toBe("NO, SORRY");
    expect(harness.noCostume.textContent).toBe("");
    expect((harness.elements.noButton as unknown as ElementStub).getAttribute("aria-label")).toBeNull();
  });

  it("restores transitions and render-owned state when posed rollback measurement also throws", () => {
    const harness = createHarness();
    const posed = harness.controller.preview({
      noPose: { centerX: 500, centerY: 420, rotation: 5 },
      yesScale: 1.1,
      noScale: 0.82,
      swapped: true,
      disguised: true,
    });
    harness.controller.commit(posed.target);
    transitionElements(harness).forEach((element, index) => {
      if (index % 2 === 0) element.style.setProperty("transition", `opacity ${index + 1}s`);
    });
    const before = renderOwnedState(harness);

    harness.yesFace.failAtMeasure = harness.yesFace.measureCount + 2;
    harness.yesFace.measureFailureMessage = "preview measurement failed";
    harness.letter.failAtMeasure = harness.letter.measureCount + 5;
    harness.letter.measureFailureMessage = "rollback measurement failed";

    let thrown: unknown;
    try {
      harness.controller.preview({
        yesScale: 1.4,
        noScale: 0.7,
        swapped: false,
        disguised: false,
      });
    } catch (error) {
      thrown = error;
    }

    expect.soft(thrown).toMatchObject({ message: "preview measurement failed" });
    expect.soft(renderOwnedState(harness)).toEqual(before);
    expect(harness.controller.state).toBe(posed.target);
  });

  it.each([
    { initialReady: false, requestedReady: true },
    { initialReady: true, requestedReady: false },
  ])(
    "keeps refusal readiness and its committed render atomic when changing $initialReady to $requestedReady fails",
    ({ initialReady, requestedReady }) => {
      const harness = createHarness();
      const posed = harness.controller.preview({
        noPose: { centerX: 500, centerY: 420, rotation: 5 },
        yesScale: 1.1,
        noScale: 0.82,
        swapped: true,
        disguised: true,
      });
      harness.controller.commit(posed.target);
      if (initialReady) harness.controller.setRefusalReady(true);
      const stateBefore = harness.controller.state;
      const renderBefore = renderOwnedState(harness);
      harness.yesFace.failAtMeasure = harness.yesFace.measureCount + 1;

      expect(() => harness.controller.setRefusalReady(requestedReady))
        .toThrow("measurement failed");

      expect(harness.controller.state).toBe(stateBefore);
      expect(renderOwnedState(harness)).toEqual(renderBefore);
    },
  );

  it("keeps refusal copy independent from disguise state and avoids a duplicate costume", () => {
    const harness = createHarness();
    const disguised = harness.controller.preview({ disguised: true });
    harness.controller.commit(disguised.target);

    expect(harness.noLabel.textContent).toBe("DEFINITELY YES");
    expect(harness.noCostume.textContent).toBe("🥸");
    expect(harness.noLabel.textContent).not.toContain("🥸");
    expect((harness.elements.noButton as unknown as ElementStub).getAttribute("aria-label"))
      .toBe("NO option, wearing a DEFINITELY YES disguise");

    harness.controller.setRefusalReady(true);
    expect(harness.noLabel.textContent).toBe("Okay, I'll behave…");
    expect(harness.noCostume.textContent).toBe("🥸");
    expect((harness.elements.noButton as unknown as ElementStub).getAttribute("aria-label"))
      .toBe("NO refusal option: Okay, I'll behave…");

    harness.controller.clearDisguise();
    expect(harness.controller.state.disguised).toBe(false);
    expect(harness.noLabel.textContent).toBe("Okay, I'll behave…");
    expect(harness.noCostume.textContent).toBe("");
    expect((harness.elements.noButton as unknown as ElementStub).getAttribute("aria-label")).toBeNull();
  });

  it("rebases refusal copy without resetting already committed scale or order layers", () => {
    const harness = createHarness();
    const disguised = harness.controller.preview({
      noPose: { centerX: 363.5, centerY: 500, rotation: 0 },
      yesScale: 1.1,
      noScale: 0.82,
      swapped: false,
      disguised: true,
    });
    harness.controller.commit(disguised.target);

    harness.controller.setRefusalReady(true);

    expect(harness.controller.state.yesScale).toBe(1.1);
    expect(harness.controller.state.noScale).toBe(0.82);
    expect(harness.controller.state.swapped).toBe(false);
    expect(harness.controller.state.disguised).toBe(true);
    expect(harness.controller.state.noPose).not.toBeNull();
    expect(harness.controller.state.noPose).not.toEqual(disguised.target.noPose);
    expect(harness.noLabel.textContent).toBe("Okay, I'll behave…");
    expect(harness.noCostume.textContent).toBe("🥸");
    expect((harness.elements.noButton as unknown as ElementStub).getAttribute("aria-label"))
      .toBe("NO refusal option: Okay, I'll behave…");
  });

  it("stages without committing, revalidates changed geometry, and resets all persistent render state", () => {
    const harness = createHarness();
    const posed = harness.controller.preview({
      noPose: { centerX: 500, centerY: 420, rotation: 0 },
      disguised: true,
    });
    harness.controller.commit(posed.target);
    harness.addProtected(rect(450, 380, 100, 80));

    harness.controller.revalidate();
    expect(harness.controller.state.noPose).not.toBeNull();
    expect(harness.controller.state.noPose).not.toEqual(posed.target.noPose);
    const staged = applyTrickVisualPatch(harness.controller.state, { yesScale: 1.2, swapped: true });
    harness.controller.stage(staged);
    expect(harness.controller.state.yesScale).toBe(1);
    expect(harness.yesFace.style.getPropertyValue("--yes-scale")).toBe("1.2");

    harness.controller.setRefusalReady(true);
    harness.controller.reset();
    expect(harness.controller.state).toBe(INITIAL_TRICK_VISUAL_STATE);
    expect(harness.yesFace.style.getPropertyValue("--yes-scale")).toBe("1");
    expect(harness.stage.hasAttribute("data-swapped")).toBe(false);
    expect(harness.stage.hasAttribute("data-disguised")).toBe(false);
    expect(harness.noSeat.style.getPropertyValue("--no-pose-x")).toBe("");
    expect(harness.noLabel.textContent).toBe("NO, SORRY");
    expect(harness.noCostume.textContent).toBe("");
  });

  it("measures protected selectors in letter-local coordinates and uses a deterministic current pose", () => {
    const harness = createHarness();
    const random = vi.spyOn(Math, "random");
    vi.stubGlobal("getComputedStyle", vi.fn(() => ({
      borderLeftWidth: "5px",
      borderRightWidth: "7px",
      borderTopWidth: "3px",
      borderBottomWidth: "4px",
    })));

    const pose = harness.controller.choosePose("plane", 2);
    const expected = chooseSafeNoPose({
      letterPaddingBox: rect(5, 3, 588, 593),
      viewport: { left: -100, right: 700 },
      currentNo: rect(316, 478, 88, 44),
      noHitSize: { width: 88, height: 44 },
      yes: rect(220, 478, 80, 44),
      protectedRects: [],
    }, {
      intent: "plane",
      attempt: 2,
      currentRotation: 0,
    });

    expect(pose).toEqual(expected);
    expect(harness.letter.selectorSeen).toBe(
      ".eyebrow, [data-question], [data-note], .date-ticket, [data-signature], .tape, .wax-seal",
    );
    expect(harness.letter.measureCount).toBe(1);
    expect(harness.yesSeat.measureCount).toBe(1);
    expect(harness.yesButton.measureCount).toBe(1);
    expect(harness.yesFace.measureCount).toBe(1);
    expect(harness.noSeat.measureCount).toBe(1);
    expect(harness.noButton.measureCount).toBe(1);
    expect(harness.noFace.measureCount).toBe(1);
    expect(random).not.toHaveBeenCalled();
  });
});
