import type { InvitationConfig } from "../domain/invitation-config";
import { initialInvitationState, transition, type InvitationState } from "../domain/invitation-machine";
import { createTrickDeck } from "../domain/trick-deck";
import { applyTrick } from "./trick-effects";
import type { InvitationView } from "./invitation-view";

export interface InvitationController { getState(): InvitationState; }

export function wireInvitation(view: InvitationView, _config: InvitationConfig): InvitationController {
  const deck = createTrickDeck();
  let state = transition(initialInvitationState, { type: "REVEAL" });
  let lastPointerAttemptAt = Number.NEGATIVE_INFINITY;
  let guardUntil = 0;

  const attemptNo = (fromPointer = false): boolean => {
    if (state.kind !== "asking" || state.canRefuse) return false;
    if (fromPointer) {
      const now = performance.now();
      if (now - lastPointerAttemptAt < 350) return false;
      lastPointerAttemptAt = now;
    }
    const trick = deck.next();
    state = transition(state, { type: "NO_ATTEMPT" });
    if (state.kind !== "asking") return false;
    applyTrick(trick, {
      stage: view.stage,
      letter: view.letter,
      yesButton: view.yesButton,
      noButton: view.noButton,
      status: view.status,
      attempt: state.attempts,
    });
    if (state.canRefuse) {
      view.noButton.dataset.locked = "true";
      view.noButton.textContent = "Okay, I'll behave…";
      view.status.textContent = "A real refusal option is now available.";
    }
    return true;
  };

  view.stage.addEventListener("click", (event) => {
    if (performance.now() >= guardUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    guardUntil = 0;
    view.status.textContent = "The buttons moved — choose again so your answer is unmistakable.";
  }, true);
  view.noButton.addEventListener("click", () => { attemptNo(false); });
  view.noButton.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse" && attemptNo(true)) guardUntil = performance.now() + 650;
  });
  return { getState: () => state };
}
