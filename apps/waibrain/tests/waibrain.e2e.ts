/// <reference types="node" />
/** Keyless browser E2E over the real DSH Host and standalone WaiBrain Vite surface. */

import { createRequire } from 'node:module'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from '../../web/tests/scaffold.ts'
import { REPO_ROOT } from '../../web/tests/support.ts'

const APP_ROOT = join(REPO_ROOT, 'apps/waibrain')
const MAIN_FIXTURE = join(APP_ROOT, 'tests/fixtures/main.jsonl')
const CHILD_FIXTURES = [
  join(APP_ROOT, 'tests/fixtures/facts.jsonl'),
  join(APP_ROOT, 'tests/fixtures/tasks.jsonl'),
  join(APP_ROOT, 'tests/fixtures/memory.jsonl'),
]

interface ViteServer {
  httpServer: { address(): AddressInfo | string | null }
  listen(): Promise<void>
  close(): Promise<void>
}

interface ViteModule {
  createServer(config: Record<string, unknown>): Promise<ViteServer>
}

async function freePort(): Promise<number> {
  const server = createNetServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('port probe returned no address')
  await new Promise<void>((resolve, reject) => server.close((error) => {
    if (error === undefined) resolve()
    else reject(error)
  }))
  return address.port
}

describe('WaiBrain browser E2E', () => {
  let scaffold: WebScaffold
  let vite: ViteServer
  let browser: Browser
  let page: Page
  const pageErrors: string[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      replayFixture: MAIN_FIXTURE,
      replayChildFixtures: CHILD_FIXTURES,
      paceMs: 2,
    })
    const requireFromWeb = createRequire(join(REPO_ROOT, 'apps/web/package.json'))
    const viteEntry = requireFromWeb.resolve('vite')
    const viteModule = await import(pathToFileURL(viteEntry).href) as ViteModule
    const port = await freePort()
    vite = await viteModule.createServer({
      root: APP_ROOT,
      configFile: false,
      logLevel: 'error',
      server: {
        host: '127.0.0.1',
        port,
        strictPort: true,
        proxy: {
          '/api': {
            target: scaffold.baseUrl,
            changeOrigin: true,
            headers: { origin: scaffold.baseUrl },
            ws: true,
          },
        },
      },
    })
    await vite.listen()
    const address = vite.httpServer.address()
    if (address === null || typeof address === 'string') throw new Error('WaiBrain Vite server has no TCP address')
    const playwrightEntry = requireFromWeb.resolve('playwright')
    const playwright = await import(pathToFileURL(playwrightEntry).href) as typeof import('playwright')
    browser = await playwright.chromium.launch()
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' })
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto(`http://127.0.0.1:${String(address.port)}/`, { waitUntil: 'load' })
    await page.getByLabel('主对话模型').waitFor({ timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await vite?.close()
    await scaffold?.close()
  })

  it('creates 1+N real Sessions with independent prompts and a live attachment', async () => {
    const createButton = page.getByRole('button', { name: '保存角色并创建对话' })
    if (!await createButton.isEnabled()) {
      const alerts = await page.getByRole('alert').allTextContents()
      throw new Error(`WaiBrain setup did not become ready: ${alerts.join(' | ')}`)
    }
    await createButton.click()
    await page.getByRole('heading', { name: '与林川对话' }).waitFor({ timeout: 30_000 })

    await page.getByRole('button', { name: '添加脑分支' }).click()
    await page.getByLabel('新分支名称').fill('长期记忆')
    await page.getByLabel('新分支职责').fill('只关注可复用的长期偏好')
    await page.getByLabel('新分支 System Prompt').fill('只汇报值得长期保留的用户偏好。')
    await page.getByRole('button', { name: '挂接到当前对话' }).click()
    await page.getByRole('heading', { name: '长期记忆' }).waitFor({ timeout: 30_000 })

    expect(await page.locator('.runtime-branch-card').count()).toBe(3)
    expect(await page.locator('.runtime-branch-card .branch-meta').filter({ hasText: 'Session' }).count()).toBe(3)
    const prompts = await page.locator('.runtime-prompt p').allTextContents()
    expect(prompts).toEqual(expect.arrayContaining([
      expect.stringContaining('需要外部查证'),
      expect.stringContaining('任务、承诺和行动线索'),
      expect.stringContaining('值得长期保留'),
    ]))
  })

  it('runs all four model flows and pushes each branch report through the main Session', async () => {
    const input = page.getByLabel('给林川发消息')
    await input.fill('我想先做一个能验证这个结构的 Demo。')
    await page.getByRole('button', { name: '发送' }).click()

    await page.getByText('我听见了。我们先把这个想法收敛成一个能验证的最小场景。').waitFor({ timeout: 30_000 })
    try {
      await expect.poll(
        () => page.getByText('已推送主对话', { exact: true }).count(),
        { timeout: 30_000 },
      ).toBe(3)
    } catch (error: unknown) {
      const branchState = await page.locator('.runtime-branch-card').allTextContents()
      const alerts = await page.getByRole('alert').allTextContents()
      throw new Error(`brain reports did not settle: ${[...alerts, ...branchState].join(' | ')}`, { cause: error })
    }
    await page.getByText('我们可以先写下一条可验证的产品假设。').waitFor({ timeout: 30_000 })
    expect(await page.getByText('[[silence]]', { exact: true }).count()).toBe(0)
  })

  it('keeps every timeline lane aligned to the matching header', async () => {
    await page.getByRole('button', { name: '认知时间轴' }).click()
    const headers = page.locator('[data-timeline-grid="header"] > .lane-heading')
    const cells = page.locator('[data-timeline-grid="消息 01"] > .timeline-cell')
    await expect.poll(() => headers.count()).toBe(5)
    expect(await cells.count()).toBe(5)
    for (let index = 0; index < 5; index++) {
      const header = await headers.nth(index).boundingBox()
      const cell = await cells.nth(index).boundingBox()
      if (header === null || cell === null) throw new Error(`timeline lane ${String(index)} has no box`)
      expect(Math.abs(header.x - cell.x)).toBeLessThan(1)
      expect(Math.abs(header.width - cell.width)).toBeLessThan(1)
    }
    expect(pageErrors).toEqual([])
  })
})
