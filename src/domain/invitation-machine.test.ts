import { describe, expect, it } from "vitest";
import { initialInvitationState, transition } from "./invitation-machine";

describe("invitation state machine", () => {
  it("reveals the real refusal only after eight NO attempts", () => {
    let state = transition(initialInvitationState, { type: "REVEAL" });
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      state = transition(state, { type: "NO_ATTEMPT" });
      expect(state).toEqual({ kind: "asking", attempts: attempt, canRefuse: attempt === 8 });
    }
  });

  it("cannot enter refusal confirmation early", () => {
    const asking = transition(initialInvitationState, { type: "REVEAL" });
    expect(transition(asking, { type: "REAL_NO" })).toEqual(asking);
  });

  it("accepts a confirmed refusal without external side effects", () => {
    let state = transition(initialInvitationState, { type: "REVEAL" });
    for (let attempt = 0; attempt < 8; attempt += 1) state = transition(state, { type: "NO_ATTEMPT" });
    state = transition(state, { type: "REAL_NO" });
    expect(state).toEqual({ kind: "confirmingNo" });
    expect(transition(state, { type: "CONFIRM_NO" })).toEqual({ kind: "declined" });
  });

  it("celebrates only after explicit YES events", () => {
    const asking = transition(initialInvitationState, { type: "REVEAL" });
    expect(transition(asking, { type: "YES" })).toEqual({ kind: "celebrating" });
    expect(transition({ kind: "confirmingNo" }, { type: "ACTUALLY_YES" })).toEqual({ kind: "celebrating" });
    expect(transition(asking, { type: "NO_ATTEMPT" }).kind).toBe("asking");
  });
});
