/** Package-owned invariant companion. @module @deepseek-ai/dsh-host-waibrain/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-waibrain'
export const name = 'host-waibrain-invariant'
export const inject = ['invariants']
/** No runtime invariant: standard Session events and the storage-domain schema own every durable relationship. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
