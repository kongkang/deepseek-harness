# 外脑网页第一阶段状态

状态：等待固定提交与 GUI 证据

当前结论：第一个 WaiNao Web Tab 已由 Host 端 WaiBrain 领域服务驱动，浏览器不再持有已提交 Agent 图，也不再用 `collectTail` 推断后台编排状态。Agent 角色、主模型、任意数量外挂外脑、启停状态和永久对话均可动态编辑并持久化；每轮冻结配置 revision，主路和外挂路独立结算，Host 重启会恢复或明确终止未完成状态。提交前测试已覆盖刷新、重启、关闭、迟到结果、恰好一次 wake、分路启动/结算失败和恢复竞态，其中 Host 新包达到逐文件 100% coverage；受影响文档、运行时闭包、lint、包发布检查、Host/Client 构建、WaiBrain 生产构建和真实浏览器 E2E 均已通过。

下一步：固定提交并从该提交启动真实服务录制 GUI GIF，然后按 `wianao-voice-1n -> wianao-voice` 创建 PR，完成 Codex review、CI 和合并后远端验证。当前 fork 没有开放 PR，因此该 PR 直接以产品分支为 base，不构成仍在开放的 PR stack。
