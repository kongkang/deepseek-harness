# 外脑网页第一阶段：Host 持久化实施计划

## 目标与依据

本计划落实 [已确认需求](2026-08-24-waibrain-confirmed-requirements.md) 和 [第一阶段开发计划](2026-08-24-waibrain-phase-1-development-plan.md)：第一个 Tab 由 Host 持有 Agent、对话、配置版本、运行状态和外挂外脑结果；浏览器只保存尚未提交的表单草稿。页面刷新、断网、关闭标签页和 Host 重启后，已经提交的数据可以恢复。

当前独立页面已具备角色表单、模型选择和任意数量外挂外脑卡片的展示基础，但 Agent 与卡片仍是页面内存草稿；`waibrain-dialog` preset 的编排器仍从静态 `config.shadows` 派发，不能满足动态配置、下一条消息生效、对话关闭和跨对话隔离。

## 范围

- 创建、选择和更新 Agent，持久化当前页面的全部角色字段、主模型和有序外挂外脑配置。
- 每次 Agent 保存形成不可变配置版本；发送消息时冻结该轮使用的版本和已启用外挂外脑集合。
- 创建、选择、恢复和主动关闭对话；新对话保持 Agent，旧对话永久可选。
- 主对话与全部已启用外挂外脑从同一段已完成 Session 历史并行启动。
- 外挂外脑独立完成、空结果、失败和超时；结果只写回原对话。对话开放时可以唤醒原主对话，关闭后只记录。
- 第一个页面完整接入 Host 数据，并提供加载、保存、运行、失败和关闭状态。
- `pnpm run waibrain:dev` 作为 WaiNao Web 的默认开发入口，Host 就绪后自动打开独立 WaiBrain 首页；标准 DSH Web 仍保留给通用 Harness 调试。

## 非目标

- 不实现 Skill、Tools、Memory、自我更新、限时外挂外脑或公开网络部署。
- 不迁移从未写入 Host 的旧浏览器内存草稿，也不猜测普通 DSH Session 属于哪个 Agent。
- 不把产品数据限制为固定两个外挂外脑；部署只设置并发数、单路超时和结果长度上限。
- 不更改 `agent-loop`，不增加浏览器直连模型或浏览器编排协议。

## 架构与数据

### Host 领域服务

新增正式 Host 包 `@deepseek-ai/dsh-host-waibrain`（`packages/host/waibrain/`），作为产品领域协调器并通过 Typert Remote 暴露 `waibrain/*`。它依赖现有 `ctx.storageDomain`、`ctx.agents`、`ctx.sessions`、`ctx.sessionPersistence`、`ctx.agentPresets`、`ctx.subagents`、`ctx.systemPrompt` 和 `ctx.tools`，不依赖具体存储或模型 provider。包结构沿用 `packages/feedback/message-feedback` 的 storage-domain + `TypertRemoteService` + Remote 标记模式，并补齐 release member 元数据、README 和 invariant。

Web bundle 在 `storage-domain`、Agent/Session 和 subagent 服务可用后挂载该服务；Typert Gateway 自动接管 `/api/waibrain/<method>`，无需向旧 `ApiProxy` 的硬编码路由表增加产品专用方法。

### 持久化记录

用 `storage-domain` 打开版本化 `waibrain` JSON domain。领域文件只保存跨 Session 的索引和配置：

- 全局记录保存 Agent 顺序、当前所选 Agent、每个 Agent 上次选择的对话和 recoverable `pendingOperation`；
- `agents` 表保存每个 Agent 的当前配置、单调修订号和不可变配置修订历史；
- `conversations` 表保存 Agent/Session 绑定、创建时间、开放或关闭状态、关闭时的公开消息序列边界，以及保守的 `hasPendingWake` 启动索引。该标志只表示“可能存在”：准备写 `wake-pending` 前先置真；仅在主 Session 事件折叠确认没有未配对 wake 后才清除。Host 启动只 inspect 标志为真的对话，以 Session 事件为最终权威；标志为真但事件不存在的崩溃残留会被安全清除。

