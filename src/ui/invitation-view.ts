import type { InvitationConfig } from "../domain/invitation-config";
import { displayDate, displayTime } from "../domain/date-time";

export interface InvitationView {
  readonly stage: HTMLElement;
  readonly letter: HTMLElement;
  readonly askingPanel: HTMLElement;
  readonly actions: HTMLElement;
  readonly yesSeat: HTMLElement;
  readonly noSeat: HTMLElement;
  readonly yesMotion: HTMLElement;
  readonly noMotion: HTMLElement;
  readonly yesFace: HTMLElement;
  readonly noFace: HTMLElement;
  readonly noLabel: HTMLElement;
  readonly noCostume: HTMLElement;
  readonly yesButton: HTMLButtonElement;
  readonly noButton: HTMLButtonElement;
  readonly successPanel: HTMLElement;
  readonly calendarLink: HTMLAnchorElement;
  readonly telegramLink: HTMLAnchorElement;
  readonly declinedPanel: HTMLElement;
  readonly dialog: HTMLDialogElement;
  readonly actuallyYesButton: HTMLButtonElement;
  readonly confirmNoButton: HTMLButtonElement;
  readonly status: HTMLElement;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing invitation element: ${selector}`);
  return element;
}

export function mountInvitation(root: HTMLElement, config: InvitationConfig): InvitationView {
  root.innerHTML = `
    <section class="desk" data-stage>
      <div class="snapshot" aria-hidden="true"><span>🌷</span><small>save the date</small></div>
      <div class="postage" aria-hidden="true"><b>♥</b><span>POSTED<br />WITH LOVE</span></div>
      <article class="letter" data-letter>
        <span class="tape" aria-hidden="true"></span>
        <span class="eyebrow">a tiny invitation, especially for you</span>
        <section data-asking>
          <h1 data-question></h1>
          <p class="note" data-note></p>
          <dl class="date-ticket">
            <div><dt>Date</dt><dd data-date></dd></div>
            <div><dt>Time</dt><dd data-time></dd></div>
            <div><dt>Place</dt><dd data-place></dd></div>
          </dl>
          <p class="signature" data-signature></p>
          <div class="actions" data-actions>
            <span class="choice-seat" data-yes-seat>
              <span class="choice-motion" data-yes-motion>
                <button class="button button--yes choice-button" type="button" data-yes aria-label="YES, I'D LOVE TO">
                  <span class="choice-face" data-yes-face>YES, I'D LOVE TO</span>
                </button>
              </span>
            </span>
            <span class="choice-seat" data-no-seat>
              <span class="choice-motion" data-no-motion>
                <button class="button button--no choice-button" type="button" data-no aria-label="NO, SORRY">
                  <span class="choice-face" data-no-face>
                    <span class="choice-costume" data-no-costume aria-hidden="true"></span>
                    <span data-no-label>NO, SORRY</span>
                  </span>
                </button>
              </span>
            </span>
          </div>
        </section>
        <section class="result result--yes" data-success hidden>
          <div class="bouquet" aria-hidden="true">🌸 ♥ 🌷</div>
          <h2 tabindex="-1">It's a date!</h2>
          <p>I'll be counting down the days.</p>
          <div class="result-actions">
            <a class="button button--yes" data-calendar target="_blank" rel="noopener noreferrer"></a>
            <a class="button button--telegram" data-telegram target="_blank" rel="noopener noreferrer"></a>
          </div>
        </section>
        <section class="result result--declined" data-declined hidden>
          <h2 tabindex="-1">No worries ♥</h2>
          <p>Thank you for being honest. This little note will behave now.</p>
        </section>
        <span class="wax-seal" aria-hidden="true">♥</span>
      </article>
      <p class="doodle doodle--left" aria-hidden="true">psst… choose yes ↗</p>
      <p class="doodle doodle--right" aria-hidden="true">made with butterflies ✶</p>
    </section>
    <p class="sr-only" role="status" aria-live="polite" data-status></p>
    <dialog class="no-dialog" data-no-dialog aria-labelledby="no-dialog-title">
      <form method="dialog">
        <span aria-hidden="true">🎭</span>
        <h2 id="no-dialog-title">One last dramatic question…</h2>
        <p>Cupid has requested a final confirmation.</p>
        <button class="button button--yes" value="yes" type="button" data-actually-yes>Actually, yes</button>
        <button class="button button--no" value="no" type="button" data-confirm-no>Yes, I really mean no</button>
      </form>
    </dialog>`;

  required<HTMLElement>(root, "[data-question]").textContent = `${config.to}, will you go on a date with me?`;
  required<HTMLElement>(root, "[data-note]").textContent = config.note;
  required<HTMLElement>(root, "[data-date]").textContent = displayDate(config);
  required<HTMLElement>(root, "[data-time]").textContent = displayTime(config);
  required<HTMLElement>(root, "[data-place]").textContent = config.place || "A little surprise ✦";
  required<HTMLElement>(root, "[data-signature]").textContent = `from ${config.from || "someone with butterflies"}`;

  return {
    stage: required(root, "[data-stage]"),
    letter: required(root, "[data-letter]"),
    askingPanel: required(root, "[data-asking]"),
    actions: required(root, "[data-actions]"),
    yesSeat: required(root, "[data-yes-seat]"),
    noSeat: required(root, "[data-no-seat]"),
    yesMotion: required(root, "[data-yes-motion]"),
    noMotion: required(root, "[data-no-motion]"),
    yesFace: required(root, "[data-yes-face]"),
    noFace: required(root, "[data-no-face]"),
    noLabel: required(root, "[data-no-label]"),
    noCostume: required(root, "[data-no-costume]"),
    yesButton: required(root, "[data-yes]"),
    noButton: required(root, "[data-no]"),
    successPanel: required(root, "[data-success]"),
    calendarLink: required(root, "[data-calendar]"),
    telegramLink: required(root, "[data-telegram]"),
    declinedPanel: required(root, "[data-declined]"),
    dialog: required(root, "[data-no-dialog]"),
    actuallyYesButton: required(root, "[data-actually-yes]"),
    confirmNoButton: required(root, "[data-confirm-no]"),
    status: required(root, "[data-status]"),
  };
}
