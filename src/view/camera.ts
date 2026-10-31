/**
 * Free camera (05 §3): always looks at the dais; right-drag tilts 40–75° and
 * yaws 360°; wheel zooms 0.6–1.3; keys from rules.ts KEYS (arrows, Alt + ↑/↓,
 * Alt + 0 reset then 75° overview). Never moves by itself in a wave; shake
 * ≤ 12 px on the canvas only. Source to adapt: Space src/defense/view/camera.ts.
 * Adapted from games/space-typing src/defense/view/camera.ts (orbit, eased
 * targets, drag handling). The rig never listens to the keyboard: the input
 * router turns arrow and Alt keys into actions (00 §6), letters stay for
 * typing. Middle-drag pans within the play area + 8 m; edge pan is opt-in.
 * The shake shifts the projection only, so DOM tags projected through the
 * stage stay still.
 * Owner: view-terrain (LANES.md).
 */
import type { PerspectiveCamera } from "three";
import type { ActionHandler } from "../app/contracts";
import type { MapDef } from "../content/types";
import { DRAGON, Trauma } from "../kit/feedback";

export interface CameraRig extends ActionHandler {
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly zoom: number;
  update(dt: number): void;
  /** Trauma-based shake from kit/feedback, in pixels (≤ 12). */
  shake(pixels: number): void;
  /** A directional kick of `px` (≤ 6) along the screen direction (dx, dy), springing back in ~120 ms (05 §5); off under reduced motion. */
  kick(dx: number, dy: number, px: number): void;
  reset(): void;
  dispose(): void;
  /** Jumps or eases to a view (scenarios, settings); unspecified parts keep their target. */
  setView(view: Partial<CameraView>, snap?: boolean): void;
  /** The ground point the camera looks at, metres. */
  readonly target: { readonly x: number; readonly z: number };
  /** True while a right or middle drag is held. */
  readonly dragging: boolean;
  /** Pixels the last drag moved (under ~4 px a press is a pick, not a drag). */
  readonly lastDragPx: number;
  /** Player settings (06 §3): invert, sensitivity, edge pan, shake scale, reduced motion. */
  configure(options: Partial<CameraOptions>): void;
}

export interface CameraView {
  readonly yawDeg: number;
  readonly pitchDeg: number;
  /** Distance factor of the map's default distance: 0.6 close … 1.3 far. */
  readonly zoom: number;
  readonly targetX: number;
  readonly targetZ: number;
}

export interface CameraOptions {
  invertY: boolean;
  /** Drag and wheel speed, 0.25–3. */
  sensitivity: number;
  /** Pans when the pointer rests at the canvas edge (off by default: the camera never moves by itself in a wave). */
  edgePan: boolean;
  /** The player's screen-shake setting, 0–1. */
  shakeScale: number;
  reducedMotion: boolean;
}

export const CAMERA_LIMITS = {
  pitchMinDeg: 40,
  pitchMaxDeg: 75,
  zoomMin: 0.6,
  zoomMax: 1.3,
  overviewPitchDeg: 75,
  overviewZoom: 1.22,
  /** Pan reach past the play radius (05 §3). */
  panMarginM: 8,
  rotateStepDeg: 15,
  tiltStepDeg: 5,
  zoomStep: 1.1,
  /** How far key presses may run ahead of the eased view (holding a key spins at the easing speed). */
  keyLeadDeg: 45,
  /** Easing rate, 1/s. */
  ease: 9,
  /** Look-at height above the ground plane (the dais top). */
  lookY: 0.6,
  edgePx: 12,
  edgeSpeedMps: 16,
} as const;

/** Actions the rig takes (rules.ts KEYS names). */
export const CAMERA_ACTIONS = ["rotate-left", "rotate-right", "tilt-up", "tilt-down", "zoom-in", "zoom-out", "camera-reset"] as const;

