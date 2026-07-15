import { describe, expect, it } from "vitest";
import { TRICK_IDS } from "../domain/trick-deck";
import { TRICK_EFFECTS } from "./trick-effects";

describe("TRICK_EFFECTS", () => {
  it("implements every trick exactly once", () => {
    expect(Object.keys(TRICK_EFFECTS).sort()).toEqual([...TRICK_IDS].sort());
  });
});
