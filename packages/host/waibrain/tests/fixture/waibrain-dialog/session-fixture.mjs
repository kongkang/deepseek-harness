/** Source-test mirror of the built WaiBrain preset companion. */
export const name = 'waibrain-session-fixture'
export const inject = ['systemPrompt', 'tools']

export function apply(ctx) {
  ctx.systemPrompt.section({
    name: 'deployment:persona',
    order: 0,
    complete: true,
    text: context => context.agent === undefined
      ? '你是一个自然、简洁、友善的对话伙伴。请直接回应用户，不调用工具。'
      : ctx.get('waibrainHost')?.personaForSession(context.agent.id)
        ?? '你是一个自然、简洁、友善的对话伙伴。请直接回应用户，不调用工具。',
  })
  ctx.systemPrompt.suppressRuntimeContext()
  ctx.tools.restrict({ allow: [] })
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const ref = context.agent === undefined ? undefined : ctx.get('waibrainHost')?.modelSelectionForSession(context.agent.id)
    if (ref === undefined) return assembled
    ref.assembled = ref.current
    return { ...assembled, variables: { ...assembled.variables, provider: ref.current?.provider, model: ref.current?.model } }
  })
  ctx.on('agent/request', async ({ agent }, next) => {
    const resolved = await next()
    const selected = ctx.get('waibrainHost')?.modelSelectionForSession(agent.id).assembled
    if (selected === undefined) return resolved
    const { reasoningEffort: _ignored, ...rest } = resolved
    return { ...rest, ...selected }
  })
  ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
    const host = ctx.get('waibrainHost')
    if (host === undefined || !host.isBoundSession(agent.id)) return next()
    return await host.authorizeMessages(agent, messages) ? next() : { kind: 'reject' }
  })
}
