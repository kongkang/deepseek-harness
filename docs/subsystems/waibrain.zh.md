# 外挂外脑 Agent 工作区

[English](waibrain.md) | 中文

[`@deepseek-ai/dsh-host-waibrain`](../../packages/host/waibrain)负责外挂外脑产品域的持久状态：可编辑的 Agent 修订、动态管理的外脑列表、永久对话标识，以及基于标准 Session、由 Host 控制的 1+N 执行。[`apps/waibrain`](../../apps/waibrain)是对应的浏览器客户端，只调用类型化的 `waibrain` Remote 命名空间。

来源：[`packages/host/waibrain/src/types.ts`](../../packages/host/waibrain/src/types.ts)

## 持久 Agent 配置

Agent id 保持稳定，每次保存都会追加一份不可变的编号修订。每条用户消息被接纳时，修订会冻结主角色、主模型选择和有序外脑列表。外脑是普通的可编辑记录：用户可以在保存下一个修订前新增、重命名、重新配置、启用、停用、排序或删除。

```ts type-equiv
/** Opaque identity of one durable WaiBrain Agent. */
type WaiBrainAgentId = Branded<'WaiBrainAgentId'>
```

```ts type-equiv
/** One provider/model/reasoning target. */
interface WaiBrainModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}
```

```ts type-equiv
/** Editable main-character fields persisted by the Host. */
interface WaiBrainRole {
  readonly name: string
  readonly tagline: string
  readonly personality: string
  readonly voice: string
  readonly scenario: string
  readonly greeting: string
  readonly examples: string
  readonly systemPrompt: string
}
```

```ts type-equiv
/** One dynamically managed external brain. */
interface WaiBrainExternalBrain {
  readonly id: string
  readonly label: string
  readonly direction: string
  readonly persona: string
  readonly selection: WaiBrainModelSelection
  readonly enabled: boolean
}
```

```ts type-equiv
/** Complete editable Agent configuration. */
interface WaiBrainAgentConfig {
  readonly label: string
  readonly role: WaiBrainRole
  readonly mainSelection: WaiBrainModelSelection
  readonly externalBrains: readonly WaiBrainExternalBrain[]
}
```

```ts type-equiv
/** One immutable persisted Agent revision. */
interface WaiBrainAgentRevision {
  readonly id: WaiBrainAgentId
  readonly revision: number
  readonly config: WaiBrainAgentConfig
  readonly createdAt: number
}
```

```ts type-equiv
/** Save one new Agent or compare-and-set an existing Agent revision. */
interface WaiBrainSaveAgentRequest {
  readonly agentId?: WaiBrainAgentId
  readonly expectedRevision: number | null
  readonly config: WaiBrainAgentConfig
}
```

```ts type-equiv
/** Select one durable Agent. */
interface WaiBrainSelectAgentRequest {
  readonly agentId: WaiBrainAgentId
}
```

## 永久对话与 1+N 轮次

每个对话把一个 Agent 绑定到一个标准主 Session。接纳提示词时会冻结一份 Agent 修订，并让主线路与所有已启用外脑从同一个已完成 Session 前缀开始执行。各线路独立结算；非空外脑结果必须先持久提交，之后才能以延迟唤醒进入主 Session。关闭对话会拒绝后续提示词，只丢弃尚未投递的唤醒。

```ts type-equiv
/** Opaque identity of one durable WaiBrain conversation. */
type WaiBrainConversationId = Branded<'WaiBrainConversationId'>
```

```ts type-equiv
/** Opaque identity of one admitted WaiBrain round. */
type WaiBrainRoundId = Branded<'WaiBrainRoundId'>
```

```ts type-equiv
/** Select one durable conversation. */
interface WaiBrainSelectConversationRequest {
  readonly conversationId: WaiBrainConversationId
}
```

```ts type-equiv
/** Create one conversation for an Agent. */
interface WaiBrainCreateConversationRequest {
  readonly agentId: WaiBrainAgentId
}
```

