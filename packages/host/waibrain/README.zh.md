---
description: "Host 自有的外脑 Agent 配置、永久对话身份与 1+N 外挂外脑执行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-waibrain

[English](README.md) | 中文

## 概述

服务提供 `ctx.waibrainHost`、持久化 `waibrain` 存储领域，并暴露 Typert Remote namespace `waibrain`：持久的 Agent 角色 revision、绑定标准主 Session 的永久对话身份，以及从同一完成前缀启动全部启用外挂外脑、再把已落定结果作为受限 wake 消息送回的 1+N 执行。

## 目录

- [配置](#configuration)
- [持久记录与 Remote 方法](#durable-records-and-remote-methods)
- [投递与恢复](#delivery-and-recovery)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="configuration"></a>

## 配置

- `maxAdmittedBranches` 限制已保存 Agent revision 中以及单条已接纳消息内启用的外挂外脑数量。
- `externalBrainTimeoutMs` 分别限制每个外挂外脑运行的时长。
- `externalBrainMaxTokens` 限制每个子模型请求的 token 数。
- `maxResultBytes` 限制主 Session 投射中按 UTF-8 保留的结果；完整输出仍以子 Session 为准。

所有值均为必填正安全整数。错误配置在插件初始化阶段失败。

<a id="durable-records-and-remote-methods"></a>

## 持久记录与 Remote 方法

每个 Agent 拥有稳定的 opaque id 与只追加的不可变配置 revision 序列。一个 revision 包含完整可编辑的角色、主模型选择与有序外挂外脑名册。保存使用 `expectedRevision` 比较并设置语义；过期写返回当前 revision 且不覆盖。

每个对话归属一个 Agent 与一个标准主 Session。`bootstrap`、`saveAgent`、`selectAgent`、`createConversation`、`selectConversation`、`conversation`、`prompt` 与 `closeConversation` 构成 Remote API。产品拒绝以带类型的 result 分支返回，而不是抛出传输错误。

`prompt` 按对话串行化接纳、冻结 Agent revision、记录 `waibrain/round-admitted`，然后从同一完成的 Session 前缀启动主 lane 与全部启用的外挂外脑。外挂外脑通过配置的 fork provider 使用普通子 Session。它们的失败与超时独立落定。

标准 Session 日志拥有全部模型可见与生命周期事实。[持久化目录](../../../docs/persistence-catalog.zh.md) 列出了 WaiBrain 事件。Agent 记录、对话归属、选择与创建对话恢复元数据存放在 storage-domain 版本 1。

<a id="delivery-and-recovery"></a>

## 投递与恢复

外挂外脑结果先提交 `waibrain/wake-pending`；此后才允许以 `【闪念】「<label>」<result>` 进入主 inbox。`waibrain/wake-delivered` 保证投递恰好一次。关闭对话提交关闭序列、拒绝后续 prompt，并把待定 wake 转为 `waibrain/wake-discarded-on-close`，而不移除已落定的 lane 结果。

Host 启动时把被上一进程中断的活跃 lane 标记为 `host-restarted`，对账已提交的 wake，并且不会急切发布每个已存储 Session。需要活跃主 Agent 的操作按需恢复它。冷读通过 `sessionQuery` 观察 Session，不恢复 Agent。

`waibrain-dialog` preset 挂载单独导出的 `./session` 插件。它提供冻结的 persona 与模型选择、把工具限制为空集，并拒绝未经 Host 接纳的用户轮次。在绑定 WaiBrain Session 之外选择该 preset 得到中性的零工具对话。

<a id="dev-note"></a>

## 开发备注

设计历史与第一阶段计划见 [durable-agent-conversations 笔记](../../../.agents/notes/implemented/feature/2026-08-24-durable-waibrain-agent-conversations.zh.md)；产品级叙述见 [docs/subsystems/waibrain.md](../../../docs/subsystems/waibrain.zh.md)。冷读走 `sessionQuery.observeSession` 租约；活跃读取使用 `Session.snapshotEvents()`。

<a id="model-experience"></a>

## 模型体验

### 主对话 persona

#### 模型看到什么

每次主请求收到从已接纳 Agent revision 渲染的完整系统提示词：角色名、可选标语、性格、语气、关系场景、问候语、对话示例、用户撰写的 system prompt，以及包自有的「自然说话、不使用工具、吸收有用的 `【闪念】` 结果而不暴露机制」指令。

#### Token 影响

完整 persona 在该请求生命周期内替换其余全部系统提示词段落。其大小取决于冻结的角色字段；更晚的 Agent revision 只影响更晚接纳的用户消息。

#### KV Cache 影响

使用同一 Agent revision 的请求保有稳定的系统提示词前缀。编辑任何角色字段会改变下一条已接纳消息的前缀，并可能使提供方的系统提示词缓存复用失效。

### 外挂外脑子请求

#### 模型看到什么

每个启用的外挂外脑收到与主 lane 相同的已完成对话历史与用户消息，外加其冻结的标签、职责、persona 与「独立作答、不使用工具」的指令。所选提供方、模型与推理强度属于该外挂外脑 revision。

#### Token 影响

每个启用的外挂外脑创建一个受 `externalBrainMaxTokens` 限制的独立模型请求。禁用的外脑不产生请求。历史长度遵循标准 Session fork 行为。

#### KV Cache 影响

并列外挂外脑是独立请求，不共享包级缓存身份。未变化的历史可在同一路由内保留可复用前缀；编辑外挂外脑 persona 或模型选择会改变该请求并可能使复用失效。

### 迟到结果 wake

#### 模型看到什么

对话保持打开期间，每个非空已落定结果以用户角色插件消息 `【闪念】「<label>」<result>` 进入主 Session。已关闭的对话保留 lane 结果，但不向主模型暴露 wake。

#### Token 影响

每个已投递 wake 追加一条受限消息，并可能启动一次额外主模型轮次。空、失败、超时、被中断或被丢弃的 wake 不会向模型请求添加结果文本。

#### KV Cache 影响

已投递 wake 追加在已完成前缀之后，并保留该前缀。Agent revision 变更不会重写旧 wake 消息；投递前关闭对话会完全避免额外请求。

<a id="known-limitations-and-deferred-work"></a>

## 已知限制与暂缓事项

- **不支持自主修改配置**：Host 暴露用户发起的 CRUD，但没有供模型创建、编辑、启停、到期或移除外挂外脑的工具。
- **不支持附加工具、skill 或记忆**：主 Session 与外挂外脑 Session 都刻意保持零工具；增加这些能力需要明确的授权与组合决策。
- **不迁移旧浏览器草稿**：浏览器内存中的旧外脑草稿从未持久化，无法重建为 Agent 记录。
