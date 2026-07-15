type EarlyAttempt = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

type AskingState =
  | { readonly kind: "asking"; readonly attempts: EarlyAttempt; readonly canRefuse: false }
  | { readonly kind: "asking"; readonly attempts: 8; readonly canRefuse: true };

export type InvitationState =
  | { readonly kind: "sealed" }
  | AskingState
  | { readonly kind: "celebrating" }
  | { readonly kind: "confirmingNo" }
  | { readonly kind: "declined" };

export type InvitationEvent =
  | { readonly type: "REVEAL" }
  | { readonly type: "NO_ATTEMPT" }
  | { readonly type: "YES" }
  | { readonly type: "REAL_NO" }
  | { readonly type: "ACTUALLY_YES" }
  | { readonly type: "CONFIRM_NO" };

const NEXT_ATTEMPT = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function freezeState<State extends InvitationState>(state: State): Readonly<State> {
  return Object.freeze(state);
}

export const initialInvitationState: InvitationState = freezeState({ kind: "sealed" });

export function transition(state: InvitationState, event: InvitationEvent): InvitationState {
  if (state.kind === "sealed" && event.type === "REVEAL") {
    return freezeState({ kind: "asking", attempts: 0, canRefuse: false });
  }
  if (state.kind === "asking") {
    if (event.type === "YES") return freezeState({ kind: "celebrating" });
    if (event.type === "NO_ATTEMPT" && state.canRefuse === false) {
      const attempts = NEXT_ATTEMPT[state.attempts];
      if (attempts === 8) return freezeState({ kind: "asking", attempts, canRefuse: true });
      return freezeState({ kind: "asking", attempts, canRefuse: false });
    }
    if (event.type === "REAL_NO" && state.attempts === 8 && state.canRefuse === true) {
      return freezeState({ kind: "confirmingNo" });
    }
  }
  if (state.kind === "confirmingNo") {
    if (event.type === "ACTUALLY_YES") return freezeState({ kind: "celebrating" });
    if (event.type === "CONFIRM_NO") return freezeState({ kind: "declined" });
  }
  return state;
}