每轮配置快照、主路状态以及每个外挂外脑的开始/完成/空结果/失败/超时使用新 `waibrain/*` Session 事件追加到原主 Session，不进入会反复整文件重写的领域 JSON。外挂结果正文的权威副本只保存在该路的子 Session；主 Session 事件记录 `childSessionId`、状态、长度、截断标记和最多 512 UTF-8 bytes 的降级摘要。产品固定使用本地 `fork` provider，并在运行时断言 `run.localAgent` 存在；违反该 invariant 时按基础设施失败结算。正常结算路径必须先 `ctx.sessions.flush(run.localAgent.session)`，再追加并 flush 主 Session 元数据，最后才 `run.dispose()`；测试证明 dispose 后仍可用 `sessionPersistence.inspect(childSessionId)` 读取完整结果。`waibrain/conversation` 也通过 `inspect(childSessionId)` 投影历史结果；子 Session 缺失或损坏时只显示元数据摘要和明确的“正文不可用”状态，不让整段对话读取失败。这样，关闭对话后的结果不会在以后每个 fork seed 中按 N 路重复复制；开放对话的结果只有在唤醒主路后才作为标准、模型可见的消息进入主 Session 历史。`fork` 创建的子 Session 已带标准 `origin: 'subagent'` 和 `parentSession`；现有标准 Web 会把它们排除在顶层 Workspace 会话列表之外，并通过父会话的 subagent 入口呈现，因此不新增 WaiBrain 私有 header 字段。服务内领域写入经过一条串行操作链，先写存储再发布新内存快照。创建 Session 等跨领域操作使用持久的 `pendingOperation` 标记：先记录意图，再创建标准 Session，最后提交绑定；Host 启动时恢复或清理未完成操作。这样不会把未知 Session 静默当作成功对话。

主对话消息也不在领域记录重复保存，权威内容仍是标准 Session 日志。读取对话时，服务折叠普通消息事件、`waibrain/*` 元数据事件和受引用的子 Session 结果；关闭后的公开消息按持久化 `closedAtSeq` 截断，保证关闭提交后的迟到主回复不会再次对用户可见。部署级 `externalBrainMaxTokens` 只限制单路模型输出规模；子 Session 日志体积主要由复制的 fork seed 决定，本阶段不另设日志上限。`maxResultBytes` 只限制投影到 WaiBrain 页面以及回灌主路的正文，完整子 Session 仍保留可审计的模型输出。compaction 只治理模型历史，不删除 log-only 事件；本阶段以“结果正文只在子 Session 保存一次、开放对话的回灌正文属于真实模型历史”控制存储放大，不声称 compaction 会缩小底层 Session 日志。

### 配置版本与模型输入

每个 WaiBrain 主 Session 挂载 `waibrain-dialog` preset，但移除 preset 内静态 persona 与 `config.shadows` 编排器。该 preset 只保留本产品所需的 compaction 组合和 `@deepseek-ai/dsh-host-waibrain` 导出的薄 Agent companion，使超长对话沿用已有 durable summary + recent messages 机制，并让任何按该持久 preset 恢复 Session 的调用方都经过同一保护。companion 用 `ctx.get('waibrainHost')` 读取可选根级服务，不声明强制 inject；服务存在且 Session 已绑定时读取冻结快照并安装：

- Agent 作用域的动态 persona section，名称使用 `PERSONA_SECTION`（`deployment:persona`），设置 `complete: true`，并调用 `suppressRuntimeContext()`；文本按当前轮冻结的配置版本生成，确保模型看到的完整 System Prompt 逐字等于该人格文本，不混入部署 persona、Harness identity 或 Web surface 文案；
- `installModelSelection` 引用，按当前轮配置选择主模型与思考强度；
- `tools.restrict({ allow: [] })`，保证主对话零工具。

所有会进入绑定人格或外挂 persona 的用户字段都视为纯文本，不向产品暴露 System Prompt 模板语法。Host 包提供唯一的 `validatePersonaText`，直接调用 `@deepseek-ai/dsh-system-prompt` 导出的 `renderPrompt` 对单 section、空 variables 做 dry-run，不另写正则或复制扫描器：任何渲染异常都翻译为 `invalid-persona-template`，携带字段路径和首个触发 `{{` 的字段内字符位置。这样，完整的已注册/未知引用以及 `{{a{b}}` 这类渲染器判定为 malformed 的文本都在 `saveAgent` 最早边界被拒绝；只有渲染器允许的、后文没有任何 `}}` 的孤立 `{{` 按普通文本通过。页面在对应输入框提示“角色文本不支持 `{{ }}` 模板”。companion 在从冻结快照生成人格前复用同一函数，保护历史/损坏数据；命中时追加可读的配置失败状态，引导用户修改角色卡，不向页面暴露内部插值异常。

