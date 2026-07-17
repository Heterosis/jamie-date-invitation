import type { Point, SpatialIntent, VisualPreview } from "./trick-geometry";
import type { TrickEffectContext, TrickRegistry } from "./trick-runner";

interface PosePreview {
  readonly preview: VisualPreview;
  readonly posed: boolean;
}

function centerOf(value: DOMRectReadOnly): { readonly x: number; readonly y: number } {
  return {
    x: value.left + value.width / 2,
    y: value.top + value.height / 2,
  };
}

function transformDelta(from: DOMRectReadOnly, to: DOMRectReadOnly): string {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
}

function centerDelta(from: DOMRectReadOnly, to: DOMRectReadOnly): Point {
  const fromCenter = centerOf(from);
  const toCenter = centerOf(to);
  return { x: fromCenter.x - toCenter.x, y: fromCenter.y - toCenter.y };
}

function rotateVector(value: Point, degrees: number): Point {
  const radians = degrees * Math.PI / 180;
  return {
    x: value.x * Math.cos(radians) - value.y * Math.sin(radians),
    y: value.x * Math.sin(radians) + value.y * Math.cos(radians),
  };
}

function noMotionRotationDelta(preview: VisualPreview): number {
  const previousRotation = preview.previous.noPose?.rotation ?? 0;
  const targetRotation = preview.target.noPose?.rotation ?? 0;
  return previousRotation - targetRotation;
}

function noMotionTransform(
  preview: VisualPreview,
  letterDelta: Point,
  localRotation = noMotionRotationDelta(preview),
): string {
  const targetRotation = preview.target.noPose?.rotation ?? 0;
  const localDelta = rotateVector(letterDelta, -targetRotation);
  return `translate(${localDelta.x}px, ${localDelta.y}px) rotate(${localRotation}deg)`;
}

function letterLocalActivation(context: TrickEffectContext): Point {
  return context.activation;
}

function flipKeyframes(before: DOMRectReadOnly, after: DOMRectReadOnly): Keyframe[] {
  return [
    { transform: transformDelta(before, after) },
    { transform: "translate(0, 0)" },
  ];
}

function choosePosePreview(context: TrickEffectContext, intent: SpatialIntent): PosePreview {
  const pose = context.choosePose(intent);
  return {
    preview: context.preview(pose ? { noPose: pose } : {}),
    posed: pose !== null,
  };
}

function ownedArtifact(context: TrickEffectContext, className: string): HTMLElement {
  const element = context.trackArtifact(
    context.view.letter.ownerDocument.createElement("span"),
  );
  element.className = className;
  element.dataset.trickArtifact = "true";
  element.setAttribute("data-trick-artifact", "true");
  element.setAttribute("aria-hidden", "true");
  return element;
}

