/**
 * Per-frame scene hooks nobody restores by hand (quality rescue wave 1 review, 01/11): the first call for a scene
 * installs one scene.onBeforeRender and one scene.onAfterRender that run what was there, then every registered
 * hook in order. A presenter adds its own and its dispose removes only its own, so a replay that disposes an older
 * run after a newer one was built (app.ts retires the last run's views) drops nobody else's hook. Iterates arrays
 * by index: nothing allocated per frame.
 * Owner: view-terrain (LANES.md).
 */
import type * as THREE from "three";

export type SceneHook = THREE.Scene["onBeforeRender"];
type Phase = "before" | "after";

const registry = new WeakMap<THREE.Scene, Record<Phase, SceneHook[]>>();

/** Adds `hook` to run before (or after) every render of `scene`; returns its remover (idempotent). */
export function addSceneHook(scene: THREE.Scene, phase: Phase, hook: SceneHook): () => void {
  let hooks = registry.get(scene);
  if (hooks === undefined) {
    const made: Record<Phase, SceneHook[]> = { before: [], after: [] };
    const ownBefore = scene.onBeforeRender;
    const ownAfter = scene.onAfterRender;
    scene.onBeforeRender = function (this: THREE.Scene, renderer, s, camera, geometry, material, group) {
      ownBefore.call(this, renderer, s, camera, geometry, material, group);
      const list = made.before;
      for (let i = 0; i < list.length; i += 1) list[i]!.call(this, renderer, s, camera, geometry, material, group);
    };
    scene.onAfterRender = function (this: THREE.Scene, renderer, s, camera, geometry, material, group) {
      const list = made.after;
      for (let i = 0; i < list.length; i += 1) list[i]!.call(this, renderer, s, camera, geometry, material, group);
      ownAfter.call(this, renderer, s, camera, geometry, material, group);
    };
    registry.set(scene, made);
    hooks = made;
  }
  const list = hooks[phase];
  list.push(hook);
  return () => {
    const at = list.indexOf(hook);
    if (at >= 0) list.splice(at, 1);
  };
}
