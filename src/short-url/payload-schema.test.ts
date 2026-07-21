import { describe, expect, it } from "vitest";
import { DEFAULT_NOTE, parseInvitationConfig } from "../domain/invitation-config";
import {
  invitationConfigToTuple,
  isShareableInvitationConfig,
  tupleToInvitationConfig,
  type CompactInvitationTuple,
  type ShareableInvitationConfig,
} from "./payload-schema";

function shareableConfig(search: string): ShareableInvitationConfig {
  const config = parseInvitationConfig(search);
  if (!isShareableInvitationConfig(config)) {
    throw new Error("Test fixture must be a shareable invitation.");
  }
  return config;
}

function shareableConfigFromParams(
  values: Readonly<Record<string, string>>,
): ShareableInvitationConfig {
  const params = new URLSearchParams(values);
  return shareableConfig(params.toString());
}

describe("isShareableInvitationConfig", () => {
  it("requires a date, time, and non-maker configuration", () => {
    expect(isShareableInvitationConfig(parseInvitationConfig("?date=2026-08-08&time=19%3A30"))).toBe(true);
    expect(isShareableInvitationConfig(parseInvitationConfig("?time=19%3A30"))).toBe(false);
    expect(isShareableInvitationConfig(parseInvitationConfig("?date=2026-08-08"))).toBe(false);
    expect(isShareableInvitationConfig(parseInvitationConfig("?date=2026-08-08&time=19%3A30&make=1"))).toBe(false);
  });
});

