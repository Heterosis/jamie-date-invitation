import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from "vitest";
import { TRICK_IDS } from "../domain/trick-deck";
import type { InvitationView } from "./invitation-view";
import {
  createTrickRunner,
  type TrickEffect,
  type TrickEffectContext,
  type TrickRegistry,
} from "./trick-runner";
import type {
  TrickVisualController,
  VisualPreview,
} from "./trick-geometry";
import {
  applyTrickVisualPatch,
  INITIAL_TRICK_VISUAL_STATE,
  type TrickVisualPatch,
  type TrickVisualState,
} from "./trick-state";

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value?: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
} {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise as (value?: T | PromiseLike<T>) => void;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeAnimation(
  finished: Promise<unknown>,
  onCancel: () => void = () => undefined,
): Animation {
  return {
    finished,
    pause: vi.fn(),
    play: vi.fn(),
    cancel: vi.fn(onCancel),
  } as unknown as Animation;
}

class FakeElement extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly animationQueue: Animation[] = [];
  readonly animationCalls: Array<{
    readonly keyframes: Keyframe[] | PropertyIndexedKeyframes;
    readonly options: KeyframeAnimationOptions;
  }> = [];
  readonly attributes = new Map<string, string>();
  parent: FakeElement | null = null;
  textContent: string | null = "";
  hidden = false;
  removed = false;

  readonly animate = vi.fn((
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options: KeyframeAnimationOptions,
  ): Animation => {
    this.animationCalls.push({ keyframes, options });
    const animation = this.animationQueue.shift();
    if (!animation) throw new Error("No fake animation was queued");
    return animation;
  });

  readonly remove = vi.fn((): void => {
    this.removed = true;
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  });

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

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  querySelectorAll<ElementType extends Element>(selector: string): ElementType[] {
    if (selector !== "[data-trick-artifact]") return [];
    const matches: FakeElement[] = [];
    const visit = (element: FakeElement): void => {
      if (!element.removed && element.dataset.trickArtifact !== undefined) {
        matches.push(element);
      }
      element.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches as unknown as ElementType[];
  }
}

class FakeWindow extends EventTarget {
  readonly addedListeners: string[] = [];
  readonly removedListeners: string[] = [];

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.addedListeners.push(type);
    super.addEventListener(type, callback, options);
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    this.removedListeners.push(type);
    super.removeEventListener(type, callback, options);
  }
}

const EMPTY_RECT = Object.freeze({
  x: 0,
  y: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
}) as DOMRectReadOnly;

interface FakeViewFixture {
  readonly view: InvitationView;
  readonly stage: FakeElement;
  readonly letter: FakeElement;
  readonly noButton: FakeElement;
  readonly status: FakeElement;
}

function fakeView(): FakeViewFixture {
  const stage = new FakeElement();
  const letter = new FakeElement();
  const noButton = new FakeElement();
  const status = new FakeElement();
  stage.append(letter);
  letter.append(noButton);

  const element = (): FakeElement => new FakeElement();
  const view = {
    stage,
    letter,
    askingPanel: element(),
    actions: element(),
    yesSeat: element(),
    noSeat: element(),
    yesMotion: element(),
    noMotion: element(),
    yesFace: element(),
    noFace: element(),
    noLabel: element(),
    noCostume: element(),
    yesButton: element(),
    noButton,
    successPanel: element(),
    calendarLink: element(),
    telegramLink: element(),
    declinedPanel: element(),
    dialog: element(),
    actuallyYesButton: element(),
    confirmNoButton: element(),
    status,
  } as unknown as InvitationView;
  return { view, stage, letter, noButton, status };
}

