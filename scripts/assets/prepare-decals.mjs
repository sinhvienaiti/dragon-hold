#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareTextures, runPrepare } from './prepare-ground.mjs';

/** Decal sheets retain their layout and alpha; no cropping or colour keying. */
export function prepareDecals(options = {}) {
  return prepareTextures({ ...options, kind: 'decals' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runPrepare('decals');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
