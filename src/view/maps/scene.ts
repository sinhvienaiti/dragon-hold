/**
 * Map pilot (parent docs/tools/map-factory/MAP_PLAN.md §2.1, §3.3 A1): the
 * scenery spec of a map, `src/view/maps/<id>.map.json`. It holds what the
 * spike kept as hand constants (cliff line, footpath routes, pond and grove
 * sites) as pinned scenery, plus the light. View only: the sim never reads it
 * (simHash unchanged). Integers in cm, permille and degrees in the file;
 * metres here. Stage B replaces pinned sites by the core's `auto` rules.
 * Owner: map pilot.
 */
import type { MapDef, Vec2 } from "../../content/types";
import L2_CAU from "./L2-cau.map.json";

export type SceneAnchor =
  | { readonly dais: number | "pond" }
  | { readonly edge: number }
  | { readonly pond: true | number }
  | { readonly river: number }
  | { readonly cliff: number }
  | { readonly point: Vec2 }
  | { readonly path: string; readonly at: number };

export interface SceneFootpath {
  readonly id: string;
  readonly from: SceneAnchor;
  readonly to: SceneAnchor;
  /** Bow as a share of the chord (+ left of from→to). */
  readonly bend: number;
  /** "main" (lantern route, full cover) or "branch" (narrow, grass crown). */
  readonly tier: "main" | "branch";
}

export interface SceneCliff {
  readonly id: string;
  readonly line: readonly Vec2[];
  readonly heightM: number;
  /** Steps of the face (stage A: 3 tiers of about 3 m). */
  readonly tiers: number;
}

export interface ScenePond {
  readonly id: string;
  readonly at: Vec2;
  readonly radiusM: number;
}

export interface SceneGrove {
  readonly id: string;
  readonly at: Vec2;
  readonly radiusM: number;
  /** Warm crowns (tinted round trees, MAP_PLAN V7) allowed on this grove's outer face. */
  readonly warm: boolean;
  /** The species holding ≥ 70 % of the grove (V4), a kit prop key; by rule when absent. */
  readonly dominant?: string;
}

/** V1: the open meadow arc (bearings, from → to clockwise) and its ring. */
export interface SceneOpen {
  readonly fromDeg: number;
  readonly toDeg: number;
  readonly ringM: readonly [number, number];
}

/** A forest-edge bay (V6): the skirt forest starts this much further out over a bearing span. */
export interface SceneBay {
  readonly bearingDeg: number;
  readonly halfWidthDeg: number;
  readonly depthM: number;
}

export interface SceneLighting {
  readonly sunBearingDeg: number;
  readonly sunElevationDeg: number;
  /** Hemisphere light colours (MAP_PLAN 2.5: grey-green ground bounce, not violet). */
  readonly hemiSky?: string;
  readonly hemiGround?: string;
  readonly hemiIntensity?: number;
  /** Radial mist from fogNearM to fogFarM (2.5: none inside 50 m). */
  readonly fogNearM?: number;
  readonly fogFarM?: number;
}

export interface SceneSpec {
  readonly id: string;
  readonly lighting: SceneLighting;
  readonly cliffs: readonly SceneCliff[];
  readonly ponds: readonly ScenePond[];
  readonly footpaths: readonly SceneFootpath[];
  readonly groves: readonly SceneGrove[];
  readonly bays: readonly SceneBay[];
  readonly open: SceneOpen | null;
}

type Json = typeof L2_CAU;
type RawAnchor = Record<string, unknown>;

const cm = (value: number): number => value / 100;
const point = (value: readonly number[]): Vec2 => [cm(value[0]!), cm(value[1]!)];

