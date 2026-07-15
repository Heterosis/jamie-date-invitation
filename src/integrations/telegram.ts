import type { InvitationConfig } from "../domain/invitation-config";
import { createEventWindow, displayDate, displayTime } from "../domain/date-time";

export interface TelegramAction {
  readonly label: string;
  readonly href: string;
}

function generatedDraft(config: InvitationConfig): string {
  const lines = [`${config.to} says YES! 💌 It's a date.`];
  if (createEventWindow(config).ok) lines.push(`${displayDate(config)} at ${displayTime(config)}`);
  if (config.place) lines.push(`📍 ${config.place}`);
  return lines.join("\n");
}

export function buildTelegramAction(config: InvitationConfig, invitationUrl: string): TelegramAction {
  const isGeneratedDraft = config.tgText === null;
  const draft = config.tgText ?? generatedDraft(config);
  if (config.telegram) {
    const url = new URL(`https://t.me/${config.telegram}`);
    url.searchParams.set("text", isGeneratedDraft ? `${draft}\n${invitationUrl}` : draft);
    return { label: `TELL ${config.notifyName.toLocaleUpperCase("en-US")} ON TELEGRAM`, href: url.toString() };
  }

  const url = new URL("https://t.me/share/url");
  url.searchParams.set("url", invitationUrl);
  url.searchParams.set("text", draft);
  return { label: "SHARE ON TELEGRAM", href: url.toString() };
}