describe("compact invitation tuple", () => {
  it("packs the approved reference fixture exactly", () => {
    const config = shareableConfig(
      "?from=Alex&date=2026-08-08&time=19%3A30&place=Botanic+Gardens&telegram=alex_date",
    );

    const expected: CompactInvitationTuple = [
      590,
      "Alex",
      20260808,
      1170,
      "Botanic Gardens",
      "alex_date",
    ];

    expect(invitationConfigToTuple(config)).toEqual(expected);
  });

  it("packs all explicit fields in ascending bit order and round-trips them", () => {
    const config = shareableConfigFromParams({
      to: "Jordan",
      from: "Alex",
      date: "2026-08-08",
      time: "19:30",
      tz: "America/New_York",
      duration: "90",
      place: "Botanic Gardens",
      title: "Sunset picnic",
      note: "Bring a smile",
      telegram: "alex_date",
      notifyName: "Bestie",
      tgText: "We have a date!",
    });

    const tuple = invitationConfigToTuple(config);

    expect(tuple).toEqual([
      4095,
      "Jordan",
      "Alex",
      20260808,
      1170,
      "America/New_York",
      90,
      "Botanic Gardens",
      "Sunset picnic",
      "Bring a smile",
      "alex_date",
      "Bestie",
      "We have a date!",
    ]);
    expect(tupleToInvitationConfig(tuple)).toEqual(config);
  });

  it("omits parser defaults, derivations, and empty optional fields", () => {
    const config = shareableConfig("?date=2026-08-08&time=19%3A30");

    expect(config).toMatchObject({
      to: "Jamie",
      from: "",
      tz: "Asia/Singapore",
      duration: 120,
      place: "",
      title: "A very special date 💌",
      note: DEFAULT_NOTE,
      telegram: null,
      notifyName: "ME",
      tgText: null,
    });
    expect(invitationConfigToTuple(config)).toEqual([12, 20260808, 1170]);
    expect(tupleToInvitationConfig([12, 20260808, 1170])).toEqual(config);
  });

  it("round-trips Unicode and emoji through the production parser", () => {
    const config = shareableConfigFromParams({
      to: "嘉敏 💌",
      from: "陳小明 🌸",
      date: "2026-12-31",
      time: "23:59",
      place: "植物園 🌿",
      note: "一起看煙火 🎆",
      tgText: "答應我吧 🥰",
    });

    expect(tupleToInvitationConfig(invitationConfigToTuple(config))).toEqual(config);
  });

  it("left-pads compact dates and times when reconstructing parser input", () => {
    const config = shareableConfig("?date=0001-01-01&time=00%3A00");

    expect(invitationConfigToTuple(config)).toEqual([12, 10101, 0]);
    expect(tupleToInvitationConfig([12, 10101, 0])).toEqual(config);
  });

  it("round-trips every text field at its parser limit", () => {
    const config = shareableConfigFromParams({
      to: "t".repeat(40),
      from: "f".repeat(40),
      date: "2026-08-08",
      time: "19:30",
      tz: "America/New_York",
      duration: "720",
      place: "p".repeat(100),
      title: "h".repeat(80),
      note: "n".repeat(240),
      telegram: "a".repeat(32),
      notifyName: "y".repeat(40),
      tgText: "g".repeat(500),
    });

    expect(tupleToInvitationConfig(invitationConfigToTuple(config))).toEqual(config);
  });

  it("returns the frozen configuration produced by the production parser", () => {
    const decoded = tupleToInvitationConfig([12, 20260808, 1170]);

    expect(Object.isFrozen(decoded)).toBe(true);
  });

  it.each([
    ["a non-array value", null],
    ["an empty tuple", []],
    ["a string mask", ["12", 20260808, 1170]],
    ["a fractional mask", [12.5, 20260808, 1170]],
    ["a negative mask", [-1, 20260808, 1170]],
    ["a non-finite mask", [Number.POSITIVE_INFINITY, 20260808, 1170]],
  ])("rejects %s", (_description, value) => {
    expect(() => tupleToInvitationConfig(value)).toThrow();
  });

  it("rejects unknown mask bits", () => {
    expect(() => tupleToInvitationConfig([0x100c, 20260808, 1170, "unknown"])).toThrow();
  });

  it.each([
    ["a missing value", [12, 20260808]],
    ["an extra value", [12, 20260808, 1170, "extra"]],
  ])("rejects %s", (_description, value) => {
    expect(() => tupleToInvitationConfig(value)).toThrow();
  });

  it.each([
    ["to", [13, 123, 20260808, 1170]],
    ["from", [14, 123, 20260808, 1170]],
    ["time zone", [28, 20260808, 1170, 123]],
    ["place", [76, 20260808, 1170, 123]],
    ["title", [140, 20260808, 1170, 123]],
    ["note", [268, 20260808, 1170, 123]],
    ["Telegram username", [524, 20260808, 1170, 123]],
    ["notification name", [1036, 20260808, 1170, 123]],
    ["Telegram text", [2060, 20260808, 1170, 123]],
  ])("rejects a non-string %s", (_field, tuple) => {
    expect(() => tupleToInvitationConfig(tuple)).toThrow();
  });

  it.each([
    ["date", [12, "20260808", 1170]],
    ["time", [12, 20260808, "1170"]],
    ["duration", [44, 20260808, 1170, "120"]],
  ])("rejects a non-numeric %s", (_field, tuple) => {
    expect(() => tupleToInvitationConfig(tuple)).toThrow();
  });

  it.each([
    ["a negative date", [12, -1, 1170]],
    ["a date longer than eight digits", [12, 100000000, 1170]],
    ["a fractional date", [12, 20260808.5, 1170]],
    ["a non-finite date", [12, Number.POSITIVE_INFINITY, 1170]],
    ["an impossible calendar date", [12, 20260230, 1170]],
    ["a negative time", [12, 20260808, -1]],
    ["a time after 23:59", [12, 20260808, 1440]],
    ["a fractional time", [12, 20260808, 1170.5]],
    ["a non-finite time", [12, 20260808, Number.NaN]],
    ["a duration below 15 minutes", [44, 20260808, 1170, 14]],
    ["a duration above 720 minutes", [44, 20260808, 1170, 721]],
    ["a fractional duration", [44, 20260808, 1170, 90.5]],
    ["a non-finite duration", [44, 20260808, 1170, Number.NEGATIVE_INFINITY]],
  ])("rejects %s", (_description, tuple) => {
    expect(() => tupleToInvitationConfig(tuple)).toThrow();
  });

  it.each([
    ["date", [8, 1170]],
    ["time", [4, 20260808]],
    ["date and time", [0]],
  ])("rejects a tuple missing %s bits", (_description, tuple) => {
    expect(() => tupleToInvitationConfig(tuple)).toThrow();
  });
});
