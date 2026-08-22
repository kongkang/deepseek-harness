# Agent Note: AgentOptions 上的显式思考程度

Status: implemented

[English](2026-08-23-agent-options-reasoning-effort.md) | 中文

## Problem

被委派的子智能体没有任何通道携带「每个子智能体自己的思考程度」。`AgentOptions` 只声明了 `provider`、`model`、`maxTokens`，而 loop 的请求种子逻辑只从持久化 session header 恢复首请求的 `reasoningEffort`：当 header 的 provider/model 与声明路由一致、且该值未被标记为适配器默认值时恢复，否则不携带、交给适配器默认。

由此产生两个后果。fork 出来的子智能体会话以父的已完成轮次前缀为种子，其中包含父的 `request/header` 事件。当子与父跑同一个 provider/model——比如 flash 识别影子 fork 自 flash 主对话——loop 会把主对话的 `off` 努力度恢复给子，静默丢掉委派方请求的努力度。而模型与父不同的子则根本无法请求任何努力度：每个进程内子智能体都落到适配器默认，因为只有 web 应用和 headless bundle 的模型选择安装器会设置努力度，而两者都只装在父平面上。

## Decision

`AgentOptions` 增加可选的 `reasoningEffort`（`packages/core/agent/src/runtime-types.ts`），与模型选择面用的同一个 `ReasoningEffortId`。loop 的请求种子（`packages/core/agent-loop/src/agent.ts`）在 options 显式给出努力度时用它播首请求，否则才回退到既有的持久化 header 恢复逻辑。后续请求继续跟随已落盘 header，因此该值持久且可重建；模型选择瀑布监听器仍会剥离并覆写它——这正是 web 应用的会话模型选择器对 options 保持优先级的方式。

`resolveChildAgentOptions` 永不复制父的努力度：只有显式的 `requested.reasoningEffort` 会到达子。于是该选项成为委派边界的精确选择——识别影子请求 `low`、干活影子请求 `high`，与父跑什么档无关——而既有会话、恢复路径、以及从不设置该选项的部署保持原有行为，一个字节都不变。

## Consequences

显式请求了努力度的调用方,会在子的首个请求上精确拿到该值,落进它的 `request/header` 并在后续 step 中恢复——waibrain 的识别/干活两级就依赖这一点。该字段在 merge-extensible 的 `AgentOptions` 上,因此子智能体启动请求无需任何 seam 改动即可携带。已发布的 web 应用与 headless 组合都不设置它,这些路径保持原有行为;`packages/core/agent-loop/tests/agent-options-effort.spec.ts` 钉死了优先级(显式 options 努力度 > 持久化 header 恢复 > 适配器默认,模型选择瀑布仍在其上)。

## Alternatives considered

**由插件侧按 child id 挂 `agent/request` 监听器。** 编排器可以自己注册瀑布监听器，用 run-id 映射施加每个影子的努力度，不动仓库代码。否决：映射落在无类型、零 import 的用户模块里，没有清理机制；而且 fork 种子恢复陷阱对所有其他调用方原样保留——同模型的子仍会看到父的努力度，除非监听器抢在它前面。options 字段在努力度被播种的唯一位置修掉了通用缺陷，并带单测覆盖。

**让子继承父的努力度。** 把父的努力度展开进 `resolveChildAgentOptions` 会让委派更省事。否决：把主对话的 `off` 继承进需要思考的影子，正是本次要除掉的陷阱；委派边界上的显式性也与该 seam 既有的 provider/model 覆写契约一致。
