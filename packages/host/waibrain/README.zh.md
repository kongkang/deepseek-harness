# @deepseek-ai/dsh-host-waibrain

[English](README.md) | 中文

Host 自有的外脑 Agent 配置、永久对话身份和 1+N 执行。服务提供 `ctx.waibrainHost`、持久化 `waibrain` 存储领域，并暴露 Typert Remote namespace `waibrain`。

## 配置

- `maxAdmittedBranches` 限制已保存 Agent revision 中以及单条已接纳消息内启用的外挂外脑数量。
- `externalBrainTimeoutMs` 分别限制每个外挂外脑运行的时长。
- `externalBrainMaxTokens` 限制每个子模型请求的 token 数。
- `maxResultBytes` 限制主 Session 投射中按 UTF-8 保留的结果；完整输出仍以子 Session 为准。

所有值都必须是正安全整数。错误配置会在插件初始化时快速失败。

## 持久记录与 Remote 方法

每个 Agent 拥有稳定的不透明 id，以及一串仅追加的不可变配置 revision。Revision 包含完整可编辑角色、主模型选择和有序外挂外脑列表。保存使用 `expectedRevision` 比较并交换语义；陈旧写入会返回当前 revision，而不会覆盖它。

每个对话属于一个 Agent 和一个标准主 Session。`bootstrap`、`saveAgent`、`selectAgent`、`createConversation`、`selectConversation`、`conversation`、`prompt` 与 `closeConversation` 构成 Remote API。产品拒绝通过带类型的结果分支返回，不会作为传输错误抛出。

`prompt` 按对话串行接纳操作，冻结 Agent revision，记录 `waibrain/round-admitted`，然后让主路和每个已启用外挂外脑从同一段已完成 Session 前缀开始。外挂外脑通过已配置的 fork 提供方使用普通子 Session；各路失败与超时相互独立结算。

标准 Session 日志拥有全部模型可见事实和生命周期事实。[持久化目录](../../../docs/persistence-catalog.zh.md)列出了外脑事件。Agent 记录、对话所有权、选择状态与新建对话恢复元数据位于 storage-domain 版本 1。

## 投递与恢复

外挂外脑结果先提交 `waibrain/wake-pending`，之后才可作为 `【闪念】「<label>」<result>` 进入主 inbox。`waibrain/wake-delivered` 保证只投递一次。关闭对话会提交关闭序号、拒绝后续提示，并把待投递 wake 转换为 `waibrain/wake-discarded-on-close`，但不会移除已经结算的分路结果。

Host 启动时会把上一进程中仍在运行的分路标记为 `host-restarted`、协调已提交 wake，并且不会急切发布每个已存 Session。需要实时主 Agent 的操作才会按需恢复它；冷读取只检查持久化，不会恢复 Agent。

`waibrain-dialog` 预设挂载单独导出的 `./session` 插件。它提供冻结的人格和模型选择，把工具限制为空集合，并拒绝未经过 Host 接纳的用户轮次。在未绑定外脑 Session 中选择该预设，会得到中性、零工具的对话。

## 模型体验

### 主对话人格

#### 模型看到什么

每次主请求都会收到由已接纳 Agent revision 渲染的完整系统提示词：角色名、可选的一句话定位、性格、说话方式、关系场景、开场白、对话示例、用户编写的系统提示词，以及本包拥有的指令——自然交谈、不使用工具，并在有帮助时吸收 `【闪念】` 结果而不暴露机制。

#### Token 影响

完整人格会在该请求生命周期内替代其他所有系统提示词 section。其大小由冻结角色字段决定；后续 Agent revision 只影响之后接纳的用户消息。

#### KV Cache 影响

使用同一个 Agent revision 的请求保持稳定系统提示词前缀。编辑任意角色字段都会在下一条已接纳消息中改变该前缀，并可能使提供方无法复用系统提示词缓存。

### 外挂外脑子请求

#### 模型看到什么

每个已启用外挂外脑会收到与主路相同的已完成对话历史和用户消息，以及它冻结的名称、职责、人格和独立回答且不使用工具的指令。所选提供方、模型和思考强度属于该外挂外脑 revision。

#### Token 影响

每个已启用外挂外脑产生一次独立模型请求，受 `externalBrainMaxTokens` 限制。已停用外挂外脑不增加请求。历史长度遵循标准 Session fork 行为。

#### KV Cache 影响

同级外挂外脑是独立请求，不共享包级缓存身份。未改变的历史可以在同一路由内保留提供方可复用前缀；编辑外挂外脑人格或模型选择会改变该请求，并可能使缓存无法复用。

### 迟到结果 wake

#### 模型看到什么

只要对话仍处于打开状态，每个非空结算结果就会作为用户角色插件消息 `【闪念】「<label>」<result>` 进入主 Session。已关闭对话会保留分路结果，但不会把 wake 暴露给主模型。

#### Token 影响

每个已投递 wake 追加一条受限消息，并可能启动一次额外主模型轮次。空、失败、超时、被中断或被丢弃的 wake 不会向模型请求添加结果文本。

#### KV Cache 影响

已投递 wake 追加在已完成前缀之后，并保留该前缀。Agent revision 变更不会重写旧 wake 消息；投递前关闭对话会完全避免额外请求。

## 已知限制与暂缓事项

- **不支持自主修改配置**：Host 暴露用户发起的 CRUD，但没有供模型创建、编辑、启停、到期或移除外挂外脑的工具。
- **不支持附加工具、skill 或记忆**：主 Session 与外挂外脑 Session 都刻意保持零工具；增加这些能力需要明确的授权与组合决策。
- **不迁移旧浏览器草稿**：浏览器内存中的旧外脑草稿从未持久化，无法重建为 Agent 记录。
