# Agent Note: 外脑对话轮询改为局部 patch，不再整页重绘

Status: implemented

[English](2026-08-25-waibrain-poll-local-dom-patch.md) | 中文

## Problem

`apps/waibrain` 的 `refreshConversation()` 每 `pollIntervalMs`（生产环境 500ms）轮询一次 Host，只要请求成功，就无条件替换 `state.conversation` 并调用 `render()`——而 `render()` 是用 `target.innerHTML` 重写整个 app shell。任何正在进行的交互——打开的原生 `<select>`、正获得焦点的输入框、角色卡表单里未保存的文字——都会在下一次轮询时被销毁，即便对话内容其实没有变化。测试套件之所以没能拦住这个问题，是因为测试里 `pollIntervalMs` 固定写死成 60 秒，远超单次测试运行时长，轮询在测试期间根本不会触发。

## Decision

`refreshConversation()` 现在先用 `JSON.stringify` 比较本次轮询结果和 `state.conversation`；结果没变化就直接返回，既不改状态也不碰 DOM。结果确实不同时，`state.conversation` 会被更新，除下文所述的例外情况外，接下来运行的是 `patchConversationView()` 而不是完整的 `render()`，按当前 `state.view` 做局部 patch：

- `studio` 视图有意不做任何 DOM 操作。studio 页面不读取 `state.conversation`，所以轮询只会把它刷新到内存里；下一次真正的 render（切 tab、保存等）自然会用上最新值。
- `conversation` 视图只 patch 两处子树——`.chat-scroll` 和 `.runtime-branch-list`，用的是完整渲染同样使用的 `renderChatScrollContent` 和 `renderRuntimeBrainList` 函数，所以后端真实发生的变化（新消息、某个外挂外脑跑完）依然能显示出来，同时不打扰输入框、头部和正打开的外挂外脑编辑器。
- `timeline` 视图只 patch `.wb-round-list`，通过 `renderRoundListContent`。

对话头部和输入框里渲染的是由 `closed`/`busy` 派生出的文案和 `disabled` 状态（"关闭对话"按钮的文案、输入框的提示文案、发送按钮的 `disabled`），这两块被 patch 的子树都覆盖不到。因此 `refreshConversation()` 还会比较新旧 `WaiBrainConversationView` 的 `conversation.status` 和 `busy`；只要其中一项在 `state.view === 'conversation'` 时发生变化，就退回完整的 `render()` 而不是局部 patch，从而保证头部和输入框能正确更新——比如另一个客户端把这场对话关闭了，而当前标签页正在轮询它的时候。这种状态翻转发生频率很低，为它多付出一次完整重渲染，比再单独 patch 这两块的代价划算。

## Alternatives considered

**把头部/输入框依赖的每一块都单独 patch（状态文案、按钮文案/disabled、输入框提示/disabled），而不是退回整页渲染。** 未采用：为了一个每场对话最多发生几次的事件（对话打开/关闭、忙碌状态切换）新增一堆 DOM patch 调用点，相比直接调一次 `render()` 没有可感知的收益。

**对 DOM 做 diff，而不是比较拉取到的数据。** 未采用：会给这个刻意保持"纯字符串模板 + 直接操作 DOM"风格的文件引入虚拟 DOM/diff 依赖；定点的 `querySelector` + `innerHTML` patch 与文件现有风格一致。

**手写 deep-equal，而不是用 `JSON.stringify` 比较。** 未采用：`WaiBrainConversationView` 是一个小的、可 JSON 序列化、低频轮询的值，没有函数字段也没有循环引用；`JSON.stringify` 相等性判断已经足够，不需要新增依赖。

## Known limitation

`refreshConversation()` 用 `refreshing` 标志防止重入，但没有处理响应顺序：如果用户在上一个对话的轮询请求还在飞行中时切换了选中对话，那个还未返回的旧请求可能在新对话自己的请求之后才 resolve，短暂地用已经不再选中的对话数据覆盖 `state.conversation`。这个竞态在本次改动之前就已存在，这次没有修复。后续修复应该给每次 `runtime.conversation()` 调用打上发起时的对话 id，并丢弃 id 与当前 `state.selectedConversationId` 不一致的响应。

## Verification

`apps/waibrain/tests/app.spec.ts` 覆盖：短轮询间隔（120ms）下连续多轮、对话内容不变时，聚焦的输入框、其未保存的值、以及 `<select>` 节点身份都保持不变；两次轮询之间后端真的新增了一条消息时，新消息能通过局部 patch 正确显示且不替换输入框节点；两次轮询之间对话被别处关闭时，会退回完整渲染，使头部按钮文案和输入框的 `disabled` 状态正确更新。

## Consequences

对话内容没有变化时，轮询不再打断用户在 `studio` 或 `conversation` 视图里正在进行的交互。`status`/`busy` 发生翻转时，每次会多付出一次完整渲染，鉴于这种情况很少发生，这个代价可以接受。跨对话切换时已存在的响应乱序竞态仍未解决。
