import { describe, expect, it } from "vitest";
import { parseInvitationConfig } from "../domain/invitation-config";
import {
  buildMakerUrl,
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
