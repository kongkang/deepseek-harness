/** First WaiBrain tab backed entirely by the durable Host domain. */

import {
  DshRuntimeClient,
  type ModelCatalog,
  type ModelCatalogEntry,
  type ModelSelection,
  type WaiBrainAgentConfig,
  type WaiBrainAgentRevision,
  type WaiBrainBootstrap,
  type WaiBrainConversationSummary,
  type WaiBrainConversationView,
  type WaiBrainExternalBrain,
  type WaiBrainExternalBrainRound,
  type WaiBrainRuntime,
} from './dsh-runtime.ts'

type View = 'studio' | 'conversation' | 'timeline'

interface BrainEditor {
  id: string | null
}

interface AppState {
  view: View
  loading: boolean
  saving: boolean
  sending: boolean
  error: string
  notice: string
  bootstrap: WaiBrainBootstrap | null
  catalog: ModelCatalog | null
  selectedAgentId: string | null
  selectedConversationId: string | null
  revision: number | null
  draft: WaiBrainAgentConfig
  conversation: WaiBrainConversationView | null
  composer: string
  editor: BrainEditor | null
  editorError: string
}

const colours = ['#635bff', '#d76948', '#168477', '#9b59b6', '#3975c6', '#b27b18'] as const
const icon = {
  brain: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 4.5a3 3 0 0 0-5 2.2 3.2 3.2 0 0 0 .8 6.2A3.5 3.5 0 0 0 9.5 18V4.5Zm5 0a3 3 0 0 1 5 2.2 3.2 3.2 0 0 1-.8 6.2A3.5 3.5 0 0 1 14.5 18V4.5ZM9.5 8H7m7.5 3H17m-7.5 3H7.8m6.7-6H17"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17.5 3.5 21l4-1.5A9 9 0 1 0 5 17.5Z"/><path d="M8 11h8M8 14h5"/></svg>',
  timeline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M7 7h10M7 12h7M7 17h9"/><circle cx="7" cy="7" r="1.5"/><circle cx="7" cy="12" r="1.5"/><circle cx="7" cy="17" r="1.5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Z"/><path d="M7 12h13"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
}

function initialConfig(): WaiBrainAgentConfig {
  return {
    label: '林川',
    role: {
      name: '林川',
      tagline: '陪用户把混乱慢慢想清楚的人',
      personality: '温和、诚实、清醒，有耐心，不急着给答案',
      voice: '自然简洁，先理解，再用一个问题帮助用户往前走',
      scenario: '长期在场的思考伙伴，尊重用户的节奏与边界',
      greeting: '我在。你今天想从什么开始聊？',
      examples: '用户：我脑子里很乱。\n林川：那我们先不急着整理全部。现在最占心的是哪一件？',
      systemPrompt: '你是林川。保持人格和关系连续性。外挂外脑的答案是内部信号，由你判断如何自然表达。',
    },
    mainSelection: { provider: '', model: '' },
    externalBrains: [],
  }
}

function cloneConfig(config: WaiBrainAgentConfig): WaiBrainAgentConfig {
  return structuredClone(config)
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function shortDate(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value)
}

function modelRows(catalog: ModelCatalog | null): Array<{ provider: string; providerName: string; model: ModelCatalogEntry }> {
  return catalog?.groups.flatMap(group => group.models.map(model => ({
    provider: group.id,
    providerName: group.name ?? group.id,
    model,
  }))) ?? []
}

function selectionKey(selection: Pick<ModelSelection, 'provider' | 'model'>): string {
  return `${selection.provider}:${selection.model}`
}

function parseSelection(value: string): Pick<ModelSelection, 'provider' | 'model'> | undefined {
  const split = value.indexOf(':')
  if (split < 1 || split === value.length - 1) return undefined
  return { provider: value.slice(0, split), model: value.slice(split + 1) }
}

function catalogModel(catalog: ModelCatalog | null, selection: Pick<ModelSelection, 'provider' | 'model'>) {
  return catalog?.groups.find(group => group.id === selection.provider)?.models.find(model => model.id === selection.model)
}

function defaultSelection(catalog: ModelCatalog): ModelSelection {
  const rows = modelRows(catalog)
  const preferred = rows.find(row => row.provider === 'deepseek-official' && /flash/i.test(row.model.id)) ?? rows[0]
  if (preferred === undefined) return { provider: '', model: '' }
  const effort = preferred.model.reasoning?.efforts.find(item => item.id === 'off')?.id
    ?? preferred.model.reasoning?.defaultEffort
    ?? preferred.model.reasoning?.efforts[0]?.id
  return {
    provider: preferred.provider,
    model: preferred.model.id,
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  }
}

