import {
  decodeInvitationPayload,
  encodeInvitationPayload,
} from "./payload-codec";
import type { ShareableInvitationConfig } from "./payload-schema";

const PATH_RESOLUTION_ORIGIN = "https://short-route.invalid/";

function invalidInvitationHash(): never {
  throw new TypeError("Invalid invitation link fragment.");
}

function shortInvitationPath(basePath: string): string {
  const siteBase = new URL(basePath, PATH_RESOLUTION_ORIGIN);
  return new URL("s/", siteBase).pathname;
}

export function isShortInvitationPath(
  pathname: string,
  basePath = import.meta.env.BASE_URL,
): boolean {
  return pathname === shortInvitationPath(basePath);
}

export function buildShortInvitationUrl(
  currentHref: string,
  config: ShareableInvitationConfig,
  basePath = import.meta.env.BASE_URL,
): URL {
  const siteBase = new URL(basePath, currentHref);
  const url = new URL("s/", siteBase);
  url.hash = encodeInvitationPayload(config);
  return url;
}

export function decodeShortInvitationHash(
  hash: string,
): ShareableInvitationConfig {
  if (typeof hash !== "string" || !hash.startsWith("#") || hash.length === 1) {
    return invalidInvitationHash();
  }

  try {
    return decodeInvitationPayload(hash.slice(1));
  } catch {
    return invalidInvitationHash();
  }
}
