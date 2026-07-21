export function mountInvalidInvitation(root: HTMLElement): void {
  document.title = "Invitation link unavailable";
  root.innerHTML = `
    <section class="desk">
      <article class="letter" data-arrived="true">
        <span class="tape" aria-hidden="true"></span>
        <span class="eyebrow">invitation unavailable</span>
        <h1>This invitation link couldn't be opened.</h1>
        <p class="note">Please ask the sender for a new link.</p>
        <span class="wax-seal" aria-hidden="true">♥</span>
      </article>
    </section>`;
}
