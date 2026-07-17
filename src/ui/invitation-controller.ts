import type { InvitationConfig } from "../domain/invitation-config";
import { initialInvitationState, transition, type InvitationState } from "../domain/invitation-machine";
import { createTrickDeck, type TrickDeck } from "../domain/trick-deck";
import { buildGoogleCalendarAction } from "../integrations/google-calendar";
import { buildTelegramAction } from "../integrations/telegram";
import { TRICK_EFFECTS } from "./trick-effects";
import type { InvitationView } from "./invitation-view";
import { createTrickRunner, type TrickRunner } from "./trick-runner";

export interface InvitationDependencies {
  readonly deck?: TrickDeck;
  readonly runner?: TrickRunner;
}

export interface InvitationController {
  getState(): InvitationState;
  dispose(): void;
}

export function wireInvitation(
  view: InvitationView,
  config: InvitationConfig,
  dependencies: InvitationDependencies = {},
): InvitationController {
  const deck = dependencies.deck ?? createTrickDeck();
  const runner = dependencies.runner ?? createTrickRunner(view, TRICK_EFFECTS);
  let transactionToken = 0;
  let disposed = false;
  let state = transition(initialInvitationState, { type: "REVEAL" });

  const showSuccess = (): void => {
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

  const resetRunner = (): void => {
    try {
      runner.reset();
    } catch {
      // Reset completes its owned cancellation and cleanup before surfacing transition errors.
    }
  };

  const chooseYes = (): void => {
    if (disposed) return;
    transactionToken += 1;
    resetRunner();
    state = state.kind === "confirmingNo"
      ? transition(state, { type: "ACTUALLY_YES" })
      : transition(state, { type: "YES" });
    if (state.kind !== "celebrating") return;
    if (view.dialog.open) view.dialog.close();
    showSuccess();
  };

  const attemptNo = async (event: MouseEvent): Promise<void> => {
    if (disposed) return;
    if (state.kind === "confirmingNo") {
      if (!view.dialog.open) view.dialog.showModal();
      return;
    }
    if (state.kind !== "asking") return;

    if (runner.busy) {
      view.status.textContent = "One tiny trick at a time — let this one finish first.";
      return;
    }

    runner.clearDisguise();

    if (state.canRefuse) {
      state = transition(state, { type: "REAL_NO" });
      if (state.kind === "confirmingNo") view.dialog.showModal();
      return;
    }

    const trick = deck.next();
    state = transition(state, { type: "NO_ATTEMPT" });
    if (state.kind !== "asking") return;

    view.stage.dataset.attempts = String(state.attempts);
    const token = ++transactionToken;
    const buttonRect = view.noButton.getBoundingClientRect();
    const letterRect = view.letter.getBoundingClientRect();
    const activation = event.clientX || event.clientY
      ? { x: event.clientX - letterRect.left, y: event.clientY - letterRect.top }
      : {
          x: buttonRect.left + buttonRect.width / 2 - letterRect.left,
          y: buttonRect.top + buttonRect.height / 2 - letterRect.top,
        };

    const result = await runner.start(trick, state.attempts, activation).finished;
    if (
      disposed
      || token !== transactionToken
      || result.outcome === "cancelled"
      || state.kind !== "asking"
    ) return;

    if (state.canRefuse) {
      view.noButton.dataset.locked = "true";
      runner.setRefusalReady(true);
      view.status.textContent = "A real refusal option is now available.";
    }
  };

  const confirmNo = (): void => {
    if (disposed) return;
    transactionToken += 1;
    resetRunner();
    state = transition(state, { type: "CONFIRM_NO" });
    if (state.kind !== "declined") return;
    view.dialog.close();
    view.askingPanel.hidden = true;
    view.successPanel.hidden = true;
    view.declinedPanel.hidden = false;
    view.letter.classList.add("is-declined");
    view.status.textContent = "The invitation was respectfully declined.";
    window.setTimeout(() => view.declinedPanel.querySelector<HTMLElement>("h2")?.focus(), 50);
  };

  const noClick = (event: MouseEvent): void => {
    void attemptNo(event);
  };

  view.yesButton.addEventListener("click", chooseYes);
  view.noButton.addEventListener("click", noClick);
  view.actuallyYesButton.addEventListener("click", chooseYes);
  view.confirmNoButton.addEventListener("click", confirmNo);
  return {
    getState: () => state,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      transactionToken += 1;
      view.yesButton.removeEventListener("click", chooseYes);
      view.noButton.removeEventListener("click", noClick);
      view.actuallyYesButton.removeEventListener("click", chooseYes);
      view.confirmNoButton.removeEventListener("click", confirmNo);
      runner.dispose();
    },
  };
}