```ts type-equiv
/** Read one conversation. */
interface WaiBrainConversationRequest {
  readonly conversationId: WaiBrainConversationId
}
```

```ts type-equiv
/** Admit one user message. */
interface WaiBrainPromptRequest {
  readonly conversationId: WaiBrainConversationId
  readonly text: string
}
```

```ts type-equiv
/** Close one conversation. */
interface WaiBrainCloseConversationRequest {
  readonly conversationId: WaiBrainConversationId
}
```

```ts type-equiv
/** Deployment limits the browser needs before editing or sending. */
interface WaiBrainLimits {
  readonly maxAdmittedBranches: number
  readonly externalBrainTimeoutMs: number
  readonly externalBrainMaxTokens: number
  readonly maxResultBytes: number
}
```

```ts type-equiv
/** Initial durable application snapshot. */
interface WaiBrainBootstrap {
  readonly limits: WaiBrainLimits
  readonly agents: readonly WaiBrainAgentRevision[]
  readonly selectedAgentId: WaiBrainAgentId | null
  readonly conversations: readonly WaiBrainConversationSummary[]
  readonly selectedConversationId: WaiBrainConversationId | null
}
```

```ts type-equiv
/** One conversation row shown in the durable history selector. */
interface WaiBrainConversationSummary {
  readonly id: WaiBrainConversationId
  readonly agentId: WaiBrainAgentId
  readonly sessionId: string
  readonly createdAt: number
  readonly status: 'open' | 'closed'
}
```

```ts type-equiv
/** One public message projected from the main standard Session. */
interface WaiBrainConversationMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly seq: number
}
```

```ts type-equiv
/** Public state of one external-brain lane for an admitted round. */
interface WaiBrainExternalBrainRound {
  readonly externalBrainId: string
  readonly label: string
  readonly status: 'running' | 'completed' | 'empty' | 'error' | 'timeout' | 'host-restarted'
  readonly childSessionId?: string
  readonly summary?: string
  readonly truncated?: boolean
  readonly resultUnavailable?: boolean
}
```

```ts type-equiv
/** Public state of one user round and all of its independently settling lanes. */
interface WaiBrainRoundView {
  readonly id: WaiBrainRoundId
  readonly configRevision: number
  readonly userMessageId: string
  readonly mainStatus: 'running' | 'completed' | 'failed' | 'host-restarted'
  readonly externalBrains: readonly WaiBrainExternalBrainRound[]
}
```

```ts type-equiv
/** Main-session transcript plus Host-owned 1+N lane state. */
interface WaiBrainConversationView {
  readonly conversation: WaiBrainConversationSummary
  readonly busy: boolean
  readonly messages: readonly WaiBrainConversationMessage[]
  readonly rounds: readonly WaiBrainRoundView[]
}
```

## 结果词汇

业务拒绝保持为类型化的 Remote 结果。基础设施失败会作为 Remote 错误传播；Host 会把已经接纳的线路记录为失败，不会让它永久停留在运行中。

```ts type-equiv
/** A user-authored prompt field contains System Prompt template syntax. */
interface WaiBrainInvalidPersonaTemplate {
  readonly code: 'invalid-persona-template'
  readonly field: string
  readonly offset: number
}
```

```ts type-equiv
/** Enabled external brains exceed the deployment admission limit. */
interface WaiBrainBranchLimitExceeded {
  readonly code: 'branch-limit-exceeded'
  readonly maxAdmittedBranches: number
  readonly enabledCount: number
}
```

```ts type-equiv
/** A compare-and-set Agent update observed a newer revision. */
interface WaiBrainRevisionConflict {
  readonly code: 'revision-conflict'
  readonly current: WaiBrainAgentRevision
}
```

```ts type-equiv
/** The requested Agent does not exist. */
interface WaiBrainAgentNotFound {
  readonly code: 'agent-not-found'
  readonly agentId: WaiBrainAgentId
}
```

