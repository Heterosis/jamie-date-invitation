import { deflateSync, inflateSync } from "fflate";
import {
  invitationConfigToTuple,
  tupleToInvitationConfig,
  type ShareableInvitationConfig,
} from "./payload-schema";

export const MAX_ENCODED_PAYLOAD_LENGTH = 8_192;
export const MAX_INFLATED_PAYLOAD_BYTES = 8_192;

const PAYLOAD_VERSION = 0x01;
const BASE64_URL_ALPHABET = /^[A-Za-z0-9_-]+$/;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function invalidPayload(): never {
  throw new TypeError("Invalid invitation payload.");
}

function oversizedPayload(): never {
  throw new RangeError("Invitation payload exceeds the supported size.");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(token: string): Uint8Array {
  const paddingLength = (4 - (token.length % 4)) % 4;
  const base64 = token
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    + "=".repeat(paddingLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeInvitationPayload(
  config: ShareableInvitationConfig,
): string {
  const tuple = invitationConfigToTuple(config);
  const inflatedBytes = textEncoder.encode(JSON.stringify(tuple));
  if (inflatedBytes.length > MAX_INFLATED_PAYLOAD_BYTES) {
    return oversizedPayload();
  }

  const compressedBytes = deflateSync(inflatedBytes, { level: 9 });
  const envelope = new Uint8Array(1 + compressedBytes.length);
  envelope[0] = PAYLOAD_VERSION;
  envelope.set(compressedBytes, 1);

  const token = base64UrlEncode(envelope);
  if (token.length > MAX_ENCODED_PAYLOAD_LENGTH) {
    return oversizedPayload();
  }
  return token;
}

export function decodeInvitationPayload(
  token: string,
): ShareableInvitationConfig {
  if (
    typeof token !== "string"
    || token.length === 0
    || token.length > MAX_ENCODED_PAYLOAD_LENGTH
    || !BASE64_URL_ALPHABET.test(token)
    || token.length % 4 === 1
  ) {
    return invalidPayload();
  }

  try {
    const envelope = base64UrlDecode(token);
    if (base64UrlEncode(envelope) !== token) return invalidPayload();
    if (envelope.length < 2 || envelope[0] !== PAYLOAD_VERSION) {
      return invalidPayload();
    }

    const inflatedBytes = inflateSync(
      envelope.subarray(1),
      { out: new Uint8Array(MAX_INFLATED_PAYLOAD_BYTES + 1) },
    );
    if (inflatedBytes.length > MAX_INFLATED_PAYLOAD_BYTES) {
      return invalidPayload();
    }

    const json = textDecoder.decode(inflatedBytes);
    const value: unknown = JSON.parse(json);
    return tupleToInvitationConfig(value);
  } catch {
    return invalidPayload();
  }
}
