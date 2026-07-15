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

  it("uses Telegram chat picker when no direct target exists", () => {
    const action = buildTelegramAction(parseInvitationConfig(""), invitationUrl);
    expect(action.label).toBe("SHARE ON TELEGRAM");
    const url = new URL(action.href);
    expect(url.origin + url.pathname).toBe("https://t.me/share/url");
    expect(url.searchParams.get("url")).toBe(invitationUrl);
  });

  it("uses custom draft exactly when supplied", () => {
    const config = parseInvitationConfig("?telegram=alex_date&tgText=Jamie+says+absolutely+yes");
    const url = new URL(buildTelegramAction(config, invitationUrl).href);
    expect(url.searchParams.get("text")).toBe("Jamie says absolutely yes");
  });

  it("adds only valid schedule and real location to the generated draft", () => {
    const config = parseInvitationConfig("?to=Jamie&date=2026-08-08&time=19%3A30&place=Botanic+Gardens");
    const url = new URL(buildTelegramAction(config, invitationUrl).href);
    expect(url.searchParams.get("text")).toContain("Saturday, August 8, 2026");
    expect(url.searchParams.get("text")).toContain("Botanic Gardens");
  });
});