```ts type-equiv
/** The requested conversation does not exist. */
interface WaiBrainConversationNotFound {
  readonly code: 'conversation-not-found'
  readonly conversationId: WaiBrainConversationId
}
```

```ts type-equiv
/** A runtime operation is not available in the current implementation stage. */
interface WaiBrainRuntimeUnavailable {
  readonly code: 'runtime-unavailable'
  readonly message?: string
}
```

```ts type-equiv
/** The main Agent or a committed result wake currently owns the conversation. */
interface WaiBrainConversationBusy {
  readonly code: 'conversation-busy'
  readonly conversationId: WaiBrainConversationId
}
```

```ts type-equiv
/** A closed conversation is immutable and accepts no new prompt. */
interface WaiBrainConversationClosed {
  readonly code: 'conversation-closed'
  readonly conversationId: WaiBrainConversationId
}
```

```ts type-equiv
/** Successful product result. */
interface WaiBrainSuccess<T> {
  readonly ok: true
  readonly value: T
}
```

```ts type-equiv
/** Rejected product result. */
interface WaiBrainRejected<E> {
  readonly ok: false
  readonly error: E
}
```

```ts type-equiv
/** Save result. */
type WaiBrainSaveAgentResult = WaiBrainSuccess<{ readonly agent: WaiBrainAgentRevision }> | WaiBrainRejected<
  WaiBrainInvalidPersonaTemplate | WaiBrainBranchLimitExceeded | WaiBrainRevisionConflict | WaiBrainAgentNotFound
>
```

```ts type-equiv
/** Agent selection result. */
type WaiBrainSelectAgentResult =
  | WaiBrainSuccess<{ readonly selectedAgentId: WaiBrainAgentId }>
  | WaiBrainRejected<WaiBrainAgentNotFound>
```

```ts type-equiv
/** Conversation creation result. */
type WaiBrainCreateConversationResult =
  | WaiBrainSuccess<{ readonly conversation: WaiBrainConversationSummary }>
  | WaiBrainRejected<WaiBrainAgentNotFound | WaiBrainRuntimeUnavailable>
```

```ts type-equiv
/** Conversation selection result. */
type WaiBrainSelectConversationResult =
  | WaiBrainSuccess<{ readonly selectedConversationId: WaiBrainConversationId }>
  | WaiBrainRejected<WaiBrainConversationNotFound>
```

```ts type-equiv
/** Conversation read result. */
type WaiBrainConversationResult = WaiBrainSuccess<WaiBrainConversationView> | WaiBrainRejected<WaiBrainConversationNotFound>
```

```ts type-equiv
/** Prompt admission result. */
type WaiBrainPromptResult = WaiBrainSuccess<{ readonly roundId: WaiBrainRoundId }> | WaiBrainRejected<
  | WaiBrainConversationNotFound
  | WaiBrainConversationClosed
  | WaiBrainConversationBusy
  | WaiBrainBranchLimitExceeded
  | WaiBrainRuntimeUnavailable
>
```

```ts type-equiv
/** Close result. */
type WaiBrainCloseConversationResult =
  | WaiBrainSuccess<{ readonly closed: true }>
  | WaiBrainRejected<WaiBrainConversationNotFound | WaiBrainRuntimeUnavailable>
```

## 持久化与恢复

Agent 修订、对话归属、选择状态与恢复元数据使用带版本的 `waibrain` storage domain。所有模型可见 persona、已接纳轮次、线路结算和唤醒转换都可以从标准 Session header 与事件重建。Host 启动时会把上一个进程中断的活动线路标记为 `host-restarted`，精确一次地协调已提交唤醒，并且只在操作需要时恢复主 Agent。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxwaibrainhost--waibrainhostservice"></a>

### `ctx.waibrainHost` — `WaiBrainHostService`

