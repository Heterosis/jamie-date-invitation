import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseInvitationConfig } from "../domain/invitation-config";
import {
  invitationConfigToTuple,
  isShareableInvitationConfig,
  type ShareableInvitationConfig,
} from "./payload-schema";
import {
  decodeInvitationPayload,
  encodeInvitationPayload,
  MAX_ENCODED_PAYLOAD_LENGTH,
  MAX_INFLATED_PAYLOAD_BYTES,
} from "./payload-codec";

const textEncoder = new TextEncoder();
const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function shareableConfig(search: string): ShareableInvitationConfig {
  const config = parseInvitationConfig(search);
  if (!isShareableInvitationConfig(config)) {
    throw new Error("Test fixture must be a shareable invitation.");
  }
  return config;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function withNoncanonicalTailBits(canonicalToken: string): string {
  const remainder = canonicalToken.length % 4;
  if (remainder !== 2 && remainder !== 3) {
    throw new Error("Test fixture must have unused Base64URL tail bits.");
  }

  const finalCharacter = canonicalToken.at(-1);
  const finalValue = finalCharacter === undefined
    ? -1
    : base64UrlAlphabet.indexOf(finalCharacter);
  const unusedBitMask = remainder === 2 ? 0b1111 : 0b0011;
  if (finalValue < 0 || (finalValue & unusedBitMask) !== 0) {
    throw new Error("Test fixture must use canonical Base64URL tail bits.");
  }

  const alternateCharacter = base64UrlAlphabet[finalValue | 0b0001];
  if (alternateCharacter === undefined) {
    throw new Error("Could not create a noncanonical Base64URL fixture.");
  }
  return canonicalToken.slice(0, -1) + alternateCharacter;
}

function nodeEnvelope(inflated: Uint8Array, version = 0x01): string {
  const compressed = deflateRawSync(inflated, { level: 9 });
  return base64UrlEncode(Buffer.concat([
    Buffer.from([version]),
    compressed,
  ]));
}

function tupleJson(config: ShareableInvitationConfig): string {
  return JSON.stringify(invitationConfigToTuple(config));
}

function validTupleJsonWithByteLength(byteLength: number): Uint8Array {
  const json = JSON.stringify([12, 20260808, 1170]);
  const jsonByteLength = textEncoder.encode(json).length;
  if (jsonByteLength > byteLength) {
    throw new Error("Requested test fixture is too short.");
  }
  return textEncoder.encode(json + " ".repeat(byteLength - jsonByteLength));
}

function deterministicHighEntropyAscii(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&'()*+,-./:;<=>?@[]^_`{|}~";
  let state = 0x12345678;
  let result = "";
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    result += alphabet[(state >>> 0) % alphabet.length];
  }
  return result;
}

const minimalConfig = shareableConfig("?date=2026-08-08&time=19%3A30");
const referenceConfig = shareableConfig(
  "?from=Alex&date=2026-08-08&time=19%3A30&place=Botanic+Gardens&telegram=alex_date",
);

