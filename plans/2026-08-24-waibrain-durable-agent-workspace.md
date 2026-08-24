# 外脑 Agent 工作区持久化开发计划

状态：待实现

## 目标

把 `apps/waibrain` 从浏览器内存驱动的 Demo 改造成由 DeepSeek Harness Host 持有状态的外脑产品界面。第一阶段完成 Agent 配置保存、对话恢复、1+N 并行运行、动态外脑配置、关闭语义和端到端验收，不实现 skill、工具、记忆或自动自我更新。

需求真源是 [持久化外脑 Agent 对话提案](../.agents/notes/proposed/feature/2026-08-24-durable-waibrain-agent-conversations.zh.md)。既有 [1+N 架构决策](../docs/handoff/handoff-2026-08-22-2235-waibrain-dialog.zh.md)、[回灌与真实 Web 验收](../docs/handoff/handoff-2026-08-23-1817-waibrain-continuation.zh.md)和 [1+N 实现蓝图](2026-08-23-voice-skill-dual-brain-design.md)继续有效；独立 Demo 的浏览器编排不是运行真源。

## 已验证的当前状态

- `apps/waibrain/src/app.ts` 的 `initialState()` 持有角色、外脑、开关、Session 绑定、消息和当前页面；每次挂载都会回到示例角色“林川”。
- `DshRuntimeClient` 只提供模型目录、创建 Session 和“发消息后轮询 history”三类操作，没有 Agent 列表、配置版本、对话索引、恢复、新对话或关闭 API。
- 当前页面先启动主 Session 请求，再启动独立外脑 Session 请求，并把每个结果分别排进 `mainQueue`；这不是既有 Host 端识别影子、工作 agent 和合并闪念编排器。
- DSH 已提供可复用能力：Session 事件日志与 JSONL/SQLite 持久化、`session.list`/`session.history` 冷读取、`ctx.agents.create/resume`、Agent preset、Typert Remote、`storage-domain` 及 JSON/SQLite 后端。
- Web 组合已经挂载 `storage-json` 和 `storage-domain`，因此第一阶段可以把非 Session 图数据放在 `$DSH_HOME/storages`，无需浏览器存储或新增数据库依赖。部署以后可以只改 domain route 切换到 SQLite。
- `waibrain-e2e` 中的既有 Host 编排器证明了 Flash/off/零工具 Talker、N 个 Flash/low 识别影子、命中后的 Pro/high 工作 agent、`【闪念】` 回灌和抛错隔离；它仍从固定 YAML 读取配置，而且“等待全部识别再启动全部 worker”的全局栅栏会让一个永久挂起的识别分支拖住其他分支。

## 范围

### 本阶段包含

- 创建、选择和更新多个 Agent。
- 保存角色表单当前全部字段、主模型选择、外脑表单当前全部字段、模型选择、推理强度、工作 agent 开关和启用状态。
- 一个 Agent 下创建多场对话，恢复上次所选对话，并查看旧对话。
- 每条消息并行启动 Talker 和所有已启用外脑，保留既有识别/工作 agent 内部流程。
- 动态增加、编辑、启用和关闭外脑；变更从下一条用户消息生效。
- 页面刷新、关闭和重新连接不影响 Host 工作。
- 用户明确关闭对话后停止主对话和新输入，但让已经接纳的外脑完成并把结果记录回原对话。
- 记录每条消息使用的 Agent 配置版本、外脑集合、开关状态、分支开始和结算结果。
- 无密钥单元、真实组合、Session snapshot 和浏览器 e2e，以及单独的真实提供方冒烟测试入口。

### 本阶段不包含

- skill、工具或记忆的选择、安装、权限和执行。
- 由模型自动修改 Agent 的自我更新和 24 小时外脑期限。
- 用户认证、多租户、公开互联网部署或跨设备同步。
- 删除 Agent、删除历史对话或迁移从未持久化的浏览器内存配置。
- 把 Talker 改成推理模型，或让模型负责外脑编排。

## 目标架构

### Host 领域服务

新增私有插件包 `packages/experimental/waibrain/`，导出 `WaiBrainService`，注册 `ctx.waibrain` 并通过 Typert Remote 暴露 `waibrain/*` 操作。该服务是 Agent 配置、对话索引、配置接纳、运行关联和关闭状态的唯一写入者。

