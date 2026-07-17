import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvitationConfig } from "../domain/invitation-config";
import type { TrickDeck, TrickId } from "../domain/trick-deck";
import { INITIAL_TRICK_VISUAL_STATE, type TrickVisualState } from "./trick-state";
import type {
  TrickRun,
  TrickRunOutcome,
  TrickRunResult,
  TrickRunner,
} from "./trick-runner";
import { wireInvitation, type InvitationController } from "./invitation-controller";
import type { InvitationView } from "./invitation-view";

const CONFIG: InvitationConfig = Object.freeze({
  to: "Jamie",
  from: "Alex",
  date: null,
  time: null,
  tz: "Asia/Singapore",
  duration: 120,
  place: "",
  title: "A date",
  note: "Would you join me?",
  telegram: null,
  notifyName: "Alex",
  tgText: null,
  make: false,
});

interface RectInit {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function domRect({ left, top, width, height }: RectInit): DOMRect {
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
  } as DOMRect;
}

class FakeClassList {
  private readonly values = new Set<string>();

  add(...tokens: string[]): void {
    tokens.forEach((token) => this.values.add(token));
  }

  remove(...tokens: string[]): void {
    tokens.forEach((token) => this.values.delete(token));
  }

  contains(token: string): boolean {
    return this.values.has(token);
  }
}

class FakeElement extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly classList = new FakeClassList();
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  readonly heading: FakeElement | null;
  href = "";
  disabled = false;
  focused = false;
  open = false;
  showModalCalls = 0;
  closeCalls = 0;
  private content = "";
  private isHidden = false;
  private rect: DOMRect;
  private readonly onHiddenChange?: (hidden: boolean) => void;
  private readonly onTextChange?: (text: string) => void;

  constructor(options: {
    readonly rect?: RectInit;
    readonly heading?: boolean;
    readonly hidden?: boolean;
    readonly onHiddenChange?: (hidden: boolean) => void;
    readonly onTextChange?: (text: string) => void;
  } = {}) {
    super();
    this.rect = domRect(options.rect ?? { left: 0, top: 0, width: 0, height: 0 });
    this.heading = options.heading === true ? new FakeElement() : null;
    this.isHidden = options.hidden ?? false;
    this.onHiddenChange = options.onHiddenChange;
    this.onTextChange = options.onTextChange;
  }

  get textContent(): string {
    return this.content;
  }

  set textContent(value: string | null) {
    this.content = value ?? "";
    this.onTextChange?.(this.content);
  }

  get hidden(): boolean {
    return this.isHidden;
  }

  set hidden(value: boolean) {
    this.isHidden = value;
    this.onHiddenChange?.(value);
  }

  setRect(value: RectInit): void {
    this.rect = domRect(value);
  }

  getBoundingClientRect(): DOMRect {
    return this.rect;
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

  querySelector<ElementType extends Element>(selector: string): ElementType | null {
    return (selector === "h2" ? this.heading : null) as unknown as ElementType | null;
  }

  querySelectorAll<ElementType extends Element>(): ElementType[] {
    return [];
  }

  focus(): void {
    this.focused = true;
  }

  showModal(): void {
    this.open = true;
    this.showModalCalls += 1;
  }

  close(): void {
    this.open = false;
    this.closeCalls += 1;
  }

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (callback) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(callback);
      this.listeners.set(type, listeners);
    }
    super.addEventListener(type, callback, options);
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (callback) this.listeners.get(type)?.delete(callback);
    super.removeEventListener(type, callback, options);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

interface FakeView extends InvitationView {
  readonly stage: FakeElement & HTMLElement;
  readonly letter: FakeElement & HTMLElement;
  readonly askingPanel: FakeElement & HTMLElement;
  readonly yesButton: FakeElement & HTMLButtonElement;
  readonly noButton: FakeElement & HTMLButtonElement;
  readonly noLabel: FakeElement & HTMLElement;
  readonly noCostume: FakeElement & HTMLElement;
  readonly successPanel: FakeElement & HTMLElement;
  readonly declinedPanel: FakeElement & HTMLElement;
  readonly dialog: FakeElement & HTMLDialogElement;
  readonly actuallyYesButton: FakeElement & HTMLButtonElement;
  readonly confirmNoButton: FakeElement & HTMLButtonElement;
  readonly status: FakeElement & HTMLElement;
}

