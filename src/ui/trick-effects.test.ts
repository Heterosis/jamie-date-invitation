import { afterEach, describe, expect, it, vi } from "vitest";
import { TRICK_IDS } from "../domain/trick-deck";
import { TRICK_EFFECTS, type TrickContext } from "./trick-effects";

function fakeAnimatedButton(): HTMLButtonElement {
  const classes = new Set<string>();
  return Object.assign(new EventTarget(), {
    textContent: "NO, SORRY",
    dataset: {} as Record<string, string>,
    offsetWidth: 120,
    classList: {
      add: (...tokens: string[]) => tokens.forEach((token) => classes.add(token)),
      remove: (...tokens: string[]) => tokens.forEach((token) => classes.delete(token)),
      contains: (token: string) => classes.has(token),
    },
  }) as unknown as HTMLButtonElement;
}

function fakeContext(noButton: HTMLButtonElement): TrickContext {
  return {
    stage: {} as HTMLElement,
    letter: {} as HTMLElement,
    yesButton: {} as HTMLButtonElement,
    noButton,
    status: { textContent: "" } as HTMLElement,
    attempt: 1,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TRICK_EFFECTS", () => {
  it("implements every trick exactly once", () => {
    expect(Object.keys(TRICK_EFFECTS).sort()).toEqual([...TRICK_IDS].sort());
  });

  it("cleans up only the animation that actually ended", () => {
    const noButton = fakeAnimatedButton();
    const context = fakeContext(noButton);

    TRICK_EFFECTS["cupid-magnet"](context);
    TRICK_EFFECTS["paper-plane"](context);
    expect(noButton.classList.contains("trick-magnet")).toBe(true);
    expect(noButton.classList.contains("trick-plane")).toBe(true);

    noButton.dispatchEvent(Object.assign(new Event("animationend"), { animationName: "magnet" }));
    expect(noButton.classList.contains("trick-magnet")).toBe(false);
    expect(noButton.classList.contains("trick-plane")).toBe(true);

    noButton.dispatchEvent(Object.assign(new Event("animationend"), { animationName: "paper-plane" }));
    expect(noButton.classList.contains("trick-plane")).toBe(false);
  });

  it("lets only the newest temporary label restore the button", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    const noButton = fakeAnimatedButton();
    const context = fakeContext(noButton);

    TRICK_EFFECTS["dramatic-excuse"](context);
    vi.advanceTimersByTime(500);
    TRICK_EFFECTS["tiny-disguise"](context);
    vi.advanceTimersByTime(450);

    expect(noButton.textContent).toBe("🥸 DEFINITELY YES");
    vi.advanceTimersByTime(500);
    expect(noButton.textContent).toBe("NO, SORRY");
  });
});