真实用户消息继续使用标准 `source.kind='user'`，避免改变标题、对话投影等既有消费者。协调器在 admission 前生成稳定 `MessageId`，`waibrain/round-admitted` 事件记录 `roundId + conversationId + configRevision + 完整配置快照 + userMessageId`；后续 `user/message` 的 id/seq 与它对齐。`agent/pre-step` 从消息 id 查到本轮快照并确定动态 persona/模型。外挂结果唤醒使用独立的 `waibrain-result` MessageSource，携带原 conversation/round/brain 标识。对于绑定到 WaiBrain 的 Session，companion 使用显式准入白名单：只允许 `kind === 'user'` 且消息 id 对应本轮 `round-admitted`，或 `kind === 'waibrain-result'` 且存在同键未配对 pending wake；对话已关闭或任何其他来源一律追加并 flush `waibrain/foreign-turn-rejected`（含来源 kind）后返回 pre-step reject。拒绝会留下 `turn/start`、`foreign-turn-rejected` 和 `turn/end { kind: 'blocked' }`，被拒消息不进入 `user/message`，也不产生模型输出。因而标准 DSH Web 仍可查看 WaiBrain Session 和子会话用于调试，但不能绕过 `waibrain/prompt` 继续输入；这项只读限制及可见的 blocked 结果写入包 README Known Limitations。

同一 preset 被用户从标准 Web 直接选择、Session 尚未绑定 WaiBrain 时，或当前 profile 根本没有 `waibrainHost` 服务时，companion 走同一中性分支：用 `PERSONA_SECTION` 注册 `complete: true` 的中性默认人格、调用 `suppressRuntimeContext()` 并安装 `tools.restrict({ allow: [] })`，不安装冻结快照模型选择，也不执行上述 WaiBrain 准入检查；模型沿用部署默认值，使它仍是可正常聊天的零工具普通对话，且绝不创建 WaiBrain 领域记录。`preset.yml` 的说明明确写为“供外脑网页使用；单独选用时是零工具普通对话”，README 同时记录无 Host profile 的降级语义。最终渲染的 System Prompt 和模型选择继续由标准 `request/header` 事件记录，满足“模型可见即有日志”。绑定模式下的主对话 persona 文本和 `【闪念】「label」正文` 回灌格式由协调器同一模块定义；real-composition 测试和 WaiBrain snapshot 逐字断言渲染出的完整 System Prompt 等于冻结配置生成的人格文本。

### 1+N 并行与生命周期

`waibrain/prompt` 在对话串行 admission 中完成：

1. 验证对话开放、主 Session 可恢复、Agent 配置修订存在，并确认主 Agent 当前 idle 且没有已经提交但尚未进入 turn 的结果唤醒；否则以 `busy` 拒绝，不把第二条用户消息 steering 到当前 turn；仍在运行但尚未产出结果的旧轮外挂外脑不构成 `busy`；
2. 在主消息进入 inbox 前冻结配置和启用外挂外脑，追加 `waibrain/round-admitted` 并通过 `ctx.sessions.flush(session)` 等待其持久化；
3. 从尚未含本轮消息的同一已完成主 Session 前缀，对所有启用外挂外脑依次调用 `subagents.start('fork', ...)` 取得 Promise（不等待任何结果），全部调用完成后才 `agent.followup(...)` 投递本轮用户消息；
4. Remote 在 admission 后立即返回，主路和外挂外脑使用 Host 自有生命周期继续，不继承浏览器请求的取消信号。

