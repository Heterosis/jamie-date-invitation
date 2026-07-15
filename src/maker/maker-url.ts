import { createEventWindow } from "../domain/date-time";
import { parseInvitationConfig } from "../domain/invitation-config";

export interface MakerValues {
  readonly to: string;
  readonly from: string;
  readonly date: string;
  readonly time: string;
  readonly tz: string;
  readonly duration: string;
  readonly place: string;
  readonly title: string;
  readonly note: string;
  readonly telegram: string;
  readonly notifyName: string;
  readonly tgText: string;
}

const FIELD_NAMES = [
  "to",
  "from",
  "date",
  "time",
  "tz",
  "duration",
  "place",
  "title",
  "note",
  "telegram",
  "notifyName",
  "tgText",
] as const;

export function buildMakerUrl(base: string, values: MakerValues): URL {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  for (const field of FIELD_NAMES) {
    const value = values[field].trim();
    if (value) url.searchParams.set(field, value);
  }
  return url;
}

export function validateMakerValues(values: MakerValues): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) errors.push("Choose a valid date.");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(values.time)) errors.push("Choose a valid time.");
  if (errors.length) return errors;

  const url = buildMakerUrl("https://validation.invalid/", values);
  const config = parseInvitationConfig(url.search);
  if (config.date !== values.date) return ["Choose a valid date."];
  if (config.time !== values.time) return ["Choose a valid time."];
  if (config.tz !== values.tz) return ["Choose a valid IANA time zone."];
  if (!createEventWindow(config).ok) {
    return ["That local date and time is ambiguous or does not exist in this time zone."];
  }
  return [];
}
