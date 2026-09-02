/** Thin Agent-preset companion for WaiBrain-bound and neutral Sessions. */

import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection, type ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { PERSONA_SECTION } from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { NEUTRAL_WAIBRAIN_PERSONA } from './composition.ts'

/** Cordis plugin name. */
export const name = 'waibrain-session'
/** Services always needed by the preset companion. */
export const inject = ['systemPrompt', 'tools']

/** Register the complete dynamic persona, zero-tool mask, route, and admission guard. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: PERSONA_SECTION,
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA'),
    complete: true,
    text: (context) => {
      const host = ctx.get('waibrainHost')
      return context.agent === undefined
        ? NEUTRAL_WAIBRAIN_PERSONA
        : host?.personaForSession(context.agent.id) ?? NEUTRAL_WAIBRAIN_PERSONA
    },
  }), 'waibrainSession.persona()')
  ctx.systemPrompt.suppressRuntimeContext()
  ctx.tools.restrict({ allow: [] })

  ctx.on('agent/created', ({ agent }) => {
    const host = ctx.get('waibrainHost')
    const selection = host?.modelSelectionForSession(agent.id)
      ?? { current: undefined, assembled: undefined } satisfies ModelSelectionRef
    installModelSelection(agent.ctx, selection)
  })

  ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
    const host = ctx.get('waibrainHost')
    if (host === undefined || !host.isBoundSession(agent.id)) return next()
    if (await host.authorizeMessages(agent, messages)) return next()
    return { kind: 'reject' }
  })
}
