import { defineConfig } from 'tsdown'

/**
 * Build each bundled public entry independently so shared code is inlined.
 * A multi-entry build emits an unlisted hash-named chunk outside the package's
 * exact published-file inventory. The session companion ships from the tsc
 * artifact plane because its dependencies remain package imports.
 */
export default defineConfig([
  {
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    entry: ['lib/types/invariant.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
])
