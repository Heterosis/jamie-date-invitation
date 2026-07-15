import { describe, expect, it } from "vitest";
import { parseInvitationConfig } from "./invitation-config";
import { createEventWindow, formatGoogleInstant } from "./date-time";

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
});
