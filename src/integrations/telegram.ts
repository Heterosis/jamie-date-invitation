import type { InvitationConfig } from "../domain/invitation-config";
import { displayDate, displayTime } from "../domain/date-time";

export interface TelegramAction {
  readonly label: string;
  readonly href: string;
}

function generatedDraft(config: InvitationConfig, invitationUrl: string): string {
  const lines = [`${config.to} says YES! 💌 It's a date.`];
  if (config.date && config.time) lines.push(`${displayDate(config)} at ${displayTime(config)}`);
  if (config.place) lines.push(`📍 ${config.place}`);
  lines.push(invitationUrl);
  return lines.join("\n");
}

export function buildTelegramAction(config: InvitationConfig, invitationUrl: string): TelegramAction {
  const draft = config.tgText ?? generatedDraft(config, invitationUrl);
  if (config.telegram) {
    const url = new URL(`https://t.me/${config.telegram}`);
    url.searchParams.set("text", draft);
    return { label: `TELL ${config.notifyName.toLocaleUpperCase("en-US")} ON TELEGRAM`, href: url.toString() };
  }

  const url = new URL("https://t.me/share/url");
  url.searchParams.set("url", invitationUrl);
  url.searchParams.set("text", draft);
  return { label: "SHARE ON TELEGRAM", href: url.toString() };
}