type FakeVisuals = TrickVisualController & {
  readonly preview: MockedFunction<TrickVisualController["preview"]>;
  readonly stage: MockedFunction<TrickVisualController["stage"]>;
  readonly commit: MockedFunction<TrickVisualController["commit"]>;
  readonly clearDisguise: MockedFunction<TrickVisualController["clearDisguise"]>;
  readonly setRefusalReady: MockedFunction<TrickVisualController["setRefusalReady"]>;
  readonly revalidate: MockedFunction<TrickVisualController["revalidate"]>;
  readonly reset: MockedFunction<TrickVisualController["reset"]>;
};

function fakeVisuals(options: {
  readonly onCommit?: (state: Readonly<TrickVisualState>) => void;
  readonly onRevalidate?: () => void;
} = {}): FakeVisuals {
  let committed: Readonly<TrickVisualState> = INITIAL_TRICK_VISUAL_STATE;
  const controller = {
    get state(): Readonly<TrickVisualState> {
      return committed;
    },
    choosePose: vi.fn(() => null),
    preview: vi.fn((patch: TrickVisualPatch): VisualPreview => ({
      previous: committed,
      target: applyTrickVisualPatch(committed, patch),
      beforeYes: EMPTY_RECT,
      beforeNo: EMPTY_RECT,
      afterYes: EMPTY_RECT,
      afterNo: EMPTY_RECT,
    })),
    stage: vi.fn(),
    commit: vi.fn((state: Readonly<TrickVisualState>): void => {
      committed = state;
      options.onCommit?.(state);
    }),
    clearDisguise: vi.fn(),
    setRefusalReady: vi.fn(),
    revalidate: vi.fn(() => options.onRevalidate?.()),
    reset: vi.fn(() => {
      committed = INITIAL_TRICK_VISUAL_STATE;
    }),
  };
  return controller as unknown as FakeVisuals;
}

interface FakeRaf {
  readonly request: ReturnType<typeof vi.fn>;
  readonly cancel: ReturnType<typeof vi.fn>;
  flush(): void;
}

function fakeRaf(): FakeRaf {
  let nextId = 0;
  const queued = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback): number => {
    nextId += 1;
    queued.set(nextId, callback);
    return nextId;
  });
  const cancel = vi.fn((id: number): void => {
    queued.delete(id);
  });
  return {
    request,
    cancel,
    flush(): void {
      const callbacks = [...queued.values()];
      queued.clear();
      callbacks.forEach((callback) => callback(0));
    },
  };
}

interface SetupOptions {
  readonly animation?: Animation;
  readonly animations?: readonly Animation[];
  readonly persistence?: "commit-target" | "transient";
  readonly patch?: TrickVisualPatch;
  readonly fallbackMs?: number;
  readonly reducedMotion?: boolean;
  readonly artifactCount?: number;
  readonly effect?: TrickEffect;
  readonly onCommit?: (state: Readonly<TrickVisualState>) => void;
  readonly onRevalidate?: () => void;
  readonly artifactRemoveError?: Error;
  readonly setTimeout?: typeof globalThis.setTimeout;
}

function setupRunner(options: SetupOptions = {}) {
  const elements = fakeView();
  const animations = options.animations
    ? [...options.animations]
    : options.animation ? [options.animation] : [];
  const animationTarget = new FakeElement();
  animationTarget.animationQueue.push(...animations);
  elements.letter.append(animationTarget);
  const artifacts: FakeElement[] = [];
  const visuals = fakeVisuals({
    onCommit: options.onCommit,
    onRevalidate: options.onRevalidate,
  });
  const raf = fakeRaf();
  const fakeWindow = new FakeWindow();
  vi.stubGlobal("window", fakeWindow);

  const effect: TrickEffect = options.effect ?? ((context: TrickEffectContext) => {
    const preview = context.preview(options.patch ?? { yesScale: 1.2 });
    for (let index = 0; index < animations.length; index += 1) {
      context.animate(
        animationTarget as unknown as Element,
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 240, easing: "ease-out" },
      );
    }
    for (let index = 0; index < (options.artifactCount ?? 1); index += 1) {
      const artifact = new FakeElement();
      if (options.artifactRemoveError) {
        artifact.remove.mockImplementation(() => {
          throw options.artifactRemoveError;
        });
      }
      artifacts.push(artifact);
      elements.letter.append(artifact);
      context.trackArtifact(artifact as unknown as HTMLElement);
    }
    return {
      message: "The full trick completed.",
      preview,
      fallbackMs: options.fallbackMs ?? 900,
      persistence: options.persistence ?? "commit-target",
    };
  });
  const registry = Object.fromEntries(
    TRICK_IDS.map((id) => [id, effect]),
  ) as unknown as TrickRegistry;
  const runner = createTrickRunner(elements.view, registry, {
    visuals,
    reducedMotion: () => options.reducedMotion ?? false,
    setTimeout: options.setTimeout,
    requestAnimationFrame: raf.request as typeof globalThis.requestAnimationFrame,
    cancelAnimationFrame: raf.cancel as typeof globalThis.cancelAnimationFrame,
  });
  return {
    runner,
    elements,
    visuals,
    animationTarget,
    artifacts,
    raf,
    window: fakeWindow,
  };
}

