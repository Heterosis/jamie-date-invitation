export interface NoPose {
  readonly centerX: number;
  readonly centerY: number;
  readonly rotation: number;
}

export interface TrickVisualState {
  readonly noPose: NoPose | null;
  readonly yesScale: number;
  readonly noScale: number;
  readonly swapped: boolean;
  readonly disguised: boolean;
}

export type TrickVisualPatch = Partial<TrickVisualState>;

export const MAX_YES_SCALE = 1.5;
export const MIN_NO_FACE_SCALE = 0.68;

export const INITIAL_TRICK_VISUAL_STATE: Readonly<TrickVisualState> = Object.freeze({
  noPose: null,
  yesScale: 1,
  noScale: 1,
  swapped: false,
  disguised: false,
});

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function freezePose(pose: NoPose | null): NoPose | null {
  if (!pose) return null;
  return Object.freeze({
    centerX: finite(pose.centerX, 0),
    centerY: finite(pose.centerY, 0),
    rotation: finite(pose.rotation, 0),
  });
}

export function applyTrickVisualPatch(
  current: Readonly<TrickVisualState>,
  patch: TrickVisualPatch,
): Readonly<TrickVisualState> {
  return Object.freeze({
    noPose: patch.noPose === undefined ? current.noPose : freezePose(patch.noPose),
    yesScale: Math.min(
      MAX_YES_SCALE,
      Math.max(1, finite(patch.yesScale ?? current.yesScale, current.yesScale)),
    ),
    noScale: Math.min(
      1,
      Math.max(MIN_NO_FACE_SCALE, finite(patch.noScale ?? current.noScale, current.noScale)),
    ),
    swapped: patch.swapped ?? current.swapped,
    disguised: patch.disguised ?? current.disguised,
  });
}