每个外挂外脑使用自己的模型、思考强度、职责和 persona，并显式 `toolFilter: { allow: [] }`。单路受部署级超时和结果长度限制。部署级 `maxAdmittedBranches` 默认是 8，可配置提高；它不限制 Agent 保存任意数量的外挂外脑，但 `bootstrap` 会向页面公开该值，`saveAgent` 在启用数量超限时立即拒绝并让页面在开关处说明恢复方法，`prompt` 保留同名拒绝作为并发配置漂移的最后防线。任何路径都不只运行一个子集或排队到不同历史。每个已 admission 的 Promise 单独捕获并追加原 Session，任何失败都不阻塞主路或兄弟路。结果按 `conversationId + roundId + externalBrainId` 更新；仅当原对话仍开放时，用带相同标识的 follow-up 唤醒该对话的主 Agent。旧轮结果即使在新一轮开始后才完成也仍可唤醒原主路：若主路正运行，协调器先持久化一个 pending wake，等 Agent idle 后再投递，绝不 steering 到当前 turn；对话 admission 与结果投递共用同一串行链，决定二者的确定顺序。`busy` 只由主 Agent 运行和已提交 pending wake 持有；主路结算后，即使旧轮外脑仍在运行，也允许下一轮 admission。页面只在主路或 pending wake 期间禁用发送，外挂卡片运行中仅展示状态。回归测试直接断言每个 fork seed 的末位 seq 恰等于上一轮 `turn/end` 的 seq，且不含本轮 `waibrain/round-admitted` 或用户消息。

pending wake 是主 Session 中可恢复的状态机：结果结算后、投递前先把该对话的 `hasPendingWake` 置真并持久化，再追加并 flush `waibrain/wake-pending`，键为 `roundId + externalBrainId`，同时记录确定性的 `wakeMessageId`；Agent idle 后用该 id 和 `waibrain-result` source 创建 follow-up。观察到同 id 的 `user/message` 已追加并 flush 后，再追加 `waibrain/wake-delivered`；折叠确认没有其他未配对 wake 后才清除领域索引。若进程在消息追加与 delivered 事件之间退出，恢复时先按 `wakeMessageId` 查主日志，已存在则只补 delivered，不重复投递。Host 启动只 inspect `hasPendingWake=true` 的对话并以事件折叠结果为准：开放对话通过统一恢复入口取得主 Agent，再在 idle 后恰好投递一次；关闭对话追加 `waibrain/wake-discarded-on-close`。`busy` 只对开放对话生效，关闭提交会为全部 pending wake 追加 discarded 事件、清除索引并立即释放它们。

主 Agent 采用惰性恢复：`bootstrap` 与 `selectConversation` 只读并持久选择，不 resume 历史对话；仅 `prompt` 和 wake 投递调用 `ensureConversationAgent()`。未恢复等价于 idle，并在同一对话串行链中先 `ctx.agents.resume(...)`，由持久 preset 自动挂载 companion，再 admission。Host 启动只为 `hasPendingWake=true` 且事件折叠仍有未配对 wake 的开放对话调用同一入口，其他历史对话不占用 live Agent。这样，重启后的第一次发送只承担一次明确的 resume 延迟，busy 判定和 seed 边界与常驻 Agent 相同。

关闭对话先持久化 `status=closed` 与当前 Session 序列边界，为当时全部未配对 wake 追加并 flush `waibrain/wake-discarded-on-close`，再拒绝新 admission 并取消正在运行的主路。已经 admission 的外挂外脑不取消；它们结算后仍更新原 round，但关闭检查直接追加 discarded 状态而不 follow-up。新对话拥有不同 Session 和 conversationId，迟到结果没有任何路由到新 Session 的字段。

Host 重启时，持久 Agent、对话、消息和已结算外挂外脑状态全部恢复；重启前仍标记运行中的路被结算为可见的 `host-restarted` 失败。已结算但未投递的 wake 按上述事件对与 `wakeMessageId` 恢复或丢弃，不会永久持有 busy，也不会重复回灌。本阶段不声称跨进程继续执行已经被 Host 进程终止的模型调用。

## Remote API

- `waibrain/bootstrap`：Agent/对话索引、持久选择、当前视图和部署级 `maxAdmittedBranches`。
- `waibrain/saveAgent`：创建或按 `expectedRevision` 更新完整配置。
- `waibrain/selectAgent`：持久选择 Agent。
- `waibrain/createConversation`：为 Agent 创建并绑定标准 Session；header 只记录 `agentPreset: 'waibrain-dialog'`，不写 `meta.systemPrompt`，人格唯一来源始终是领域配置修订与轮次快照。
- `waibrain/selectConversation`：持久选择历史对话。
- `waibrain/conversation`：读取公开消息、配置修订边界、每轮 1+N 状态和结果。
- `waibrain/prompt`：Host 端原子 admission，快速返回 round id。
- `waibrain/closeConversation`：提交关闭边界并停止主路公开输出。