该包注入 `storageDomain`、`sessionPersistence`、`sessions`、`agents`、`agentPresets`、`systemPrompt`、`subagents` 和模型服务，只依赖 Service Definition，不依赖 JSON 或 SQLite 具体提供方。`packages/experimental/AGENTS.md` 禁止发布包和 app manifest 依赖实验包，因此正式 Web bundle 不引用它；开发入口通过专用 overlay 挂载，`apps/waibrain` 只调用 Remote 和现有模型目录/历史读取接口。

仓库内组合拆成两种不同格式：`examples/waibrain/cordis.yml` 是可以直接 boot 的完整 entry-list leaf，`examples/waibrain/cordis.patch.yml` 是供现有 Web profile 叠加的 patch-list overlay；两者复用同一 preset 目录。entry-list leaf 用于 Loader 解析、进程内编排、keyless snapshot 和 with-key smoke；冷 Agent lookup、`agentId` wire 与浏览器恢复统一由包含 `dsh-api-remotes` 和 `dsh-api-gateway` 的 patch overlay + Web scaffold 验证。`scripts/dev-waibrain.ts` 启动 Host 时显式传入 `--patch`，浏览器 e2e 通过 `launchWebScaffold({ extraOverlayPath, agentPresets })` 挂载 patch-list。实验包进入 `examples/package.json`、所需 TypeScript face aggregate 和根 `devDependencies`，不进入任何 release member 的依赖字段。

profile 的裸包解析只扫描发布 CLI 的依赖闭包，无法自然看到实验包。开发脚本在启动 Host 前把 `@deepseek-ai/dsh-experimental-waibrain` 显式链接到 `$DSH_HOME/profiles/node_modules`；链接使用与 app-boot 相同的 scoped package 目录和可重入 symlink 规则，测试覆盖正确链接、已存在正确链接和冲突目标失败。Web scaffold 先依赖现有 vitest tsconfig-paths 源码解析；只有聚焦 Loader 测试证明确实绕过 paths 时，才增加有当前用例和 JSDoc 的 `extraModuleLinks` 选项。

入口严格区分源码面和产物面。包单元测试、`vitest.waibrain.config.ts` 与 Web e2e 通过 tsconfig paths 运行 `src/`；`waibrain:dev` 的 profile link 和可 boot example leaf 通过 package exports 运行 `lib/`。开发脚本先完成实验包初次构建，再启动 build watcher；后续成功重建会主动重启 Host 并让 UI 通过持久化 API 重连，不能让页面刷新静默使用旧 `lib/`。进程监管显式区分主动 Host 重启和异常退出：主动重启保持 UI、端口与 `$DSH_HOME`，轮询暂时显示可恢复网络状态而不清空投影。example smoke 和 Loader 解析门禁显式依赖实验包 build。

### 持久化分工

| 数据 | 真源 | 原因 |
|---|---|---|
| Agent 当前记录和不可变配置版本 | `storage-domain` 的 `waibrain` domain | 它们跨越多场 Session，不属于单一对话日志 |
| Agent 到对话的索引、当前所选对话、对话开放/关闭状态 | `waibrain` domain | 支持冷启动列表与恢复，不扫描所有事件正文 |
| 用户消息、主回复、外脑运行和结果、配置生效边界、关闭事件 | 主 Session 事件日志 | 历史、恢复、模型上下文和 UI 时间轴从同一事件流重建 |
| 识别影子和工作 agent 的完整执行 | 各自 DSH 子 Session | 保留现有 subagent 生命周期、模型选择和持久记录 |
| 浏览器状态 | Host 响应的临时投影 | 浏览器不保存业务真源，刷新后可全部重建 |

### Domain schema v0

`agents` 表按 branded `WaiBrainAgentId` 保存当前 revision 指针、创建/更新时间和当前配置；`revisions` 表使用单段 branded `WaiBrainRevisionKey`（由 Agent id 与单调 revision 编码）保存不可变快照，不假设 storage-domain 支持复合键；`conversations` 表按主 `SessionId` 保存 Agent id、创建时间、`creating/open/closed` 状态和最后活动时间；global 记录最后所选 Agent 与对话。