function modelControls(catalog: ModelCatalog | null, selection: ModelSelection, prefix: string, labels: [string, string]): string {
  const rows = modelRows(catalog)
  const options = rows.map(row => `<option value="${escapeHtml(selectionKey({ provider: row.provider, model: row.model.id }))}"${row.provider === selection.provider && row.model.id === selection.model ? ' selected' : ''}>${escapeHtml(row.providerName)} · ${escapeHtml(row.model.name ?? row.model.id)}</option>`).join('')
  const model = catalogModel(catalog, selection)
  const efforts = model?.reasoning?.efforts ?? []
  const effortOptions = efforts.length === 0
    ? '<option value="">模型默认</option>'
    : efforts.map(effort => `<option value="${escapeHtml(effort.id)}"${effort.id === selection.reasoningEffort ? ' selected' : ''}>${escapeHtml(effort.name)}</option>`).join('')
  return `<div class="two-fields compact-fields model-fields"><label class="field"><span>${labels[0]}</span><select name="${prefix}Model" aria-label="${labels[0]}"${rows.length === 0 ? ' disabled' : ''}>${options}</select></label><label class="field"><span>${labels[1]}</span><select name="${prefix}Reasoning" aria-label="${labels[1]}"${rows.length === 0 ? ' disabled' : ''}>${effortOptions}</select></label></div>`
}

function field(label: string, name: string, value: string, required = false): string {
  return `<label class="field"><span>${escapeHtml(label)}${required ? ' *' : ''}</span><input name="${escapeHtml(name)}" aria-label="${escapeHtml(label)}" value="${escapeHtml(value)}" /></label>`
}

function area(label: string, name: string, value: string, rows = 3, hint = ''): string {
  return `<label class="field"><span>${escapeHtml(label)}</span>${hint === '' ? '' : `<small>${escapeHtml(hint)}</small>`}<textarea name="${escapeHtml(name)}" aria-label="${escapeHtml(label)}" rows="${String(rows)}">${escapeHtml(value)}</textarea></label>`
}

function conversationsFor(state: AppState): WaiBrainConversationSummary[] {
  return state.bootstrap?.conversations.filter(item => item.agentId === state.selectedAgentId)
    .sort((left, right) => right.createdAt - left.createdAt) ?? []
}

function renderTopbar(state: AppState): string {
  const nav = (view: View, label: string, glyph: string): string => `<button class="nav-button ${state.view === view ? 'is-active' : ''}" type="button" data-action="view" data-view="${view}"${view !== 'studio' && state.selectedConversationId === null ? ' disabled' : ''}><span class="icon">${glyph}</span><span>${label}</span></button>`
  const status = state.loading ? '正在连接 Host' : state.error !== '' ? 'Host 连接异常' : 'Host 数据已同步'
  return `<header class="topbar"><a class="brand" href="#studio" data-action="view" data-view="studio"><span class="brand-mark">${icon.brain}</span><span><strong>外脑</strong><small>一个身份，多个思考方向</small></span></a><nav aria-label="主导航">${nav('studio', '角色与外挂', icon.settings)}${nav('conversation', '主对话', icon.chat)}${nav('timeline', '认知时间轴', icon.timeline)}</nav><div class="topbar-status"><span class="status-light"></span><span>${escapeHtml(status)}</span></div></header>`
}

function renderManager(state: AppState): string {
  const agents = state.bootstrap?.agents ?? []
  const agentOptions = agents.map(agent => `<option value="${agent.id}"${agent.id === state.selectedAgentId ? ' selected' : ''}>${escapeHtml(agent.config.label || agent.config.role.name)} · v${String(agent.revision)}</option>`).join('')
  const conversations = conversationsFor(state)
  const conversationOptions = conversations.map(item => `<option value="${item.id}"${item.id === state.selectedConversationId ? ' selected' : ''}>${shortDate(item.createdAt)} · ${item.status === 'open' ? '进行中' : '已关闭'}</option>`).join('')
  return `<section class="agent-manager wb-manager" aria-label="Agent 和对话管理"><div class="agent-manager-copy"><span class="eyebrow">HOST WORKSPACE</span><strong>持久 Agent</strong></div><label class="agent-selector"><span class="sr-only">选择 Agent</span><select name="agentId" aria-label="选择 Agent"${agents.length === 0 ? ' disabled' : ''}><option value="">${agents.length === 0 ? '尚未保存 Agent' : '选择 Agent'}</option>${agentOptions}</select></label><button class="agent-button" type="button" data-action="new-agent">${icon.plus}<span>新建 Agent</span></button><button class="agent-button is-primary" type="button" data-action="save-agent"${state.saving ? ' disabled' : ''}>${state.saving ? '正在保存…' : '保存 Agent'}</button><label class="agent-selector conversation-selector"><span class="sr-only">选择历史对话</span><select name="conversationId" aria-label="选择历史对话"${conversations.length === 0 ? ' disabled' : ''}><option value="">${conversations.length === 0 ? '暂无历史对话' : '选择历史对话'}</option>${conversationOptions}</select></label><button class="agent-button" type="button" data-action="new-conversation"${state.selectedAgentId === null || state.saving ? ' disabled' : ''}>${icon.plus}<span>新对话</span></button><p class="agent-manager-notice">${escapeHtml(state.notice || '配置保存到 Host；修改在下一条用户消息生效。')}</p></section>`
}

