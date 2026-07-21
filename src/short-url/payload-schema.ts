import {
  DEFAULT_DURATION,
  DEFAULT_NOTE,
  DEFAULT_TIME_ZONE,
  DEFAULT_TO,
  deriveInvitationTitle,
  deriveNotifyName,
  parseInvitationConfig,
  type InvitationConfig,
} from "../domain/invitation-config";

export type ShareableInvitationConfig =
  Omit<InvitationConfig, "date" | "time" | "make"> & {
    readonly date: string;
    readonly time: string;
    readonly make: false;
  };

export type CompactInvitationTuple =
  readonly [mask: number, ...values: readonly (string | number)[]];

const KNOWN_MASK = 0x0fff;
const REQUIRED_MASK = 0x000c;

const TO_BIT = 1 << 0;
const FROM_BIT = 1 << 1;
const DATE_BIT = 1 << 2;
const TIME_BIT = 1 << 3;
const TIME_ZONE_BIT = 1 << 4;
const DURATION_BIT = 1 << 5;
const PLACE_BIT = 1 << 6;
const TITLE_BIT = 1 << 7;
const NOTE_BIT = 1 << 8;
const TELEGRAM_BIT = 1 << 9;
const NOTIFY_NAME_BIT = 1 << 10;
const TELEGRAM_TEXT_BIT = 1 << 11;

const STRICT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STRICT_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function invalidTuple(): never {
  throw new TypeError("Invalid compact invitation tuple.");
}

function invalidConfig(): never {
  throw new TypeError("Invalid shareable invitation configuration.");
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && Number.isInteger(value);
}

function integerInRange(value: unknown, minimum: number, maximum: number): number {
  if (!isFiniteInteger(value) || value < minimum || value > maximum) {
    return invalidTuple();
  }
  return value;
}

function popcount(value: number): number {
  let remaining = value;
  let count = 0;
  while (remaining !== 0) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}

function compactDate(date: string): number {
  if (!STRICT_DATE.test(date)) return invalidConfig();
  const value = Number(date.replaceAll("-", ""));
  if (!Number.isInteger(value) || value < 0 || value > 99_999_999) {
    return invalidConfig();
  }
  return value;
}

function compactTime(time: string): number {
  if (!STRICT_TIME.test(time)) return invalidConfig();
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  return hours * 60 + minutes;
}

function expandedDate(value: unknown): string {
  const digits = integerInRange(value, 0, 99_999_999).toString().padStart(8, "0");
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function expandedTime(value: unknown): string {
  const minutes = integerInRange(value, 0, 1439);
  const hoursText = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minutesText = (minutes % 60).toString().padStart(2, "0");
  return `${hoursText}:${minutesText}`;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") return invalidTuple();
  return value;
}

export function isShareableInvitationConfig(
  config: InvitationConfig,
): config is ShareableInvitationConfig {
  return config.date !== null && config.time !== null && config.make === false;
}

export function invitationConfigToTuple(
  config: ShareableInvitationConfig,
): CompactInvitationTuple {
  if (!isShareableInvitationConfig(config)) return invalidConfig();
  if (!isFiniteInteger(config.duration) || config.duration < 15 || config.duration > 720) {
    return invalidConfig();
  }

  let mask = 0;
  const values: (string | number)[] = [];
  const append = (bit: number, value: string | number): void => {
    mask |= bit;
    values.push(value);
  };

  if (config.to !== DEFAULT_TO) append(TO_BIT, config.to);
  if (config.from !== "") append(FROM_BIT, config.from);
  append(DATE_BIT, compactDate(config.date));
  append(TIME_BIT, compactTime(config.time));
  if (config.tz !== DEFAULT_TIME_ZONE) append(TIME_ZONE_BIT, config.tz);
  if (config.duration !== DEFAULT_DURATION) append(DURATION_BIT, config.duration);
  if (config.place !== "") append(PLACE_BIT, config.place);
  if (config.title !== deriveInvitationTitle(config.from)) append(TITLE_BIT, config.title);
  if (config.note !== DEFAULT_NOTE) append(NOTE_BIT, config.note);
  if (config.telegram !== null) append(TELEGRAM_BIT, config.telegram);
  if (config.notifyName !== deriveNotifyName(config.from)) {
    append(NOTIFY_NAME_BIT, config.notifyName);
  }
  if (config.tgText !== null) append(TELEGRAM_TEXT_BIT, config.tgText);

  const tuple: [number, ...(string | number)[]] = [mask, ...values];
  return tuple;
}

export function tupleToInvitationConfig(value: unknown): ShareableInvitationConfig {
  if (!Array.isArray(value)) return invalidTuple();
  const tuple: readonly unknown[] = value;
  const maskValue = tuple[0];
  if (
    !isFiniteInteger(maskValue)
    || maskValue < 0
    || maskValue > KNOWN_MASK
    || (maskValue & ~KNOWN_MASK) !== 0
  ) {
    return invalidTuple();
  }

  const mask = maskValue;
  if ((mask & REQUIRED_MASK) !== REQUIRED_MASK) return invalidTuple();
  if (tuple.length !== 1 + popcount(mask)) return invalidTuple();

  let cursor = 1;
  const nextValue = (): unknown => {
    const next = tuple[cursor];
    cursor += 1;
    return next;
  };
  const params = new URLSearchParams();

  if ((mask & TO_BIT) !== 0) params.set("to", stringValue(nextValue()));
  if ((mask & FROM_BIT) !== 0) params.set("from", stringValue(nextValue()));
  params.set("date", expandedDate(nextValue()));
  params.set("time", expandedTime(nextValue()));
  if ((mask & TIME_ZONE_BIT) !== 0) params.set("tz", stringValue(nextValue()));
  if ((mask & DURATION_BIT) !== 0) {
    params.set("duration", integerInRange(nextValue(), 15, 720).toString());
  }
  if ((mask & PLACE_BIT) !== 0) params.set("place", stringValue(nextValue()));
  if ((mask & TITLE_BIT) !== 0) params.set("title", stringValue(nextValue()));
  if ((mask & NOTE_BIT) !== 0) params.set("note", stringValue(nextValue()));
  if ((mask & TELEGRAM_BIT) !== 0) params.set("telegram", stringValue(nextValue()));
  if ((mask & NOTIFY_NAME_BIT) !== 0) {
    params.set("notifyName", stringValue(nextValue()));
  }
  if ((mask & TELEGRAM_TEXT_BIT) !== 0) params.set("tgText", stringValue(nextValue()));

  const config = parseInvitationConfig(params.toString());
  if (!isShareableInvitationConfig(config)) return invalidTuple();
  return config;
}
