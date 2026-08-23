/** Standalone WaiBrain development and build configuration. */

const dshTarget = process.env.WAIBRAIN_DSH_URL ?? 'http://127.0.0.1:4174'

export default {
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: dshTarget,
        changeOrigin: true,
        headers: { origin: dshTarget },
        ws: true,
      },
    },
  },
}