function renderRole(state: AppState): string {
  const role = state.draft.role
  return `<section class="surface role-surface"><div class="surface-heading"><div><span class="step-index">01</span><div><span class="eyebrow">PERSONA</span><h2>角色卡</h2><p>所有字段都由 Host 保存，并按消息轮次冻结版本。</p></div></div><span class="required-note">带 * 为必填</span></div><form class="role-form" data-form="role"><div class="persona-preview"><div class="large-avatar">${escapeHtml(role.name.slice(0, 1) || '？')}</div><div><span>对话预览</span><strong>${escapeHtml(role.name || '未命名角色')}</strong><p>“${escapeHtml(role.greeting || '写一句自然的开场白。')}”</p></div><span class="model-chip">v${String(state.revision ?? 0)}</span></div><div class="two-fields">${field('角色名称', 'roleName', role.name, true)}${field('一句话定位', 'roleTagline', role.tagline, true)}</div>${area('性格特质', 'rolePersonality', role.personality, 3)}<div class="two-fields">${area('说话方式', 'roleVoice', role.voice, 4)}${area('关系与场景', 'roleScenario', role.scenario, 4)}</div>${area('开场白', 'roleGreeting', role.greeting, 3)}<details class="advanced-fields" open><summary>高级角色设定 <span>对话示例与主 System Prompt</span></summary>${area('对话示例', 'roleExamples', role.examples, 5)}${area('主对话 System Prompt', 'roleSystemPrompt', role.systemPrompt, 6, '角色文本不支持 {{ }} 模板。')}</details>${modelControls(state.catalog, state.draft.mainSelection, 'main', ['主对话模型', '主对话思考强度'])}<div class="role-actions"><span><strong>持久配置</strong> 保存后，当前 Agent 的下一条消息使用新版本。</span><button class="primary-button" type="button" data-action="save-agent"${state.saving ? ' disabled' : ''}>保存 Agent</button></div></form></section>`
}

function laneStatus(lane: WaiBrainExternalBrainRound | undefined): string {
  if (lane === undefined) return '等待下一条消息'
  const labels: Record<WaiBrainExternalBrainRound['status'], string> = {
    running: '分析中', completed: '已完成并回灌', empty: '没有正文', error: '运行失败',
    timeout: '运行超时', 'host-restarted': 'Host 重启，任务已终止',
  }
  return labels[lane.status]
}

function latestLane(state: AppState, brainId: string): WaiBrainExternalBrainRound | undefined {
  return state.conversation?.rounds.findLast(round => round.externalBrains.some(lane => lane.externalBrainId === brainId))
    ?.externalBrains.find(lane => lane.externalBrainId === brainId)
}

function renderBrainCard(state: AppState, brain: WaiBrainExternalBrain, index: number, compact = false): string {
  const lane = latestLane(state, brain.id)
  const status = laneStatus(lane)
  const stateClass = lane?.status === 'running' ? 'is-thinking' : lane?.status === 'error' || lane?.status === 'timeout' || lane?.status === 'host-restarted' ? 'is-error' : lane?.status === 'completed' ? 'is-pushed' : ''
  return `<article class="${compact ? 'runtime-branch-card' : 'config-branch-card'} ${stateClass}" style="--branch-colour:${colours[index % colours.length]}"><div class="branch-card-heading runtime-branch-heading"><span class="branch-symbol">${icon.brain}</span><div><h3>${escapeHtml(brain.label)}</h3><p>${escapeHtml(brain.direction || '尚未填写职责')}</p></div><span class="runtime-status"><i></i>${escapeHtml(brain.enabled ? status : '已关闭')}</span></div><div class="branch-meta"><span>${escapeHtml(brain.selection.provider)} · ${escapeHtml(brain.selection.model)}</span><span>${escapeHtml(brain.selection.reasoningEffort ?? '模型默认')}</span></div>${lane?.summary === undefined ? '' : `<div class="thought-card"><span>本轮答案${lane.truncated ? ' · 已按页面上限截断' : ''}</span><p>${escapeHtml(lane.summary)}${lane.resultUnavailable ? '\n（子 Session 正文不可用，显示降级摘要）' : ''}</p></div>`}<div class="branch-actions"><button type="button" data-action="edit-brain" data-brain-id="${escapeHtml(brain.id)}" aria-label="编辑 ${escapeHtml(brain.label)}">编辑</button><button type="button" data-action="toggle-brain" data-brain-id="${escapeHtml(brain.id)}" aria-label="${brain.enabled ? '关闭' : '启用'} ${escapeHtml(brain.label)}">${brain.enabled ? '关闭' : '启用'}</button><button class="danger-action" type="button" data-action="remove-brain" data-brain-id="${escapeHtml(brain.id)}" aria-label="移除 ${escapeHtml(brain.label)}">移除</button></div></article>`
}

