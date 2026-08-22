# 基于快慢脑双线程的语音对话 Skill 设计方案

> 内部设计/调研记录（中文，草案待评审）。本文不是发布到文档站的内容，不遵循 tutorial/reference 分级与双语成对约束；落位按全局「记录类 md 写 docs/」约定。

## 1. 背景与目标

目标一句话：在 DSH 插件生态上实现 **Talker-Reasoner** 式语音对话——一个快模型（Talker/快脑）负责流畅承接对话，一个或多个慢模型（Reasoner/慢脑）在后台异步深度思考、搜索、捕捉情绪，结果不打断地回灌主对话。

第一阶段只验证一件事：**交互体验闭环**——用户提问后主对话立即响应、不等待；慢脑结果在后续轮次自然插回（「刚才我查了一下…」）。

## 2. 先例调研（避免闭门造车）

这个模式已有正式命名和成熟实践，本方案不重新发明，而是把 DSH 现有能力映射到该模式：

- **Talker-Reasoner 模式**（Google DeepMind，2024-12）：Talker 快速响应维持对话，Reasoner 后台推理并把结果回灌 Talker；LiveKit 将其落地为语音智能体的标准模式，并收入 Agent Patterns Catalog。见 [LiveKit 博客](https://livekit.com/blog/talker-reasoner-pattern-voice-agents)、[Agent Patterns Catalog](https://www.agentpatternscatalog.org/patterns/talker-reasoner/)。
- **DUMA: a Dual-Mind Conversational Agent with Fast and Slow Thinking**（arXiv 2310.18075）：学术界的「双心智快慢思考」对话智能体。见 [arXiv](https://arxiv.org/abs/2310.18075)。
- **Salesforce VoiceAgentRAG**：语音 RAG 的双智能体内存路由，专治语音检索延迟。
- **vaos-voice-bridge**：开源 Talker-Reasoner 实现，PersonaPlex 作 System 1 快响应、Letta/Claude 作 System 2 推理。
- **Fast-in-Slow**（arXiv 2506.01953）：双系统基础模型的学术对照。

结论：用户设想的「快慢脑」即业界的 Talker-Reasoner，方向成立；本方案的价值不在模式创新，而在用 DSH 已有的子智能体、模型路由、会话日志机制低成本落地，并明确「语音 I/O 放 DSH 外部」。

## 3. 方案边界（明确取舍）

三条已对齐的边界：

1. **DSH 只当「脑」，语音 I/O 放外部。** DSH 无音频能力——音频输入在协议层被拒绝，文件读取明确推迟 audio/video，模型上下文只吃图片不吃音频。外部渠道负责转写与合成，DSH 只吃文本进出。
2. **慢脑 = 按需派发的子智能体，第一阶段不做常驻影子。** 主对话判断需要深思考/搜索时才派；「一个慢脑从头到尾旁听全程」延后。
3. **底座用稳定 subagent 工具，不碰实验性 Agent Teams。** 实验性 Agent Teams（roster + 邮箱 + 任务板）是「1 主 + N 子」的实验雏形，但为 private 包、无稳定性承诺，本方案只把它当设计参照。

## 4. 架构映射（核心）

Talker-Reasoner 各概念到 DSH 现成能力的映射：

| 模式概念 | DSH 实现 | 是否现成 |
|---|---|---|
| Talker（快脑） | 主会话 Agent，默认走 `luna` 模型路由 | 现成（纯配置） |
| Reasoner（慢脑） | 后台派发的 one-shot 子智能体，指定 `sosol` 路由 | 现成（纯配置） |
| 非阻塞对话 | one-shot 后台派发（background delegation） | 现成 |
| 结果回灌 | 子智能体结算通知 / report 通道，注入主对话下一轮 | 现成 |
| 1 主 + N 子并行 | 同时派多个后台子智能体，各自独立上下文 | 现成 |
| 高价值内容沉淀 | 慢脑子智能体写文件 / 持久化 session | 现成 |
| 快慢脑用两个模型 | `llm-pi-ai` 手写路由，OpenAI 兼容网关即配置 | 现成（纯配置） |

模型路由：`llm-pi-ai` 支持手写 route（baseURL + 模型 id + `compat` 开关），luna / SOSOL 只要走 OpenAI 兼容网关，就是纯配置，零 adapter 代码。

## 5. 运行流程（一次交互）

1. 用户发问（文本，由外部语音层转写）。
2. 主对话（Talker/luna）立即接话，告知「我先查一下」，同时继续追问补充上下文。
3. 主对话后台派发一个慢脑子智能体（Reasoner/sosol），任务为搜索/深度思考；派发不阻塞主对话。
4. 用户补充的信息，主对话随追问继续传给慢脑做二次加工（后续 follow-up）。
5. 慢脑跑完，DSH 自动往主对话注入结算通知；主对话下一轮自然说出「刚才我查了一下，结果是…」。
6. 需要多路深挖时，主对话并行派多个慢脑，各自独立完成后分别回灌。

## 6. 分阶段实施

- **阶段 1（已落地）**：数据驱动的 1+N 编排——「外脑对话」预设（`~/.dsh/.agent-presets/waibrain-dialog/`）读 `agent.cordis.yml` 里的影子配置，每轮 fork N 个识别影子、命中派干活影子、以「闪念」回灌。验收见 §7；编排器是零 import 的 `.mjs`（用户预设根的解析限制）。
- **阶段 2（待做）**：Web 设置面板——主 agent 角色/任务设置 + N 个可动态增删的影子卡片（任务/模型/思考程度）。
- **阶段 3（延后评估）**：语音 I/O 接入（外部网关对接）。

## 7. 验收方式（怎么算 1+N 闭环成功）

DSH 有硬约束——模型看到的一切都进会话日志、都能重建。用它做可复现验收，分三层：

- **编排器单测（无 key，`waibrain-e2e/orchestrator.spec.ts`）**：坏配置 fail loud；每轮按配置 fork N 个识别影子（provider/model/reasoningEffort 逐字段断言）；命中派干活影子或直接产出；闪念 cap、空不发；depth>0 跳过；主轮次中止信号传播。
- **B0 组合测试（无 key，`waibrain-e2e/composition.spec.ts`）**：经 Loader 挂载真实 `agent.cordis.yml` + 脚本化 mock 模型，断言 subagent 生命周期事件、识别 low / 干活 high 努力度逐级透传、搜索结果进干活 prompt、干活影子零工具、闪念进入第二轮主对话请求。
- **真 API e2e（`waibrain-e2e/e2e-1n.ts`，需 key）**：① 主对话首回复即时且不认怂；② 影子走 fork，识别/干活努力度真实生效；③ 闪念第一人称注入；④ 第二轮自然带出闪念。
- **用户 Web 验收**：网页建会话选「外脑对话」预设 + flash/off 模型，发消息看闪念。

这比「感觉不卡」可验证得多，且前两层能进 CI。

## 8. 风险与取舍

- **回灌时机**：结算通知对空闲主对话会唤醒新 turn，对忙碌主对话注入最近 step 边界——后者体验更好，但依赖主对话仍活跃；需在阶段 0 实测。
- **Token 与成本**：慢脑每次派发都有独立上下文成本；阶段 0 应实测「按需派发 vs 每轮都派」的成本差异。
- **模型路由协议**：luna / SOSOL 若非标准 OpenAI 兼容，需确认 `compat` 开关是否够用（大概率够，个别需适配）。

## 9. 实现蓝图（1+N 数据驱动，已落地）

### 9.1 交付物与落位

- 「外脑对话」预设：用户自建 preset，落位 `~/.dsh/.agent-presets/waibrain-dialog/`（DSH home 用户根；运行中的 Web 进程动态发现，不改仓库、不重启）。仓库侧权威副本在 `waibrain-e2e/fixture/waibrain-dialog/`：e2e 默认挂副本，交付时同步覆盖用户目录。
- 编排插件：预设目录内的相对路径 `orchestrator.mjs`。用户预设根的插件必须零 import（从 `~/.dsh` 出发 Node ESM resolver 看不到仓库 TS 源码，`.ts` 还会触发 require/esm 循环），id 用 `globalThis.crypto.randomUUID()`、深度判断内联、全靠注入的服务干活。
- 模型：主对话 `deepseek-v4-flash` + `reasoningEffort: off`（预设机制不设主模型，web 会话创建时选）；识别影子 `flash + low`，干活影子 `pro + high`（配置驱动）。

### 9.2 1+N 配置（数据驱动）= agent.cordis.yml 编排器行的 config

persona 行（官方 dsh-persona，`includeRuntimeContext: false`）承载主对话人格；编排器行 `config.shadows` 承载 N 个影子：

```yaml
- id: waibrain-orchestrator
  name: './orchestrator.mjs'
  config:
    shadows:
      - id: search
        label: 搜索与新知
        task: 需要查证、搜索或了解外部事实的问题（新闻、影视、吃喝玩乐、名词解释等）
        model: deepseek-v4-flash
        reasoningEffort: low
        search: true                    # 命中后由编排器先 ctx.web.search 再派干活影子
        worker: { model: deepseek-v4-pro, reasoningEffort: high }
```

影子条目：`id` / `label` / `task`（任务描述）/ `model` / `reasoningEffort`（`off|low|high|max`）/ 可选 `search`（bool）/ 可选 `worker`（干活层 `{model, reasoningEffort}`，缺省则识别结果直接当闪念）。坏配置在插件加载时 fail loud。

### 9.3 每轮流程（编排在 agent 之外，确定性）

1. 主对话 `agent/pre-step`（depth 0、step 1、enter）后，编排器 void 并行 fork N 个识别影子——fork 自主对话已完成轮次前缀，同模型同前缀缓存对齐天然成立，主对话永不被阻塞。
2. 识别影子用结构化输出（子作用域 `structured_output` 工具）独立判断「这轮归不归我管」：`{relevant, brief}`。
3. 命中：`search: true` 先 `ctx.web.search`；有 `worker` 则 fork 干活影子（pro+high，brief + 搜索结果进 prompt），否则 brief 直接产出。
4. 结果 trim、剥【闪念】前缀、300 字 cap，`agent.inject` 以第一人称「闪念」非唤醒注入主对话下一轮；任何错误只记日志，不阻塞主对话；主轮次中止信号传播到所有影子。

### 9.4 仓库改动（支撑影子思考程度）

`AgentOptions` 增加 `reasoningEffort`；loop 首请求种子在 options 显式给出努力度时优先于持久化 header 恢复值（修掉 fork 影子与主对话同模型时恢复父 `off` 的陷阱），未给出时维持既有恢复语义。见 Agent Note [2026-08-23-agent-options-reasoning-effort](../.agents/notes/implemented/architecture/2026-08-23-agent-options-reasoning-effort.md)。

### 9.5 端到端验收

见 §7 的三层验收；真 API e2e 输出会话转录与断言结果，可复现。
