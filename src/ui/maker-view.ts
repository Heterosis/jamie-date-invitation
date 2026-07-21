import type { InvitationConfig } from "../domain/invitation-config";
import {
  buildMakerUrlState,
  normalizeMakerDefaults,
  type MakerUrlState,
  type MakerValues,
} from "../maker/maker-url";

type MakerField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const FALLBACK_IANA_TIME_ZONES = Object.freeze([
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
  "Pacific/Honolulu",
]);

function input(root: ParentNode, name: keyof MakerValues): MakerField {
  const element = root.querySelector<MakerField>(`[name="${name}"]`);
  if (!element) throw new Error(`Missing maker field: ${name}`);
  return element;
}

function timeZoneOptions(browserTimeZone: string, configTimeZone: string): string[] {
  const timeZones = new Set<string>(FALLBACK_IANA_TIME_ZONES);
  try {
    for (const timeZone of Intl.supportedValuesOf?.("timeZone") ?? []) timeZones.add(timeZone);
  } catch {
    // Keep the deterministic fallbacks when this API is absent or unavailable.
  }
  timeZones.add(browserTimeZone);
  timeZones.add(configTimeZone);
  return [...timeZones].filter(Boolean).sort();
}

function populateTimeZoneOptions(
  select: HTMLSelectElement,
  browserTimeZone: string,
  configTimeZone: string,
): void {
  const browserDefault = document.createElement("option");
  browserDefault.value = "";
  browserDefault.textContent = `Browser default (${browserTimeZone})`;
  select.append(browserDefault);

  for (const timeZone of timeZoneOptions(browserTimeZone, configTimeZone)) {
    const option = document.createElement("option");
    option.value = timeZone;
    option.textContent = timeZone;
    select.append(option);
  }
}

function readValues(root: ParentNode): MakerValues {
  return {
    to: input(root, "to").value,
    from: input(root, "from").value,
    date: input(root, "date").value,
    time: input(root, "time").value,
    tz: input(root, "tz").value,
    duration: input(root, "duration").value,
    place: input(root, "place").value,
    title: input(root, "title").value,
    note: input(root, "note").value,
    telegram: input(root, "telegram").value,
    notifyName: input(root, "notifyName").value,
    tgText: input(root, "tgText").value,
  };
}