Agent 配置快照包含角色表单的 `name`、`tagline`、`personality`、`voice`、`scenario`、`greeting`、`examples`、`systemPrompt`，主模型 `provider/model/reasoningEffort`，以及有稳定 branded id 的有序外脑列表。每个外脑保存名称、职责、系统提示词、颜色、识别模型选择、工作 agent 配置和 `enabled`。

Domain 只保存非 Session 图数据。每次写入使用服务内按 Agent 或对话串行的队列，先完成后端持久化再发布内存状态和 Remote 结果；配置更新使用 revision compare-and-set，先用稳定 operation id 写不可变 revision 和对应 `config-changed` 事件，再推进 current 指针。崩溃恢复在接纳新 send 前完成未提交 operation；已经存在且内容相同的 revision/事件视为幂等重试，孤立 revision 不会成为 current。storage-domain 不提供跨表事务，所以所有跨记录流程都使用显式提交状态、固定写入顺序和幂等恢复，不使用事务措辞或假设。

插件 `Config` 显式校验部署可调参数，包括允许作为 Talker Flash 的 `provider/model` 路由集合、每分支超时、单轮最大并发分支数、闪念聚合窗口、中断修复重试间隔与上限、结果长度上限、历史页大小上限、增量页大小上限和客户端建议轮询间隔。产品数据不设置固定外脑卡片总数；create/update 在最早可判定点拒绝 Talker 路由不在允许集合或 enabled 数超过当前部署并发上限的配置，并返回权威允许集合/上限供 UI 展示。send 保留相同检查，以便部署运行中调整配置后在接纳消息前明确失败整轮请求，不能分批假装并行或静默跳过。Talker 的 reasoning 必须为 off，零工具由专用 preset 的空 allow-list 和 package runtime invariant 保证；插件不硬编码 Flash model id 或工具 deny 名单。

### Session 事件和消息来源

在 WaiBrain 包中扩展 `SessionEventMap`，至少记录以下持久事实：

- `waibrain/config-changed`：哪次用户操作创建了哪个新 revision，以及它从下一条用户消息生效。
- `waibrain/turn-dispatched`：稳定 turn id、当前用户消息 id、实际接纳的 revision，以及本轮启用的外脑 id 集合。
- `waibrain/brain-started`：外脑 id、子 Session id 和所属 turn id。
- `waibrain/brain-settled`：成功结果或明确失败、所属 turn id、外脑 id、子 Session id 和配置 revision。
- `waibrain/conversation-closed`：关闭提交点，以及提交时仍在运行的外脑 id。

普通用户输入继续使用标准 `source.kind: 'user'`，保留会话标题、continuation 和所有既有 user-source 消费者的行为；Agent id、对话 id、turn id、revision 和用户消息 id 的关联全部写入 `waibrain/turn-dispatched`。开放对话中的闪念 follow-up 复用既有内部 plugin source，并通过持久事件关联原始 turn 与外脑；关闭后的分支只追加 `brain-settled`，不再创建模型可见 follow-up。

所有事件使用闭合、严格验证的 v0 payload。实现同时更新 TypeScript 和 Python SDK 的 Session 事件预期输出；不把新模型可见输入藏在 sidecar 或浏览器内存中。

### Remote API

`WaiBrainService` 提供明确的业务结果联合类型，存储损坏和生命周期错误直接 reject，不伪装成“找不到”：

