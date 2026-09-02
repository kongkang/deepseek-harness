/** Run the DSH Web Host and standalone WaiBrain Vite surface as one process group. */

import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const hostPort = process.env.WAIBRAIN_DSH_PORT ?? '4174'
const uiPort = process.env.WAIBRAIN_UI_PORT ?? '5173'
const host = spawn(process.execPath, [
  '--import', 'tsx/esm', join(root, 'apps/cli/src/bin.ts'),
  'web', '--no-open', '--port', hostPort,
], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'inherit'] })
const children: ChildProcess[] = [host]
let stopping = false

/**
 * The Host's /api carrier authenticates a browser session minted from the
 * launch token printed as `dsh web: <url>?token=…`. The Vite surface runs on
 * its own origin, so its proxy must carry that session cookie to the Host.
 * @param chunk - one stdout piece of the Host process.
 * @returns the launch-token URL when this chunk printed it.
 */
function launchUrlOf(chunk: string): string | undefined {
  return /^dsh web: (\S+)$/m.exec(chunk)?.[1]
}

let launchUrl: string | undefined
host.stdout.on('data', (chunk: Buffer) => {
  process.stdout.write(chunk)
  launchUrl ??= launchUrlOf(chunk.toString('utf8'))
})

function exited(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    child.once('exit', () => {
      resolve()
    })
  })
}

async function stop(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal)
  }
  await Promise.all(children.map(exited))
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void stop(signal) })
}

function observe(child: ChildProcess): void {
  child.once('exit', (code, signal) => {
    if (stopping) return
    void stop().then(() => {
      process.exitCode = code ?? (signal === null ? 1 : 0)
    })
  })
}

async function waitForHost(): Promise<void> {
  const deadline = Date.now() + 30_000
  const url = `http://127.0.0.1:${hostPort}/`
  while (!stopping && Date.now() < deadline) {
    if (host.exitCode !== null || host.signalCode !== null) {
      throw new Error('DSH Host exited before becoming ready')
    }
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) })
      return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  if (!stopping) throw new Error(`DSH Host did not become ready at ${url}`)
}

async function start(): Promise<void> {
  const deadline = Date.now() + 30_000
  while (launchUrl === undefined && !stopping && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (stopping) return
  if (launchUrl === undefined) {
    throw new Error('DSH Host printed no launch-token URL; the UI cannot establish its browser session')
  }
  await waitForHost()
  const token = new URL(launchUrl).searchParams.get('token') ?? ''
  const ui = spawn(join(root, 'apps/web/node_modules/.bin/vite'), [
    join(root, 'apps/waibrain'), '--host', '127.0.0.1', '--port', uiPort, '--strictPort',
  ], {
    cwd: root,
    env: {
      ...process.env,
      WAIBRAIN_DSH_URL: `http://127.0.0.1:${hostPort}`,
      WAIBRAIN_DSH_TOKEN: token,
    },
    stdio: 'inherit',
  })
  children.push(ui)
  observe(ui)
}

observe(host)
void start().catch((error: unknown) => {
  if (stopping) return
  console.error(String(error))
  process.exitCode = 1
  void stop()
})
