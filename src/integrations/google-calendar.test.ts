import { describe, expect, it } from "vitest";
import { parseInvitationConfig } from "../domain/invitation-config";
import { buildGoogleCalendarAction } from "./google-calendar";

describe("buildGoogleCalendarAction", () => {
  it("builds the official event-edit URL", () => {
    const config = parseInvitationConfig("?from=Alex&date=2026-08-08&time=19%3A30&tz=Asia%2FSingapore&duration=120&place=Botanic+Gardens&note=Bring+a+smile");
    const action = buildGoogleCalendarAction(config);
    expect(action.enabled).toBe(true);
    if (!action.enabled) return;
    const url = new URL(action.href);
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/r/eventedit");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20260808T113000Z/20260808T133000Z");
    expect(url.searchParams.get("stz")).toBe("Asia/Singapore");
    expect(url.searchParams.get("etz")).toBe("Asia/Singapore");
    expect(url.searchParams.get("text")).toBe("Date with Alex 💌");
    expect(url.searchParams.get("details")).toBe("Bring a smile");
    expect(url.searchParams.get("location")).toBe("Botanic Gardens");
  });

  it("disables Calendar when date or time is missing", () => {
    expect(buildGoogleCalendarAction(parseInvitationConfig(""))).toEqual({
      enabled: false,
      label: "DATE NEEDS FIXING",
      reason: "Date needs fixing",
    });
  });

  it("omits invented fallback locations", () => {
    const action = buildGoogleCalendarAction(parseInvitationConfig("?date=2026-08-08&time=19%3A30"));
    expect(action.enabled).toBe(true);
    if (action.enabled) expect(new URL(action.href).searchParams.has("location")).toBe(false);
  });
});