所有 Remote 使用生成的 strict Typert 定义；方法参数只用一个具名 `request` 对象，避免 `agent`、`session` 等 lookup 保留参数，若接收取消信号则 `signal` 必须是最后一个参数。浏览器请求固定为 `POST /api/waibrain/<method>`，HTTP 信封的 `method` 为 `waibrain/<method>`，payload 为且仅为 `{ args: { request: ... } }`（无参方法使用 `{ args: {} }`）。所有业务拒绝使用显式结果联合：不存在、修订冲突、已关闭、`busy`、`invalid-persona-template`、模型不可用、超过部署 admission 上限和内部恢复失败。浏览器不解析 Host 文件路径，也不接收模型密钥。

## 实施步骤

1. 建立失败测试：领域 schema/恢复、`pendingOperation` 崩溃后的恢复与清理、`hasPendingWake` 假阳性清理、Agent 修订冲突、未知 domain 版本/invalid-record 拒绝、对话选择不 resume、下一消息配置冻结、`{{foo}}` 与已注册 `{{model}}` 均在 saveAgent 被字段级拒绝、`{{a{b}}` 这类 malformed 组同样被同一 dry-run 字段级拒绝、孤立 `{{` 正常保存并逐字进入 System Prompt、历史脏模板在 companion 兜底结算为可读配置失败、标准通道向开放或关闭 WaiBrain Session 投递均被 pre-step 拒绝且不破坏 WaiBrain 视图/busy、第三类 MessageSource 注入同样被拒绝且不进 `user/message`、任意 N、保存时启用数超限拒绝、发送时超限最后防线、主路运行中再次 prompt 的 `busy` 拒绝、主路结算后旧轮外挂仍运行时允许下一轮、重启后未投递 wake 恰好重投一次、同键 wake 不重复回灌、关闭时 pending wake 被丢弃且 busy 释放、重启后直接发送时 resume → admission → 派发及 seed 边界、dispose 后子 Session 结果仍可 inspect、结果子 Session 损坏时降级、独立失败、单路超时和关闭竞态与跨对话隔离。对 `maxResultBytes` 和 512 bytes 降级摘要分别覆盖：恰等于界限、超出 1 byte、单块超大结果，以及多字节字符跨界不产生半个字符；`externalBrainMaxTokens` 只校验正整数，覆盖零、负数和非整数拒绝，模型/provider 报告输出 token 超限时该路结算为可见失败且不影响兄弟路。
2. 新增 `packages/host/waibrain/` 的类型、schema、storage domain、协调服务、Remote、README、invariant 和 real-composition tests；注册 Host aggregate、Host 包目录、web bundle 依赖与 `waibrain-host` 插件行，并在 `apps/cli/package.json` dependencies 显式加入 `@deepseek-ai/dsh-host-waibrain`，保证 preset bare specifier 从应用依赖面可解析。以 `message-feedback` 为 Remote/storage 实现模板，不经过 experimental 依赖路径。
3. 将 `waibrain-dialog` preset 收敛为 compaction + `waibrain-session` 薄 Agent companion 主对话组合；该 row id 与 Host 平面的 `waibrain-host` 不同，删除静态 persona 与 shadows 编排。companion 只负责可选查询 Host 领域服务、安装动态选择并在 pre-step 强制 WaiBrain admission，不拥有第二份绑定模式 persona 或编排逻辑。把 persona 和回灌格式留在协调器唯一来源；以该 shipped preset 真实创建一次绑定 Session，断言 header 不含 `systemPrompt`、companion 已挂载、完整 System Prompt 逐字等于冻结人格、标准 prompt 旁路被拒绝；再直接从标准 preset 入口创建一次未绑定 Session，断言中性完整人格、正常对话、零工具且没有 WaiBrain 领域记录；最后在不含 `waibrain-host` 行的 headless/CLI composition 中挂载同一 preset，断言走相同中性分支且不产生领域记录。把现有 1+N 测试改为直接证明 Host 协调器派发动态配置与 compaction 后历史。
4. 先扩展 `llm-replay` 的 child fixture 绑定为显式稳定 matcher（按外脑 id/label/persona 指纹而不是并发首调顺序），由 Web scaffold 透传并删除 concurrent-subagents XXX；为 scaffold 增加调用方可拥有并复用的 `harnessHome`/`persistenceRoot`，`close()` 不删除外部目录。通过最小 keyless 场景证明现有 harness 能稳定表达动态 N、配置修订和关闭生命周期，未通过前不开始客户端或 UI 接线。
5. 改写 `apps/waibrain/src/dsh-runtime.ts` 为 Typert Remote + 模型目录客户端；按 `{ args }` wire 信封调用 `waibrain/<method>`，保留 wire 单测；删除 `collectTail` 和基于 `【闪念】` 正则推断 Host 状态的浏览器轮询协议。
6. 改写第一个 Tab 状态流：初始 bootstrap、空状态、Agent 新建/选择/保存、外挂外脑增删改开关、对话新建/选择/关闭、发送 admission 和对话视图轮询。保留现有视觉基础，所有“页面草稿/后端待接入”提示改为真实保存状态。
7. 定义 WaiBrain scenario 表与 `apps/waibrain/tests/snapshots/` 预期输出，并把 `apps/waibrain/tests/**/*.snapshot.ts` 与 `apps/web` 一样只在 `DSH_EXAMPLE_MODE === 'lib'` 时加入 `vitest.snapshot.config.ts` 的显式 include 白名单；确认 CI snapshot job 运行同一入口。更新独立页面测试和真实 Host 浏览器 E2E，加入页面关闭继续、历史切换、关闭迟到结果、主路运行中禁发但外脑运行不禁发、超限开关提示和动态 N；用同一持久目录关 Host 再启动验证恢复。真实 provider 冒烟仅在凭据存在时运行，稳定 matcher 的 keyless replay 负责多路并行门禁。
8. 核对新增 `waibrain/*` Session 事件对 TypeScript `examples/jsonrpc-agent/tests/snapshots/` 和 Python `scripts/snapshots/python-sdk-single-exe/` 投影的影响；需要时重录两套预期，不需要时在 PR 说明事件为何未进入相应公共投影。
9. 更新中英文 README、持久化/配置目录、实现计划状态和 Agent Note；把 proposed 持久化提案转为 implemented，删除已被动态 Host 协调器替代的旧静态实现说明。
10. 让 `waibrain:dev` 在 Host 就绪后启动并自动打开 WaiBrain 首页；构建 `apps/waibrain/dist`，验证 5173 的根页面就是该产品界面。