function renderBrainEditor(state: AppState): string {
  if (state.editor === null) return ''
  const brain = state.editor.id === null ? undefined : state.draft.externalBrains.find(item => item.id === state.editor?.id)
  const selection = brain?.selection ?? defaultSelection(state.catalog ?? { groups: [], failures: [] })
  return `<form class="branch-editor-form wb-brain-editor" data-form="brain-editor"><div class="editor-title"><div><span class="eyebrow">HOST CONFIG</span><h3>${brain === undefined ? '添加外挂外脑' : `编辑 ${escapeHtml(brain.label)}`}</h3></div><button class="icon-button" type="button" data-action="close-editor" aria-label="关闭外挂外脑编辑器">${icon.close}</button></div>${field('外挂外脑名称', 'brainLabel', brain?.label ?? '', true)}${area('外挂外脑职责', 'brainDirection', brain?.direction ?? '', 3)}${area('人格提示词', 'brainPersona', brain?.persona ?? '', 4, '纯文本；不支持 {{ }} 模板。')}${modelControls(state.catalog, selection, 'brain', ['外挂外脑模型', '外挂外脑思考强度'])}<label class="check-field"><input type="checkbox" name="brainEnabled"${brain?.enabled === false ? '' : ' checked'} /><span><strong>启用这个外挂外脑</strong><small>保存后从下一条用户消息开始生效。</small></span></label>${state.editorError === '' ? '' : `<p class="form-error" role="alert">${escapeHtml(state.editorError)}</p>`}<button class="secondary-button full-button" type="button" data-action="save-brain">保存外挂外脑</button></form>`
}

function renderBrains(state: AppState): string {
  const cards = state.draft.externalBrains.map((brain, index) => renderBrainCard(state, brain, index)).join('')
  const enabled = state.draft.externalBrains.filter(brain => brain.enabled).length
  const limit = state.bootstrap?.limits.maxAdmittedBranches
  return `<section class="surface branch-surface"><div class="surface-heading"><div><span class="step-index">02</span><div><span class="eyebrow">PARALLEL BRAINS</span><h2>外挂外脑</h2><p>可新增、编辑、启停和删除任意数量；Host 为每条消息冻结当时启用的集合。</p></div></div><span class="branch-count">${String(enabled)} 已启用${limit === undefined ? '' : ` / 并发上限 ${String(limit)}`}</span></div><div class="branch-architecture"><span>同一历史</span><i></i><strong>主对话</strong><i></i><span>N 个外挂外脑</span></div><div class="config-branch-list">${cards || '<div class="timeline-empty wb-empty"><h2>还没有外挂外脑</h2><p>添加后，它会和主对话从同一历史并行开始。</p></div>'}</div>${renderBrainEditor(state)}<button class="dashed-button" type="button" data-action="add-brain">${icon.plus}<span>添加外挂外脑</span></button></section>`
}

function renderStudio(state: AppState): string {
  return `<main class="studio-page"><header class="studio-hero"><div><span class="hero-kicker"><i></i>HOST-BACKED WORKSPACE</span><h1>定义主对话，也管理它的外挂外脑</h1><p>这里的 Agent、人格、模型和外挂外脑均可编辑并持久化。保存的新版本从下一条用户消息开始生效。</p></div><div class="hero-note"><span>${icon.brain}</span><p><strong>真实 Host 数据</strong>刷新页面或重启 Host 后，Agent、对话和运行状态都会恢复。</p></div></header>${state.error === '' ? '' : `<p class="wb-global-error" role="alert">${escapeHtml(state.error)}</p>`}<div class="config-layout">${renderRole(state)}${renderBrains(state)}</div></main>`
}

function renderMessages(state: AppState): string {
  const rows = state.conversation?.messages ?? []
  if (rows.length === 0) return `<article class="message assistant-message greeting-message"><span class="message-author">${escapeHtml(state.draft.role.name)}</span><p>${escapeHtml(state.draft.role.greeting)}</p></article>`
  return rows.map(message => message.role === 'user'
    ? `<article class="message user-message"><p>${escapeHtml(message.text)}</p></article>`
    : `<article class="message assistant-message"><span class="message-author">${escapeHtml(state.draft.role.name)}</span><p>${escapeHtml(message.text)}</p></article>`).join('')
}

/** Content of `.chat-scroll`; shared by the full render and the poll-driven patch. */
function renderChatScrollContent(state: AppState): string {
  const busy = state.conversation?.busy === true || state.sending
  return `${renderMessages(state)}${busy ? '<article class="message assistant-message pending-message"><span class="message-author">运行状态</span><p>主对话或已提交的外挂结果正在处理…</p></article>' : ''}`
}

/** Content of `.runtime-branch-list`; shared by the full render and the poll-driven patch. */
function renderRuntimeBrainList(state: AppState): string {
  const cards = state.draft.externalBrains.map((brain, index) => renderBrainCard(state, brain, index, true)).join('')
  return cards || '<p class="timeline-empty">尚未配置外挂外脑。</p>'
}

