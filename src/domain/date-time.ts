import { Temporal } from "@js-temporal/polyfill";
import type { InvitationConfig } from "./invitation-config";

export type EventWindow =
  | { readonly ok: true; readonly start: Temporal.Instant; readonly end: Temporal.Instant }
  | { readonly ok: false; readonly error: "Date needs fixing" };

export function createEventWindow(config: InvitationConfig): EventWindow {
  if (!config.date || !config.time) return { ok: false, error: "Date needs fixing" };
  const [year, month, day] = config.date.split("-").map(Number);
  const [hour, minute] = config.time.split(":").map(Number);
  if ([year, month, day, hour, minute].some((part) => part === undefined)) {
    return { ok: false, error: "Date needs fixing" };
  }
  try {
    const start = Temporal.ZonedDateTime.from(
      { timeZone: config.tz, year: year!, month: month!, day: day!, hour: hour!, minute: minute! },
      { disambiguation: "reject", overflow: "reject" },
    );
    return { ok: true, start: start.toInstant(), end: start.add({ minutes: config.duration }).toInstant() };
  } catch {
    return { ok: false, error: "Date needs fixing" };
  }
}

export function formatGoogleInstant(instant: Temporal.Instant): string {
  return instant.toString({ smallestUnit: "second" }).replace(/[-:]/g, "");
}

export function displayDate(config: InvitationConfig): string {
  if (!config.date) return "Date to be decided";
  return Temporal.PlainDate.from(config.date).toLocaleString("en-US", { dateStyle: "full" });
}

export function displayTime(config: InvitationConfig): string {
  if (!config.time) return "Time to be decided";
  return Temporal.PlainTime.from(config.time).toLocaleString("en-US", { timeStyle: "short" });
}