- `waibrain/listAgents({ cursor?, limit? })`：有界返回 Agent 摘要、当前 revision、最后所选项和下一页游标。
- `waibrain/getAgent({ agentId })`：返回当前完整配置。
- `waibrain/createAgent({ config })`：校验全量配置并创建 revision 1。
- `waibrain/updateAgent({ agentId, ifRevision, config, conversationId? })`：创建下一 revision，并在发起变更的对话记录下一消息生效事件。
- `waibrain/listConversations({ agentId, cursor?, limit? })`：有界返回该 Agent 的历史对话，按最后活动时间排序。
- `waibrain/createConversation({ agentId })`：以 Agent 当前 revision 创建新的主 Session，保留旧对话。
- `waibrain/getConversation({ conversationId, beforeSeq?, maxMessages? })`：返回有界的尾页或更早一页、`hasMore`、最新 seq、对话状态和当前活动分支；只读取 domain 与 Session 历史，不恢复或驱动模型。
- `waibrain/pollConversation({ conversationId, afterSeq, limit? })`：有界返回指定 seq 之后的事件、活动分支、`hasMore`、下一游标和 Host 配置的建议重试间隔；页面重连先冷读尾页，再从最新 seq 增量轮询。
- `waibrain/send(agent, { content, clientTimeZone? })`：首个 `Agent` lookup 参数在 wire 上使用 `agentId`，其值是对话的主 Session id；方法从 Agent 取得身份，在对话队列中接纳配置快照并发送本轮消息，返回稳定 turn/message id，不等待模型结算。
- `waibrain/closeConversation({ conversationId })`：提交关闭状态、停止主输出并拒绝后续输入，不等待已经接纳的外脑完成。
- `waibrain/select({ agentId, conversationId? })`：保存刷新后恢复所需的本地单用户选择。

Remote 使用 `/api/waibrain/<method>` 的 Typert Gateway 传输和生成 schema。实验包提供不导入 Host 代码的 `./types` 与 `./client` 出口；`apps/waibrain/vite.config.ts` 启用 tsconfig paths，从根 `devDependencies` 解析 client-only 类型。`apps/waibrain/src/dsh-runtime.ts` 改为类型化 WaiBrain 客户端，不再从浏览器分别创建和排队主/分支 Session。

读操作、配置操作和 close 使用 Host 全局 Remote，不触发 Agent 恢复；`send` 使用 Typert 的 `Agent` lookup 参数，生成描述符的身份 wire 字段是 `agentId`，值仍是 conversation 的主 Session id。该 lookup 已由 `createApiRemoteAgentResolver` 配置到共享 single-flight 恢复路径；业务 request 不重复携带 `conversationId`，方法断言 Agent id 对应一条 WaiBrain conversation。

页面可见且对话存在未结算分支时，客户端按 Host 返回的建议间隔调用 `pollConversation`；稳定空闲时使用有界退避。页面关闭只终止轮询请求。每次重连都先调用 `getConversation` 补齐遗漏事件，因此增量通道不承担重放真源职责。

Host 启动时只把自身拥有的 domain 半提交作为写入硬门，继续 `creating → open` 和未提交配置 operation；它不在全局启动路径强写其他组件可能正在 resume 的冷 Session。`getConversation`/`pollConversation` 从事件流与本进程 active-run 表派生分支状态：存在 `brain-started`、没有匹配 `brain-settled`、本进程也没有对应运行时，立即投影为 `host-interrupted`，因此重连 UI 不会继续转圈。

持久的 `host-interrupted` 结算采用稳定 operation id 和非阻塞惰性修复。下一次 send 经共享 lookup 取得 live Agent 后，在同一 conversation 队列中先重读尾部、恰好补写一次结算，再接纳新 turn；closed 对话和没有后续 send 的对话由后台 best-effort repair 重读后追加。Session 预留冲突或 seq 推进只让该对话重读并有界重试，不能阻止服务发布，也不能影响其他 Agent、读操作或写操作。合成结算永不触发闪念 follow-up；在持久写入完成前，读时投影保持同样的已中断结果。

## 关键运行流程

### 保存 Agent

1. UI 收集当前表单全部字段并调用 create/update。
2. Host 完整校验字段、模型选择、重复外脑 id、enabled 外脑数量和 Talker 的 Flash/off 要求；Flash 根据插件 Config 的允许路由集合判定，错误携带权威允许集合或并发上限。零工具在组合期由 preset 限制，并由运行期 invariant 断言实际可见工具集为空。
3. Host 在 Agent 串行队列中 compare-and-set 当前 revision，持久化不可变快照，再更新 current 指针。
4. 如果变更来自一场对话，Host 向该主 Session 追加 `config-changed`；该对话已关闭时只更新 Agent，不能唤醒对话。
5. UI 使用 Host 返回快照替换本地投影，不自行猜测保存成功。

### 新建与恢复对话

