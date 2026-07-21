import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTE,
  parseInvitationConfig,
} from "../domain/invitation-config";
import { buildMakerUrl, type MakerValues } from "../maker/maker-url";
import {
  isShareableInvitationConfig,
  type ShareableInvitationConfig,
} from "./payload-schema";
import {
  buildShortInvitationUrl,
  decodeShortInvitationHash,
  isShortInvitationPath,
} from "./short-url";

function productionFixture(): ShareableInvitationConfig {
  const search = new URLSearchParams({
    to: "Jamie",
    from: "Alex",
    date: "2026-08-08",
    time: "19:30",
    tz: "Asia/Singapore",
    duration: "120",
    place: "Botanic Gardens",
    note: DEFAULT_NOTE,
    telegram: "alex_date",
    notifyName: "Alex",
  });
  const config = parseInvitationConfig(search.toString());
  if (!isShareableInvitationConfig(config)) {
    throw new Error("Production fixture must be shareable.");
  }
  return config;
}

const config = productionFixture();

function legacyMakerValues(
  invitation: ShareableInvitationConfig,
): MakerValues {
  return {
    to: invitation.to,
    from: invitation.from,
    date: invitation.date,
    time: invitation.time,
    tz: invitation.tz,
    duration: invitation.duration.toString(),
    place: invitation.place,
    title: invitation.title,
    note: invitation.note,
    telegram: invitation.telegram ?? "",
    notifyName: invitation.notifyName,
    tgText: invitation.tgText ?? "",
  };
}

describe("isShortInvitationPath", () => {
  it("recognizes only the exact root short-entry pathname", () => {
    expect(isShortInvitationPath("/s/", "/")).toBe(true);
    expect(isShortInvitationPath("/s")).toBe(false);
    expect(isShortInvitationPath("/s/foo", "/")).toBe(false);
    expect(isShortInvitationPath("/short/", "/")).toBe(false);
    expect(isShortInvitationPath("/ss/", "/")).toBe(false);
  });

  it.each([
    ["/jamie-date-invitation/", "/jamie-date-invitation/s/"],
    ["/date-night/", "/date-night/s/"],
  ])("recognizes the exact short entry under base %s", (basePath, pathname) => {
    expect(isShortInvitationPath(pathname, basePath)).toBe(true);
  });

  it.each([
    ["/jamie-date-invitation/s", "/jamie-date-invitation/"],
    ["/jamie-date-invitation/s/extra", "/jamie-date-invitation/"],
    ["/jamie-date-invitation/short/", "/jamie-date-invitation/"],
    ["/jamie-date-invitation-copy/s/", "/jamie-date-invitation/"],
    ["/nested/jamie-date-invitation/s/", "/jamie-date-invitation/"],
    ["/s/", "/jamie-date-invitation/"],
    ["/s/?make=1", "/"],
  ])("rejects near-miss pathname %s for base %s", (pathname, basePath) => {
    expect(isShortInvitationPath(pathname, basePath)).toBe(false);
  });

  it("uses only URL.pathname so query text cannot affect recognition", () => {
    const url = new URL("https://example.test/s/?make=1#old");

    expect(url.pathname).toBe("/s/");
    expect(isShortInvitationPath(url.pathname, "/")).toBe(true);
  });

  it("does not infer a repository base from the current pathname", () => {
    expect(isShortInvitationPath(
      "/renamed-repository/s/",
      "/jamie-date-invitation/",
    )).toBe(false);
  });
});

describe("buildShortInvitationUrl", () => {
  it.each([
    ["/", "/s/"],
    ["/jamie-date-invitation/", "/jamie-date-invitation/s/"],
    ["/date-night/", "/date-night/s/"],
  ])("builds the exact short-entry URL for base %s", (basePath, pathname) => {
    const url = buildShortInvitationUrl(
      "https://example.test/somewhere/maker?make=1&to=Jamie#old-fragment",
      config,
      basePath,
    );

    expect(url.pathname).toBe(pathname);
    expect(url.search).toBe("");
    expect(url.hash).toMatch(/^#[A-Za-z0-9_-]+$/);
    expect(url.href.match(/#/g)).toHaveLength(1);
    expect(decodeShortInvitationHash(url.hash)).toEqual(config);
  });

  it("uses the configured base instead of inferring one from currentHref", () => {
    const url = buildShortInvitationUrl(
      "https://example.test/old-repository/deep/maker?make=1#old",
      config,
      "/date-night/",
    );
    const cleanUrl = buildShortInvitationUrl(
      "https://example.test/",
      config,
      "/date-night/",
    );

    expect(url.pathname).toBe("/date-night/s/");
    expect(url.search).toBe("");
    expect(url.href).toBe(cleanUrl.href);
  });

  it("defaults to Vite's configured base path", () => {
    const url = buildShortInvitationUrl(
      "https://example.test/maker?make=1#old",
      config,
    );

    expect(url.pathname).toBe("/s/");
    expect(isShortInvitationPath(url.pathname)).toBe(true);
  });

  it("keeps the approved production URL opaque and within its length budget", () => {
    const currentHref = "https://heterosis.github.io/jamie-date-invitation/?make=1#old";
    const shortUrl = buildShortInvitationUrl(
      currentHref,
      config,
      "/jamie-date-invitation/",
    );
    const legacyUrl = buildMakerUrl(currentHref, legacyMakerValues(config));

    expect(shortUrl.pathname).toBe("/jamie-date-invitation/s/");
    expect(shortUrl.search).toBe("");
    expect(shortUrl.hash).toMatch(/^#[A-Za-z0-9_-]+$/);
    expect(decodeShortInvitationHash(shortUrl.hash)).toEqual(config);
    expect(shortUrl.href).not.toContain("Alex");
    expect(shortUrl.href).not.toContain("Botanic");
    expect(shortUrl.href.length).toBeLessThanOrEqual(140);
    expect(shortUrl.href.length).toBeLessThan(legacyUrl.href.length);
  });
});

describe("decodeShortInvitationHash", () => {
  it("decodes a real nonempty fragment semantically", () => {
    const url = buildShortInvitationUrl("https://example.test/", config, "/");

    expect(decodeShortInvitationHash(url.hash)).toEqual(config);
  });

  it.each([
    ["a token without a hash marker", "AQ"],
    ["an empty fragment", "#"],
    ["a malformed token", "#not+a+base64url+token"],
  ])("rejects %s", (_description, hash) => {
    expect(() => decodeShortInvitationHash(hash)).toThrow();
  });

  it("does not echo a rejected fragment in its error", () => {
    const privateHash = "#private-marker-4815162342?";
    let caughtError: unknown;

    try {
      decodeShortInvitationHash(privateHash);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    expect(String(caughtError)).not.toContain(privateHash);
    expect(String(caughtError)).not.toContain(privateHash.slice(1));
  });
});
