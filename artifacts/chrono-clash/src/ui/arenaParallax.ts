/** Restrained 2.5D arena parallax. CSS transforms only — no per-gem math. */

export const ARENA_PARALLAX_FAR = 5;
export const ARENA_PARALLAX_MID = 9;
export const ARENA_PARALLAX_NEAR = 12;

export function clampParallax(n: number): number {
  if (n < -1) return -1;
  if (n > 1) return 1;
  return n;
}

export function parallaxDisabled(app: HTMLElement | null): boolean {
  if (!app) return true;
  if (app.classList.contains("fx-low") || app.classList.contains("anim-low")) return true;
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function startArenaParallax(layer: HTMLElement, app: HTMLElement): () => void {
  let ax = 0;
  let ay = 0;
  let tx = 0;
  let ty = 0;
  let raf = 0;

  const apply = (x: number, y: number): void => {
    layer.style.setProperty("--arena-x", x.toFixed(4));
    layer.style.setProperty("--arena-y", y.toFixed(4));
  };

  const tick = (): void => {
    raf = 0;
    if (parallaxDisabled(app)) {
      ax = 0;
      ay = 0;
      tx = 0;
      ty = 0;
      apply(0, 0);
      return;
    }
    ax += (tx - ax) * 0.12;
    ay += (ty - ay) * 0.12;
    apply(ax, ay);
    if (Math.abs(tx - ax) > 0.002 || Math.abs(ty - ay) > 0.002) {
      raf = requestAnimationFrame(tick);
    }
  };

  const kick = (): void => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const onPointer = (ev: PointerEvent): void => {
    if (parallaxDisabled(app)) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    tx = clampParallax((ev.clientX / w) * 2 - 1) * 0.55;
    ty = clampParallax((ev.clientY / h) * 2 - 1) * 0.45;
    kick();
  };

  const onOrient = (ev: DeviceOrientationEvent): void => {
    if (parallaxDisabled(app)) return;
    const gamma = typeof ev.gamma === "number" ? ev.gamma : 0;
    const beta = typeof ev.beta === "number" ? ev.beta : 0;
    tx = clampParallax(gamma / 42) * 0.5;
    ty = clampParallax((beta - 45) / 48) * 0.4;
    kick();
  };

  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("deviceorientation", onOrient, { passive: true });
  apply(0, 0);

  return () => {
    window.removeEventListener("pointermove", onPointer);
    window.removeEventListener("deviceorientation", onOrient);
    if (raf) cancelAnimationFrame(raf);
    apply(0, 0);
  };
}
