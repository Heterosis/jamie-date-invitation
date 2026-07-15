import { describe, expect, it } from "vitest";
import { DEFAULT_NOTE, parseInvitationConfig } from "./invitation-config";

describe("parseInvitationConfig", () => {
  it("applies every documented fallback", () => {
    expect(parseInvitationConfig("")).toEqual({
      to: "Jamie",
      from: "",
      date: null,
      time: null,
      tz: "Asia/Singapore",
      duration: 120,
      place: "",
      title: "A very special date 💌",
      note: DEFAULT_NOTE,
      telegram: null,
      notifyName: "ME",
      tgText: null,
      make: false,
    });
  });

  it("freezes the returned configuration at runtime", () => {
    const config = parseInvitationConfig("");

    expect(Object.isFrozen(config)).toBe(true);
  });

  it("parses normalized valid values", () => {
    const query = "?to=Jamie&from=Alex&date=2026-08-08&time=19%3A30&tz=Asia%2FSingapore&duration=90&place=Botanic+Gardens&title=Picnic&note=Bring+a+smile&telegram=%40alex_date&notifyName=Alex&tgText=Jamie+says+yes&make=1";
    expect(parseInvitationConfig(query)).toEqual({
      to: "Jamie",
      from: "Alex",
      date: "2026-08-08",
      time: "19:30",
      tz: "Asia/Singapore",
      duration: 90,
      place: "Botanic Gardens",
      title: "Picnic",
      note: "Bring a smile",
      telegram: "alex_date",
      notifyName: "Alex",
      tgText: "Jamie says yes",
      make: true,
    });
  });

  it("treats invalid factual fields as missing", () => {
    const config = parseInvitationConfig("?date=2026-02-30&time=25%3A99&tz=Mars%2FOlympus&duration=900&telegram=bad-name");
    expect(config.date).toBeNull();
    expect(config.time).toBeNull();
    expect(config.tz).toBe("Asia/Singapore");
    expect(config.duration).toBe(120);
    expect(config.telegram).toBeNull();
  });

  it("enforces the inclusive duration boundaries", () => {
    expect(parseInvitationConfig("?duration=14").duration).toBe(120);
    expect(parseInvitationConfig("?duration=15").duration).toBe(15);
    expect(parseInvitationConfig("?duration=720").duration).toBe(720);
    expect(parseInvitationConfig("?duration=721").duration).toBe(120);
  });

  it("removes control characters and enforces text limits", () => {
    const config = parseInvitationConfig(`?to=${encodeURIComponent("Ja\u0000mie")}&note=${"x".repeat(300)}`);
    expect(config.to).toBe("Ja mie");
    expect(config.note).toHaveLength(240);
  });

  it("derives title and notification name from from", () => {
    const config = parseInvitationConfig("?from=Alex&telegram=alex_date");
    expect(config.title).toBe("Date with Alex 💌");
    expect(config.notifyName).toBe("Alex");
  });
});
