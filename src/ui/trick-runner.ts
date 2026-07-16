import type { TrickId } from "../domain/trick-deck";
import { createTrickVisualController } from "./trick-geometry";
import type {
  Point,
  SpatialIntent,
  TrickVisualController,
  VisualPreview,
} from "./trick-geometry";
import { INITIAL_TRICK_VISUAL_STATE } from "./trick-state";
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

interface ActiveRun {
  readonly token: number;
  readonly id: TrickId;
  previousState: Readonly<TrickVisualState>;
  targetState: Readonly<TrickVisualState>;
  persistence: "commit-target" | "transient";
  message: string;
  readonly animations: Animation[];
  readonly animationSet: Set<Animation>;
  readonly cancelledAnimations: Set<Animation>;
  readonly artifacts: HTMLElement[];
  readonly artifactSet: Set<HTMLElement>;
  readonly removedArtifacts: Set<HTMLElement>;
  deadline: ReturnType<typeof globalThis.setTimeout> | null;
  readonly resolve: (result: TrickRunResult) => void;
  readonly finished: Promise<TrickRunResult>;
  settled: boolean;
}

function defaultVisuals(view: InvitationView): TrickVisualController {
  return createTrickVisualController({
    stage: view.stage,
    letter: view.letter,
    actions: view.actions,
    yesSeat: view.yesSeat,
    noSeat: view.noSeat,
    yesMotion: view.yesMotion,
    noMotion: view.noMotion,
    yesButton: view.yesButton,
    noButton: view.noButton,
    yesFace: view.yesFace,
    noFace: view.noFace,
    noLabel: view.noLabel,
    noCostume: view.noCostume,
  });
}

function safe(action: () => void): void {
  try {
    action();
  } catch {
    // Lifecycle cleanup must finish even when one owned resource misbehaves.
  }
}

function fallbackDelay(value: number, reducedMotion: boolean): number {
  const finite = Number.isFinite(value) ? Math.max(0, value) : 0;
  return reducedMotion ? Math.min(finite, 50) : finite;
}