1. createConversation 读取 Agent 当前 revision 和外脑开关，预分配主 Session id，并先写一条不对列表发布的 `creating` conversation 记录，其中保存重试所需的 Agent id、revision、cwd 和 preset。
2. Host 使用该固定 id 创建主 Session；同 id、同 cwd、同 preset 的重试复用既有 Session，冲突则明确失败。Session 创建成功后把 conversation 改为 `open`，再更新当前选择；恢复扫描对 `creating` 记录按同一输入补建 Session，或在 Session 已存在时完成发布。
3. 主 Session header 记录仓库 fixture 中稳定的 `waibrain` preset。preset 挂载 WaiBrain 的 Agent-scope consumer：它从本轮 `turn-dispatched` revision 提供人物 prompt 和 Flash/off 模型选择，agent-loop 仍把实际模型配置和完整 system prompt 记入每轮 `request/header`。
4. 页面刷新只调用有界 list/get/history，不创建或恢复 Agent。真正发送消息时，通过 Host 已有的共享 Typert Agent resolver 按 Session header 重建同一个 preset；WaiBrain 不实现第二套 resume 缓存或争夺 Session 所有权。
5. New Conversation 创建新主 Session；旧 Session、domain 行和事件日志保持不变。

### 并行发送

1. send 在对话串行队列中拒绝 closed 状态，读取 Agent 当前 revision，并创建稳定 turn/message id。
2. send 在接纳标准 user message 的同一提交点追加 `waibrain/turn-dispatched`。WaiBrain `agent/pre-step` 监听器只有同时满足“当前主 Session 在 domain 中对应一场 `open` WaiBrain conversation”和“委派深度为 0”才编排；它按 turn id 从该事件或同源的服务内接纳记录取得冻结 revision 和 enabled 集合，在进入主模型步骤前启动所有已启用外脑。它不从 user source 或 Message 私有字段取配置，也不处理普通 DSH 会话或任何识别/worker 子 Agent 的 step。
3. 每个外脑从同一已完成主对话前缀 fork，并各自运行“识别→可选搜索→worker→结算→回灌”的独立 pipeline。协调器先启动所有已启用 pipeline，再让 Talker 继续；任何 pipeline 都不等待其他分支完成识别或 worker。
4. Talker 使用 Flash/off/零工具直接承接用户。测试用闩锁证明所有分支已启动后才释放任一路结果，不依赖真实延迟推断并行。
5. 每个分支受 Config 中的独立超时约束，结算时先追加 `brain-settled`。同一 turn 的首个有效闪念启动短聚合窗口；窗口到期或全部分支结算时，按 Agent 配置中的分支顺序合并当前已结算闪念并只发起一次 follow-up，晚到闪念进入下一窗口。任何窗口都不等待未结算兄弟；flush 时对话已 closed 则只保留结果、不 followup。抛错、超时或永久不结算的测试分支都不能阻塞 Talker 和兄弟分支。

### 配置生效

配置更新不修改已经接纳的 turn。下一次 send 读取新 revision，并把该 revision 与实际启用分支集合写入 `turn-dispatched`；因此动态增加、编辑、启用或关闭外脑都从下一条消息统一生效。

新增加的外脑第一次 fork 时继承当前主 Session 已完成前缀。DSH 现有压缩事件继续决定模型输入是完整原文还是摘要加近期消息；WaiBrain 不再维护第二份模型摘要。UI 回看走完整 Session 事件分页，不把压缩后的模型上下文误当成用户可见历史。

### 页面关闭和主动关闭对话

浏览器 fetch 或页面生命周期的 AbortSignal 只取消该次 Remote 等待，不能传入已经接纳的 Agent 或 subagent 运行。send 在持久接纳后返回，Host 持有剩余生命周期。

closeConversation 先在对话队列中持久化 closed 状态和 `conversation-closed`，关闭后续输入接纳，再只取消主 Agent 当前公开 turn。WaiBrain 编排器对这类关闭不把主 Agent abort 传播给已启动外脑；普通“停止当前生成”仍可保留现有取消语义。

关闭提交后的 `assistant/message` 不得进入公开 transcript。已经启动的外脑继续结算并追加结果事件；结果不调用 `followup`。全部分支结算后，服务可以释放主 Agent 句柄，使对话冷却，但不会删除 Session 或 domain 行。

## 实施顺序

### 1. 先写失败测试和类型约定