describe("invitation payload codec", () => {
  it("round-trips a shareable invitation semantically", () => {
    const decoded = decodeInvitationPayload(encodeInvitationPayload(referenceConfig));

    expect(decoded).toEqual(referenceConfig);
  });

  it("produces deterministic output for the same canonical configuration", () => {
    expect(encodeInvitationPayload(referenceConfig)).toBe(
      encodeInvitationPayload(referenceConfig),
    );
  });

  it("emits only the strict unpadded Base64URL alphabet", () => {
    const token = encodeInvitationPayload(referenceConfig);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("=");
  });

  it("uses a version-1 raw-DEFLATE envelope readable by Node zlib", () => {
    const token = encodeInvitationPayload(referenceConfig);
    const envelope = Buffer.from(token, "base64url");

    expect(envelope[0]).toBe(0x01);
    expect(inflateRawSync(envelope.subarray(1)).toString("utf8")).toBe(
      tupleJson(referenceConfig),
    );
  });

  it("decodes a version-1 raw-DEFLATE envelope produced by Node zlib", () => {
    const token = nodeEnvelope(textEncoder.encode(tupleJson(referenceConfig)));

    expect(decodeInvitationPayload(token)).toEqual(referenceConfig);
  });

  it("rejects an encoder input whose tuple JSON exceeds the raw UTF-8 limit", () => {
    const oversizedConfig: ShareableInvitationConfig = {
      ...minimalConfig,
      tgText: "x".repeat(MAX_INFLATED_PAYLOAD_BYTES + 1),
    };

    expect(textEncoder.encode(tupleJson(oversizedConfig)).length).toBeGreaterThan(
      MAX_INFLATED_PAYLOAD_BYTES,
    );
    expect(() => encodeInvitationPayload(oversizedConfig)).toThrow();
  });

  it("rejects an encoder result whose Base64URL token exceeds the encoded limit", () => {
    const config: ShareableInvitationConfig = {
      ...minimalConfig,
      tgText: deterministicHighEntropyAscii(8_000),
    };
    const rawBytes = textEncoder.encode(tupleJson(config));
    const independentlyEncodedLength = nodeEnvelope(rawBytes).length;

    expect(rawBytes.length).toBeLessThanOrEqual(MAX_INFLATED_PAYLOAD_BYTES);
    expect(independentlyEncodedLength).toBeGreaterThan(MAX_ENCODED_PAYLOAD_LENGTH);
    expect(() => encodeInvitationPayload(config)).toThrow();
  });

  it("rejects an empty token", () => {
    expect(() => decodeInvitationPayload("")).toThrow();
  });

  it("rejects an encoded token over the input limit", () => {
    expect(() => decodeInvitationPayload("A".repeat(MAX_ENCODED_PAYLOAD_LENGTH + 1))).toThrow();
  });

  it.each(["AQ+", "AQ/", "AQ=", "AQ\n"])(
    "rejects invalid Base64URL alphabet or padding in %j",
    (token) => {
      expect(() => decodeInvitationPayload(token)).toThrow();
    },
  );

  it("rejects a Base64URL length whose remainder modulo four is one", () => {
    expect(() => decodeInvitationPayload("A")).toThrow();
  });

  it("rejects alternate noncanonical Base64URL tail bits for the same bytes", () => {
    const canonicalToken = nodeEnvelope(textEncoder.encode(tupleJson(referenceConfig)));
    const alternateToken = withNoncanonicalTailBits(canonicalToken);

    expect(Buffer.from(alternateToken, "base64url")).toEqual(
      Buffer.from(canonicalToken, "base64url"),
    );
    expect(decodeInvitationPayload(canonicalToken)).toEqual(referenceConfig);
    expect(() => decodeInvitationPayload(alternateToken)).toThrow();
  });

  it("rejects raw-DEFLATE bytes with no version byte", () => {
    const compressedOnly = deflateRawSync(textEncoder.encode(tupleJson(minimalConfig)));

    expect(() => decodeInvitationPayload(base64UrlEncode(compressedOnly))).toThrow();
  });

  it("rejects an unknown envelope version", () => {
    const token = nodeEnvelope(textEncoder.encode(tupleJson(minimalConfig)), 0x02);

    expect(() => decodeInvitationPayload(token)).toThrow();
  });

  it("rejects a version byte with no compressed bytes", () => {
    expect(() => decodeInvitationPayload(base64UrlEncode(new Uint8Array([0x01])))).toThrow();
  });

  it.each([
    ["truncated", (() => {
      const compressed = deflateRawSync(textEncoder.encode(tupleJson(minimalConfig)));
      return Buffer.concat([Buffer.from([0x01]), compressed.subarray(0, -1)]);
    })()],
    ["corrupt", new Uint8Array([0x01, 0xff])],
  ])("rejects %s raw-DEFLATE bytes", (_description, envelope) => {
    expect(() => decodeInvitationPayload(base64UrlEncode(envelope))).toThrow();
  });

  it("rejects inflated bytes that are not valid UTF-8", () => {
    const token = nodeEnvelope(new Uint8Array([0xc3, 0x28]));

    expect(() => decodeInvitationPayload(token)).toThrow();
  });

  it("rejects inflated text that is not JSON", () => {
    const token = nodeEnvelope(textEncoder.encode("not JSON"));

    expect(() => decodeInvitationPayload(token)).toThrow();
  });

  it("delegates invalid decoded tuple schemas to the schema validator", () => {
    const token = nodeEnvelope(textEncoder.encode(JSON.stringify([0])));

    expect(() => decodeInvitationPayload(token)).toThrow();
  });

  it("accepts exactly 8,192 inflated bytes when the tuple JSON has trailing whitespace", () => {
    const inflated = validTupleJsonWithByteLength(MAX_INFLATED_PAYLOAD_BYTES);

    expect(inflated.length).toBe(MAX_INFLATED_PAYLOAD_BYTES);
    expect(decodeInvitationPayload(nodeEnvelope(inflated))).toEqual(minimalConfig);
  });

  it("rejects 8,193 inflated bytes", () => {
    const inflated = validTupleJsonWithByteLength(MAX_INFLATED_PAYLOAD_BYTES + 1);

    expect(inflated.length).toBe(MAX_INFLATED_PAYLOAD_BYTES + 1);
    expect(() => decodeInvitationPayload(nodeEnvelope(inflated))).toThrow();
  });

  it("does not echo decoded payload contents in error messages", () => {
    const marker = "private-marker-4815162342";
    const token = nodeEnvelope(textEncoder.encode(marker));

    try {
      decodeInvitationPayload(token);
      throw new Error("Expected decoding to fail.");
    } catch (error) {
      expect(String(error)).not.toContain(marker);
    }
  });

  it("keeps the approved reference fixture payload at or below 87 characters", () => {
    expect(encodeInvitationPayload(referenceConfig).length).toBeLessThanOrEqual(87);
  });
});
