import { describe, expect, it } from "vitest";
import { parseInvitationConfig } from "./invitation-config";
import { createEventWindow, displayDate, displayTime, formatGoogleInstant } from "./date-time";

describe("createEventWindow", () => {
  it("converts Singapore wall time to UTC and adds duration", () => {
    const config = parseInvitationConfig("?date=2026-08-08&time=19%3A30&tz=Asia%2FSingapore&duration=120");
    const result = createEventWindow(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatGoogleInstant(result.start)).toBe("20260808T113000Z");
    expect(formatGoogleInstant(result.end)).toBe("20260808T133000Z");
  });

  it("rejects a nonexistent DST wall time", () => {
    const config = parseInvitationConfig("?date=2026-03-08&time=02%3A30&tz=America%2FNew_York");
    expect(createEventWindow(config)).toEqual({ ok: false, error: "Date needs fixing" });
  });

  it("rejects an ambiguous DST wall time", () => {
    const config = parseInvitationConfig("?date=2026-11-01&time=01%3A30&tz=America%2FNew_York");
    expect(createEventWindow(config)).toEqual({ ok: false, error: "Date needs fixing" });
  });

  it("rejects a date with trailing components", () => {
    const config = parseInvitationConfig("?date=2026-08-08&time=19%3A30");
    expect(createEventWindow({ ...config, date: "2026-08-08-extra" })).toEqual({
      ok: false,
      error: "Date needs fixing",
    });
  });

  it("rejects a time with trailing components", () => {
    const config = parseInvitationConfig("?date=2026-08-08&time=19%3A30");
    expect(createEventWindow({ ...config, time: "19:30:garbage" })).toEqual({
      ok: false,
      error: "Date needs fixing",
    });
  });

  it("rejects an out-of-range duration", () => {
    const config = parseInvitationConfig("?date=2026-08-08&time=19%3A30");
    expect(createEventWindow({ ...config, duration: -30 })).toEqual({
      ok: false,
      error: "Date needs fixing",
    });
  });

  it("keeps the configured elapsed duration when crossing into daylight saving time", () => {
    const config = parseInvitationConfig(
      "?date=2026-03-08&time=01%3A30&tz=America%2FNew_York&duration=120",
    );
    const result = createEventWindow(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatGoogleInstant(result.start)).toBe("20260308T063000Z");
    expect(formatGoogleInstant(result.end)).toBe("20260308T083000Z");
    expect(result.end.epochMilliseconds - result.start.epochMilliseconds).toBe(120 * 60 * 1_000);
  });
});

describe("displayDate", () => {
  it("uses the approved fallback when the date is missing", () => {
    expect(displayDate(parseInvitationConfig(""))).toBe("Date to be decided");
  });

  it("formats a valid date in en-US", () => {
    expect(displayDate(parseInvitationConfig("?date=2026-08-08"))).toBe("Saturday, August 8, 2026");
  });
});

describe("displayTime", () => {
  it("uses the approved fallback when the time is missing", () => {
    expect(displayTime(parseInvitationConfig(""))).toBe("Time to be decided");
  });

  it("formats a valid time in en-US", () => {
    expect(displayTime(parseInvitationConfig("?time=19%3A30"))).toBe("7:30 PM");
  });
});
