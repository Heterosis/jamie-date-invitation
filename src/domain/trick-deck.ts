export const TRICK_IDS = [
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
] as const;

export type TrickId = (typeof TRICK_IDS)[number];

export interface TrickDeck { next(): TrickId; }

export function createTrickDeck(random: () => number = Math.random): TrickDeck {
  let bag: TrickId[] = [];
  let cursor = 0;
  const refill = (): void => {
    bag = [...TRICK_IDS];
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
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
