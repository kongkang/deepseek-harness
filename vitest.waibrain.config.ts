import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from './vitest.shared.ts'

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.base.json'] }), standardDecoratorPlugin()],
  test: {
    execArgv: vitestExecArgv,
    setupFiles: ['./scripts/test-invariants.ts'],
    include: [
      'apps/waibrain/tests/**/*.spec.ts',
      'apps/waibrain/tests/**/*.e2e.ts',
    ],
    pool: 'forks',
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
