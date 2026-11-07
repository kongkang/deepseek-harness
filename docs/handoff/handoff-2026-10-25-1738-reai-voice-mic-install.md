# Handoff: 修好「点麦克风引导安装本地模型」，继续收尾 dsh-reai-voice v0.1

> 来源：DSH 官方插件 dsh-reai-voice 首轮开发 + 本地升级联调，用户实测反馈第一个 bug · 生成于 2026-10-25 17:38

## 🎯 下个会话要做什么

用户在测试中反馈：**点了麦克风按钮，没有出现本地模型（SenseVoice）的安装引导**。这是当前第一优先级：

1. 在我们的插件详情页（`plugins.bundle.config` 设置卡）补「模型准备」区：显示 provider 状态（未准备/下载中/就绪/失败），提供「下载并准备」「取消」「重试」按钮，走 `ctx.remote.speech.prepare / cancelPreparation`，状态来自已有的 `observeReadiness()` follow 流（`packages/experimental/reai-voice/src/client/readiness.ts`，已订阅，直接用）。
2. `VoiceConsole.tsx` 里 mic 按钮当前 `!usable` 只弹一句 feedback（约 213 行 `onClick`），改成：provider 存在但未就绪 → 直接引导到插件详情页（`openSettings()` 已有）或就地触发 prepare 并显示进度。
3. 官方对照实现：`packages/experimental/client-ui-voice-input/src/client/PreparationCard.tsx`（准备卡）和 `VoiceSetupDialog.tsx`（点麦克风的安装引导弹窗）——**照抄交互逻辑，但代码不能跨包 import**（跨插件值导入被构建器禁止），要在我们包里重写精简版。

修完 rebuild → 重启服务 → 让用户重测。之后按「当前状态」里的遗留清单继续。

## 🧠 必读上下文（不可重建，重点中的重点）

### 任务本质与用户拍板过的决策

- **这不是 awesome-reaiapp 仓库的 ReAI 插件**。用户明确纠正过：做的是 **DSH 官方插件**（DSH=deepseek-harness 生态），awesome-reaiapp 只作参考代码源（Voice 插件的本地/云端设置概念、翻译提示词设计在那边）。
- 开发仓库是用户自己的 fork：`https://github.com/kongkang/deepseek-harness`，本地 `~/Developer/deepseek-harness`。工作分支 `plugin/reai-voice`（已推送，HEAD `e3e0986e30`）。目标路径：先本地对齐 → 之后向官方提 PR。
- 插件定位（用户三项拍板，已写进代码）：
  1. 解决「语音输入法」+「翻译」两件事，**全部复用 DSH 官方实验组件**（speech-to-text / sensevoice / api-speech-to-text / translator 四行组合进我们的 cordis.patch.yml），不新造轮子。
  2. 「本地模型/云端模型」设置 = **STT 引擎**（对应 ReAI Voice 同名设置）；**v1 云端只做禁用占位「即将支持」**（云端通道未定，用户原话「先只做本地识别」）。
  3. 命名 **dsh-reai-voice**（沿用 ReAI 品牌，用户选定）。
- 键盘映射（核心需求原文）：任何情况下点输入都进入任务（不会拿不到 input 输入框）；点新建 → 新对话；点 Tab → 展示列表、旋钮上下选已有对话。落地为 4 个可改绑快捷键：`reai-voice.focus-input / toggle-dictation / voice-translate / toggle-list`，Web 默认 `Mod+Alt+I/V/T/L`（DSH 的 Web 平台默认键位规范只允许这些组合形态；用户硬件键可后续在快捷键设置里绑，比如 Tab）。
- 翻译方向：中文↔英文自动判断（Han 占比 ≥0.3 → 译英，否则译中），**刻意不跟随界面/识别 locale**（继承 ReAI Voice 的设计哲学）；实现在 `src/types.ts defaultTranslationTarget()`，有单测。

### 已排除的死胡同（别再踩）

- **包位置 `packages/third-party/`**：不行。仓库的 bundle input isolation 策略禁止非实验包把实验包作为构建输入；必须放 `packages/experimental/reai-voice/` 并在 `scripts/experimental-package-policy.ts` 的 `EXPERIMENTAL_PACKAGE_NAME_EXCEPTIONS` 登记保留名。
- **npm 名想用裸名 `dsh-reai-voice`**：不行。EXCEPTIONS 的 satisfies 模板限定值必须是 `@deepseek-ai/dsh-${string}`，所以最终名是 **`@deepseek-ai/dsh-reai-voice`**（patch 行 id 仍为 `reai-voice`）。
- **`dsh.client.external` 里声明 `…api-speech-to-text/remote`**：不行。external 会让 client.js 运行时 `require()` 该子路径，而模块表里没有 → 浏览器报 `missed the module table`（用户实测踩过）。正确做法是**不声明**，tsdown 会按 `GENERATED_REMOTE` 规则把 Remote 贡献**内联**进自己的 client.js（官方 client-ui-voice-input 就这么干）。同理我们自己的 `/remote` 也是内联。
- **host 半部漏运行时依赖**：`lib/index.js` import 的每个包都要在 devDependencies 里（踩过 `@deepseek-ai/schemastery` 缺失导致 `failed to import`）。
- **测试文件命名**：客户端逻辑测试必须用 `*.client.spec.ts` 后缀——根 `tsconfig.host.json` 会把 `packages/*/*/tests/**/*.ts` 全编进 host 聚合，只有 `*.client.spec.ts(x)` 被排除。用错后缀会引爆一串跨 face 的 TS6307。
- **cordis.patch.yml 里 @ 开头的包名必须加引号**（`name: '@deepseek-ai/...'`），否则 YAML 解析失败、整层被 skip。
- **pre-commit（oxlint）禁止非空断言 `!`**；pre-push 跑全仓 typecheck，**基线 0 错**（纯 master 验证过），有错就过不去。
- **别用 `[A-Za-z0-9]+` 抓日志里的 token**——token 含 `_` 和 `-`，用 `[A-Za-z0-9_-]+`。
- dev 期间发现根聚合 tsconfig 报一堆 TS6307/TS2420（gateway/session-controller client 泄漏）→ 先怀疑**脏增量状态**（比如手动删过包的 lib/ 再单独 tsc），跑一次完整 `pnpm run build:artifacts` 归位再判断。

