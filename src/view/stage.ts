/**
 * The WebGL stage: renderer on #dh-canvas, scene, perspective camera (FOV 30°,
 * 05 §3), light rig and layer groups the other view parts add to.
 * Adapt from Space src/defense/view (copy with a source header; never import).
 * Owner: view-terrain (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Group, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { Projector, Quality } from "../app/contracts";

export interface StageLayers {
  readonly ground: Group;
  readonly actors: Group;
  readonly fx: Group;
}

export interface Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly layers: StageLayers;
  readonly quality: Quality;
  /** World metres → CSS pixels, for DOM tags and chips. */
  readonly project: Projector;
  resize(): void;
  render(): void;
  dispose(): void;
}

export function createStage(host: HTMLElement, quality: Quality = "high"): Stage {
  // TODO(view-terrain)
  throw new Error("view/stage: not built yet (view-terrain lane)");
}
