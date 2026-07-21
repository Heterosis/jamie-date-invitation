import { createEventWindow } from "../domain/date-time";
import { parseInvitationConfig } from "../domain/invitation-config";
import { isShareableInvitationConfig } from "../short-url/payload-schema";
import { buildShortInvitationUrl } from "../short-url/short-url";

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

export interface MakerUrlState {
  readonly errors: readonly string[];
  readonly previewUrl: URL;
  readonly shareUrl: URL | null;
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

const DEFAULT_MAKER_TIME_ZONE = "Asia/Singapore";
const DEFAULT_MAKER_DURATION = "120";

export function normalizeMakerDefaults(
  values: MakerValues,
  browserTimeZone?: string,
): MakerValues {
  const fallbackTimeZone = browserTimeZone?.trim() || DEFAULT_MAKER_TIME_ZONE;
  return Object.freeze({
    ...values,
    tz: values.tz.trim() || fallbackTimeZone,
    duration: values.duration.trim() || DEFAULT_MAKER_DURATION,
  });
}

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

export function buildMakerUrlState(
  currentHref: string,
  basePath: string,
  values: MakerValues,
): MakerUrlState {
  const normalized = normalizeMakerDefaults(values);
  const legacyUrl = buildMakerUrl(currentHref, normalized);
  const errors = validateMakerValues(normalized);
  if (errors.length > 0) {
    return { errors, previewUrl: legacyUrl, shareUrl: null };
  }

  const config = parseInvitationConfig(legacyUrl.search);
  if (!isShareableInvitationConfig(config)) {
    throw new TypeError("Validated maker values were not shareable.");
  }

  const shortUrl = buildShortInvitationUrl(currentHref, config, basePath);
  return { errors, previewUrl: shortUrl, shareUrl: shortUrl };
}

export function validateMakerValues(values: MakerValues): string[] {
  const normalized = normalizeMakerDefaults(values);
  const date = normalized.date.trim();
  const time = normalized.time.trim();
  const timeZone = normalized.tz;
  const durationText = normalized.duration;
  const duration = Number(durationText);
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push("Choose a valid date.");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.push("Choose a valid time.");
  if (!durationText || !Number.isInteger(duration) || duration < 15 || duration > 720) {
    errors.push("Choose a whole duration from 15 to 720 minutes.");
  }
  if (errors.length) return errors;

  const url = buildMakerUrl("https://validation.invalid/", normalized);
  const config = parseInvitationConfig(url.search);
  if (config.date !== date) return ["Choose a valid date."];
  if (config.time !== time) return ["Choose a valid time."];
  if (config.tz !== timeZone) return ["Choose a valid IANA time zone."];
  if (!createEventWindow(config).ok) {
    return ["That local date and time is ambiguous or does not exist in this time zone."];
  }
  return [];
}