- 在 `packages/experimental/waibrain/tests/` 建立 domain、revision、发送、关闭竞态和恢复测试，先使用内存 storage backend、脚本化模型与现有 subagent testkit。
- 增加真实 Loader 组合 fixture，挂载 storage-domain、Session persistence、Agent loop、preset、subagent provider、WaiBrain 服务和 `dsh-api-remotes`；验证真实 wire 的 lane 再挂 `dsh-api-gateway`，确保冷 Agent lookup 由共享 resolver 接管。
- 在 `apps/waibrain/tests/` 先增加“保存后卸载再挂载”“刷新不创建新 Session”“新对话继承配置”“关闭页面后台完成”“主动关闭只停止主回复”“结果不串对话”的失败用例。
- 增加 keyless Session snapshot 场景，固定一条用户消息对应的配置 revision、并行分支开始、分支结果和 Talker 公开输出。

### 2. 建立 WaiBrain Host 包

- 新增 `packages/experimental/waibrain/package.json`、tsconfig、`src/types.ts`、`src/spec.ts`、`src/events.ts`、`src/index.ts`、`src/invariant.ts`、测试和双语 README。
- 在 `packages/experimental/README.md` 及中文对侧登记包和 `ctx.waibrain`；更新根 TypeScript aggregate、paths、workspace 约束和 package invariant 清单所需生成源。
- 新增可 boot 的 `examples/waibrain/cordis.yml`、独立 `cordis.patch.yml` overlay 与 persona-only preset；在 `examples/package.json`、所需 TypeScript face aggregate 和根 `devDependencies` 登记实验包，并为 example leaf 增加 keyless 与 with-key smoke。不得修改发布 Web bundle 对实验包的依赖。
- `scripts/dev-waibrain.ts` 先完成产物构建并安装 profile module link，再通过 `--patch` 挂载；其 build watcher 在源码变化后重建并主动重启 Host。监管器为主动重启单独设状态，不触发“任一子进程退出即停掉全组”的异常路径，保持 UI、Host 端口和 `$DSH_HOME` 不变。example leaf 的 plain-Node smoke 同样先声明实验包 build 依赖。用真实 Loader boot 证明 overlay 与 preset 中的实验包裸名能从 `lib/` 解析。
- Web scaffold 先只用 `extraOverlayPath`、`agentPresets` 和现有 tsconfig paths 运行源码面测试；只有这个真实测试出现 module-resolution 失败时才增加 `extraModuleLinks`，不得预先增加无使用者的抽象。
- 为实验包增加纯类型 `./client` 出口，在 `apps/waibrain/vite.config.ts` 接入 tsconfig paths，并只把实验包加入根 `devDependencies`。
- 把 `waibrain-e2e/fixture/waibrain-dialog/orchestrator.mjs` 的运行逻辑迁入可注入 `ctx.waibrain` 的仓库插件代码；preset 只保留稳定 Agent 组合，revision 中的人物 prompt 和模型选择在每轮覆盖 preset 默认值。

### 3. 实现持久化和恢复

- 定义 domain v0 与 branded ids，完成严格 schema、revision compare-and-set、Agent/对话串行队列和 dispose drain。
- 实现 Agent create/list/get/update、conversation create/list/get/select/poll，所有列表、历史和增量结果都执行服务端完整结果上限。
- 实现 `creating → open` 提交序与启动恢复器：有 `creating` 行但无 Session 时按固定 id 重试创建，有同 id Session 时完成发布；测试分别在 Session 创建前后注入崩溃。
- 冷恢复只走现有共享 Typert Agent resolver：Session header 重建稳定 preset，Agent-scope WaiBrain consumer 再从已接纳 revision 提供每轮 prompt 和模型选择。不得复用 API Proxy 私有 helper 或另建 resume 缓存。
- 对现有独立 Demo Session 不做猜测迁移；测试确认它们仍由普通 `session.list/history` 查看。

### 4. 实现并行编排与关闭状态机