function renderConversation(state: AppState): string {
  const closed = state.conversation?.conversation.status === 'closed'
  const busy = state.conversation?.busy === true || state.sending
  return `<main class="conversation-page"><section class="chat-panel"><header class="conversation-heading"><div class="conversation-identity"><span class="medium-avatar">${escapeHtml(state.draft.role.name.slice(0, 1) || '？')}</span><div><span class="eyebrow">主对话 · ${closed ? '已关闭' : '公开可见'}</span><h1>与${escapeHtml(state.draft.role.name)}对话</h1><p>${escapeHtml(state.draft.role.tagline)}</p></div></div><button class="secondary-button" type="button" data-action="close-conversation"${closed || state.selectedConversationId === null ? ' disabled' : ''}>${closed ? '对话已关闭' : '关闭对话'}</button></header><div class="chat-scroll" aria-live="polite">${renderChatScrollContent(state)}</div><form class="composer" data-form="composer"><label class="sr-only" for="message-composer">给${escapeHtml(state.draft.role.name)}发消息</label><textarea id="message-composer" name="message" aria-label="给${escapeHtml(state.draft.role.name)}发消息" placeholder="写下你想聊的内容…"${closed ? ' disabled' : ''}>${escapeHtml(state.composer)}</textarea><div class="composer-footer"><span>${closed ? '这场对话已关闭，只能查看历史。' : 'Enter 发送 · Shift + Enter 换行'}</span><button class="send-button" type="button" data-action="send" aria-label="发送"${closed || busy || state.composer.trim() === '' ? ' disabled' : ''}>${icon.send}</button></div></form>${state.error === '' ? '' : `<p class="wb-global-error" role="alert">${escapeHtml(state.error)}</p>`}</section><aside class="runtime-rail"><div class="rail-heading"><div><span class="eyebrow">外挂外脑 · 可编辑</span><h2>外挂外脑</h2><p>右侧可直接编辑；保存后从下一条消息生效。</p></div><button class="add-button" type="button" data-action="add-brain" aria-label="添加外挂外脑">${icon.plus}</button></div><div class="runtime-branch-list">${renderRuntimeBrainList(state)}</div>${renderBrainEditor(state)}</aside></main>`
}

/** Content of `.wb-round-list`; shared by the full render and the poll-driven patch. */
function renderRoundListContent(state: AppState): string {
  const rounds = state.conversation?.rounds ?? []
  const rows = rounds.map((round, roundIndex) => `<section class="wb-round"><header><strong>消息 ${String(roundIndex + 1).padStart(2, '0')}</strong><span>配置 v${String(round.configRevision)}</span><span>主路：${round.mainStatus}</span></header><div class="wb-round-lanes">${round.externalBrains.map((lane, index) => `<article style="--branch-colour:${colours[index % colours.length]}"><i></i><strong>${escapeHtml(lane.label)}</strong><span>${escapeHtml(laneStatus(lane))}</span><p>${escapeHtml(lane.summary ?? '等待结果')}</p></article>`).join('') || '<p>本轮没有启用外挂外脑。</p>'}</div></section>`).join('')
  return rows || '<div class="timeline-empty"><h2>还没有消息轮次</h2><p>发送第一条消息后，这里会展示真实 Host 运行状态。</p></div>'
}

function renderTimeline(state: AppState): string {
  return `<main class="timeline-page"><header class="timeline-heading"><div><span class="hero-kicker"><i></i>DURABLE 1+N TRACE</span><h1>认知时间轴</h1><p>每一轮都显示冻结的配置版本、主路状态和全部外挂外脑结算结果。</p></div></header><div class="wb-round-list">${renderRoundListContent(state)}</div></main>`
}

function renderApp(state: AppState): string {
  const page = state.view === 'studio' ? renderStudio(state) : state.view === 'conversation' ? renderConversation(state) : renderTimeline(state)
  return `<div class="app-shell">${renderTopbar(state)}${renderManager(state)}${page}</div>`
}

const CHAT_BOTTOM_THRESHOLD_PX = 48

interface ChatScrollPosition {
  atBottom: boolean
  scrollTop: number
}

function captureChatScroll(scroll: HTMLElement | null): ChatScrollPosition | null {
  if (scroll === null) return null
  return {
    atBottom: scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= CHAT_BOTTOM_THRESHOLD_PX,
    scrollTop: scroll.scrollTop,
  }
}

