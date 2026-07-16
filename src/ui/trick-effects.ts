import type { TrickId } from "../domain/trick-deck";

export interface TrickContext {
  readonly stage: HTMLElement;
  readonly letter: HTMLElement;
  readonly yesButton: HTMLButtonElement;
  readonly noButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly attempt: number;
}

type TrickEffect = (context: TrickContext) => void;

const temporaryLabelVersions = new WeakMap<HTMLButtonElement, object>();

function legacyLabelTarget(button: HTMLButtonElement): HTMLElement {
  return button.querySelector?.<HTMLElement>("[data-no-label]") ?? button;
}

function replay(element: HTMLElement, className: string, animationName: string): void {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  const removeCompletedAnimation = (event: AnimationEvent): void => {
    if (event.animationName !== animationName) return;
    element.classList.remove(className);
    element.removeEventListener("animationend", removeCompletedAnimation);
  };
  element.addEventListener("animationend", removeCompletedAnimation);
}

function temporaryLabel(button: HTMLButtonElement, label: string): void {
  const version = {};
  temporaryLabelVersions.set(button, version);
  legacyLabelTarget(button).textContent = label;
  window.setTimeout(() => {
    if (temporaryLabelVersions.get(button) !== version) return;
    temporaryLabelVersions.delete(button);
    if (button.dataset.locked !== "true") legacyLabelTarget(button).textContent = "NO, SORRY";
  }, 950);
}

export const TRICK_EFFECTS: Record<TrickId, TrickEffect> = {
  "runaway-rsvp": (context) => {
    context.noButton.style.setProperty("--run-x", `${context.attempt % 2 ? 92 : -92}px`);
    context.noButton.style.setProperty("--run-y", `${context.attempt % 3 ? -42 : 48}px`);
    replay(context.noButton, "trick-runaway", "runaway");
    context.status.textContent = "The NO button made a tiny escape.";
  },
  "growing-feelings": (context) => {
    context.yesButton.style.setProperty("--yes-scale", String(Math.min(1.08 + context.attempt * 0.055, 1.5)));
    context.noButton.style.setProperty("--no-scale", String(Math.max(0.96 - context.attempt * 0.035, 0.68)));
    context.stage.classList.add("trick-growing");
    context.status.textContent = "Funny — the feelings seem to be growing.";
  },
  "seat-swap": (context) => {
    context.stage.classList.toggle("trick-swapped");
    context.status.textContent = "The buttons swapped seats before accepting another click.";
  },
  "cupid-magnet": (context) => {
    replay(context.noButton, "trick-magnet", "magnet");
    context.status.textContent = "Cupid's magnet pulled NO toward YES.";
  },
  "paper-plane": (context) => {
    replay(context.noButton, "trick-plane", "paper-plane");
    context.status.textContent = "NO folded itself into a paper plane.";
  },
  "yes-garden": (context) => {
    context.stage.querySelectorAll(".yes-blossom").forEach((element) => element.remove());
    for (let index = 0; index < 8; index += 1) {
      const blossom = document.createElement("span");
      blossom.className = "yes-blossom";
      blossom.textContent = index % 2 ? "YES" : "✿";
      blossom.setAttribute("aria-hidden", "true");
      blossom.style.setProperty("--angle", `${index * 45}deg`);
      context.letter.append(blossom);
    }
    window.setTimeout(() => context.stage.querySelectorAll(".yes-blossom").forEach((element) => element.remove()), 1100);
    context.status.textContent = "A tiny garden of YES bloomed around the letter.";
  },
  "dramatic-excuse": (context) => {
    temporaryLabel(context.noButton, "BUT WHAT IF THERE'S DESSERT?");
    context.status.textContent = "NO would like to renegotiate over dessert.";
  },
  spotlight: (context) => {
    context.letter.style.setProperty(
      "--spotlight-x",
      `${context.yesButton.offsetLeft + context.yesButton.offsetWidth / 2}px`,
    );
    context.letter.style.setProperty(
      "--spotlight-y",
      `${context.yesButton.offsetTop + context.yesButton.offsetHeight / 2}px`,
    );
    replay(context.stage, "trick-spotlight", "spotlight");
    context.status.textContent = "A spotlight found the YES button.";
  },
  "tiny-disguise": (context) => {
    temporaryLabel(context.noButton, "🥸 DEFINITELY YES");
    replay(context.noButton, "trick-disguise", "disguise");
    context.status.textContent = "NO put on a very unconvincing disguise.";
  },
  "return-to-sender": (context) => {
    replay(context.noButton, "trick-returned", "returned");
    context.status.textContent = "NO was stamped RETURN TO SENDER.";
  },
};

export function applyTrick(id: TrickId, context: TrickContext): void {
  context.stage.dataset.lastTrick = id;
  TRICK_EFFECTS[id](context);
}
