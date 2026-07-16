import { describe, expect, it } from "vitest";
import {
  applyTrickVisualPatch,
  INITIAL_TRICK_VISUAL_STATE,
  MAX_YES_SCALE,
  MIN_NO_FACE_SCALE,
} from "./trick-state";

describe("applyTrickVisualPatch", () => {
  it("replaces a previous pose instead of adding offsets", () => {
    const first = applyTrickVisualPatch(INITIAL_TRICK_VISUAL_STATE, {
      noPose: { centerX: 100, centerY: 220, rotation: -4 },
    });
    const second = applyTrickVisualPatch(first, {
      noPose: { centerX: 260, centerY: 340, rotation: 6 },
    });
    expect(second.noPose).toEqual({ centerX: 260, centerY: 340, rotation: 6 });
  });

  it("composes pose, scale, order, and disguise independently", () => {
    const pose = applyTrickVisualPatch(INITIAL_TRICK_VISUAL_STATE, {
      noPose: { centerX: 150, centerY: 300, rotation: 0 },
    });
    const composed = applyTrickVisualPatch(pose, {
      yesScale: 1.3,
      noScale: 0.8,
      swapped: true,
      disguised: true,
    });
    expect(composed).toEqual({
      noPose: { centerX: 150, centerY: 300, rotation: 0 },
      yesScale: 1.3,
      noScale: 0.8,
      swapped: true,
      disguised: true,
    });
  });

  it("clamps configured scale bounds and freezes emitted state", () => {
    const state = applyTrickVisualPatch(INITIAL_TRICK_VISUAL_STATE, {
      yesScale: 99,
      noScale: -1,
    });
    expect(state.yesScale).toBe(MAX_YES_SCALE);
    expect(state.noScale).toBe(MIN_NO_FACE_SCALE);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(INITIAL_TRICK_VISUAL_STATE)).toBe(true);
  });
});