function restoreChatScroll(scroll: HTMLElement | null, position: ChatScrollPosition | null): void {
  if (scroll === null) return
  scroll.scrollTop = position === null || position.atBottom ? scroll.scrollHeight : position.scrollTop
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function rejection(error: { code: string; message?: string; field?: string }): string {
  if (error.code === 'invalid-persona-template') return `${error.field ?? '角色文本'} 不支持 {{ }} 模板。`
  if (error.code === 'branch-limit-exceeded') return '已启用的外挂外脑超过当前 Host 并发上限，请先关闭部分外挂外脑。'
  if (error.code === 'revision-conflict') return 'Agent 已被其他页面更新，请刷新后再编辑。'
  if (error.code === 'conversation-busy') return '主对话正在运行，请等当前公开回复完成后再发送。'
  if (error.code === 'conversation-closed') return '这场对话已经关闭。'
  return error.message ?? `Host 拒绝了操作：${error.code}`
}

/** Mount options for real-browser use and deterministic tests. */
export interface MountAppOptions {
  runtime?: WaiBrainRuntime
  pollIntervalMs?: number
}

/** Mount the Host-backed application and return its complete disposer. */
export function mountApp(target: Element | null, options: MountAppOptions = {}): () => void {
  if (!(target instanceof HTMLElement)) throw new Error('waibrain: mount target must be an HTMLElement')
  const runtime = options.runtime ?? new DshRuntimeClient()
  const abort = new AbortController()
  const state: AppState = {
    view: 'studio', loading: true, saving: false, sending: false, error: '', notice: '',
    bootstrap: null, catalog: null, selectedAgentId: null, selectedConversationId: null,
    revision: null, draft: initialConfig(), conversation: null, composer: '', editor: null, editorError: '',
  }
  let disposed = false
  let refreshing = false

  const render = (): void => {
    if (disposed) return
    const chatPosition = captureChatScroll(target.querySelector<HTMLElement>('.chat-scroll'))
    target.innerHTML = renderApp(state)
    if (state.view === 'conversation') {
      restoreChatScroll(target.querySelector<HTMLElement>('.chat-scroll'), chatPosition)
    }
  }

  const applyAgent = (agent: WaiBrainAgentRevision | undefined): void => {
    if (agent === undefined) {
      state.selectedAgentId = null
      state.revision = null
      state.draft = initialConfig()
      if (state.catalog !== null) state.draft.mainSelection = defaultSelection(state.catalog)
      state.selectedConversationId = null
      state.conversation = null
      return
    }
    state.selectedAgentId = agent.id
    state.revision = agent.revision
    state.draft = cloneConfig(agent.config)
    const candidate = state.bootstrap?.selectedConversationId
    const available = conversationsFor(state)
    state.selectedConversationId = candidate !== null && candidate !== undefined && available.some(item => item.id === candidate)
      ? candidate
      : available[0]?.id ?? null
  }

  const patchConversationView = (): void => {
    if (disposed) return
    if (state.view === 'conversation') {
      const scroll = target.querySelector<HTMLElement>('.chat-scroll')
      const chatPosition = captureChatScroll(scroll)
      if (scroll !== null) {
        scroll.innerHTML = renderChatScrollContent(state)
        restoreChatScroll(scroll, chatPosition)
      }
      const list = target.querySelector<HTMLElement>('.runtime-branch-list')
      if (list !== null) list.innerHTML = renderRuntimeBrainList(state)
      const composer = target.querySelector<HTMLTextAreaElement>('[name="message"]')
      const sendButton = target.querySelector<HTMLButtonElement>('[data-action="send"]')
      const closed = state.conversation?.conversation.status === 'closed'
      if (composer !== null) composer.disabled = closed
      if (sendButton !== null) {
        sendButton.disabled = closed || state.conversation?.busy === true || state.sending || (composer?.value ?? state.composer).trim() === ''
      }
    } else if (state.view === 'timeline') {
      const list = target.querySelector<HTMLElement>('.wb-round-list')
      if (list !== null) list.innerHTML = renderRoundListContent(state)
    }
  }

  const refreshConversation = async (): Promise<void> => {
    if (refreshing || state.selectedConversationId === null || abort.signal.aborted) return
    refreshing = true
    try {
      const result = await runtime.conversation({ conversationId: state.selectedConversationId }, abort.signal)
      if (result.ok) {
        if (JSON.stringify(result.value) === JSON.stringify(state.conversation)) return
        const previous = state.conversation
        state.conversation = result.value
        const row = state.bootstrap?.conversations.find(item => item.id === result.value.conversation.id)
        if (row !== undefined) Object.assign(row, result.value.conversation)
        const headerStateChanged = previous === null
          || previous.conversation.status !== result.value.conversation.status
        if (state.view === 'conversation' && headerStateChanged) render()
        else patchConversationView()
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      state.error = `无法刷新对话：${errorMessage(error)}`
      render()
    } finally {
      refreshing = false
    }
  }

  const refreshBootstrap = async (): Promise<void> => {
    const latest = await runtime.bootstrap(abort.signal)
    state.bootstrap = latest
    const current = latest.agents.find(agent => agent.id === state.selectedAgentId)
      ?? latest.agents.find(agent => agent.id === latest.selectedAgentId)
      ?? latest.agents[0]
    applyAgent(current)
    await refreshConversation()
  }

  const readRoleForm = (): void => {
    const form = target.querySelector<HTMLFormElement>('[data-form="role"]')
    if (form === null) return
    const data = new FormData(form)
    const text = (name: string): string => {
      const value = data.get(name)
      return typeof value === 'string' ? value.trim() : ''
    }
    state.draft.label = text('roleName')
    state.draft.role = {
      name: text('roleName'), tagline: text('roleTagline'), personality: text('rolePersonality'),
      voice: text('roleVoice'), scenario: text('roleScenario'), greeting: text('roleGreeting'),
      examples: text('roleExamples'), systemPrompt: text('roleSystemPrompt'),
    }
    const main = parseSelection(text('mainModel'))
    if (main !== undefined) {
      const effort = text('mainReasoning')
      state.draft.mainSelection = { ...main, ...(effort === '' ? {} : { reasoningEffort: effort }) }
    }
  }

  const saveAgent = async (): Promise<boolean> => {
    readRoleForm()
    if (state.draft.role.name === '' || state.draft.role.tagline === '' || state.draft.role.personality === '' || state.draft.role.greeting === '') {
      state.error = '请先完成角色名称、定位、性格和开场白。'
      render()
      return false
    }
    if (state.draft.mainSelection.provider === '' || state.draft.mainSelection.model === '') {
      state.error = '请先选择主对话模型。'
      render()
      return false
    }
    state.saving = true
    state.error = ''
    render()
    try {
      const result = await runtime.saveAgent({
        ...(state.selectedAgentId === null ? {} : { agentId: state.selectedAgentId }),
        expectedRevision: state.revision,
        config: cloneConfig(state.draft),
      }, abort.signal)
      if (!result.ok) {
        state.error = rejection(result.error)
        return false
      }
      state.selectedAgentId = result.value.agent.id
      state.revision = result.value.agent.revision
      state.draft = cloneConfig(result.value.agent.config)
      state.notice = `Agent 已保存为配置 v${String(state.revision)}。`
      await runtime.selectAgent({ agentId: result.value.agent.id }, abort.signal)
      const latest = await runtime.bootstrap(abort.signal)
      state.bootstrap = latest
      return true
    } catch (error: unknown) {
      state.error = `保存失败：${errorMessage(error)}`
      return false
    } finally {
      state.saving = false
      render()
    }
  }

  const saveBrain = async (): Promise<void> => {
    const form = target.querySelector<HTMLFormElement>('[data-form="brain-editor"]')
    if (form === null || state.editor === null) return
    const data = new FormData(form)
    const text = (name: string): string => {
      const value = data.get(name)
      return typeof value === 'string' ? value.trim() : ''
    }
    const label = text('brainLabel')
    const direction = text('brainDirection')
    const route = parseSelection(text('brainModel'))
    if (label === '' || direction === '' || route === undefined) {
      state.editorError = '请填写名称、职责并选择模型。'
      render()
      return
    }
    const effort = text('brainReasoning')
    const replacement: WaiBrainExternalBrain = {
      id: state.editor.id ?? (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `brain-${Date.now().toString(36)}`),
      label,
      direction,
      persona: text('brainPersona'),
      selection: { ...route, ...(effort === '' ? {} : { reasoningEffort: effort }) },
      enabled: data.get('brainEnabled') === 'on',
    }
    const index = state.editor.id === null ? -1 : state.draft.externalBrains.findIndex(brain => brain.id === state.editor?.id)
    if (index < 0) state.draft.externalBrains.push(replacement)
    else state.draft.externalBrains[index] = replacement
    state.editor = null
    state.editorError = ''
    if (state.selectedAgentId === null) {
      state.notice = '外挂外脑已加入新 Agent 草稿；保存 Agent 后写入 Host。'
      render()
      return
    }
    await saveAgent()
  }

  const newConversation = async (): Promise<void> => {
    if (state.selectedAgentId === null && !await saveAgent()) return
    if (state.selectedAgentId === null) return
    state.error = ''
    try {
      const result = await runtime.createConversation({ agentId: state.selectedAgentId }, abort.signal)
      if (!result.ok) {
        state.error = rejection(result.error)
        render()
        return
      }
      state.selectedConversationId = result.value.conversation.id
      await refreshBootstrap()
      state.selectedConversationId = result.value.conversation.id
      await runtime.selectConversation({ conversationId: result.value.conversation.id }, abort.signal)
      await refreshConversation()
      state.view = 'conversation'
      state.notice = '已为同一个 Agent 新建对话；旧对话仍保留在历史选择器中。'
      render()
    } catch (error: unknown) {
      state.error = `新建对话失败：${errorMessage(error)}`
      render()
    }
  }

  const send = async (): Promise<void> => {
    const text = state.composer.trim()
    if (text === '' || state.selectedConversationId === null || state.sending || state.conversation?.busy === true) return
    state.sending = true
    state.error = ''
    state.composer = ''
    render()
    try {
      const result = await runtime.prompt({ conversationId: state.selectedConversationId, text }, abort.signal)
      if (!result.ok) state.error = rejection(result.error)
      await refreshConversation()
    } catch (error: unknown) {
      state.error = `发送失败：${errorMessage(error)}`
    } finally {
      state.sending = false
      render()
    }
  }

  const onClick = (event: Event): void => {
    const origin = event.target
    if (!(origin instanceof Element)) return
    const button = origin.closest<HTMLElement>('[data-action]')
    if (button === null) return
    const action = button.dataset.action
    if (action === 'view') {
      event.preventDefault()
      const view = button.dataset.view
      if (view === 'studio' || view === 'conversation' || view === 'timeline') state.view = view
      render()
    } else if (action === 'new-agent') {
      applyAgent(undefined)
      state.notice = '正在编辑一个尚未保存的新 Agent。'
      state.view = 'studio'
      render()
    } else if (action === 'save-agent') {
      void saveAgent()
    } else if (action === 'new-conversation') {
      void newConversation()
    } else if (action === 'add-brain') {
      state.editor = { id: null }
      state.editorError = ''
      render()
    } else if (action === 'close-editor') {
      state.editor = null
      state.editorError = ''
      render()
    } else if (action === 'save-brain') {
      void saveBrain()
    } else if (action === 'edit-brain') {
      state.editor = { id: button.dataset.brainId ?? null }
      state.editorError = ''
      render()
    } else if (action === 'toggle-brain' || action === 'remove-brain') {
      const brainId = button.dataset.brainId
      const index = state.draft.externalBrains.findIndex(brain => brain.id === brainId)
      const brain = state.draft.externalBrains[index]
      if (brain === undefined) return
      if (action === 'remove-brain') state.draft.externalBrains.splice(index, 1)
      else brain.enabled = !brain.enabled
      if (state.selectedAgentId === null) render()
      else void saveAgent()
    } else if (action === 'send') {
      void send()
    } else if (action === 'close-conversation' && state.selectedConversationId !== null) {
      void runtime.closeConversation({ conversationId: state.selectedConversationId }, abort.signal).then((result) => {
        if (!result.ok) state.error = rejection(result.error)
        return refreshConversation()
      }).then(render).catch((error: unknown) => {
        state.error = `关闭失败：${errorMessage(error)}`
        render()
      })
    }
  }

  const onInput = (event: Event): void => {
    const input = event.target
    if (input instanceof HTMLTextAreaElement && input.name === 'message') {
      state.composer = input.value
      const sendButton = target.querySelector<HTMLButtonElement>('[data-action="send"]')
      if (sendButton !== null) sendButton.disabled = input.value.trim() === '' || state.conversation?.busy === true
    }
  }

  const updateReasoning = (select: HTMLSelectElement, prefix: string): void => {
    const form = select.closest('form')
    const effort = form?.querySelector<HTMLSelectElement>(`[name="${prefix}Reasoning"]`)
    const route = parseSelection(select.value)
    if (effort === null || effort === undefined || route === undefined) return
    const model = catalogModel(state.catalog, route)
    effort.replaceChildren(...(model?.reasoning?.efforts.length
      ? model.reasoning.efforts.map(item => new Option(item.name, item.id, false, item.id === model.reasoning?.defaultEffort))
      : [new Option('模型默认', '')]))
  }

  const onChange = (event: Event): void => {
    const select = event.target
    if (!(select instanceof HTMLSelectElement)) return
    if (select.name === 'agentId') {
      const agent = state.bootstrap?.agents.find(item => item.id === select.value)
      applyAgent(agent)
      if (agent !== undefined) {
        void runtime.selectAgent({ agentId: agent.id }, abort.signal)
        void refreshConversation()
      }
      render()
    } else if (select.name === 'conversationId') {
      state.selectedConversationId = select.value || null
      state.conversation = null
      if (state.selectedConversationId !== null) {
        void runtime.selectConversation({ conversationId: state.selectedConversationId }, abort.signal)
        void refreshConversation()
      }
      render()
    } else if (select.name === 'mainModel') updateReasoning(select, 'main')
    else if (select.name === 'brainModel') updateReasoning(select, 'brain')
  }

  const onKeydown = (event: KeyboardEvent): void => {
    const input = event.target
    if (input instanceof HTMLTextAreaElement && input.name === 'message' && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  target.addEventListener('click', onClick)
  target.addEventListener('input', onInput)
  target.addEventListener('change', onChange)
  target.addEventListener('keydown', onKeydown)
  render()

  void Promise.all([runtime.models(abort.signal), runtime.bootstrap(abort.signal)]).then(async ([catalog, bootstrap]) => {
    state.catalog = catalog
    state.bootstrap = bootstrap
    const agent = bootstrap.agents.find(item => item.id === bootstrap.selectedAgentId) ?? bootstrap.agents[0]
    applyAgent(agent)
    if (agent === undefined) state.draft.mainSelection = defaultSelection(catalog)
    state.loading = false
    if (modelRows(catalog).length === 0) state.error = 'Host 当前没有可路由模型，请先配置模型提供方。'
    await refreshConversation()
    render()
  }).catch((error: unknown) => {
    if (abort.signal.aborted) return
    state.loading = false
    state.error = `无法加载 WaiBrain Host：${errorMessage(error)}`
    render()
  })

  const poll = setInterval(() => { void refreshConversation() }, options.pollIntervalMs ?? 500)
  return () => {
    disposed = true
    clearInterval(poll)
    abort.abort()
    target.removeEventListener('click', onClick)
    target.removeEventListener('input', onInput)
    target.removeEventListener('change', onChange)
    target.removeEventListener('keydown', onKeydown)
    target.replaceChildren()
  }
}