export const TRICK_EFFECTS = {
  "runaway-rsvp": (context) => {
    const { preview, posed } = choosePosePreview(context, "runaway");
    const start = centerDelta(preview.beforeNo, preview.afterNo);
    const rotationDelta = noMotionRotationDelta(preview);
    const keyframes: Keyframe[] = posed
      ? [
        { transform: noMotionTransform(preview, start) },
        {
          offset: 0.38,
          transform: noMotionTransform(
            preview,
            { x: start.x * 0.66, y: start.y * 0.45 - 28 },
            rotationDelta * 0.66,
          ),
        },
        {
          offset: 0.72,
          transform: noMotionTransform(
            preview,
            { x: start.x * 0.3, y: start.y * 0.16 - 12 },
            rotationDelta * 0.3,
          ),
        },
        { transform: "translate(0, 0) rotate(0deg)" },
      ]
      : [
        { transform: noMotionTransform(preview, { x: 0, y: 0 }) },
        { transform: noMotionTransform(preview, { x: -6, y: -8 }, -2) },
        { transform: noMotionTransform(preview, { x: 6, y: -4 }, 2) },
        { transform: "translate(0, 0) rotate(0deg)" },
      ];
    context.animate(context.view.noMotion, keyframes, {
      duration: 760,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "both",
    });
    return {
      message: "The NO button made a tiny two-hop escape.",
      preview,
      fallbackMs: 900,
      persistence: "commit-target",
    };
  },

  "growing-feelings": (context) => {
    const preview = context.preview({
      yesScale: Math.min(1.5, context.state.yesScale + 0.1),
      noScale: Math.max(0.68, context.state.noScale - 0.06),
    });
    context.animate(
      context.view.yesFace,
      [{ scale: "1" }, { scale: "1.08", offset: 0.55 }, { scale: "1" }],
      { duration: 520, easing: "ease-out", fill: "both" },
    );
    context.animate(
      context.view.noFace,
      [{ scale: "1" }, { scale: ".92", offset: 0.55 }, { scale: "1" }],
      { duration: 520, easing: "ease-out", fill: "both" },
    );
    return {
      message: "Funny—the feelings seem to be growing.",
      preview,
      fallbackMs: 700,
      persistence: "commit-target",
    };
  },

  "seat-swap": (context) => {
    const preview = context.preview({ swapped: !context.state.swapped });
    context.animate(context.view.yesMotion, flipKeyframes(preview.beforeYes, preview.afterYes), {
      duration: 650,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "both",
    });
    context.animate(
      context.view.noMotion,
      [
        { transform: noMotionTransform(preview, centerDelta(preview.beforeNo, preview.afterNo)) },
        { transform: "translate(0, 0) rotate(0deg)" },
      ],
      {
        duration: 650,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "both",
      },
    );
    return {
      message: "The buttons swapped seats before accepting another click.",
      preview,
      fallbackMs: 900,
      persistence: "commit-target",
    };
  },

  "cupid-magnet": (context) => {
    const { preview, posed } = choosePosePreview(context, "magnet");
    const rotationDelta = noMotionRotationDelta(preview);
    let keyframes: Keyframe[];
    if (posed) {
      const yesCenter = centerOf(preview.beforeYes);
      const targetCenter = centerOf(preview.afterNo);
      keyframes = [
        { transform: noMotionTransform(preview, centerDelta(preview.beforeNo, preview.afterNo)) },
        {
          offset: 0.58,
          transform: noMotionTransform(
            preview,
            { x: yesCenter.x - targetCenter.x, y: yesCenter.y - targetCenter.y },
            rotationDelta * 0.42,
          ),
        },
        { transform: "translate(0, 0) rotate(0deg)" },
      ];
    } else {
      keyframes = [
        { transform: noMotionTransform(preview, { x: 0, y: 0 }) },
        { transform: noMotionTransform(preview, { x: -4, y: -4 }, -2) },
        { transform: "translate(0, 0) rotate(0deg)" },
      ];
    }
    context.animate(context.view.noMotion, keyframes, {
      duration: 880,
      easing: "ease-in-out",
      fill: "both",
    });
    return {
      message: "Cupid's magnet pulled NO toward YES, then set it down safely.",
      preview,
      fallbackMs: 1_050,
      persistence: "commit-target",
    };
  },

  "paper-plane": (context) => {
    const { preview, posed } = choosePosePreview(context, "plane");
    const start = centerDelta(preview.beforeNo, preview.afterNo);
    const rotationDelta = noMotionRotationDelta(preview);
    const motionKeyframes: Keyframe[] = posed
      ? [
        { opacity: 1, transform: noMotionTransform(preview, start) },
        {
          opacity: 1,
          offset: 0.58,
          transform: `${noMotionTransform(
            preview,
            { x: start.x * 0.45 + 70, y: start.y * 0.4 - 92 },
            rotationDelta * 0.4 + 22,
          )} scale(.58)`,
        },
        { opacity: 1, transform: "translate(0, 0) rotate(0deg) scale(1)" },
      ]
      : [
        { opacity: 1, transform: noMotionTransform(preview, { x: 0, y: 0 }) },
        {
          opacity: 0.88,
          transform: `${noMotionTransform(preview, { x: 0, y: -8 }, 5)} scale(.9)`,
        },
        { opacity: 1, transform: "translate(0, 0) rotate(0deg) scale(1)" },
      ];
    context.animate(context.view.noMotion, motionKeyframes, {
      duration: 1_000,
      easing: "cubic-bezier(.3,.1,.2,1)",
      fill: "both",
    });
    context.animate(
      context.view.noFace,
      [
        { clipPath: "inset(0)", rotate: "0deg", scale: "1", opacity: 1 },
        {
          clipPath: "polygon(0 0, 100% 50%, 0 100%, 25% 50%)",
          rotate: "-12deg",
          scale: ".82",
          opacity: 1,
          offset: 0.5,
        },
        { clipPath: "inset(0)", rotate: "0deg", scale: "1", opacity: 1 },
      ],
      { duration: 1_000, easing: "ease-in-out", fill: "both" },
    );
    return {
      message: "NO folded into a paper plane and landed somewhere safe.",
      preview,
      fallbackMs: 1_200,
      persistence: "commit-target",
    };
  },

  "yes-garden": (context) => {
    const preview = context.preview({});
    const origin = letterLocalActivation(context);
    for (let index = 0; index < 8; index += 1) {
      const item = ownedArtifact(context, "trick-garden-item");
      const angle = index * Math.PI / 4;
      const radius = index % 2 === 0 ? 72 : 92;
      const x = Math.round(Math.cos(angle) * radius);
      const y = Math.round(Math.sin(angle) * radius);
      item.textContent = index % 2 === 0 ? "🌷" : "YES";
      item.style.setProperty("--garden-x", `${origin.x}px`);
      item.style.setProperty("--garden-y", `${origin.y}px`);
      context.view.letter.append(item);
      context.animate(
        item,
        [
          { opacity: 0, transform: "translate(-50%, -50%) scale(.2)" },
          {
            opacity: 1,
            offset: 0.62,
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)`,
          },
          {
            opacity: 0,
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y - 12}px)) scale(.9)`,
          },
        ],
        {
          duration: 700,
          delay: context.reducedMotion ? 0 : index * 35,
          easing: "ease-out",
          fill: "both",
        },
      );
    }
    return {
      message: "A tiny garden of YES bloomed around the letter.",
      preview,
      fallbackMs: 1_000,
      persistence: "transient",
    };
  },

  "dramatic-excuse": (context) => {
    const preview = context.preview({});
    const bubble = ownedArtifact(context, "trick-excuse");
    const letterRect = context.view.letter.getBoundingClientRect();
    const noRect = context.view.noButton.getBoundingClientRect();
    bubble.textContent = "BUT WHAT IF THERE'S DESSERT?";
    bubble.style.setProperty("left", `${noRect.left + noRect.width / 2 - letterRect.left}px`);
    bubble.style.setProperty("top", `${noRect.top - letterRect.top - 14}px`);
    context.view.letter.append(bubble);
    context.animate(
      bubble,
      [
        { opacity: 0, transform: "translate(-50%, 8px)", scale: ".8" },
        { opacity: 1, transform: "translate(-50%, -100%)", scale: "1", offset: 0.35 },
        { opacity: 1, transform: "translate(-50%, -100%)", scale: "1", offset: 0.78 },
        { opacity: 0, transform: "translate(-50%, -110%)", scale: ".96" },
      ],
      { duration: 900, easing: "ease-out", fill: "both" },
    );
    return {
      message: "NO would like to renegotiate over dessert.",
      preview,
      fallbackMs: 1_100,
      persistence: "transient",
    };
  },

  spotlight: (context) => {
    const preview = context.preview({});
    const overlay = ownedArtifact(context, "trick-spotlight-overlay");
    const letterRect = context.view.letter.getBoundingClientRect();
    const yesRect = context.view.yesButton.getBoundingClientRect();
    overlay.style.setProperty(
      "--spotlight-x",
      `${yesRect.left + yesRect.width / 2 - letterRect.left}px`,
    );
    overlay.style.setProperty(
      "--spotlight-y",
      `${yesRect.top + yesRect.height / 2 - letterRect.top}px`,
    );
    context.view.letter.append(overlay);
    context.animate(
      overlay,
      [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }],
      { duration: 900, easing: "ease-in-out", fill: "both" },
    );
    return {
      message: "A spotlight found the YES button.",
      preview,
      fallbackMs: 1_100,
      persistence: "transient",
    };
  },

  "tiny-disguise": (context) => {
    const preview = context.preview({ disguised: true });
    context.animate(
      context.view.noFace,
      [
        { rotate: "0deg", scale: "1" },
        { rotate: "8deg", scale: ".92", offset: 0.35 },
        { rotate: "-5deg", scale: "1.04", offset: 0.7 },
        { rotate: "0deg", scale: "1" },
      ],
      { duration: 620, easing: "ease-in-out", fill: "both" },
    );
    return {
      message: "NO put on a very unconvincing disguise.",
      preview,
      fallbackMs: 750,
      persistence: "commit-target",
    };
  },

  "return-to-sender": (context) => {
    const { preview, posed } = choosePosePreview(context, "returned");
    const stamp = ownedArtifact(context, "trick-return-stamp");
    const landing = centerOf(preview.afterNo);
    const rotationDelta = noMotionRotationDelta(preview);
    stamp.textContent = "RETURN TO SENDER";
    stamp.style.setProperty("left", `${landing.x}px`);
    stamp.style.setProperty("top", `${landing.y}px`);
    context.view.letter.append(stamp);
    const motionKeyframes: Keyframe[] = posed
      ? [
        { transform: noMotionTransform(preview, centerDelta(preview.beforeNo, preview.afterNo)) },
        {
          transform: noMotionTransform(
            preview,
            { x: -12, y: 8 },
            rotationDelta * 0.28 - 5,
          ),
          offset: 0.72,
        },
        { transform: "translate(0, 0) rotate(0deg)" },
      ]
      : [
        { transform: noMotionTransform(preview, { x: 0, y: 0 }) },
        { transform: noMotionTransform(preview, { x: -5, y: 3 }, -3) },
        { transform: "translate(0, 0) rotate(0deg)" },
      ];
    context.animate(context.view.noMotion, motionKeyframes, {
      duration: 900,
      easing: "ease-in-out",
      fill: "both",
    });
    context.animate(
      stamp,
      [
        { opacity: 0, rotate: "-15deg", scale: "1.8" },
        { opacity: 1, rotate: "-8deg", scale: "1", offset: 0.42 },
        { opacity: 1, rotate: "-8deg", scale: "1" },
      ],
      { duration: 820, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" },
    );
    return {
      message: "NO was stamped RETURN TO SENDER.",
      preview,
      fallbackMs: 1_100,
      persistence: "commit-target",
    };
  },
} satisfies TrickRegistry;
