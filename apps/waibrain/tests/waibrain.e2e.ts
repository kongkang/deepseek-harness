/// <reference types="node" />
/** Keyless browser E2E over the real Host-owned WaiBrain domain and replayed model flow. */

import { createRequire } from 'node:module'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from '../../web/tests/scaffold.ts'
import { REPO_ROOT, type Browser, type Page, type PlaywrightModule } from '../../web/tests/support.ts'

const APP_ROOT = join(REPO_ROOT, 'apps/waibrain')
const MAIN_FIXTURE = join(APP_ROOT, 'tests/fixtures/main.jsonl')
const BRAIN_FIXTURE = join(APP_ROOT, 'tests/fixtures/brain.jsonl')

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
      replayChildFixtures: [BRAIN_FIXTURE],
      paceMs: 2,
    })
    const requireFromWeb = createRequire(join(REPO_ROOT, 'apps/web/package.json'))
    const viteModule = await import(pathToFileURL(requireFromWeb.resolve('vite')).href) as ViteModule
    const port = await freePort()
    vite = await viteModule.createServer({
      root: APP_ROOT,
      configFile: false,
      logLevel: 'error',
      server: {
        host: '127.0.0.1',
        port,
        strictPort: true,
        proxy: { '/api': { target: scaffold.baseUrl, changeOrigin: true, headers: { origin: scaffold.baseUrl }, ws: true } },
      },
    })
    await vite.listen()
    const address = vite.httpServer.address()
    if (address === null || typeof address === 'string') throw new Error('WaiBrain Vite server has no TCP address')
    const playwright = await import(pathToFileURL(requireFromWeb.resolve('playwright')).href) as PlaywrightModule
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

  it('persists an Agent and manages its external brain from the live right rail', async () => {
    await page.getByRole('button', { name: '新建 Agent' }).click()
    await page.getByLabel('角色名称').fill('浏览器验收 Agent')
    await page.getByRole('button', { name: '保存 Agent' }).last().click()
    await page.getByText('Agent 已保存为配置 v1。').waitFor()

    await page.getByRole('button', { name: '添加外挂外脑' }).last().click()
    await page.getByLabel('外挂外脑名称').fill('反方审视')
    await page.getByLabel('外挂外脑职责').fill('识别关键假设')
    await page.getByLabel('人格提示词').fill('从反方独立回答。')
    await page.getByRole('button', { name: '保存外挂外脑' }).click()
    await page.getByRole('button', { name: '新对话' }).click()
    await page.getByRole('heading', { name: '与浏览器验收 Agent对话' }).waitFor()

    const rail = page.getByRole('complementary')
    await rail.getByRole('button', { name: '编辑 反方审视' }).click()
    await rail.getByLabel('外挂外脑职责').fill('从右侧栏识别关键假设')
    await rail.getByRole('button', { name: '保存外挂外脑' }).click()
    await rail.getByText('从右侧栏识别关键假设').waitFor()
    await page.getByText(/Agent 已保存为配置 v\d+。/).waitFor()

    await page.reload({ waitUntil: 'load' })
    await page.getByRole('button', { name: '主对话' }).click()
    await page.getByRole('heading', { name: '与浏览器验收 Agent对话' }).waitFor()
    await page.getByRole('complementary').getByText('从右侧栏识别关键假设').waitFor()
  })

  it('renders the main reply, external-brain result, and durable timeline', async () => {
    await page.getByLabel('给浏览器验收 Agent发消息').fill('请评估这个方案。')
    await page.getByRole('button', { name: '发送' }).click()

    await page.getByText('我先回应主对话。').waitFor({ timeout: 30_000 })
    await page.getByText('我吸收了外挂外脑的提醒。').waitFor({ timeout: 30_000 })
    await page.getByRole('complementary').getByText('这是外挂外脑的独立答案。').waitFor({ timeout: 30_000 })
    await page.getByRole('complementary').getByText('已完成并回灌').waitFor({ timeout: 30_000 })

    await page.getByRole('button', { name: '认知时间轴' }).click()
    const round = page.locator('.wb-round').filter({ hasText: '消息 01' })
    await round.getByText('主路：completed').waitFor()
    await round.getByText('这是外挂外脑的独立答案。').waitFor()
    expect(pageErrors).toEqual([])
  })

  it('keeps multiple permanent conversations on the same Agent', async () => {
    await page.getByRole('button', { name: '新对话' }).click()
    const options = page.getByLabel('选择历史对话').locator('option')
    await expect.poll(() => options.count()).toBe(3)
  })
})
