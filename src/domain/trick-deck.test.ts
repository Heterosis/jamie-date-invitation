import { describe, expect, it, vi } from "vitest";
import { createTrickDeck, TRICK_IDS } from "./trick-deck";

describe("createTrickDeck", () => {
  it("contains exactly ten named tricks", () => {
    expect(TRICK_IDS).toHaveLength(10);
    expect(new Set(TRICK_IDS).size).toBe(10);
    expect(Object.isFrozen(TRICK_IDS)).toBe(true);
  });

  it("does not repeat before the bag is exhausted", () => {
    const deck = createTrickDeck(() => 0.37);
    const cycle = Array.from({ length: 10 }, () => deck.next());
    expect(new Set(cycle).size).toBe(10);
  });

  it("uses nine valid samples per refill and returns only named tricks", () => {
    const random = vi.fn(() => 0);
    const deck = createTrickDeck(random);
    const draws = Array.from({ length: 20 }, () => deck.next());
    const expectedCycle = [
      "growing-feelings",
      "seat-swap",
      "cupid-magnet",
      "paper-plane",
      "yes-garden",
      "dramatic-excuse",
      "spotlight",
      "tiny-disguise",
      "return-to-sender",
      "runaway-rsvp",
    ];

    expect(draws.slice(0, 10)).toEqual(expectedCycle);
    expect(draws.slice(10)).toEqual(expectedCycle);
    expect(random).toHaveBeenCalledTimes(18);
    for (const trick of draws) expect(TRICK_IDS).toContain(trick);
  });

  it.each([
    ["negative", -0.1],
    ["one", 1],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("rejects %s random samples", (_label, sample) => {
    expect(() => createTrickDeck(() => sample)).toThrow(RangeError);
  });
});