- 保持标准 user source，增加 WaiBrain durable events，在 send 接纳边界冻结 revision 与外脑集合，并在同一步更新事件类型目录生成产物和 TypeScript/Python SDK 预期输出。
- 把既有识别影子、工作 agent、搜索、诚实措辞、闪念回灌、错误隔离和“仅 open WaiBrain 根对话、委派深度 0”非递归守卫迁入 Host 包；移除跨分支全局栅栏，使用独立 pipeline、可配置分支超时和可配置并发上限。
- 将外脑运行的取消控制器从浏览器请求分离。普通运行取消与 conversation close 使用不同原因；close 只阻止主公开输出和新输入。
- 为 close/branch-settle、update/send、refresh/in-flight、Host dispose/in-flight 建立确定状态转换和竞态测试；读时投影立即把旧进程遗留的 started-only 分支显示为 `host-interrupted`，惰性修复在 Session 可写时恰好追加一次、不 followup，并允许对话继续接纳下一轮。
- 为每个运行时失败、超时、compare-and-set 和竞态分支补齐对应用例，满足 `packages/*/*/src` 每文件 100% 覆盖率门禁。

### 5. 改造独立 UI

- 把 `apps/waibrain/src/app.ts` 的业务 `initialState()` 改成 Host bootstrap 投影；只保留未保存表单草稿、当前视图和瞬时网络状态。
- 第一 tab 增加 Agent 新建/选择/保存入口，并让角色和所有外脑字段通过 revision API 往返。
- 增加历史对话列表、新对话、关闭对话和关闭状态展示；刷新后恢复 Host 记录的当前选择。
- 外脑卡片保留增改和开关；识别影子默认折叠或隐藏，展示工作状态和简洁结果，不显示隐藏思考。
- 对话和时间轴先从有界历史尾页恢复，再用增量游标轮询主 Session 和 WaiBrain 事件；加载更早页面可完整回看压缩前历史，不从本地 `turns` 数组构造事实。
- 页面断开、切后台、网络重连和增量页截断都使用同一游标协议测试；任何客户端 AbortSignal 都只结束读取，不传入已接纳的 Host 工作。
- 手写 Typert fetch 客户端对 Agent lookup 参数使用网关声明的 `agentId` wire 字段，其值取当前对话的主 Session id；真实 Gateway 组合测试验证 payload，不以 mock 客户端通过代替。

### 6. 更新公开约定与验证入口

- 更新 `apps/waibrain/README.md` 和中文对侧，删除浏览器编排与刷新限制的旧描述，记录 Host 持久化、恢复和关闭语义。
- 更新独立界面的 implemented Agent Note，说明 Host 领域服务成为图真源；实现完成时把本提案移到 `implemented/` 并按 implemented 格式改写。
- 更新 `docs/architecture.md` 的 WaiBrain 扩展点、对应 subsystem 页面或包 README、模块图、配置目录和持久化目录生成源。
- 把 `vitest.waibrain.config.ts` 改成可从主检出或任意 linked worktree 解析依赖与项目 root 的标准配置，移除对 `../../node_modules` 的目录假设。

## Test-first 验收矩阵