function fakeView(callOrder: string[]): FakeView {
  const element = (): FakeElement => new FakeElement();
  const stage = element();
  const letter = new FakeElement({ rect: { left: 100, top: 50, width: 600, height: 600 } });
  const noButton = new FakeElement({ rect: { left: 300, top: 200, width: 80, height: 40 } });
  const noLabel = element();
  noLabel.textContent = "NO, SORRY";
  noButton.setAttribute("aria-label", "NO, SORRY");
  const successPanel = new FakeElement({
    heading: true,
    hidden: true,
    onHiddenChange: (hidden) => {
      if (!hidden) callOrder.push("success-visible");
    },
  });
  const declinedPanel = new FakeElement({
    heading: true,
    hidden: true,
    onHiddenChange: (hidden) => {
      if (!hidden) callOrder.push("declined-visible");
    },
  });
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
    noLabel,
    noCostume: element(),
    yesButton: element(),
    noButton,
    successPanel,
    calendarLink: element(),
    telegramLink: element(),
    declinedPanel,
    dialog: element(),
    actuallyYesButton: element(),
    confirmNoButton: element(),
    status: element(),
  };
  return view as unknown as FakeView;
}

interface PendingRun {
  readonly id: TrickId;
  readonly promise: Promise<TrickRunResult>;
  readonly resolve: (outcome?: TrickRunOutcome) => void;
  readonly cancel: TrickRun["cancel"];
  settled: boolean;
}

interface FakeRunner extends TrickRunner {
  readonly start: ReturnType<typeof vi.fn<TrickRunner["start"]>>;
  readonly clearDisguise: ReturnType<typeof vi.fn<TrickRunner["clearDisguise"]>>;
  readonly setRefusalReady: ReturnType<typeof vi.fn<TrickRunner["setRefusalReady"]>>;
  readonly reset: ReturnType<typeof vi.fn<TrickRunner["reset"]>>;
  readonly dispose: ReturnType<typeof vi.fn<TrickRunner["dispose"]>>;
}

interface ControllerFixture {
  readonly view: FakeView;
  readonly deck: TrickDeck & { readonly next: ReturnType<typeof vi.fn<TrickDeck["next"]>> };
  readonly runner: FakeRunner;
  readonly controller: InvitationController;
  readonly callOrder: string[];
  setRunnerBusy(value: boolean): void;
  deferNextRun(): void;
  resolveRun(index?: number, outcome?: TrickRunOutcome): void;
  setDisguised(value: boolean): void;
}

