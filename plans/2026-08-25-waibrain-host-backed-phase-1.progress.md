# 外脑网页第一阶段进度

- [x] 刷新 `origin`、`upstream` 和 fork PR 状态。
- [x] 快进最新需求提交 `4700dd44c8`，保留现有未提交 UI/1+N 工作。
- [x] 审计 Session、Agent、preset、subagent、settings、storage-domain、Typert Remote 和 Web 入口。
- [x] 写出 Host 持久化实施计划。
- [x] 完成 10 轮独立计划审查并取得 `LGTM` 共识（Claude session `da528e81-dbdd-42c1-80a8-04d4e2a2898a`）。
- [x] Test-first 实现 Host 领域、不可变 Agent revision、永久对话和 Typert Remote。
- [x] 接入动态 1+N、独立超时/失败、迟到 wake、关闭与 Host 重启恢复。
- [x] 接入第一个 Tab、右侧直接编辑、动态增删开关外挂外脑和默认 WaiNao Web 入口。
- [x] 更新中英文应用/包文档、配置与持久化目录，并把 Agent Note 收敛为当前 implemented 记录。
- [x] 完成应用单测 8 项、Host 单元/组合测试 36 项、Host 新包逐文件 100% coverage、keyless 真实浏览器 E2E 3 项、Host/Client 构建与 WaiBrain 生产构建。
- [x] 完成最终文档、snapshot、pre-push 和提交前 diff 审查：受影响文档门禁、运行时闭包、lint、package invariant、publint、构建和 diff check 通过；完整 `doc-sync` 的 28 项中 27 项通过，剩余项只因嵌套 worktree 根包缺少基线 `lib/types`；snapshot 有 120 项通过，剩余 6 项只因 Node 24 子进程写入 ExperimentalWarning；constraints、knip 和 rescope 的剩余报错均在当前分支基线已存在且不涉及 WaiBrain。
- [ ] 录制 GUI GIF，commit、push、PR review、CI、merge 并验证远端。