| 场景 | 最低测试层 | 必须证明 |
|---|---|---|
| Agent 全字段保存 | Host 单元 + 浏览器 e2e | 每个字段和外脑顺序逐字段 round-trip |
| 页面刷新 | 浏览器 e2e | 不创建新 Session，恢复当前 Agent、对话、消息和开关 |
| Host 重启 | 真实组合 | domain 和 Session 冷恢复后继续同一对话 |
| 分支运行中 Host 重启 | 恢复单元 + 真实组合 | started-only 分支立即投影为 `host-interrupted`、不 followup，重连不再转圈且可发送下一条消息 |
| 中断修复与 resume 竞态 | 竞态单元 + 真实组合 | 并发 resume/seq 推进时重读并恰好补写一次；暂时不可写不阻塞服务，读投影始终显示已中断 |
| 新对话 | Host + 浏览器 | Agent 不变、空 transcript、旧对话可查看、开关继承 |
| 并行 1+N | 闩锁单元 + 真实组合 | Talker 与全部 enabled 分支均已启动后才允许任一路结算 |
| 编排范围 | 真实组合 | 同一 Host 的普通 DSH Session 启动零外脑；识别/worker 子 Agent 不递归产生嵌套分支 |
| 接纳快照一致性 | Host + snapshot | pre-step 使用的 revision/分支集合与同 turn 的 `turn-dispatched` 完全一致，user source 仍是标准 `user` |
| 外脑开关/编辑/新增 | Host + snapshot | 当前 turn 不变，下一条消息使用新 revision |
| 新外脑历史 | 真实组合 | fork 取得本对话前缀，不取得其他对话内容 |
| 页面关闭时运行 | 浏览器 e2e | 页面断开后 Host 完成，重连后结果存在 |
| 主动关闭对话 | 竞态单元 + 浏览器 e2e | 主回复立即停止，已启动外脑完成并记录，绝不 followup |
| 跨对话隔离 | Host + snapshot | 旧 turn 的结果只引用旧 conversation id |
| 分支失败 | 真实组合 | Talker 和兄弟分支完成，失败有 durable 记录 |
| 分支永久挂起 | 闩锁单元 + 真实组合 | 该分支按配置超时，Talker、兄弟 pipeline 和已完成闪念不等待它 |
| 闪念聚合 | fake timer + snapshot | 窗口内多路结果合成一次 follow-up，晚到结果另起窗口，关闭后的 flush 不产生公开回复 |
| 配置冲突 | Host 单元 | 陈旧 revision 返回权威 current，不覆盖新配置 |
| Talker 路由与 enabled 超限 | Host + 浏览器 | create/update 拒绝非允许 Flash 路由或超限 enabled 集合并返回权威配置；部署配置变化后 send 仍防御性拒绝 |
| 崩溃半提交恢复 | Host 单元 | Session 创建前崩溃会按固定 id 补建；创建后崩溃会完成 `creating → open`，列表不暴露半个图 |
| 异步结果增量 | Host + 浏览器 | send 返回后 Talker、分支状态和迟到结果按 seq 到达；断线重连冷读补齐且不重复 |
| 长对话回看 | Host + 浏览器 | 压缩过的对话可按 bounded pages 回看完整可见历史，页间无缺失或重复 |
| Talker 零工具 | invariant + 真实组合 | 主 Agent 实际可见工具集为空，而不是只检查配置字段或 deny 名单 |
| Agent lookup wire | 真实 Gateway 组合 | 手写客户端的 `agentId` 被 Agent lookup 接受，值等于主 Session id，且业务 request 不重复身份字段 |

测试数据使用唯一 run id，创建的临时 storage root 和 Session 在测试结束后清理。真实提供方只运行最小 1+1 冒烟测试，不把凭据、提示词原文或私有 transcript 写进测试产物。

## 验证命令

实现阶段根据实际 diff 运行最小覆盖集，预期至少包括：

```sh
pnpm exec vitest run packages/experimental/waibrain/tests
pnpm run waibrain:test
pnpm run waibrain:typecheck
pnpm run waibrain:build
pnpm exec vitest run --config vitest.waibrain.config.ts
pnpm exec vitest run --config vitest.web.config.ts apps/waibrain/tests/waibrain.e2e.ts
pnpm run test:snapshot -- -t waibrain
pnpm run test:coverage
pnpm run doc-sync
pnpm run lint
git diff --check
```

新增实验包、公共 exports、生成 Remote 和 overlay 解析路径都属于本计划的固定变化，因此同时运行 `pnpm run build`、`pnpm run hygiene`、workspace constraints 和 WaiBrain built smoke。只有存在已配置密钥并得到授权时才运行真实 API 冒烟；无密钥不能被报告成真实提供方通过。

## 迁移、发布与回滚

Domain 从 version 0 开始，预发布阶段不承诺兼容旧格式。当前浏览器内存没有可迁移的持久配置；旧独立 Demo Session 保留为普通历史 Session，不自动关联到新 Agent。

第一阶段只面向本地受信 Host。上线到公开网络前另行增加认证、用户归属、授权、保留策略、跨设备选择和部署验收；本计划完成不等于生产发布。

发布时先跑 keyless 全闭环，再在本地真实浏览器执行：创建 Agent、保存三个外脑、刷新、重启 Host、继续对话、切换开关、新建对话、关闭旧对话并观察迟到结果。真实提供方 smoke 与用户浏览器验收是两个独立证据。

回滚时从开发入口移除 WaiBrain overlay 并恢复独立 Demo 入口；发布 Web bundle 本身没有实验包依赖。保留 domain 文件和 Session 日志，不删除用户数据。回滚后的旧 Demo 不读取新 domain，重新启用前由同版本插件恢复。
