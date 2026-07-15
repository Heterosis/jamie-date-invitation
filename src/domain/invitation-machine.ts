export type InvitationState =
  | { readonly kind: "sealed" }
  | { readonly kind: "asking"; readonly attempts: number; readonly canRefuse: boolean }
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

export const initialInvitationState: InvitationState = Object.freeze({ kind: "sealed" });

export function transition(state: InvitationState, event: InvitationEvent): InvitationState {
  if (state.kind === "sealed" && event.type === "REVEAL") {
    return { kind: "asking", attempts: 0, canRefuse: false };
  }
  if (state.kind === "asking") {
    if (event.type === "YES") return { kind: "celebrating" };
    if (event.type === "NO_ATTEMPT" && state.attempts < 8) {
      const attempts = state.attempts + 1;
      return { kind: "asking", attempts, canRefuse: attempts === 8 };
    }
    if (event.type === "REAL_NO" && state.canRefuse) return { kind: "confirmingNo" };
  }
  if (state.kind === "confirmingNo") {
    if (event.type === "ACTUALLY_YES") return { kind: "celebrating" };
    if (event.type === "CONFIRM_NO") return { kind: "declined" };
  }
  return state;
}