function expectSettled(elements: FakeViewFixture): void {
  expect(vi.getTimerCount()).toBe(0);
  expect(elements.stage.dataset.trickBusy).toBe("false");
  expect(elements.stage.getAttribute("aria-busy")).toBe("false");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createTrickRunner", () => {
  it("marks the stage busy synchronously and clears it after completion", async () => {
    const completion = deferred<void>();
    const animation = fakeAnimation(completion.promise);
    const fixture = setupRunner({
      animation,
      persistence: "commit-target",
      patch: { yesScale: 1.2 },
      fallbackMs: 900,
    });

    expect(fixture.elements.stage.dataset.attempts).toBe("0");
    expect(fixture.elements.stage.dataset.trickBusy).toBe("false");
    expect(fixture.elements.stage.getAttribute("aria-busy")).toBe("false");

    const run = fixture.runner.start("growing-feelings", 1, { x: 120, y: 300 });
    expect(fixture.elements.stage.dataset.trickBusy).toBe("true");
    expect(fixture.elements.stage.getAttribute("aria-busy")).toBe("true");
    expect(fixture.elements.stage.dataset.attempts).toBe("1");
    expect(fixture.elements.stage.dataset.lastTrick).toBe("growing-feelings");

    completion.resolve();
    const result = await run.finished;

    expect(result).toEqual({ id: "growing-feelings", outcome: "completed" });
    expect(fixture.visuals.commit).toHaveBeenCalledWith(
      expect.objectContaining({ yesScale: 1.2 }),
    );
    expectSettled(fixture.elements);
  });

  it("commits persistent target state before removing temporary motion", async () => {
    const completion = deferred<void>();
    const order: string[] = [];
    const animation = fakeAnimation(completion.promise, () => order.push("cancel"));
    const fixture = setupRunner({
      animation,
      onCommit: () => order.push("commit"),
      persistence: "commit-target",
    });

    const run = fixture.runner.start("growing-feelings", 1, { x: 2, y: 3 });
    completion.resolve();

    expect(await run.finished).toEqual({
      id: "growing-feelings",
      outcome: "completed",
    });
    expect(order.slice(0, 2)).toEqual(["commit", "cancel"]);
    expectSettled(fixture.elements);
  });

  it("settles once when natural completion and fallback race", async () => {
    const completion = deferred<void>();
    const animation = fakeAnimation(completion.promise);
    const fixture = setupRunner({ animation, fallbackMs: 900, artifactCount: 1 });
    const observed = vi.fn();

    const run = fixture.runner.start("seat-swap", 2, { x: 2, y: 3 });
    void run.finished.then(observed);
    completion.resolve();
    vi.advanceTimersByTime(900);
    const result = await run.finished;
    await Promise.resolve();

    expect(result).toEqual({ id: "seat-swap", outcome: "fallback" });
    expect(observed).toHaveBeenCalledTimes(1);
    expect(fixture.visuals.commit).toHaveBeenCalledTimes(1);
    expect(animation.cancel).toHaveBeenCalledTimes(1);
    expect(fixture.artifacts[0]?.remove).toHaveBeenCalledTimes(1);
    expectSettled(fixture.elements);
  });

  it("cancels every owned animation exactly once and resolves cancelled", async () => {
    const firstCompletion = deferred<void>();
    const secondCompletion = deferred<void>();
    const first = fakeAnimation(firstCompletion.promise);
    const second = fakeAnimation(secondCompletion.promise);
    const fixture = setupRunner({ animations: [first, second], artifactCount: 1 });
    const previous = fixture.runner.visualState;

    const run = fixture.runner.start("paper-plane", 3, { x: 5, y: 8 });
    run.cancel();
    run.cancel();

    expect(await run.finished).toEqual({ id: "paper-plane", outcome: "cancelled" });
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(second.cancel).toHaveBeenCalledTimes(1);
    expect(fixture.artifacts[0]?.remove).toHaveBeenCalledTimes(1);
    expect(fixture.visuals.commit).toHaveBeenCalledTimes(1);
    expect(fixture.visuals.commit).toHaveBeenCalledWith(previous);
    expect(fixture.runner.visualState).toBe(previous);
    expectSettled(fixture.elements);
  });

  it("consumes expected Animation.finished rejection", async () => {
    const completion = deferred<void>();
    const animation = fakeAnimation(completion.promise);
    const fixture = setupRunner({ animation });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      const run = fixture.runner.start("cupid-magnet", 1, { x: 1, y: 1 });
      run.cancel();
      completion.reject(new DOMException("cancelled", "AbortError"));

      expect(await run.finished).toEqual({
        id: "cupid-magnet",
        outcome: "cancelled",
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(unhandled).not.toHaveBeenCalled();
      expectSettled(fixture.elements);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("unexpected animation cancellation uses fallback policy", async () => {
    for (const persistence of ["commit-target", "transient"] as const) {
      const completion = deferred<void>();
      const animation = fakeAnimation(completion.promise);
      const fixture = setupRunner({ animation, persistence, patch: { yesScale: 1.3 } });
      const previous = fixture.runner.visualState;

      const run = fixture.runner.start("runaway-rsvp", 1, { x: 0, y: 0 });
      completion.reject(new DOMException("interrupted", "AbortError"));

      expect(await run.finished).toEqual({ id: "runaway-rsvp", outcome: "fallback" });
      if (persistence === "commit-target") {
        expect(fixture.runner.visualState.yesScale).toBe(1.3);
      } else {
        expect(fixture.runner.visualState).toBe(previous);
        expect(fixture.visuals.commit).not.toHaveBeenCalled();
      }
      expect(fixture.elements.status.textContent).toBe("The tiny trick landed safely.");
      expectSettled(fixture.elements);
      fixture.runner.dispose();
    }
  });

  it("uses fallback to commit a persistent target", async () => {
    const completion = deferred<void>();
    const fixture = setupRunner({
      animation: fakeAnimation(completion.promise),
      persistence: "commit-target",
      patch: { yesScale: 1.25 },
      fallbackMs: 500,
    });

    const run = fixture.runner.start("growing-feelings", 1, { x: 4, y: 4 });
    await vi.advanceTimersByTimeAsync(500);

    expect(await run.finished).toEqual({ id: "growing-feelings", outcome: "fallback" });
    expect(fixture.runner.visualState.yesScale).toBe(1.25);
    expectSettled(fixture.elements);
  });

  it("uses fallback to discard a transient target", async () => {
    const completion = deferred<void>();
    const fixture = setupRunner({
      animation: fakeAnimation(completion.promise),
      persistence: "transient",
      patch: { yesScale: 1.25 },
      fallbackMs: 500,
      artifactCount: 1,
    });
    const previous = fixture.runner.visualState;

    const run = fixture.runner.start("yes-garden", 1, { x: 4, y: 4 });
    await vi.advanceTimersByTimeAsync(500);

    expect(await run.finished).toEqual({ id: "yes-garden", outcome: "fallback" });
    expect(fixture.runner.visualState).toBe(previous);
    expect(fixture.visuals.commit).not.toHaveBeenCalled();
    expect(fixture.artifacts[0]?.remove).toHaveBeenCalledTimes(1);
    expectSettled(fixture.elements);
  });

  it("Reduced Motion preserves the target state with near-zero timing", async () => {
    const fullCompletion = deferred<void>();
    const full = setupRunner({
      animation: fakeAnimation(fullCompletion.promise),
      patch: { yesScale: 1.2, disguised: true },
      artifactCount: 0,
    });
    const fullRun = full.runner.start("tiny-disguise", 1, { x: 1, y: 2 });
    const fullTarget = full.visuals.stage.mock.calls[0]?.[0];
    fullRun.cancel();
    await fullRun.finished;
    expectSettled(full.elements);
    full.runner.dispose();

    const reducedCompletion = deferred<void>();
    const reducedAnimation = fakeAnimation(reducedCompletion.promise);
    const reduced = setupRunner({
      animation: reducedAnimation,
      patch: { yesScale: 1.2, disguised: true },
      fallbackMs: 900,
      reducedMotion: true,
      artifactCount: 0,
    });
    const run = reduced.runner.start("tiny-disguise", 1, { x: 1, y: 2 });

    expect(reduced.animationTarget.animationCalls[0]?.options.duration).toBe(1);
    expect(reduced.visuals.stage.mock.calls[0]?.[0]).toEqual(fullTarget);
    await vi.advanceTimersByTimeAsync(50);

    expect(await run.finished).toEqual({ id: "tiny-disguise", outcome: "fallback" });
    expect(reduced.runner.visualState).toEqual(fullTarget);
    expectSettled(reduced.elements);
  });

  it("preparation error releases busy with a stable fallback", async () => {
    const artifact = new FakeElement();
    const fixture = setupRunner({
      artifactCount: 0,
      effect: (context) => {
        (context.view.letter as unknown as FakeElement).append(artifact);
        context.trackArtifact(artifact as unknown as HTMLElement);
        throw new Error("malformed effect");
      },
    });
    const previous = fixture.runner.visualState;

    const run = fixture.runner.start("dramatic-excuse", 2, { x: 8, y: 13 });

    expect(await run.finished).toEqual({ id: "dramatic-excuse", outcome: "fallback" });
    expect(fixture.runner.visualState).toBe(previous);
    expect(fixture.visuals.commit).toHaveBeenCalledWith(previous);
    expect(artifact.remove).toHaveBeenCalledTimes(1);
    expect(fixture.elements.status.textContent).toBe("The tiny trick landed safely.");
    expectSettled(fixture.elements);
  });

  it("reset removes every artifact and restores initial state", async () => {
    const completion = deferred<void>();
    const fixture = setupRunner({
      animation: fakeAnimation(completion.promise),
      artifactCount: 1,
    });
    const stray = new FakeElement();
    stray.dataset.trickArtifact = "true";
    fixture.elements.stage.append(stray);
    fixture.elements.noButton.dataset.locked = "true";

    const run = fixture.runner.start("yes-garden", 4, { x: 21, y: 34 });
    fixture.runner.reset();

    expect(await run.finished).toEqual({ id: "yes-garden", outcome: "cancelled" });
    expect(fixture.runner.visualState).toBe(INITIAL_TRICK_VISUAL_STATE);
    expect(fixture.visuals.setRefusalReady).toHaveBeenCalledWith(false);
    expect(fixture.visuals.reset).toHaveBeenCalledTimes(1);
    expect(fixture.artifacts[0]?.remove).toHaveBeenCalledTimes(1);
    expect(stray.remove).toHaveBeenCalledTimes(1);
    expect(fixture.elements.stage.dataset.lastTrick).toBeUndefined();
    expect(fixture.elements.noButton.dataset.locked).toBeUndefined();
    expectSettled(fixture.elements);
  });

  it("dispose invalidates late completion and leaves no timers", async () => {
    const completion = deferred<void>();
    const animation = fakeAnimation(completion.promise);
    const fixture = setupRunner({ animation, fallbackMs: 800 });
    const run = fixture.runner.start("spotlight", 1, { x: 55, y: 89 });

    fixture.runner.dispose();
    const result = await run.finished;
    const commitCount = fixture.visuals.commit.mock.calls.length;
    const status = fixture.elements.status.textContent;
    completion.resolve();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(result).toEqual({ id: "spotlight", outcome: "cancelled" });
    expect(fixture.visuals.commit).toHaveBeenCalledTimes(commitCount);
    expect(fixture.elements.status.textContent).toBe(status);
    expect(animation.cancel).toHaveBeenCalledTimes(1);
    expectSettled(fixture.elements);
  });

  it("coalesces resize and orientation changes and settles before revalidation", async () => {
    const completion = deferred<void>();
    const order: string[] = [];
    const fixture = setupRunner({
      animation: fakeAnimation(completion.promise),
      persistence: "commit-target",
      onCommit: () => order.push("commit"),
      onRevalidate: () => order.push("revalidate"),
    });
    const run = fixture.runner.start("seat-swap", 1, { x: 1, y: 1 });

    fixture.window.dispatchEvent(new Event("resize"));
    fixture.window.dispatchEvent(new Event("orientationchange"));
    fixture.window.dispatchEvent(new Event("resize"));
    expect(fixture.raf.request).toHaveBeenCalledTimes(1);
    fixture.raf.flush();

    expect(await run.finished).toEqual({ id: "seat-swap", outcome: "fallback" });
    expect(order.slice(0, 2)).toEqual(["commit", "revalidate"]);

    fixture.window.dispatchEvent(new Event("resize"));
    fixture.window.dispatchEvent(new Event("orientationchange"));
    expect(fixture.raf.request).toHaveBeenCalledTimes(2);
    fixture.raf.flush();
    expect(fixture.visuals.revalidate).toHaveBeenCalledTimes(2);
    expect(fixture.visuals.commit).toHaveBeenCalledTimes(1);
    expectSettled(fixture.elements);
  });

  it("dispose removes resize listeners and cancels a queued frame", () => {
    const fixture = setupRunner({ artifactCount: 0 });
    fixture.window.dispatchEvent(new Event("resize"));
    expect(fixture.raf.request).toHaveBeenCalledTimes(1);

    fixture.runner.dispose();
    fixture.window.dispatchEvent(new Event("resize"));
    fixture.window.dispatchEvent(new Event("orientationchange"));

    expect(fixture.raf.cancel).toHaveBeenCalledTimes(1);
    expect(fixture.raf.request).toHaveBeenCalledTimes(1);
    expect(fixture.window.removedListeners).toEqual([
      "resize",
      "orientationchange",
    ]);
    expectSettled(fixture.elements);
  });

  it("throws when a second start is attempted while busy", async () => {
    const completion = deferred<void>();
    const fixture = setupRunner({ animation: fakeAnimation(completion.promise) });
    const run = fixture.runner.start("paper-plane", 1, { x: 1, y: 1 });

    expect(() => fixture.runner.start("spotlight", 2, { x: 2, y: 2 }))
      .toThrow(/cannot start.*while.*active/i);
    expect(fixture.elements.stage.dataset.lastTrick).toBe("paper-plane");
    run.cancel();
    expect(await run.finished).toEqual({ id: "paper-plane", outcome: "cancelled" });
    expectSettled(fixture.elements);
  });

  it("settles a zero-animation effect through a microtask", async () => {
    const fixture = setupRunner({ animations: [], artifactCount: 0 });
    const run = fixture.runner.start("return-to-sender", 1, { x: 3, y: 5 });
    const observed = vi.fn();
    void run.finished.then(observed);

    expect(fixture.runner.busy).toBe(true);
    expect(fixture.elements.stage.dataset.trickBusy).toBe("true");
    expect(observed).not.toHaveBeenCalled();

    expect(await run.finished).toEqual({
      id: "return-to-sender",
      outcome: "completed",
    });
    expect(observed).toHaveBeenCalledTimes(1);
    expectSettled(fixture.elements);
  });

  it("delegates visual commands and exposes committed state", () => {
    const fixture = setupRunner({ artifactCount: 0 });

    fixture.runner.clearDisguise();
    fixture.runner.setRefusalReady(true);
    fixture.runner.revalidate();

    expect(fixture.visuals.clearDisguise).toHaveBeenCalledTimes(1);
    expect(fixture.visuals.setRefusalReady).toHaveBeenCalledWith(true);
    expect(fixture.visuals.revalidate).toHaveBeenCalledTimes(1);
    expect(fixture.runner.visualState).toBe(fixture.visuals.state);
    expect(fixture.runner.busy).toBe(false);
  });

  it("releases ownership when commit and artifact cleanup callbacks throw", async () => {
    const completion = deferred<void>();
    const animation = fakeAnimation(completion.promise);
    const fixture = setupRunner({
      animation,
      onCommit: () => {
        throw new Error("render failed");
      },
      artifactRemoveError: new Error("remove failed"),
    });

    const run = fixture.runner.start("growing-feelings", 1, { x: 1, y: 1 });
    completion.resolve();

    expect(await run.finished).toEqual({
      id: "growing-feelings",
      outcome: "completed",
    });
    expect(animation.cancel).toHaveBeenCalledTimes(1);
    expect(fixture.artifacts[0]?.remove).toHaveBeenCalledTimes(1);
    expectSettled(fixture.elements);
  });

  it("turns timer setup failure into a settled fallback", async () => {
    const completion = deferred<void>();
    const animation = fakeAnimation(completion.promise);
    const fixture = setupRunner({
      animation,
      setTimeout: (() => {
        throw new Error("timer unavailable");
      }) as unknown as typeof globalThis.setTimeout,
    });
    const previous = fixture.runner.visualState;

    const run = fixture.runner.start("runaway-rsvp", 1, { x: 1, y: 1 });

    expect(await run.finished).toEqual({ id: "runaway-rsvp", outcome: "fallback" });
    expect(fixture.visuals.commit).toHaveBeenCalledWith(previous);
    expect(animation.cancel).toHaveBeenCalledTimes(1);
    expectSettled(fixture.elements);
  });

  it("passes the exact effect context values and attempt to pose selection", async () => {
    const activation = { x: 144, y: 233 };
    const contextSpy = vi.fn((context: TrickEffectContext) => {
      expect(context.attempt).toBe(7);
      expect(context.activation).toBe(activation);
      expect(context.reducedMotion).toBe(true);
      expect(context.state).toBe(context.view ? fixture.runner.visualState : null);
      context.choosePose("runaway");
      return {
        message: "done",
        preview: context.preview({ swapped: true }),
        fallbackMs: Number.NaN,
        persistence: "commit-target" as const,
      };
    });
    let fixture!: ReturnType<typeof setupRunner>;
    fixture = setupRunner({ effect: contextSpy, reducedMotion: true, artifactCount: 0 });

    const run = fixture.runner.start("seat-swap", 7, activation);
    expect(await run.finished).toEqual({ id: "seat-swap", outcome: "completed" });
    expect(contextSpy).toHaveBeenCalledTimes(1);
    expect(fixture.visuals.choosePose).toHaveBeenCalledWith("runaway", 7);
    expectSettled(fixture.elements);
  });
});