## 验证门禁

- 新包 focused unit tests、real-composition tests 和 invariant tests。
- `apps/waibrain/tests` 的组件、wire 和真实 Host 浏览器 E2E。
- WaiBrain 自有的 `apps/waibrain/tests/snapshots/` 关键无 key snapshot：由 scenario 表复用真实 Host harness，覆盖完整 System Prompt 逐字等于冻结人格文本、稳定 matcher 绑定下同一消息的主路 + 动态 N transcript、配置修订切换，以及关闭后只记录外挂结果；新套件已在 `DSH_EXAMPLE_MODE === 'lib'` 分支进入 `vitest.snapshot.config.ts` 的 snapshot include 白名单。
- `waibrain:typecheck`、`waibrain:build`、受影响 Host package typecheck/build、scoped lint、`pnpm run test:coverage`、`pnpm run test:snapshot` 和 `doc-sync`；同时检查 TypeScript 与 Python SDK snapshot 预期。
- 本地真实 Host 重启两次，验证同一 Agent、选择、对话、消息和外挂外脑状态恢复。
- 有凭据时运行真实 DeepSeek 冒烟，验证主路与外挂外脑均经过标准模型 provider。
- 从待提交 diff 启动真实服务，用浏览器完成验收并录制 PR GIF；随后执行最小 pre-push 检查、Codex PR review、CI 绿灯和合并后远端分支验证。

## 迁移、兼容与回滚

- `waibrain` domain 从版本 1 开始；预发布策略下不读取未知版本。后续字段变化通过单调 domain 版本和显式迁移处理。
- 已有普通 DSH Session 和旧浏览器草稿不自动导入；它们仍可在标准 DSH Web 中查看。
- 回滚代码不会删除 `storages/waibrain.json` 或 Session 日志。重新部署含该服务的版本即可恢复；未知新格式会加载失败并保留文件，不会覆盖。
- 合并目标是 fork 的 `wianao-voice` 产品分支；现有 `wianao-voice -> master` PR 作为正式 stack 上层处理，避免直接改写 master。

## 完成标准

只有最新需求文档列出的七项完成标准全部通过真实 Host 浏览器验收，且代码已 commit、push、PR review、CI 通过并 merge，才标记本计划完成。
