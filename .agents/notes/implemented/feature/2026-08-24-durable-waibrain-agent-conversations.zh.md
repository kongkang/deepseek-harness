# Agent Note: 持久外脑 Agent 对话

Status: implemented

[English](2026-08-24-durable-waibrain-agent-conversations.md) | 中文

## Problem

外脑需要一个公开人格和一组可动态管理的外挂外脑，但浏览器本地草稿与静态预设名单无法保留 Agent 身份、配置改动、永久对话或比页面寿命更长的任务。仅靠标准 Session 日志也无法确定所属 Agent、某条消息接纳的 revision，以及每个外挂外脑结果的产品生命周期。

## Decision

`@deepseek-ai/dsh-host-waibrain` 服务拥有带版本的存储领域和 `waibrain` Typert Remote namespace。Agent 拥有稳定的不透明 id，以及包含全部角色字段、主模型选择和有序外挂外脑定义的不可变配置 revision。Host 拥有当前 Agent 和对话选择状态；独立浏览器界面只编辑并渲染该领域。

每个永久对话属于一个 Agent 和一个使用 `waibrain-dialog` 的标准主 Session。任意数量的对话可以保留同一个 Agent 身份。新建对话带有持久待处理操作记录，因此启动过程会完成或清除被中断的创建，而不会发布无关 Session。

对于每条被接纳的用户消息，协调器会串行提交接纳操作、冻结当前 Agent revision，并将其与消息身份一起记入日志。主路与每个已启用外挂外脑从同一段已完成对话前缀开始。外挂外脑使用普通 fork 子 Session，并分别选择模型、处理超时与结算失败；完整子输出是权威结果，主 Session 只保留有界展示投射。

有用的外挂外脑结果使用先提交再投递的顺序。`waibrain/wake-pending` 在 inbox wake 发生前使结果持久化；`waibrain/wake-delivered` 保证 wake 只发生一次。主模型会把它作为第一人称 `【闪念】` 接收并可自然回应，但绝不接收隐藏推理或外挂外脑工具。

关闭对话会提交输入与输出边界。此后 Host 拒绝新的用户消息，并阻止待投递或迟到的外挂外脑结果唤醒主对话。关闭前已接纳的任务仍可结算并把结果保留在原对话中；关闭不会建立取消树。

Host 重启会把被中断的主路和外挂路标记为 `host-restarted`、协调已提交 wake，并让冷对话保持未发布状态。读取只检查持久化，需要实时 Agent 的操作才会按需恢复对应对话。未经 Host 接纳的用户消息会在进入模型前被拒绝，因此浏览器或插件调用方无法绕过 revision 接纳。

独立界面的对话右栏保持可编辑。新增、编辑、启停或移除外挂外脑都会保存新的 Agent revision，并从下一条被接纳的用户消息生效。部署限制已启用分路数量、单路时长、输出 token 和保留结果字节，但不规定固定产品名单。

## Alternatives considered

**把 Agent 状态保留在页面内存或 localStorage。** 这种方式无法在导航或进程重启后重建 Host 自有任务，也无法证明哪个 revision 产生了一次持久模型请求。

**继续以 `config.shadows` 作为运行名单。** 静态预设可以执行 1+N，但无法创建任意外挂外脑、应用下一条消息生效的编辑、保留 Agent 专属名单或提供永久对话选择。

**为每个外挂外脑运行永久 Session。** 长期存在的同级 Session 会增加所有权、同步和陈旧上下文状态。Fork 子 Session 保留普通 Session 证据，同时让每个已接纳轮次从一个权威已完成前缀开始。

**让浏览器 JavaScript 扇出 Session 调用。** 页面关闭会移除操作所有者，崩溃恢复将依赖重建客户端队列，关闭竞态还可能把结果投递到错误对话。

**关闭对话时取消全部分路。** 取消会丢失已接纳后台任务。提交并丢弃 wake 可以保留可检查结果，同时保持已关闭公开 transcript 不变。

**Host 启动时急切恢复全部对话。** 发布全部已存 Session 会增加启动工作并唤醒不活跃 Agent。按需恢复把持久检查与实时执行分开。

## Consequences

外脑数据可以跨浏览器刷新和 Host 重启保留，多个永久对话共享一个持续演进的 Agent，每条消息都能指出产生公开 transcript 的准确 revision 和分路结果。独立分路让公开对话保持响应，且只投递一次的 wake 标记让崩溃恢复具有确定性。

实现增加了一个 Host 包、Remote 方法、storage-domain 版本 1、Session 事件类型、专用预设配套插件和有界恢复策略。模型可见文本仍可从标准 Session 日志重建；当有界主投射不可用时，子 Session 仍是证据来源。

第一阶段产品仍由用户管理并保持零工具。自动修改或到期外挂外脑、skill、工具和记忆附件需要后续授权与组合决策，不能通过本 Host 服务隐式获得。
