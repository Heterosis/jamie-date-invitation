import { Temporal } from "@js-temporal/polyfill";

export const DEFAULT_NOTE = "I've got a little plan, a lot of butterflies, and one very important question…";

export interface InvitationConfig {
  readonly to: string;
  readonly from: string;
  readonly date: string | null;
  readonly time: string | null;
  readonly tz: string;
  readonly duration: number;
  readonly place: string;
  readonly title: string;
  readonly note: string;
  readonly telegram: string | null;
  readonly notifyName: string;
  readonly tgText: string | null;
  readonly make: boolean;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const STRICT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STRICT_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TELEGRAM_USERNAME = /^[A-Za-z0-9_]{1,32}$/;
const REFERENCE_INSTANT = Temporal.Instant.from("2000-01-01T00:00:00Z");

function cleanText(value: string | null, limit: number): string {
  return (value ?? "")
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function validDate(value: string): boolean {
  if (!STRICT_DATE.test(value)) return false;
  try { Temporal.PlainDate.from(value); return true; } catch { return false; }
}

function validTime(value: string): boolean {
  if (!STRICT_TIME.test(value)) return false;
  try { Temporal.PlainTime.from(value); return true; } catch { return false; }
}

function validTimeZone(value: string): boolean {
  try { REFERENCE_INSTANT.toZonedDateTimeISO(value); return true; } catch { return false; }
}

function parseDuration(value: string | null): number {
  const duration = Number(value);
  return Number.isInteger(duration) && duration >= 15 && duration <= 720 ? duration : 120;
}

function parseTelegram(value: string | null): string | null {
  const username = cleanText(value, 33).replace(/^@/, "");
  return TELEGRAM_USERNAME.test(username) ? username : null;
}

export function parseInvitationConfig(search: string): InvitationConfig {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const to = cleanText(params.get("to"), 40) || "Jamie";
  const from = cleanText(params.get("from"), 40);
  const rawDate = cleanText(params.get("date"), 10);
  const rawTime = cleanText(params.get("time"), 5);
  const rawTimeZone = cleanText(params.get("tz"), 64);
  const place = cleanText(params.get("place"), 100);
  const title = cleanText(params.get("title"), 80) || (from ? `Date with ${from} 💌` : "A very special date 💌");
  const note = cleanText(params.get("note"), 240) || DEFAULT_NOTE;
  const telegram = parseTelegram(params.get("telegram"));
  const notifyName = cleanText(params.get("notifyName"), 40) || from || "ME";
  const tgText = cleanText(params.get("tgText"), 500) || null;

  return Object.freeze({
    to,
    from,
    date: validDate(rawDate) ? rawDate : null,
    time: validTime(rawTime) ? rawTime : null,
    tz: validTimeZone(rawTimeZone) ? rawTimeZone : "Asia/Singapore",
    duration: parseDuration(params.get("duration")),
    place,
    title,
    note,
    telegram,
    notifyName,
    tgText,
    make: params.get("make") === "1",
  });
}