Root Host service owning the WaiBrain durable domain and Remote namespace.

```ts cordis-catalog
/**
 * Read the complete durable application index without resuming Agents.
 * @returns Detached Agent, conversation, selection, and deployment-limit data.
 */
@Remote('bootstrap') bootstrap(): WaiBrainBootstrap

/**
 * Create or compare-and-set a complete Agent config.
 * @param request - Complete configuration and expected revision.
 * @returns The saved immutable revision or a typed product rejection.
 */
@Remote('saveAgent') async saveAgent(request: WaiBrainSaveAgentRequest): Promise<WaiBrainSaveAgentResult>

/**
 * Persist the selected Agent.
 * @param request - Agent identity to select.
 * @returns The selected identity or an Agent-not-found rejection.
 */
@Remote('selectAgent') async selectAgent(request: WaiBrainSelectAgentRequest): Promise<WaiBrainSelectAgentResult>

/**
 * Create and bind one standard Session to a durable WaiBrain conversation.
 * @param request - Agent identity whose current revision owns the conversation.
 * @returns The new conversation summary or a typed runtime rejection.
 */
@Remote('createConversation') async createConversation(request: WaiBrainCreateConversationRequest): Promise<WaiBrainCreateConversationResult>

/**
 * Persist the selected conversation.
 * @param request - Conversation identity to select.
 * @returns The selected identity or a conversation-not-found rejection.
 */
@Remote('selectConversation') async selectConversation(request: WaiBrainSelectConversationRequest): Promise<WaiBrainSelectConversationResult>

/**
 * Read one conversation from its standard Session and coordination events.
 * @param request - Conversation identity to project.
 * @returns The browser-safe projection or a conversation-not-found rejection.
 */
@Remote('conversation') async conversation(request: WaiBrainConversationRequest): Promise<WaiBrainConversationResult>

/**
 * Atomically admit one main prompt and publish every configured fork before the main wake.
 * @param request - Conversation identity and user text to admit.
 * @returns The accepted round identity or a typed admission rejection.
 */
@Remote('prompt') prompt(request: WaiBrainPromptRequest): Promise<WaiBrainPromptResult>

/**
 * Persist a close boundary, discard committed wakes, and cancel only the main Agent.
 * @param request - Conversation identity to close.
 * @returns An idempotent closed result or a typed runtime rejection.
 */
@Remote('closeConversation') closeConversation(request: WaiBrainCloseConversationRequest): Promise<WaiBrainCloseConversationResult>

/**
 * Whether a Session is bound by a committed conversation or the creation transaction.
 * @param sessionId - Standard Session identity to inspect.
 * @returns True when WaiBrain Host admission owns the Session.
 */
isBoundSession(sessionId: SessionId): boolean

/**
 * Complete persona selected for one bound Session, or undefined for the neutral preset path.
 * @param sessionId - Standard Session identity being assembled.
 * @returns The validated complete persona, or undefined outside a valid binding.
 */
personaForSession(sessionId: SessionId): string | undefined

/**
 * Stable mutable selection installed by the preset companion for one Session.
 * @param sessionId - Standard Session identity being assembled.
 * @returns The stable model-selection reference for that Session.
 */
modelSelectionForSession(sessionId: SessionId): ModelSelectionRef

/**
 * Enforce the Host admission whitelist before a bound Agent enters a model step.
 * @param agent - Bound main Agent proposing the model step.
 * @param messages - New user-role messages proposed for the step.
 * @returns True only when every message matches a durable Host admission.
 */
async authorizeMessages(agent: Agent, messages: readonly UserMessage[]): Promise<boolean>
```

Types: [Agent](core.zh.md) · [ModelSelectionRef](core.zh.md) · [SessionId](core.zh.md) · [UserMessage](session.zh.md)

Source: [`packages/host/waibrain/src/index.ts`](../../packages/host/waibrain/src/index.ts)
<!-- END GENERATED cordis-surface -->
