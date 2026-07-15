import type { InvitationConfig } from "../domain/invitation-config";
import { createEventWindow, formatGoogleInstant } from "../domain/date-time";

export type CalendarAction =
  | { readonly enabled: true; readonly label: "+ GOOGLE CALENDAR"; readonly href: string }
  | { readonly enabled: false; readonly label: "DATE NEEDS FIXING"; readonly reason: "Date needs fixing" };

export function buildGoogleCalendarAction(config: InvitationConfig): CalendarAction {
  const event = createEventWindow(config);
  if (!event.ok) return { enabled: false, label: "DATE NEEDS FIXING", reason: event.error };

  const url = new URL("https://calendar.google.com/calendar/r/eventedit");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("dates", `${formatGoogleInstant(event.start)}/${formatGoogleInstant(event.end)}`);
  url.searchParams.set("stz", config.tz);
  url.searchParams.set("etz", config.tz);
  url.searchParams.set("text", config.title);
  url.searchParams.set("details", config.note);
  if (config.place) url.searchParams.set("location", config.place);
  return { enabled: true, label: "+ GOOGLE CALENDAR", href: url.toString() };
}
