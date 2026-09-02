/** Standalone WaiBrain development and build configuration. */

const dshTarget = process.env.WAIBRAIN_DSH_URL ?? 'http://127.0.0.1:4174'
const dshToken = process.env.WAIBRAIN_DSH_TOKEN ?? ''

/**
 * The Host's /api carrier authenticates one browser session minted from the
 * launch token. This surface runs on its own origin, so its proxy carries the
 * session cookie to the Host; the exchange runs once per dev server start.
 * @returns the `name=value` session cookie, or undefined when no token was supplied.
 */
async function hostSessionCookie(): Promise<string | undefined> {
  if (dshToken === '') return undefined
  const login = await fetch(`${dshTarget}/?token=${encodeURIComponent(dshToken)}`, {
    redirect: 'manual',
    headers: { origin: dshTarget },
  })
  const setCookie = login.headers.get('set-cookie')
  if (login.status !== 303 || setCookie === null) {
    throw new Error(`WaiBrain dev proxy could not establish a Host session (HTTP ${String(login.status)})`)
  }
  return setCookie.split(';', 1)[0]
}

const sessionCookie = await hostSessionCookie()

export default {
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: dshTarget,
        changeOrigin: true,
        headers: {
          origin: dshTarget,
          ...(sessionCookie === undefined ? {} : { cookie: sessionCookie }),
        },
        ws: true,
      },
    },
  },
}
