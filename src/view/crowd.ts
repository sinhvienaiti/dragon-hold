/**
 * Instanced crowd of grey-box foes and units: one instanced primitive per
 * family and gait (biped capsule, quadruped low box, flyer sphere, swarm tiny
 * box), per-instance hit flash, squash and tint (05 §5), later skinned crowd
 * from the owner's GLB. Source to adapt: Space src/defense/view/crowd.ts.
 * Owner: view-crowd-fx (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Group } from "three";
import type { PlaceholderDef } from "../content/types";

export interface CrowdInstance {
  x: number;
  y: number;
  z: number;
  /** Heading in radians (view only). */
  yaw: number;
  /** 0–1 hit flash, squash factor, tint mix. */
  flash: number;
  squash: number;
}

export interface Crowd {
  readonly group: Group;
  /** Reserves an instance of `shape`; returns its handle. */
  add(shape: PlaceholderDef): number;
  remove(handle: number): void;
  set(handle: number, instance: CrowdInstance): void;
  /** Uploads instance buffers once a frame. */
  flush(): void;
  dispose(): void;
}

export function createCrowd(capacity: number): Crowd {
  // TODO(view-crowd-fx)
  throw new Error("view/crowd: not built yet (view-crowd-fx lane)");
}
