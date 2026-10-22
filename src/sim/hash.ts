/**
 * World hashing for golden tests (05 §10): a structural FNV-1a walk over the
 * mutable state, in property insertion order (deterministic code creates its
 * objects in the same order on Node and in every browser). Integers mix as
 * 32-bit words; any other number mixes its float bits, so a stray float still
 * hashes the same everywhere while a test can flag it.
 * Owner: architect for M0a setup, sim-battle afterwards (LANES.md).
 */

const PRIME = 0x01000193;
const OFFSET = 0x811c9dc5;
const floatBox = new Float64Array(1);
const floatWords = new Uint32Array(floatBox.buffer);

export const mix = (hash: number, value: number): number => Math.imul(hash ^ (value | 0), PRIME);

export function mixNumber(hash: number, value: number): number {
  if (Number.isSafeInteger(value)) {
    // Low and high 32 bits, so values past 2^31 (u squared) still count.
    const high = Math.floor(value / 4294967296);
    return mix(mix(mix(hash, 1), value >>> 0), high | 0);
  }
  floatBox[0] = value;
  return mix(mix(mix(hash, 2), floatWords[0]!), floatWords[1]!);
}

export function mixString(hash: number, value: string): number {
  let h = mix(hash, 3 + value.length);
  for (let index = 0; index < value.length; index += 1) h = mix(h, value.charCodeAt(index));
  return h;
}

/** Folds `value` (numbers, strings, booleans, null, arrays, typed arrays, Maps, Sets, plain objects) into `hash`, skipping keys in `skip`. */
export function mixValue(hash: number, value: unknown, skip: ReadonlySet<string>): number {
  if (value === null || value === undefined) return mix(hash, value === null ? 4 : 5);
  switch (typeof value) {
    case "number":
      return mixNumber(hash, value);
    case "boolean":
      return mix(hash, value ? 7 : 6);
    case "string":
      return mixString(hash, value);
    case "function":
      return hash;
    case "object":
      break;
    default:
      return mixString(hash, String(value));
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as ArrayLike<number>;
    let h = mix(hash, 8 + view.length);
    for (let index = 0; index < view.length; index += 1) h = mixNumber(h, view[index]!);
    return h;
  }
  if (Array.isArray(value)) {
    let h = mix(hash, 9 + value.length);
    for (const item of value) h = mixValue(h, item, skip);
    return h;
  }
  if (value instanceof Map) {
    let h = mix(hash, 10 + value.size);
    for (const [key, item] of value) h = mixValue(mixValue(h, key, skip), item, skip);
    return h;
  }
  if (value instanceof Set) {
    let h = mix(hash, 11 + value.size);
    for (const item of value) h = mixValue(h, item, skip);
    return h;
  }
  let h = mix(hash, 12);
  for (const key of Object.keys(value)) {
    if (skip.has(key)) continue;
    h = mixValue(mixString(h, key), (value as Record<string, unknown>)[key], skip);
  }
  return h;
}

export function hashValue(value: unknown, skip: ReadonlySet<string> = new Set()): number {
  return mixValue(OFFSET, value, skip) >>> 0;
}

export const hex32 = (hash: number): string => (hash >>> 0).toString(16).padStart(8, "0");
