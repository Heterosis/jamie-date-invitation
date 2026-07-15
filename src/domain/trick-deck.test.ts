import { describe, expect, it } from "vitest";
import { createTrickDeck, TRICK_IDS } from "./trick-deck";

describe("createTrickDeck", () => {
  it("contains exactly ten named tricks", () => {
    expect(TRICK_IDS).toHaveLength(10);
    expect(new Set(TRICK_IDS).size).toBe(10);
  });

  it("does not repeat before the bag is exhausted", () => {
    const deck = createTrickDeck(() => 0.37);
    const cycle = Array.from({ length: 10 }, () => deck.next());
    expect(new Set(cycle).size).toBe(10);
  });
});
