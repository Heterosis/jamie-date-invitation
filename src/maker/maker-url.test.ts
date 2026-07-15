import { describe, expect, it } from "vitest";
import { parseInvitationConfig } from "../domain/invitation-config";
import { buildMakerUrl, validateMakerValues, type MakerValues } from "./maker-url";

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
});
