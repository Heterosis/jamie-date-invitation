import type { InvitationConfig } from "../domain/invitation-config";
import { initialInvitationState, transition, type InvitationState } from "../domain/invitation-machine";
import { createTrickDeck } from "../domain/trick-deck";
import { buildGoogleCalendarAction } from "../integrations/google-calendar";
import { buildTelegramAction } from "../integrations/telegram";
import { applyTrick } from "./trick-effects";
import type { InvitationView } from "./invitation-view";

export interface InvitationController { getState(): InvitationState; }

export function wireInvitation(view: InvitationView, config: InvitationConfig): InvitationController {
  const deck = createTrickDeck();
  let state = transition(initialInvitationState, { type: "REVEAL" });
  let lastPointerAttemptAt = Number.NEGATIVE_INFINITY;
  let guardUntil = 0;

  const cleanupResultTricks = (): void => {
    view.stage.classList.remove("trick-growing", "trick-swapped", "trick-spotlight");
    delete view.stage.dataset.lastTrick;
    view.stage.querySelectorAll(".yes-blossom").forEach((blossom) => blossom.remove());
  };

  const showSuccess = (): void => {
    cleanupResultTricks();
    view.askingPanel.hidden = true;
    view.declinedPanel.hidden = true;
    view.successPanel.hidden = false;
    view.letter.classList.add("is-celebrating");
    view.status.textContent = "It's a date! Calendar and Telegram actions are now available.";

    const calendar = buildGoogleCalendarAction(config);
    view.calendarLink.textContent = calendar.label;
    if (calendar.enabled) {
      view.calendarLink.href = calendar.href;
      view.calendarLink.removeAttribute("aria-disabled");
    } else {
      view.calendarLink.removeAttribute("href");
      view.calendarLink.setAttribute("aria-disabled", "true");
    }

    const telegram = buildTelegramAction(config, location.href);
    view.telegramLink.textContent = telegram.label;
    view.telegramLink.href = telegram.href;
    window.setTimeout(() => view.successPanel.querySelector<HTMLElement>("h2")?.focus(), 50);
  };

  const chooseYes = (): void => {
    state = state.kind === "confirmingNo"
      ? transition(state, { type: "ACTUALLY_YES" })
      : transition(state, { type: "YES" });
    if (state.kind !== "celebrating") return;
    if (view.dialog.open) view.dialog.close();
    showSuccess();
  };

  const attemptNo = (fromPointer = false): boolean => {
    if (state.kind === "confirmingNo") {
      if (fromPointer || view.dialog.open) return false;
      view.dialog.showModal();
      return true;
    }
    if (state.kind !== "asking") return false;
    if (state.canRefuse) {
      if (fromPointer) return false;
      state = transition(state, { type: "REAL_NO" });
      if (state.kind === "confirmingNo") view.dialog.showModal();
      return true;
    }
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

  const confirmNo = (): void => {
    state = transition(state, { type: "CONFIRM_NO" });
    if (state.kind !== "declined") return;
    cleanupResultTricks();
    view.dialog.close();
    view.askingPanel.hidden = true;
    view.successPanel.hidden = true;
    view.declinedPanel.hidden = false;
    view.letter.classList.add("is-declined");
    view.status.textContent = "The invitation was respectfully declined.";
    window.setTimeout(() => view.declinedPanel.querySelector<HTMLElement>("h2")?.focus(), 50);
  };

  view.stage.addEventListener("click", (event) => {
    if (performance.now() >= guardUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    guardUntil = 0;
    view.status.textContent = "The buttons moved — choose again so your answer is unmistakable.";
  }, true);
  view.yesButton.addEventListener("click", chooseYes);
  view.noButton.addEventListener("click", () => { attemptNo(false); });
  view.noButton.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse" && attemptNo(true)) guardUntil = performance.now() + 650;
  });
  view.actuallyYesButton.addEventListener("click", chooseYes);
  view.confirmNoButton.addEventListener("click", confirmNo);
  return { getState: () => state };
}
