import { describe, expect, it } from "vitest";
import { parseInvitationConfig } from "../domain/invitation-config";
import { buildTelegramAction } from "./telegram";

const invitationUrl = "https://example.test/jamie/?to=Jamie";

describe("buildTelegramAction", () => {
  it("targets a public username and names the button", () => {
    const config = parseInvitationConfig("?to=Jamie&from=Alex&telegram=alex_date&notifyName=Alex");
    const action = buildTelegramAction(config, invitationUrl);
    expect(action.label).toBe("TELL ALEX ON TELEGRAM");
    const url = new URL(action.href);
    expect(url.origin + url.pathname).toBe("https://t.me/alex_date");
    expect(url.searchParams.get("text")).toContain("Jamie says YES! 💌");
  });

  it("uses ME when a direct target has no display name", () => {
    const config = parseInvitationConfig("?telegram=alex_date");
    expect(buildTelegramAction(config, invitationUrl).label).toBe("TELL ME ON TELEGRAM");
  });

  it("includes the invitation URL exactly once in a generated direct draft", () => {
    const config = parseInvitationConfig("?telegram=alex_date");
    const url = new URL(buildTelegramAction(config, invitationUrl).href);
    expect(url.searchParams.get("text")).toBe(`Jamie says YES! 💌 It's a date.\n${invitationUrl}`);
  });

  it("uses Telegram chat picker when no direct target exists", () => {
    const action = buildTelegramAction(parseInvitationConfig(""), invitationUrl);
    expect(action.label).toBe("SHARE ON TELEGRAM");
    const url = new URL(action.href);
    expect(url.origin + url.pathname).toBe("https://t.me/share/url");
    expect(url.searchParams.get("url")).toBe(invitationUrl);
  });

  it("does not duplicate the invitation URL in a generated generic draft", () => {
    const config = parseInvitationConfig("");
    const url = new URL(buildTelegramAction(config, invitationUrl).href);
    expect(url.searchParams.get("url")).toBe(invitationUrl);
    expect(url.searchParams.get("text")).toBe("Jamie says YES! 💌 It's a date.");
  });

  it.each([
    ["direct target", "?telegram=alex_date&tgText=Jamie+says+absolutely+yes"],
    ["generic share", "?tgText=Jamie+says+absolutely+yes"],
  ])("uses custom draft exactly for %s", (_kind, search) => {
    const config = parseInvitationConfig(search);
    const url = new URL(buildTelegramAction(config, invitationUrl).href);
    expect(url.searchParams.get("text")).toBe("Jamie says absolutely yes");
  });

  it("adds only valid schedule and real location to the generated draft", () => {
    const config = parseInvitationConfig("?to=Jamie&date=2026-08-08&time=19%3A30&place=Botanic+Gardens");
    const url = new URL(buildTelegramAction(config, invitationUrl).href);
    expect(url.searchParams.get("text")).toContain("Saturday, August 8, 2026");
    expect(url.searchParams.get("text")).toContain("Botanic Gardens");
  });

  it.each([
    ["DST gap", "2026-03-08", "02%3A30"],
    ["DST overlap", "2026-11-01", "01%3A30"],
  ])("omits schedule for an America/New_York %s", (_kind, date, time) => {
    const config = parseInvitationConfig(
      `?telegram=alex_date&to=Jamie&date=${date}&time=${time}&tz=America%2FNew_York`,
    );
    const url = new URL(buildTelegramAction(config, invitationUrl).href);
    expect(url.searchParams.get("text")).toBe(`Jamie says YES! 💌 It's a date.\n${invitationUrl}`);
  });

  it.each([
    ["date", "?telegram=alex_date&time=19%3A30"],
    ["time", "?telegram=alex_date&date=2026-08-08"],
  ])("omits schedule when %s is missing", (_missing, search) => {
    const config = parseInvitationConfig(search);
    const url = new URL(buildTelegramAction(config, invitationUrl).href);
    expect(url.searchParams.get("text")).toBe(`Jamie says YES! 💌 It's a date.\n${invitationUrl}`);
  });

  it.each([
    ["slash", "alex/date"],
    ["question mark", "alex?date"],
    ["backslash", "alex\\date"],
    ["URL-like value", "https://t.me/alex_date"],
  ])("rejects a Telegram username containing a %s", (_kind, telegram) => {
    const search = new URLSearchParams({ telegram });
    const config = parseInvitationConfig(`?${search.toString()}`);
    expect(config.telegram).toBeNull();

    const url = new URL(buildTelegramAction(config, invitationUrl).href);
    expect(url.origin + url.pathname).toBe("https://t.me/share/url");
  });
});