const DEG = Math.PI / 180;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function createCameraRig(camera: PerspectiveCamera, map: MapDef, dom: HTMLElement): CameraRig {
  const L = CAMERA_LIMITS;
  const [cx, cz] = map.dais.center;
  const [lookX, lookZ] = map.camera.lookM ?? [0, 0];
  const home: CameraView = { yawDeg: map.camera.yawDeg, pitchDeg: clamp(map.camera.pitchDeg, L.pitchMinDeg, L.pitchMaxDeg), zoom: 1, targetX: cx + lookX, targetZ: cz + lookZ };
  const panReach = map.terrain.playRadiusM + L.panMarginM;
  const options: CameraOptions = { invertY: false, sensitivity: 1, edgePan: false, shakeScale: 1, reducedMotion: false };
  const trauma = new Trauma(DRAGON);

  // What it eases toward, and where it is now.
  const goal = { yaw: home.yawDeg, pitch: home.pitchDeg, zoom: home.zoom, x: home.targetX, z: home.targetZ };
  const now = { ...goal };
  let mode: "home" | "overview" | "free" = "home";
  let drag: { kind: "turn" | "pan"; x: number; y: number; moved: number; pointer: number } | null = null;
  let lastDragPx = 0;
  let pointer: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };
  let shaking = false;

  const setPan = (x: number, z: number): void => {
    const dx = x - cx;
    const dz = z - cz;
    const length = Math.hypot(dx, dz);
    const k = length > panReach ? panReach / length : 1;
    goal.x = cx + dx * k;
    goal.z = cz + dz * k;
  };
  /** Moves the look point: `right` and `back` in metres as seen from the camera. */
  const pan = (right: number, back: number): void => {
    const yaw = goal.yaw * DEG;
    setPan(goal.x + right * Math.cos(yaw) + back * Math.sin(yaw), goal.z - right * Math.sin(yaw) + back * Math.cos(yaw));
  };
  const turn = (deg: number, lead: boolean): void => {
    goal.yaw += deg;
    if (lead) goal.yaw = clamp(goal.yaw, now.yaw - L.keyLeadDeg, now.yaw + L.keyLeadDeg);
  };
  const tilt = (deg: number): void => {
    goal.pitch = clamp(goal.pitch + deg, L.pitchMinDeg, L.pitchMaxDeg);
  };
  const zoomBy = (factor: number): void => {
    goal.zoom = clamp(goal.zoom * factor, L.zoomMin, L.zoomMax);
  };
  /** Metres per CSS pixel at the look point. */
  const metresPerPixel = (): number => {
    const height = Math.max(1, dom.clientHeight);
    return (2 * map.camera.distanceM * now.zoom * Math.tan((camera.fov * DEG) / 2)) / height;
  };
  const atGoal = (view: CameraView): boolean =>
    Math.abs(goal.yaw - view.yawDeg) < 0.5 && Math.abs(goal.pitch - view.pitchDeg) < 0.5 && Math.abs(goal.zoom - view.zoom) < 0.01 && Math.hypot(goal.x - view.targetX, goal.z - view.targetZ) < 0.1;

  const goTo = (view: CameraView): void => {
    // Keep the yaw unwrapped: take the short way round to the asked heading.
    const delta = ((((view.yawDeg - goal.yaw) % 360) + 540) % 360) - 180;
    goal.yaw += delta;
    goal.pitch = clamp(view.pitchDeg, L.pitchMinDeg, L.pitchMaxDeg);
    goal.zoom = clamp(view.zoom, L.zoomMin, L.zoomMax);
    setPan(view.targetX, view.targetZ);
  };
  const overviewView = (): CameraView => ({ ...home, pitchDeg: L.overviewPitchDeg, zoom: L.overviewZoom });

  // Pointer: right drag turns and tilts, middle drag pans, wheel zooms.
  const onContextMenu = (event: Event): void => event.preventDefault();
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 1 && event.button !== 2) return;
    drag = { kind: event.button === 2 ? "turn" : "pan", x: event.clientX, y: event.clientY, moved: 0, pointer: event.pointerId };
    dom.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent): void => {
    const rect = dom.getBoundingClientRect?.();
    if (rect) pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, inside: true };
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    mode = "free";
    if (drag.kind === "turn") {
      turn(-dx * 0.3 * options.sensitivity, false);
      tilt(dy * 0.22 * options.sensitivity * (options.invertY ? -1 : 1));
    } else {
      const mpp = metresPerPixel();
      pan(-dx * mpp, -dy * mpp / Math.max(0.5, Math.sin(now.pitch * DEG)));
    }
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (!drag || drag.pointer !== event.pointerId) return;
    lastDragPx = drag.moved;
    drag = null;
    if (dom.hasPointerCapture?.(event.pointerId)) dom.releasePointerCapture(event.pointerId);
  };
  const onPointerLeave = (): void => {
    pointer = { ...pointer, inside: false };
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    mode = "free";
    zoomBy(Math.exp(event.deltaY * (event.ctrlKey ? 0.01 : 0.0011) * options.sensitivity));
  };
  dom.addEventListener("contextmenu", onContextMenu);
  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerup", onPointerUp);
  dom.addEventListener("pointercancel", onPointerUp);
  dom.addEventListener("pointerleave", onPointerLeave);
  dom.addEventListener("wheel", onWheel, { passive: false });

  const rig: CameraRig = {
    get yawDeg() {
      return now.yaw;
    },
    get pitchDeg() {
      return now.pitch;
    },
    get zoom() {
      return now.zoom;
    },
    get target() {
      return { x: now.x, z: now.z };
    },
    get dragging() {
      return drag !== null;
    },
    get lastDragPx() {
      return lastDragPx;
    },

    handleAction(action: string): boolean {
      switch (action) {
        case "rotate-left":
          turn(-L.rotateStepDeg, true);
          break;
        case "rotate-right":
          turn(L.rotateStepDeg, true);
          break;
        case "tilt-up":
          tilt(L.tiltStepDeg);
          break;
        case "tilt-down":
          tilt(-L.tiltStepDeg);
          break;
        case "zoom-in":
          zoomBy(1 / L.zoomStep);
          break;
        case "zoom-out":
          zoomBy(L.zoomStep);
          break;
        case "camera-reset":
          // Alt + 0: back to the default view; pressed again there, the 75° overview (and back).
          if (mode === "home" && atGoal(home)) {
            goTo(overviewView());
            mode = "overview";
          } else {
            rig.reset();
          }
          return true;
        default:
          return false;
      }
      mode = "free";
      return true;
    },

    reset(): void {
      goTo(home);
      mode = "home";
    },

    setView(view: Partial<CameraView>, snap = false): void {
      goTo({
        yawDeg: view.yawDeg ?? goal.yaw,
        pitchDeg: view.pitchDeg ?? goal.pitch,
        zoom: view.zoom ?? goal.zoom,
        targetX: view.targetX ?? goal.x,
        targetZ: view.targetZ ?? goal.z,
      });
      if (view.yawDeg !== undefined) goal.yaw = view.yawDeg;
      mode = "free";
      if (snap) Object.assign(now, goal);
    },

    configure(next: Partial<CameraOptions>): void {
      Object.assign(options, next);
      options.sensitivity = clamp(options.sensitivity, 0.25, 3);
      trauma.scale = clamp(options.shakeScale, 0, 1);
      trauma.reduced = options.reducedMotion;
    },

    shake(pixels: number): void {
      const px = clamp(pixels, 0, DRAGON.trauma.maxPx);
      // shake = trauma² × maxPx, so this trauma peaks at `pixels`.
      trauma.add(Math.sqrt(px / DRAGON.trauma.maxPx));
    },

    kick(dx: number, dy: number, px: number): void {
      trauma.kick(dx, dy, px);
    },

    update(dt: number): void {
      const step = clamp(dt, 0, 0.1);
      if (options.edgePan && pointer.inside && !drag) {
        const width = dom.clientWidth;
        const height = dom.clientHeight;
        const sx = pointer.x < L.edgePx ? -1 : pointer.x > width - L.edgePx ? 1 : 0;
        const sz = pointer.y < L.edgePx ? -1 : pointer.y > height - L.edgePx ? 1 : 0;
        if (sx !== 0 || sz !== 0) {
          mode = "free";
          pan(sx * L.edgeSpeedMps * now.zoom * step, sz * L.edgeSpeedMps * now.zoom * step);
        }
      }
      const k = 1 - Math.exp(-step * L.ease);
      now.yaw += (goal.yaw - now.yaw) * k;
      now.pitch += (goal.pitch - now.pitch) * k;
      now.zoom += (goal.zoom - now.zoom) * k;
      now.x += (goal.x - now.x) * k;
      now.z += (goal.z - now.z) * k;
      const distance = map.camera.distanceM * now.zoom;
      const pitch = now.pitch * DEG;
      const yaw = now.yaw * DEG;
      const flat = Math.cos(pitch) * distance;
      camera.position.set(now.x + Math.sin(yaw) * flat, L.lookY + Math.sin(pitch) * distance, now.z + Math.cos(yaw) * flat);
      camera.lookAt(now.x, L.lookY, now.z);
      camera.updateMatrixWorld();

      // Shake: shift the projection by whole CSS pixels (≤ 12 px at 1080p), never the camera.
      const height = Math.max(1, dom.clientHeight);
      trauma.update(step, height);
      const ox = trauma.offsetX;
      const oy = trauma.offsetY;
      if (Math.abs(ox) + Math.abs(oy) > 0.01) {
        camera.updateProjectionMatrix();
        const width = Math.max(1, dom.clientWidth);
        camera.projectionMatrix.elements[8] = (-2 * ox) / width;
        camera.projectionMatrix.elements[9] = (2 * oy) / height;
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        shaking = true;
      } else if (shaking) {
        camera.updateProjectionMatrix();
        shaking = false;
      }
    },

    dispose(): void {
      dom.removeEventListener("contextmenu", onContextMenu);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("pointerleave", onPointerLeave);
      dom.removeEventListener("wheel", onWheel);
    },
  };
  rig.reset();
  Object.assign(now, goal);
  return rig;
}
