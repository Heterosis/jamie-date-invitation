export function installMotionPreference(): () => void {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const update = (): void => {
    document.documentElement.dataset.motion = media.matches ? "reduced" : "full";
  };
  update();
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