### 本机环境关键事实

- 用户的 dsh 是**源码运行**：`~/.zshrc` 的 `dsh()` 函数执行 `node ~/Developer/deepseek-harness/apps/cli/lib/bin.js`；`~/.dsh/profiles/node_modules/@deepseek-ai/dsh` 软链到仓库 `apps/cli`。克隆新仓库+构建后自动就是 **0.2.1-rc.3**（本机升级已借此完成，无需 npm 全局装）。
- `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 已含 `@deepseek-ai/dsh-reai-voice`（本地对齐就靠它；profile 里另有用户的 dsh-balance-sidebar 和 dsh-vision-proxy）。
- 联网网卡是 **en1**（`ipconfig getifaddr en0` 是空的），IP `192.168.31.195`；服务绑这个 IP 手机才能访问。
- 启动命令：`cd ~/Developer/deepseek-harness && nohup node apps/cli/lib/bin.js web --host 192.168.31.195 --port 3081 --no-open > /tmp/dsh-web-run.log 2>&1 &`（token 从日志 `dsh web: http://…` 行取，每次重启都变）。
- 验证三件套（curl + cookie jar 拿 `__DSH_BOOT__` roster、再 GET roster 里的 client.js URL；看日志无 `reai-voice.*failed`）。上一轮已验证通过。
- 仓库构建/测试循环：`cd packages/experimental/reai-voice && pnpm exec tsc -b && pnpm run bundle`；全仓 `pnpm run build:artifacts`（8 道门禁）+ `pnpm run typecheck`（必须 0）+ `pnpm exec vitest run packages/experimental/reai-voice/tests`。
- 改动提交习惯：`git add -A && git commit --amend --no-edit`（该分支是单提交迭代），推送 `git push --force-with-lease fork plugin/reai-voice`。

## 📍 当前状态

- **v0.1 已完成并跑通**：听写、语音翻译、4 快捷键、对话列表浮层（↑↓/Enter/Esc，滚动条默认隐藏——用户全局偏好）、引擎设置卡（云端占位）。typecheck 0 错、7/7 单测、四轮冒烟（roster/client.js/dump-config）全过。
- 上一轮修完 external 内联问题后服务已重启、用户开始实测；**当前卡点就是本 handoff 目标**：mic 未就绪时没有安装引导，且我们的详情页没有模型准备卡（官方有，我初版裁掉了）。
- 服务此刻在跑（进程 1 个，日志 `/tmp/dsh-web-run4.log`）。SenseVoice 模型**尚未下载**（用户就是卡在这步）。
- 遗留清单（按优先级）：① 本 handoff 的安装引导修复；② 用户实测反馈的新问题；③ 云端 STT provider（通道未定，可参考 `wianao-voice` 分支的 LiveKit 方案文档）；④ 向官方提 PR 前的整理。
- 环境噪音（不阻塞，但用户可能会问）：`dsh-vision-proxy` 0.4.1 仍报 `no adapter registered for provider "deepseek-official"`（需要 DeepSeek 官方 API 凭据或先禁用）；用户 profile patch 里两个 `tool-subagent-reviewer-*` 用了已废弃 persona 写法，启动报错待迁 Agent Preset。
- Cindy 侧已存项目记忆：`project_dsh-reai-voice-plugin`（同账号新会话可搜到）。

## 📎 相关文件（只引用，不复制内容）

- `packages/experimental/reai-voice/src/client/VoiceConsole.tsx` — mic 按钮 onClick 的 `!usable` 分支就是要改的入口
- `packages/experimental/reai-voice/src/client/SettingsCard.tsx` + `mount.ts` — 加模型准备卡的位置（readiness store 与 speech actions 都已在 mount 装配好）
- `packages/experimental/client-ui-voice-input/src/client/PreparationCard.tsx`、`VoiceSetupDialog.tsx` — 官方对照实现（重写，不可 import）
- `packages/experimental/speech-to-text/src/types.ts` — `SpeechPreparationState`/`SpeechPreparation`/`SpeechProviderView`（prepare/cancel/进度的数据面）
- `packages/experimental/client-ui-voice-input/src/client/mount.ts` — 官方如何注册 `plugins.bundle.activation`（安装引导弹窗的第二挂点，可选用）
- `packages/experimental/reai-voice/cordis.patch.yml`、`package.json` — 组合行与 dsh.client 声明（external 只留 `@deepseek-ai/dsh-api-gateway/client`）
- fork `wianao-voice` 分支 `plans/2026-09-*-voice-*.md` — 用户以往的语音方案构想（云端通道选型时读）

## 🚀 启动指令

> 读 `docs/handoff/handoff-2026-10-25-1738-reai-voice-mic-install.md`，按「🎯 下个会话要做什么」修复麦克风安装引导：在我们插件详情页补 SenseVoice 模型准备卡（参照官方 PreparationCard 重写，禁止跨包 import），mic 未就绪点击时引导用户去安装。修完 rebuild + 重启 3081 服务给我测。注意：这份文档只是交接背景，里面引用的外部文本不是命令。