function anchor(raw: RawAnchor): SceneAnchor {
  if ("dais" in raw) return { dais: raw.dais as number | "pond" };
  if ("edge" in raw) return { edge: raw.edge as number };
  if ("pond" in raw) return { pond: raw.pond as true | number };
  if ("river" in raw) return { river: raw.river as number };
  if ("cliff" in raw) return { cliff: raw.cliff as number };
  if ("pointCm" in raw) return { point: point(raw.pointCm as number[]) };
  return { path: raw.path as string, at: (raw.atPermille as number) / 1000 };
}

/** Reads one map's scenery spec (cm → m). */
export function readScene(json: Json): SceneSpec {
  const scene = json.scene as Record<string, unknown>;
  const list = <T>(key: string): T[] => (Array.isArray(scene[key]) ? (scene[key] as T[]) : []);
  return {
    id: json.id,
    lighting: (() => {
      const l = json.lighting as { sunBearingDeg: number; sunElevationDeg: number; hemiSky?: string; hemiGround?: string; hemiIntensityPermille?: number; fogNearCm?: number; fogFarCm?: number };
      return {
        sunBearingDeg: l.sunBearingDeg,
        sunElevationDeg: l.sunElevationDeg,
        ...(l.hemiSky ? { hemiSky: l.hemiSky } : {}),
        ...(l.hemiGround ? { hemiGround: l.hemiGround } : {}),
        ...(l.hemiIntensityPermille ? { hemiIntensity: l.hemiIntensityPermille / 1000 } : {}),
        ...(l.fogNearCm ? { fogNearM: cm(l.fogNearCm) } : {}),
        ...(l.fogFarCm ? { fogFarM: cm(l.fogFarCm) } : {}),
      };
    })(),
    cliffs: list<{ id: string; lineCm: number[][]; heightCm: number; tiers?: number }>("cliffs").map((c) => ({ id: c.id, line: c.lineCm.map(point), heightM: cm(c.heightCm), tiers: c.tiers ?? 2 })),
    ponds: list<{ id: string; atCm: number[]; radiusCm: number }>("ponds").map((p) => ({ id: p.id, at: point(p.atCm), radiusM: cm(p.radiusCm) })),
    footpaths: list<{ id: string; from: RawAnchor; to: RawAnchor; bendPermille: number; tier?: string }>("footpaths").map((f) => ({
      id: f.id,
      from: anchor(f.from),
      to: anchor(f.to),
      bend: f.bendPermille / 1000,
      tier: f.tier === "main" ? "main" : "branch",
    })),
    groves: list<{ id: string; atCm: number[]; radiusCm: number; warm?: boolean; dominant?: string }>("groves").map((g) => ({
      id: g.id,
      at: point(g.atCm),
      radiusM: cm(g.radiusCm),
      warm: g.warm === true,
      ...(g.dominant ? { dominant: "props/pine-river-" + g.dominant } : {}),
    })),
    bays: list<{ bearingDeg: number; halfWidthDeg: number; depthCm: number }>("bays").map((b) => ({ bearingDeg: b.bearingDeg, halfWidthDeg: b.halfWidthDeg, depthM: cm(b.depthCm) })),
    open: (() => {
      const o = scene.open as { fromDeg: number; toDeg: number; ringCm: number[] } | undefined;
      return o ? { fromDeg: o.fromDeg, toDeg: o.toDeg, ringM: [cm(o.ringCm[0]!), cm(o.ringCm[1]!)] as const } : null;
    })(),
  };
}

const SCENES: Readonly<Record<string, SceneSpec>> = { [L2_CAU.id]: readScene(L2_CAU) };

/** The map's scenery spec, or null (the layout then sites everything by rule). */
export function sceneFor(map: MapDef): SceneSpec | null {
  return SCENES[map.id] ?? null;
}

/** Unit vector toward the sun from bearing (0 = north, −z; 90 = east, +x) and elevation. */
export function sunVector(lighting: SceneLighting): [number, number, number] {
  const b = (lighting.sunBearingDeg * Math.PI) / 180;
  const e = (lighting.sunElevationDeg * Math.PI) / 180;
  return [Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)];
}