function setupController(options: {
  readonly ids?: readonly TrickId[];
  readonly clearDisguiseError?: Error;
  readonly setRefusalReadyFailures?: number;
  readonly resetFailures?: number;
} = {}): ControllerFixture {
  vi.stubGlobal("location", { href: "https://example.test/invitation" });
  vi.stubGlobal("window", {
    setTimeout(callback: () => void): number {
      callback();
      return 1;
    },
  });
  const callOrder: string[] = [];
  const view = fakeView(callOrder);
  const ids = options.ids ?? ["runaway-rsvp"];
  let deckIndex = 0;
  const deck = {
    next: vi.fn((): TrickId => {
      callOrder.push("deck");
      const id = ids[Math.min(deckIndex, ids.length - 1)] ?? "runaway-rsvp";
      deckIndex += 1;
      return id;
    }),
  };

  let busy = false;
  let manuallyBusy = false;
  let deferNext = false;
  let remainingRefusalReadyFailures = options.setRefusalReadyFailures ?? 0;
  let remainingResetFailures = options.resetFailures ?? 0;
  let visualState: Readonly<TrickVisualState> = INITIAL_TRICK_VISUAL_STATE;
  const runs: PendingRun[] = [];

  const resolvePending = (run: PendingRun, outcome: TrickRunOutcome = "completed"): void => {
    if (run.settled) return;
    run.settled = true;
    busy = false;
    run.resolve(outcome);
  };

  const start = vi.fn((id: TrickId, _attempt: number, _activation: { x: number; y: number }): TrickRun => {
    callOrder.push("start");
    busy = true;
    if (id === "tiny-disguise") {
      visualState = Object.freeze({ ...visualState, disguised: true });
      view.stage.setAttribute("data-disguised", "");
      view.noLabel.textContent = "DEFINITELY YES";
      view.noButton.setAttribute("aria-label", "NO option, wearing a DEFINITELY YES disguise");
    }
    let resolvePromise!: (result: TrickRunResult) => void;
    const promise = new Promise<TrickRunResult>((resolve) => {
      resolvePromise = resolve;
    });
    const pending: PendingRun = {
      id,
      promise,
      resolve: (outcome = "completed") => resolvePromise({ id, outcome }),
      cancel: vi.fn<TrickRun["cancel"]>(),
      settled: false,
    };
    runs.push(pending);
    if (!deferNext) queueMicrotask(() => resolvePending(pending));
    deferNext = false;
    return { id, finished: promise, cancel: pending.cancel };
  });

  const clearDisguise = vi.fn((): void => {
    callOrder.push("clear-disguise");
    if (options.clearDisguiseError) throw options.clearDisguiseError;
    visualState = Object.freeze({ ...visualState, disguised: false });
    view.stage.removeAttribute("data-disguised");
    view.noLabel.textContent = "NO, SORRY";
    view.noCostume.textContent = "";
    view.noButton.setAttribute("aria-label", "NO, SORRY");
  });
  const setRefusalReady = vi.fn((ready: boolean): void => {
    callOrder.push(`refusal-${ready}`);
    if (ready && remainingRefusalReadyFailures > 0) {
      remainingRefusalReadyFailures -= 1;
      throw new Error("refusal copy publication failed");
    }
    if (ready) {
      view.noLabel.textContent = "Okay, I'll behave…";
      view.noButton.setAttribute("aria-label", "NO refusal option: Okay, I'll behave…");
    } else {
      view.noLabel.textContent = visualState.disguised ? "DEFINITELY YES" : "NO, SORRY";
      view.noButton.setAttribute(
        "aria-label",
        visualState.disguised
          ? "NO option, wearing a DEFINITELY YES disguise"
          : "NO, SORRY",
      );
    }
  });
  const reset = vi.fn((): void => {
    callOrder.push("reset");
    busy = false;
    visualState = INITIAL_TRICK_VISUAL_STATE;
    view.stage.dataset.attempts = "0";
    delete view.noButton.dataset.locked;
    view.stage.removeAttribute("data-disguised");
    view.noLabel.textContent = "NO, SORRY";
    view.noCostume.textContent = "";
    view.noButton.setAttribute("aria-label", "NO, SORRY");
    if (remainingResetFailures > 0) {
      remainingResetFailures -= 1;
      throw new Error("visual reset fallback failed");
    }
  });
  const dispose = vi.fn((): void => {
    callOrder.push("dispose");
    busy = false;
    visualState = INITIAL_TRICK_VISUAL_STATE;
  });
  const runner = {
    get busy(): boolean {
      return manuallyBusy || busy;
    },
    get visualState(): Readonly<TrickVisualState> {
      return visualState;
    },
    start,
    clearDisguise,
    setRefusalReady,
    revalidate: vi.fn(),
    reset,
    dispose,
  } as FakeRunner;

  const controller = wireInvitation(view, CONFIG, { deck, runner });
  return {
    view,
    deck,
    runner,
    controller,
    callOrder,
    setRunnerBusy(value: boolean): void {
      manuallyBusy = value;
    },
    deferNextRun(): void {
      deferNext = true;
    },
    resolveRun(index = runs.length - 1, outcome: TrickRunOutcome = "completed"): void {
      const run = runs[index];
      if (!run) throw new Error(`Missing run ${index}`);
      resolvePending(run, outcome);
    },
    setDisguised(value: boolean): void {
      visualState = Object.freeze({ ...visualState, disguised: value });
      if (value) {
        view.stage.setAttribute("data-disguised", "");
        view.noLabel.textContent = "DEFINITELY YES";
        view.noButton.setAttribute("aria-label", "NO option, wearing a DEFINITELY YES disguise");
      }
    },
  };
}

