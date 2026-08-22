/**
 * Worktree 测试配置:跑 waibrain-e2e 下的 spec(编排器单测 + B0 组合测试)
 * 以及 agent-options-effort.spec.ts(仓库改动配套单测)。
 * 复用主仓库 tsconfig paths(@deepseek-ai 包名映射到 packages 源码);
 * 依赖从主仓库 node_modules 以相对路径直连(worktree 自身无 node_modules)。
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from '../../node_modules/vite-tsconfig-paths/dist/index.js'
import { standardDecoratorPlugin, vitestExecArgv } from '../../vitest.shared.ts'

const worktreeRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: worktreeRoot,
  plugins: [tsconfigPaths({ root: worktreeRoot, projects: ['tsconfig.base.json'] }), standardDecoratorPlugin()],
  test: {
    // tsx 的 ESM hook 让运行期动态 import(Loader 挂载预设行)也走 tsconfig paths → worktree 源码。
    execArgv: [...vitestExecArgv, '--import', 'tsx/esm'],
    include: [
      'waibrain-e2e/**/*.spec.ts',
      'packages/core/agent-loop/tests/agent-options-effort.spec.ts',
    ],
    testTimeout: 60_000,
    cacheDir: '../../node_modules/.vitest-waibrain',
  },
})
