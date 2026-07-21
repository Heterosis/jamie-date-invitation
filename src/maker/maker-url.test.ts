import { describe, expect, it } from "vitest";
import { parseInvitationConfig } from "../domain/invitation-config";
import { decodeShortInvitationHash } from "../short-url/short-url";
import {
  buildMakerUrl,
  buildMakerUrlState,
  normalizeMakerDefaults,
  validateMakerValues,
  type MakerValues,
} from "./maker-url";

const valid: MakerValues = {
  to: "Jamie",
  from: "Alex",
  date: "2026-08-08",
  time: "19:30",
  tz: "Asia/Singapore",
  duration: "120",
  place: "Botanic Gardens",
  title: "Picnic",
  note: "Bring a smile",
  telegram: "alex_date",
  notifyName: "Alex",
  tgText: "Jamie says YES!",
};

describe("maker URL", () => {
  it("builds one opaque short URL for a valid preview and share", () => {
    const state = buildMakerUrlState(
      "https://example.test/date/?make=1#maker",
      "/date/",
      valid,
    );

    expect(state.errors).toEqual([]);
    expect(state.shareUrl).not.toBeNull();
    expect(state.previewUrl.toString()).toBe(state.shareUrl?.toString());
    expect(state.previewUrl.origin).toBe("https://example.test");
    expect(state.previewUrl.pathname).toBe("/date/s/");
    expect(state.previewUrl.search).toBe("");
    expect(state.previewUrl.hash).toMatch(/^#[A-Za-z0-9_-]+$/);

    const publicUrl = state.previewUrl.toString();
    for (const privateText of [
      "make=",
      "to=",
      "from=",
      "date=",
      "telegram=",
      "Jamie",
      "Alex",
      "Botanic",
    ]) {
      expect(publicUrl).not.toContain(privateText);
    }
    expect(decodeShortInvitationHash(state.previewUrl.hash)).toEqual(
      parseInvitationConfig(buildMakerUrl("https://example.test/", valid).search),
    );
  });

  it("builds one editable query URL for a valid preview and share when selected", () => {
    const state = buildMakerUrlState(
      "https://example.test/date/index.html?make=1#maker",
      "/date/",
      valid,
      "query",
    );

    expect(state.errors).toEqual([]);
    expect(state.shareUrl).not.toBeNull();
    expect(state.previewUrl.toString()).toBe(state.shareUrl?.toString());
    expect(state.previewUrl.origin).toBe("https://example.test");
    expect(state.previewUrl.pathname).toBe("/date/");
    expect(state.previewUrl.hash).toBe("");
    expect(state.previewUrl.searchParams.has("make")).toBe(false);
    expect(parseInvitationConfig(state.previewUrl.search)).toEqual(
      parseInvitationConfig(buildMakerUrl("https://example.test/", valid).search),
    );
  });

  it("resolves a root deployment base without preserving maker query or hash", () => {
    const state = buildMakerUrlState(
      "https://example.test/?make=1#maker",
      "/",
      valid,
    );

    expect(state.previewUrl.pathname).toBe("/s/");
    expect(state.previewUrl.search).toBe("");
    expect(state.shareUrl?.toString()).toBe(state.previewUrl.toString());
  });

  it("keeps an invalid state private while its legacy preview reflects current values", () => {
    const state = buildMakerUrlState(
      "https://example.test/date/?make=1#maker",
      "/date/",
      { ...valid, from: " Current Alex ", date: "", time: "20:45" },
    );

    expect(state.errors).toEqual(["Choose a valid date."]);
    expect(state.shareUrl).toBeNull();
    expect(state.previewUrl.pathname).toBe("/date/");
    expect(state.previewUrl.hash).toBe("");
    expect(state.previewUrl.searchParams.has("make")).toBe(false);
    expect(state.previewUrl.searchParams.get("from")).toBe("Current Alex");
    expect(state.previewUrl.searchParams.get("date")).toBeNull();
    expect(state.previewUrl.searchParams.get("time")).toBe("20:45");
  });

  it("never exposes an invalid query URL as shareable", () => {
    const state = buildMakerUrlState(
      "https://example.test/date/?make=1#maker",
      "/date/",
      { ...valid, date: "" },
      "query",
    );

    expect(state.errors).toEqual(["Choose a valid date."]);
    expect(state.shareUrl).toBeNull();
    expect(state.previewUrl.pathname).toBe("/date/");
    expect(state.previewUrl.hash).toBe("");
    expect(state.previewUrl.searchParams.has("make")).toBe(false);
  });

  it.each([
    ["duration", { duration: "14" }, "Choose a whole duration from 15 to 720 minutes."],
    ["time zone", { tz: "Mars/Olympus" }, "Choose a valid IANA time zone."],
    [
      "DST gap",
      { date: "2026-03-08", time: "02:30", tz: "America/New_York" },
      "That local date and time is ambiguous or does not exist in this time zone.",
    ],
  ])("never exposes a share URL for an invalid %s", (_kind, overrides, message) => {
    const state = buildMakerUrlState(
      "https://example.test/?make=1#maker",
      "/",
      { ...valid, ...overrides },
    );

    expect(state.errors).toEqual([message]);
    expect(state.shareUrl).toBeNull();
    expect(state.previewUrl.pathname).toBe("/");
    expect(state.previewUrl.search).not.toBe("");
    expect(state.previewUrl.hash).toBe("");
  });

  it("normalizes blank schedule defaults before validation and short encoding", () => {
    const browserNormalized = normalizeMakerDefaults(
      { ...valid, tz: "", duration: "" },
      "America/New_York",
    );
    const state = buildMakerUrlState(
      "https://example.test/?make=1",
      "/",
      browserNormalized,
    );

    expect(state.errors).toEqual([]);
    expect(state.shareUrl).not.toBeNull();
    expect(decodeShortInvitationHash(state.previewUrl.hash)).toMatchObject({
      tz: "America/New_York",
      duration: 120,
    });
  });

  it("round-trips every field through the production parser", () => {
    const url = buildMakerUrl("https://example.test/date/?make=1", valid);
    expect(url.searchParams.has("make")).toBe(false);
    expect(parseInvitationConfig(url.search)).toMatchObject({
      to: "Jamie",
      from: "Alex",
      date: "2026-08-08",
      time: "19:30",
      tz: "Asia/Singapore",
      duration: 120,
      place: "Botanic Gardens",
      title: "Picnic",
      note: "Bring a smile",
      telegram: "alex_date",
      notifyName: "Alex",
      tgText: "Jamie says YES!",
    });
  });

  it("omits empty optional fields", () => {
    const url = buildMakerUrl("https://example.test/date/?make=1", {
      ...valid,
      place: "",
      telegram: "",
      tgText: "",
    });
    expect(url.searchParams.has("place")).toBe(false);
    expect(url.searchParams.has("telegram")).toBe(false);
    expect(url.searchParams.has("tgText")).toBe(false);
  });

  it("requires a valid date and time before sharing", () => {
    expect(validateMakerValues({ ...valid, date: "", time: "" })).toEqual([
      "Choose a valid date.",
      "Choose a valid time.",
    ]);
  });

  it("rejects DST gaps through the same event-window validator", () => {
    expect(validateMakerValues({
      ...valid,
      date: "2026-03-08",
      time: "02:30",
      tz: "America/New_York",
    })).toEqual([
      "That local date and time is ambiguous or does not exist in this time zone.",
    ]);
  });

  it("normalizes blank optional schedule fields to documented defaults", () => {
    expect(validateMakerValues({ ...valid, tz: "", duration: "" })).toEqual([]);

    const normalized = normalizeMakerDefaults({
      ...valid,
      tz: "",
      duration: "",
    });

    expect(normalized.tz).toBe("Asia/Singapore");
    expect(normalized.duration).toBe("120");
    expect(validateMakerValues(normalized)).toEqual([]);
    expect(parseInvitationConfig(buildMakerUrl("https://example.test/", normalized).search))
      .toMatchObject({ tz: "Asia/Singapore", duration: 120 });
  });

  it("uses the maker browser zone when optional schedule fields are blank", () => {
    const normalized = normalizeMakerDefaults({
      ...valid,
      tz: "",
      duration: "",
    }, "America/New_York");

    expect(normalized.tz).toBe("America/New_York");
    expect(normalized.duration).toBe("120");
  });

  it("validates DST gaps in the normalized maker browser zone", () => {
    const normalized = normalizeMakerDefaults({
      ...valid,
      date: "2026-03-08",
      time: "02:30",
      tz: "",
    }, "America/New_York");

    expect(validateMakerValues(normalized)).toEqual([
      "That local date and time is ambiguous or does not exist in this time zone.",
    ]);
  });

  it.each(["14", "721", "15.5"])(
    "rejects an explicit invalid duration of %j",
    (duration) => {
      expect(validateMakerValues({ ...valid, duration })).toEqual([
        "Choose a whole duration from 15 to 720 minutes.",
      ]);
    },
  );

  it("rejects an explicit invalid nonempty time zone", () => {
    expect(validateMakerValues({ ...valid, tz: "Mars/Olympus" })).toEqual([
      "Choose a valid IANA time zone.",
    ]);
  });

  it.each(["15", "720"])(
    "accepts the inclusive duration boundary %s",
    (duration) => {
      expect(validateMakerValues({ ...valid, duration })).toEqual([]);
      expect(parseInvitationConfig(buildMakerUrl("https://example.test/", {
        ...valid,
        duration,
      }).search).duration).toBe(Number(duration));
    },
  );

  it("validates the same trimmed date, time, and time zone that it writes", () => {
    const padded = {
      ...valid,
      date: " 2026-08-08 ",
      time: " 19:30 ",
      tz: " Asia/Singapore ",
    };

    expect(validateMakerValues(padded)).toEqual([]);
    const url = buildMakerUrl("https://example.test/?make=1#maker", padded);
    expect(url.searchParams.get("date")).toBe("2026-08-08");
    expect(url.searchParams.get("time")).toBe("19:30");
    expect(url.searchParams.get("tz")).toBe("Asia/Singapore");
    expect(url.hash).toBe("");
  });
});
