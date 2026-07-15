import { describe, expect, expectTypeOf, it } from "vitest";
import {
  initialInvitationState,
  transition,
  type InvitationEvent,
  type InvitationState,
} from "./invitation-machine";

const ALL_EVENTS = [
  { type: "REVEAL" },
  { type: "NO_ATTEMPT" },
  { type: "YES" },
  { type: "REAL_NO" },
  { type: "ACTUALLY_YES" },
  { type: "CONFIRM_NO" },
] as const satisfies readonly InvitationEvent[];

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

  it("cannot represent contradictory asking states", () => {
    expectTypeOf<{ kind: "asking"; attempts: 0; canRefuse: true }>().not.toMatchTypeOf<InvitationState>();
    expectTypeOf<{ kind: "asking"; attempts: 8; canRefuse: false }>().not.toMatchTypeOf<InvitationState>();
  });

  it("ignores REAL_NO from a forged early-refusal state", () => {
    const forged = { kind: "asking", attempts: 0, canRefuse: true } as unknown as InvitationState;
    expect(transition(forged, { type: "REAL_NO" })).toBe(forged);
  });

  it("saturates at the eighth NO attempt", () => {
    let state = transition(initialInvitationState, { type: "REVEAL" });
    for (let attempt = 0; attempt < 8; attempt += 1) state = transition(state, { type: "NO_ATTEMPT" });

    expect(transition(state, { type: "NO_ATTEMPT" })).toBe(state);
    expect(state).toEqual({ kind: "asking", attempts: 8, canRefuse: true });
  });

  it.each([{ kind: "celebrating" }, { kind: "declined" }] as const)(
    "$kind is absorbing for every event",
    (terminalState) => {
      for (const event of ALL_EVENTS) expect(transition(terminalState, event)).toBe(terminalState);
    },
  );

  it("freezes initial and every newly emitted state", () => {
    const asking = transition(initialInvitationState, { type: "REVEAL" });
    const advanced = transition(asking, { type: "NO_ATTEMPT" });
    const celebrating = transition(asking, { type: "YES" });
    let refusable = asking;
    for (let attempt = 0; attempt < 8; attempt += 1) refusable = transition(refusable, { type: "NO_ATTEMPT" });
    const confirmingNo = transition(refusable, { type: "REAL_NO" });
    const declined = transition(confirmingNo, { type: "CONFIRM_NO" });
    const actuallyYes = transition(confirmingNo, { type: "ACTUALLY_YES" });

    for (const state of [
      initialInvitationState,
      asking,
      advanced,
      celebrating,
      refusable,
      confirmingNo,
      declined,
      actuallyYes,
    ]) {
      expect(Object.isFrozen(state)).toBe(true);
    }
  });
});
