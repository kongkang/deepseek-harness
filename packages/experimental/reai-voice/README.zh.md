# ReAI 语音（@deepseek-ai/dsh-reai-voice）

把 ReAI 键盘上的语音与对话操作带进 DSH：输入框听写、语音翻译、键盘驱动的对话列表。

## 功能

- **语音听写**：输入栏的麦克风按钮（或全局快捷键）开始录音，再按一次完成识别，文字进入当前输入框草稿。识别使用本机 SenseVoice（与官方语音输入相同的组件），不产生任何会话事件。
- **语音翻译**：地球按钮录一句话，识别后自动翻译（中文 ↔ 英文自动判断方向），译文直接进入输入框；翻译失败可一键插入原文。
- **键盘操作**：
  - `进入对话输入`（默认 Web `⌘/Ctrl+Alt+I`）：任何界面状态下回到对话输入框；没有对话时自动新建。
  - `语音听写`（默认 Web `⌘/Ctrl+Alt+V`）：开始/结束一次听写。
  - `语音翻译`（默认 Web `⌘/Ctrl+Alt+T`）：开始/结束一次语音翻译。
  - `打开/关闭对话列表`（默认 Web `⌘/Ctrl+Alt+L`）：唤起键盘优先的对话列表，`↑ ↓` 选择、`Enter` 打开、`Esc` 关闭。所有快捷键都可在快捷键设置里改绑（例如绑到硬件 Tab 键）。
- **设置**：插件详情页只有一个设置——识别引擎。当前版本提供本地模型（SenseVoice），云端模型为即将支持的占位选项。

## 组合

本 bundle 复用官方实验组件：`speech-to-text`（识别服务）、`speech-to-text-sensevoice`（本地识别）、`api-speech-to-text`（浏览器 Remote）、`translator`（翻译服务），并加入本包 `@deepseek-ai/dsh-reai-voice`（Remote 与全部界面）。

## 本地开发

在 deepseek-harness 仓库内：

```sh
pnpm install
pnpm --filter @deepseek-ai/dsh-reai-voice bundle
pnpm run dev:web
```

在 `packages/bundle/web-app/cordis.patch.yml` 追加 `@deepseek-ai/dsh-reai-voice` 行（或用 `--patch` 覆盖层）后，浏览器即可加载本插件。

## 状态

0.1.0 为首个候选版本：云端识别占位、翻译方向自动判断，均未做真实设备验收。
