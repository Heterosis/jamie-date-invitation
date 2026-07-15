export const TRICK_IDS = Object.freeze([
  "runaway-rsvp",
  "growing-feelings",
  "seat-swap",
  "cupid-magnet",
  "paper-plane",
  "yes-garden",
  "dramatic-excuse",
  "spotlight",
  "tiny-disguise",
  "return-to-sender",
] as const);

export type TrickId = (typeof TRICK_IDS)[number];

export interface TrickDeck { next(): TrickId; }

export function createTrickDeck(random: () => number = Math.random): TrickDeck {
  let bag: TrickId[] = [];
  let cursor = 0;
  const refill = (): void => {
    bag = [...TRICK_IDS];
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const sample = random();
      if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
        throw new RangeError("Random samples must be finite and between 0 (inclusive) and 1 (exclusive)");
      }
      const swapIndex = Math.floor(sample * (index + 1));
      [bag[index], bag[swapIndex]] = [bag[swapIndex]!, bag[index]!];
    }
    cursor = 0;
  };
  refill();
  return {
    next(): TrickId {
      if (cursor >= bag.length) refill();
      return bag[cursor++]!;
    },
  };
}