function click(target: EventTarget, clientX = 0, clientY = 0): void {
  target.dispatchEvent(Object.assign(new Event("click"), { clientX, clientY }));
}

async function flushTransaction(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function completeAttempts(fixture: ControllerFixture, attempts = 8): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    click(fixture.view.noButton);
    await flushTransaction();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wireInvitation", () => {
  it("routes one ready native NO click through one deck and runner transaction", async () => {
    const fixture = setupController();

    click(fixture.view.noButton, 250, 175);
    await flushTransaction();

    expect(fixture.deck.next).toHaveBeenCalledTimes(1);
    expect(fixture.runner.start).toHaveBeenCalledTimes(1);
    expect(fixture.runner.start).toHaveBeenCalledWith("runaway-rsvp", 1, { x: 150, y: 125 });
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 1, canRefuse: false });
    expect(fixture.view.stage.dataset.attempts).toBe("1");
    expect(fixture.view.noButton.disabled).toBe(false);
  });

  it("skips empty disguise validation before one ready NO transaction", async () => {
    const fixture = setupController({
      clearDisguiseError: new Error("empty disguise validation must not run"),
    });

    click(fixture.view.noButton);
    await flushTransaction();

    expect(fixture.runner.visualState.disguised).toBe(false);
    expect(fixture.runner.clearDisguise).not.toHaveBeenCalled();
    expect(fixture.deck.next).toHaveBeenCalledTimes(1);
    expect(fixture.runner.start).toHaveBeenCalledTimes(1);
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 1, canRefuse: false });
  });

  it("mouse pointerenter is inert even when it fires twice", async () => {
    const fixture = setupController();
    const pointerEnter = (): Event => Object.assign(new Event("pointerenter"), { pointerType: "mouse" });

    fixture.view.noButton.dispatchEvent(pointerEnter());
    fixture.view.noButton.dispatchEvent(pointerEnter());
    await flushTransaction();

    expect(fixture.deck.next).not.toHaveBeenCalled();
    expect(fixture.runner.start).not.toHaveBeenCalled();
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 0, canRefuse: false });
  });

  it("busy NO clicks do not draw, count, cancel, queue, or clear disguise", async () => {
    const fixture = setupController();
    fixture.view.noButton.focus();
    fixture.setRunnerBusy(true);
    fixture.view.noButton.dispatchEvent(Object.assign(new Event("click"), { clientX: 0, clientY: 0 }));
    await Promise.resolve();

    expect(fixture.deck.next).not.toHaveBeenCalled();
    expect(fixture.runner.start).not.toHaveBeenCalled();
    expect(fixture.runner.clearDisguise).not.toHaveBeenCalled();
    expect(fixture.runner.reset).not.toHaveBeenCalled();
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 0, canRefuse: false });
    expect(fixture.view.noButton.disabled).toBe(false);
    expect(fixture.view.status.textContent).toContain("finish");
    expect(fixture.view.noButton.focused).toBe(true);
  });

  it("publishes the real refusal only after the deferred eighth run settles", async () => {
    const fixture = setupController();
    await completeAttempts(fixture, 7);
    fixture.deferNextRun();

    click(fixture.view.noButton);
    await Promise.resolve();

    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 8, canRefuse: true });
    expect(fixture.view.noLabel.textContent).toBe("NO, SORRY");
    expect(fixture.runner.setRefusalReady).not.toHaveBeenCalled();

    fixture.resolveRun();
    await flushTransaction();

    expect(fixture.runner.setRefusalReady).toHaveBeenCalledTimes(1);
    expect(fixture.runner.setRefusalReady).toHaveBeenCalledWith(true);
    expect(fixture.view.noLabel.textContent).toBe("Okay, I'll behave…");
    expect(fixture.view.noButton.getAttribute("aria-label")).toContain("refusal option");
    expect(fixture.view.status.textContent).toBe("A real refusal option is now available.");
  });

  it("retries failed refusal publication before accepting a later deliberate refusal", async () => {
    const fixture = setupController({ setRefusalReadyFailures: 1 });

    await completeAttempts(fixture);

    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 8, canRefuse: true });
    expect(fixture.runner.setRefusalReady).toHaveBeenCalledTimes(1);
    expect(fixture.view.noButton.dataset.locked).toBeUndefined();
    expect(fixture.view.dialog.open).toBe(false);
    expect(fixture.view.status.textContent).toBe(
      "The real refusal option needs another try. Please press NO again.",
    );

    click(fixture.view.noButton);
    await flushTransaction();

    expect(fixture.runner.setRefusalReady).toHaveBeenCalledTimes(2);
    expect(fixture.view.noButton.dataset.locked).toBe("true");
    expect(fixture.view.noLabel.textContent).toBe("Okay, I'll behave…");
    expect(fixture.view.dialog.open).toBe(false);
    expect(fixture.deck.next).toHaveBeenCalledTimes(8);
    expect(fixture.runner.start).toHaveBeenCalledTimes(8);
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 8, canRefuse: true });

    click(fixture.view.noButton);

    expect(fixture.view.dialog.open).toBe(true);
    expect(fixture.deck.next).toHaveBeenCalledTimes(8);
    expect(fixture.runner.start).toHaveBeenCalledTimes(8);
    expect(fixture.controller.getState()).toEqual({ kind: "confirmingNo" });
  });

  it("opens confirmation after eight settled runs without drawing or starting a ninth", async () => {
    const fixture = setupController();
    await completeAttempts(fixture);

    click(fixture.view.noButton);

    expect(fixture.view.dialog.open).toBe(true);
    expect(fixture.deck.next).toHaveBeenCalledTimes(8);
    expect(fixture.runner.start).toHaveBeenCalledTimes(8);
    expect(fixture.controller.getState()).toEqual({ kind: "confirmingNo" });
  });

  it("reopens a dismissed confirmation without drawing or counting", async () => {
    const fixture = setupController();
    await completeAttempts(fixture);
    click(fixture.view.noButton);
    fixture.view.dialog.close();

    click(fixture.view.noButton);

    expect(fixture.view.dialog.open).toBe(true);
    expect(fixture.view.dialog.showModalCalls).toBe(2);
    expect(fixture.deck.next).toHaveBeenCalledTimes(8);
    expect(fixture.runner.start).toHaveBeenCalledTimes(8);
    expect(fixture.controller.getState()).toEqual({ kind: "confirmingNo" });
  });

  it("clears an existing disguise before drawing and starting the same accepted click", async () => {
    const fixture = setupController();
    fixture.setDisguised(true);

    click(fixture.view.noButton);
    await flushTransaction();

    expect(fixture.callOrder.slice(0, 3)).toEqual(["clear-disguise", "deck", "start"]);
    expect(fixture.deck.next).toHaveBeenCalledTimes(1);
    expect(fixture.runner.start).toHaveBeenCalledTimes(1);
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 1, canRefuse: false });
  });

  it("recovers an active disguise clear failure without consuming the retry", async () => {
    const clearError = new Error("disguise render failed");
    const fixture = setupController({
      ids: ["tiny-disguise", "runaway-rsvp"],
      clearDisguiseError: clearError,
    });
    click(fixture.view.noButton);
    await flushTransaction();

    click(fixture.view.noButton);
    await flushTransaction();

    expect(fixture.runner.clearDisguise).toHaveBeenCalledTimes(1);
    expect(fixture.runner.reset).toHaveBeenCalledTimes(1);
    expect(fixture.runner.visualState).toBe(INITIAL_TRICK_VISUAL_STATE);
    expect(fixture.deck.next).toHaveBeenCalledTimes(1);
    expect(fixture.runner.start).toHaveBeenCalledTimes(1);
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 1, canRefuse: false });
    expect(fixture.view.stage.dataset.attempts).toBe("1");
    expect(fixture.view.status.textContent).toBe(
      "That tiny trick stumbled safely. Please try NO again.",
    );

    click(fixture.view.noButton);
    await flushTransaction();

    expect(fixture.deck.next).toHaveBeenCalledTimes(2);
    expect(fixture.runner.start).toHaveBeenCalledTimes(2);
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 2, canRefuse: false });
  });

  it("lets genuine refusal copy win when Tiny Disguise is the deferred eighth run", async () => {
    const ids: TrickId[] = [
      "runaway-rsvp",
      "growing-feelings",
      "seat-swap",
      "cupid-magnet",
      "paper-plane",
      "yes-garden",
      "dramatic-excuse",
      "tiny-disguise",
    ];
    const fixture = setupController({ ids });
    await completeAttempts(fixture, 7);
    fixture.deferNextRun();

    click(fixture.view.noButton);
    await Promise.resolve();
    expect(fixture.runner.visualState.disguised).toBe(true);
    expect(fixture.view.noLabel.textContent).toBe("DEFINITELY YES");

    fixture.resolveRun();
    await flushTransaction();

    expect(fixture.runner.visualState.disguised).toBe(true);
    expect(fixture.runner.setRefusalReady).toHaveBeenCalledTimes(1);
    expect(fixture.view.noLabel.textContent).toBe("Okay, I'll behave…");
    expect(fixture.view.noButton.getAttribute("aria-label")).toBe(
      "NO refusal option: Okay, I'll behave…",
    );

    click(fixture.view.noButton);

    expect(fixture.runner.clearDisguise).toHaveBeenCalledTimes(1);
    expect(fixture.runner.visualState.disguised).toBe(false);
    expect(fixture.view.noCostume.textContent).toBe("");
    expect(fixture.view.dialog.open).toBe(true);
    expect(fixture.deck.next).toHaveBeenCalledTimes(8);
    expect(fixture.runner.start).toHaveBeenCalledTimes(8);
    expect(fixture.controller.getState()).toEqual({ kind: "confirmingNo" });
  });

  it("resets before YES renders and ignores an old run that resolves later", async () => {
    const fixture = setupController();
    fixture.deferNextRun();
    click(fixture.view.noButton);
    await Promise.resolve();

    click(fixture.view.yesButton);
    const terminalStatus = fixture.view.status.textContent;
    expect(fixture.callOrder.indexOf("reset")).toBeLessThan(fixture.callOrder.indexOf("success-visible"));
    expect(fixture.runner.reset).toHaveBeenCalledTimes(1);
    expect(fixture.controller.getState()).toEqual({ kind: "celebrating" });
    expect(fixture.view.successPanel.hidden).toBe(false);
    expect(fixture.callOrder.filter((entry) => entry === "success-visible")).toHaveLength(1);

    fixture.resolveRun();
    await flushTransaction();

    expect(fixture.view.status.textContent).toBe(terminalStatus);
    expect(fixture.runner.setRefusalReady).not.toHaveBeenCalled();
    expect(fixture.callOrder.filter((entry) => entry === "success-visible")).toHaveLength(1);
  });

  it("aborts YES rendering when reset fails and lets a later choice retry", async () => {
    const fixture = setupController({ resetFailures: 1 });
    fixture.deferNextRun();
    click(fixture.view.noButton);
    await Promise.resolve();

    click(fixture.view.yesButton);

    expect(fixture.runner.reset).toHaveBeenCalledTimes(1);
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 1, canRefuse: false });
    expect(fixture.view.askingPanel.hidden).toBe(false);
    expect(fixture.view.successPanel.hidden).toBe(true);
    expect(fixture.view.status.textContent).toBe(
      "The invitation could not reset safely. Please try your choice again.",
    );

    fixture.resolveRun();
    await flushTransaction();
    expect(fixture.view.status.textContent).toBe(
      "The invitation could not reset safely. Please try your choice again.",
    );

    click(fixture.view.yesButton);

    expect(fixture.runner.reset).toHaveBeenCalledTimes(2);
    expect(fixture.controller.getState()).toEqual({ kind: "celebrating" });
    expect(fixture.view.successPanel.hidden).toBe(false);
  });

  it("invalidates published refusal before a failed terminal reset", async () => {
    const fixture = setupController({ resetFailures: 1 });
    await completeAttempts(fixture);
    expect(fixture.runner.setRefusalReady).toHaveBeenCalledTimes(1);
    expect(fixture.view.noButton.dataset.locked).toBe("true");

    click(fixture.view.yesButton);

    expect(fixture.runner.reset).toHaveBeenCalledTimes(1);
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 8, canRefuse: true });
    expect(fixture.view.successPanel.hidden).toBe(true);
    expect(fixture.view.noButton.dataset.locked).toBeUndefined();
    expect(fixture.view.noLabel.textContent).toBe("NO, SORRY");

    click(fixture.view.noButton);
    await flushTransaction();

    expect(fixture.runner.setRefusalReady).toHaveBeenCalledTimes(2);
    expect(fixture.view.noButton.dataset.locked).toBe("true");
    expect(fixture.view.noLabel.textContent).toBe("Okay, I'll behave…");
    expect(fixture.view.dialog.open).toBe(false);
    expect(fixture.deck.next).toHaveBeenCalledTimes(8);
    expect(fixture.runner.start).toHaveBeenCalledTimes(8);
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 8, canRefuse: true });

    click(fixture.view.noButton);

    expect(fixture.view.dialog.open).toBe(true);
    expect(fixture.runner.setRefusalReady).toHaveBeenCalledTimes(2);
    expect(fixture.deck.next).toHaveBeenCalledTimes(8);
    expect(fixture.runner.start).toHaveBeenCalledTimes(8);
    expect(fixture.controller.getState()).toEqual({ kind: "confirmingNo" });
  });

  it("dispose tears down every listener and makes late completion and future events inert", async () => {
    const fixture = setupController();
    fixture.deferNextRun();
    click(fixture.view.noButton);
    await Promise.resolve();
    const statusBeforeDispose = fixture.view.status.textContent;

    fixture.controller.dispose();
    fixture.controller.dispose();

    expect(fixture.runner.dispose).toHaveBeenCalledTimes(1);
    expect(fixture.runner.reset).not.toHaveBeenCalled();
    expect(fixture.view.letter.listenerCount("focusin")).toBe(0);
    expect(fixture.view.yesButton.listenerCount("click")).toBe(0);
    expect(fixture.view.noButton.listenerCount("click")).toBe(0);
    expect(fixture.view.actuallyYesButton.listenerCount("click")).toBe(0);
    expect(fixture.view.confirmNoButton.listenerCount("click")).toBe(0);

    fixture.resolveRun();
    click(fixture.view.noButton);
    click(fixture.view.yesButton);
    click(fixture.view.actuallyYesButton);
    click(fixture.view.confirmNoButton);
    await flushTransaction();

    expect(fixture.view.status.textContent).toBe(statusBeforeDispose);
    expect(fixture.deck.next).toHaveBeenCalledTimes(1);
    expect(fixture.runner.start).toHaveBeenCalledTimes(1);
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 1, canRefuse: false });
  });

  it("resets before confirmed decline renders and keeps external actions hidden", async () => {
    const fixture = setupController();
    await completeAttempts(fixture);
    click(fixture.view.noButton);

    click(fixture.view.confirmNoButton);

    expect(fixture.callOrder.indexOf("reset")).toBeLessThan(fixture.callOrder.indexOf("declined-visible"));
    expect(fixture.runner.reset).toHaveBeenCalledTimes(1);
    expect(fixture.controller.getState()).toEqual({ kind: "declined" });
    expect(fixture.view.askingPanel.hidden).toBe(true);
    expect(fixture.view.successPanel.hidden).toBe(true);
    expect(fixture.view.declinedPanel.hidden).toBe(false);
    expect(fixture.view.dialog.open).toBe(false);
  });

  it("keeps confirmation open when decline reset fails and lets confirmation retry", async () => {
    const fixture = setupController({ resetFailures: 1 });
    await completeAttempts(fixture);
    click(fixture.view.noButton);

    click(fixture.view.confirmNoButton);

    expect(fixture.runner.reset).toHaveBeenCalledTimes(1);
    expect(fixture.controller.getState()).toEqual({ kind: "confirmingNo" });
    expect(fixture.view.dialog.open).toBe(true);
    expect(fixture.view.askingPanel.hidden).toBe(false);
    expect(fixture.view.declinedPanel.hidden).toBe(true);
    expect(fixture.view.status.textContent).toBe(
      "The invitation could not reset safely. Please try your choice again.",
    );

    click(fixture.view.confirmNoButton);

    expect(fixture.runner.reset).toHaveBeenCalledTimes(2);
    expect(fixture.controller.getState()).toEqual({ kind: "declined" });
    expect(fixture.view.dialog.open).toBe(false);
    expect(fixture.view.declinedPanel.hidden).toBe(false);
  });

  it("converts pointer coordinates to letter-local activation exactly once", async () => {
    const fixture = setupController();

    click(fixture.view.noButton, 250, 175);
    await flushTransaction();

    expect(fixture.runner.start).toHaveBeenCalledWith("runaway-rsvp", 1, { x: 150, y: 125 });
  });

  it("uses the semantic NO center for keyboard and synthetic zero coordinates", async () => {
    const fixture = setupController();

    click(fixture.view.noButton, 0, 0);
    await flushTransaction();

    expect(fixture.runner.start).toHaveBeenCalledWith("runaway-rsvp", 1, { x: 240, y: 170 });
  });

  it("checks busy before disguise clearing and real-refusal confirmation during the eighth run", async () => {
    const fixture = setupController();
    await completeAttempts(fixture, 7);
    fixture.deferNextRun();
    click(fixture.view.noButton);
    await Promise.resolve();
    const clearsAfterEighthStart = fixture.runner.clearDisguise.mock.calls.length;

    click(fixture.view.noButton);

    expect(fixture.runner.clearDisguise).toHaveBeenCalledTimes(clearsAfterEighthStart);
    expect(fixture.deck.next).toHaveBeenCalledTimes(8);
    expect(fixture.runner.start).toHaveBeenCalledTimes(8);
    expect(fixture.view.dialog.open).toBe(false);
    expect(fixture.view.status.textContent).toContain("finish");
    expect(fixture.controller.getState()).toEqual({ kind: "asking", attempts: 8, canRefuse: true });

    fixture.resolveRun();
    await flushTransaction();
    expect(fixture.runner.setRefusalReady).toHaveBeenCalledTimes(1);
  });

  it("preserves reopened confirmation and the Actually Yes terminal path", async () => {
    const fixture = setupController();
    await completeAttempts(fixture);
    click(fixture.view.noButton);
    fixture.view.dialog.close();
    click(fixture.view.noButton);

    click(fixture.view.actuallyYesButton);

    expect(fixture.runner.reset).toHaveBeenCalledTimes(1);
    expect(fixture.controller.getState()).toEqual({ kind: "celebrating" });
    expect(fixture.view.dialog.open).toBe(false);
    expect(fixture.view.successPanel.hidden).toBe(false);
    expect(fixture.deck.next).toHaveBeenCalledTimes(8);
    expect(fixture.runner.start).toHaveBeenCalledTimes(8);
  });
});