export function mountMaker(root: HTMLElement, config: InvitationConfig): void {
  root.innerHTML = `
    <main class="maker">
      <header>
        <span>PRIVATE LETTERPRESS</span>
        <h1>Make a tiny invitation</h1>
        <p>Fill the details, preview the letter, then copy one self-contained URL.</p>
      </header>
      <div class="maker-grid">
        <form class="maker-form" data-maker-form novalidate>
          <label>To<input name="to" maxlength="40" /></label>
          <label>From<input name="from" maxlength="40" /></label>
          <label>Date<input name="date" type="date" required /></label>
          <label>Time<input name="time" type="time" required /></label>
          <label>IANA zone<select name="tz"></select></label>
          <label>Duration in minutes<input name="duration" type="number" min="15" max="720" step="1" /></label>
          <label class="wide">Place<input name="place" maxlength="100" /></label>
          <label class="wide">Calendar title<input name="title" maxlength="80" /></label>
          <label class="wide">Invitation note<textarea name="note" maxlength="240" rows="3"></textarea></label>
          <label>Telegram username<input name="telegram" maxlength="33" placeholder="without @" /></label>
          <label>Telegram display name<input name="notifyName" maxlength="40" /></label>
          <label class="wide">Custom Telegram draft<textarea name="tgText" maxlength="500" rows="3"></textarea></label>
          <p class="maker-status" role="status" data-maker-status></p>
          <label class="wide">Generated invitation URL<input name="generated" aria-label="Generated invitation URL" readonly /></label>
          <div class="maker-actions wide">
            <button type="button" data-copy disabled>Copy invitation link</button>
            <button type="button" data-share hidden>Share link</button>
            <button type="button" data-reset>Reset</button>
          </div>
        </form>
        <section class="preview-wrap">
          <span>LIVE PREVIEW</span>
          <iframe title="Invitation preview" data-preview></iframe>
        </section>
      </div>
    </main>`;

  const form = root.querySelector<HTMLFormElement>("[data-maker-form]")!;
  const status = root.querySelector<HTMLElement>("[data-maker-status]")!;
  const generated = root.querySelector<HTMLInputElement>('[name="generated"]')!;
  const preview = root.querySelector<HTMLIFrameElement>("[data-preview]")!;
  const copy = root.querySelector<HTMLButtonElement>("[data-copy]")!;
  const share = root.querySelector<HTMLButtonElement>("[data-share]")!;
  const reset = root.querySelector<HTMLButtonElement>("[data-reset]")!;
  let browserTimeZone = "Asia/Singapore";
  try {
    browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || browserTimeZone;
  } catch {
    // Keep the deterministic fallback when the browser cannot report a zone.
  }

  const timeZone = input(form, "tz") as HTMLSelectElement;
  populateTimeZoneOptions(timeZone, browserTimeZone, config.tz);

  input(form, "to").value = config.to;
  input(form, "from").value = config.from;
  input(form, "date").value = config.date ?? "";
  input(form, "time").value = config.time ?? "";
  timeZone.value = browserTimeZone;
  input(form, "duration").value = String(config.duration);
  input(form, "place").value = config.place;
  input(form, "title").value = new URLSearchParams(location.search).has("title") ? config.title : "";
  input(form, "note").value = config.note;
  input(form, "telegram").value = config.telegram ?? "";
  input(form, "notifyName").value = config.notifyName === "ME" ? "" : config.notifyName;
  input(form, "tgText").value = config.tgText ?? "";

  const refresh = (): MakerUrlState => {
    const values = normalizeMakerDefaults(readValues(form), browserTimeZone);
    const state = buildMakerUrlState(location.href, import.meta.env.BASE_URL, values);
    generated.value = state.shareUrl?.toString() ?? "";
    preview.src = state.previewUrl.toString();
    copy.disabled = state.shareUrl === null;
    share.disabled = state.shareUrl === null;
    status.textContent = state.errors.length ? state.errors.join(" ") : "Ready to send ♥";
    return state;
  };

  const materializeDefaults = (): MakerUrlState => {
    const rawValues = readValues(form);
    const normalized = normalizeMakerDefaults(rawValues, browserTimeZone);
    if (!rawValues.tz.trim()) input(form, "tz").value = normalized.tz;
    if (!rawValues.duration.trim()) input(form, "duration").value = normalized.duration;
    return refresh();
  };

  form.addEventListener("input", refresh);
  form.addEventListener("focusout", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if ((target.name === "tz" || target.name === "duration") && !target.value.trim()) {
      materializeDefaults();
    }
  });
  form.addEventListener("submit", (event) => event.preventDefault());
  copy.addEventListener("click", async () => {
    if (copy.disabled) return;
    const state = materializeDefaults();
    const shareUrl = state.shareUrl;
    if (!shareUrl) return;
    const shareUrlText = shareUrl.toString();
    let copied = false;
    try {
      await navigator.clipboard.writeText(shareUrlText);
      copied = true;
    } catch {
      generated.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
    }
    status.textContent = copied
      ? "Invitation link copied ♥"
      : "Copy failed — select the link and copy it manually.";
  });

  if (typeof navigator.share === "function") {
    share.hidden = false;
    share.addEventListener("click", async () => {
      if (share.disabled) return;
      const state = materializeDefaults();
      const shareUrl = state.shareUrl;
      if (!shareUrl) return;
      try {
        await navigator.share({ title: "A tiny invitation", url: shareUrl.toString() });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          status.textContent = "Sharing failed — copy the invitation link instead.";
        }
      }
    });
  }

  reset.addEventListener("click", () => {
    form.reset();
    input(form, "to").value = "Jamie";
    input(form, "tz").value = browserTimeZone;
    input(form, "duration").value = "120";
    refresh();
  });
  refresh();
}