export function createTrickRunner(
  view: InvitationView,
  registry: TrickRegistry,
  options: TrickRunnerOptions = {},
): TrickRunner {
  view.stage.dataset.attempts = "0";
  view.stage.dataset.trickBusy = "false";
  view.stage.setAttribute("aria-busy", "false");

  const visuals = options.visuals ?? defaultVisuals(view);
  const readsReducedMotion = options.reducedMotion ?? (() => false);
  const schedulesTimeout = options.setTimeout ?? globalThis.setTimeout;
  const clearsTimeout = options.clearTimeout ?? globalThis.clearTimeout;
  const schedulesFrame = options.requestAnimationFrame
    ?? ((callback: FrameRequestCallback) => globalThis.requestAnimationFrame(callback));
  const cancelsFrame = options.cancelAnimationFrame
    ?? ((handle: number) => globalThis.cancelAnimationFrame(handle));
  const resizeTarget = typeof window === "undefined" ? null : window;

  let active: ActiveRun | null = null;
  let tokenSeed = 0;
  let queuedFrame: number | null = null;
  let disposed = false;

  function cancelAnimation(record: ActiveRun, animation: Animation): void {
    safe(() => {
      void animation.finished.catch(() => undefined);
    });
    if (record.cancelledAnimations.has(animation)) return;
    record.cancelledAnimations.add(animation);
    safe(() => animation.cancel());
  }

  function removeArtifact(record: ActiveRun, artifact: HTMLElement): void {
    if (record.removedArtifacts.has(artifact)) return;
    record.removedArtifacts.add(artifact);
    safe(() => artifact.remove());
  }

  function setIdle(): void {
    safe(() => {
      view.stage.dataset.trickBusy = "false";
    });
    safe(() => view.stage.setAttribute("aria-busy", "false"));
  }

  function restorePrevious(record: ActiveRun): void {
    try {
      visuals.commit(record.previousState);
    } catch {
      safe(() => visuals.stage(record.previousState));
    }
  }

  function settle(token: number, outcome: TrickRunOutcome): void {
    const record = active;
    if (!record || record.token !== token || record.settled) return;
    record.settled = true;
    let finalOutcome = outcome;

    try {
      if (outcome === "completed" || (
        outcome === "fallback" && record.persistence === "commit-target"
      )) {
        try {
          visuals.commit(record.targetState);
        } catch {
          finalOutcome = "fallback";
          restorePrevious(record);
        }
      } else if (outcome === "fallback") {
        try {
          visuals.stage(record.previousState);
        } catch {
          restorePrevious(record);
        }
      } else if (outcome === "cancelled") {
        restorePrevious(record);
      }

      if (record.deadline !== null) {
        const deadline = record.deadline;
        record.deadline = null;
        safe(() => clearsTimeout(deadline));
      }
      for (const animation of record.animations) cancelAnimation(record, animation);
      for (const artifact of record.artifacts) removeArtifact(record, artifact);

      setIdle();
      safe(() => {
        if (finalOutcome === "completed") view.status.textContent = record.message;
        if (finalOutcome === "fallback") {
          view.status.textContent = "The tiny trick landed safely.";
        }
        if (finalOutcome === "cancelled") {
          view.status.textContent = "The tiny trick stopped safely.";
        }
      });
    } finally {
      setIdle();
      record.resolve({ id: record.id, outcome: finalOutcome });
      if (active === record) active = null;
    }
  }

  function cleanupArtifacts(): void {
    const artifacts = new Set<HTMLElement>();
    for (const root of [view.stage, view.letter]) {
      safe(() => {
        root.querySelectorAll<HTMLElement>("[data-trick-artifact]")
          .forEach((artifact) => artifacts.add(artifact));
      });
    }
    artifacts.forEach((artifact) => safe(() => artifact.remove()));
  }

  function resetVisualAndMetadataState(): void {
    let firstTransitionError: unknown;
    let transitionFailed = false;
    try {
      visuals.setRefusalReady(false);
    } catch (error) {
      transitionFailed = true;
      firstTransitionError = error;
    }
    try {
      visuals.reset();
    } catch (error) {
      if (!transitionFailed) {
        transitionFailed = true;
        firstTransitionError = error;
      }
    }
    cleanupArtifacts();
    safe(() => delete view.stage.dataset.lastTrick);
    safe(() => {
      view.stage.dataset.attempts = "0";
    });
    safe(() => delete view.noButton.dataset.locked);
    setIdle();
    if (transitionFailed) throw firstTransitionError;
  }

  const queueRevalidation = (): void => {
    if (disposed || queuedFrame !== null) return;
    queuedFrame = -1;
    try {
      const handle = schedulesFrame(() => {
        queuedFrame = null;
        if (disposed) return;
        const token = active?.token;
        if (token !== undefined) settle(token, "fallback");
        visuals.revalidate();
      });
      if (queuedFrame !== null) queuedFrame = handle;
    } catch {
      queuedFrame = null;
    }
  };

  resizeTarget?.addEventListener("resize", queueRevalidation);
  resizeTarget?.addEventListener("orientationchange", queueRevalidation);

  const runner: TrickRunner = {
    get busy(): boolean {
      return active !== null && !active.settled;
    },

    get visualState(): Readonly<TrickVisualState> {
      return visuals.state;
    },

    start(id: TrickId, attempt: number, activation: Point): TrickRun {
      if (disposed) {
        throw new Error("Cannot start a trick after its runner has been disposed.");
      }
      if (active) {
        throw new Error(
          `Cannot start trick "${id}" while trick "${active.id}" is active.`,
        );
      }

      view.stage.dataset.lastTrick = id;
      view.stage.dataset.attempts = String(attempt);
      view.stage.dataset.trickBusy = "true";
      view.stage.setAttribute("aria-busy", "true");

      let capturedPrevious: Readonly<TrickVisualState> = INITIAL_TRICK_VISUAL_STATE;
      let stateReadFailed = false;
      try {
        capturedPrevious = visuals.state;
      } catch {
        stateReadFailed = true;
      }

      const token = ++tokenSeed;
      let resolve!: (result: TrickRunResult) => void;
      const finished = new Promise<TrickRunResult>((resolvePromise) => {
        resolve = resolvePromise;
      });
      const record: ActiveRun = {
        token,
        id,
        previousState: capturedPrevious,
        targetState: capturedPrevious,
        persistence: "commit-target",
        message: "The tiny trick landed safely.",
        animations: [],
        animationSet: new Set(),
        cancelledAnimations: new Set(),
        artifacts: [],
        artifactSet: new Set(),
        removedArtifacts: new Set(),
        deadline: null,
        resolve,
        finished,
        settled: false,
      };
      active = record;

      const run: TrickRun = {
        id,
        finished,
        cancel(): void {
          settle(token, "cancelled");
        },
      };

      try {
        if (stateReadFailed) throw new Error("Unable to capture the visual state.");
        const reducedMotion = Boolean(readsReducedMotion());
        const context: TrickEffectContext = {
          view,
          attempt,
          state: capturedPrevious,
          activation,
          reducedMotion,
          choosePose(intent: SpatialIntent) {
            return visuals.choosePose(intent, attempt);
          },
          preview(patch: TrickVisualPatch): VisualPreview {
            return visuals.preview(patch);
          },
          animate(
            element: Element,
            keyframes: Keyframe[] | PropertyIndexedKeyframes,
            animationOptions: KeyframeAnimationOptions,
          ): Animation {
            const normalizedOptions = reducedMotion
              ? { ...animationOptions, duration: 1 }
              : animationOptions;
            const animation = element.animate(keyframes, normalizedOptions);
            try {
              animation.pause();
            } finally {
              if (!record.animationSet.has(animation)) {
                record.animationSet.add(animation);
                record.animations.push(animation);
              }
            }
            return animation;
          },
          trackArtifact<ElementType extends HTMLElement>(element: ElementType): ElementType {
            if (!record.artifactSet.has(element)) {
              record.artifactSet.add(element);
              record.artifacts.push(element);
            }
            element.dataset.trickArtifact = "true";
            return element;
          },
        };

        const result = registry[id](context);
        record.previousState = result.preview.previous;
        record.targetState = result.preview.target;
        record.persistence = result.persistence;
        record.message = result.message;
        const deadlineMs = fallbackDelay(result.fallbackMs, reducedMotion);

        visuals.stage(record.targetState);
        for (const animation of record.animations) animation.play();

        if (record.animations.length === 0) {
          queueMicrotask(() => settle(token, "completed"));
        } else {
          const completions = record.animations.map((animation) => {
            try {
              return animation.finished;
            } catch (error) {
              return Promise.reject(error);
            }
          });
          void Promise.allSettled(completions).then((results) => {
            settle(
              token,
              results.some((result) => result.status === "rejected")
                ? "fallback"
                : "completed",
            );
          });
        }

        record.deadline = schedulesTimeout(() => settle(token, "fallback"), deadlineMs);
      } catch {
        record.previousState = capturedPrevious;
        record.targetState = capturedPrevious;
        record.persistence = "commit-target";
        settle(token, "fallback");
      }

      return run;
    },

    clearDisguise(): void {
      visuals.clearDisguise();
    },

    setRefusalReady(ready: boolean): void {
      visuals.setRefusalReady(ready);
    },

    revalidate(): void {
      visuals.revalidate();
    },

    reset(): void {
      const activeToken = active?.token;
      tokenSeed += 1;
      if (activeToken !== undefined) settle(activeToken, "cancelled");
      resetVisualAndMetadataState();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      safe(() => resizeTarget?.removeEventListener("resize", queueRevalidation));
      safe(() => {
        resizeTarget?.removeEventListener("orientationchange", queueRevalidation);
      });
      if (queuedFrame !== null) {
        safe(() => cancelsFrame(queuedFrame!));
        queuedFrame = null;
      }
      const activeToken = active?.token;
      tokenSeed += 1;
      if (activeToken !== undefined) settle(activeToken, "cancelled");
      resetVisualAndMetadataState();
    },
  };

  return runner;
}
