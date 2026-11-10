# Agent Note: 桌面欢迎窗口接受 profile 自带的账号服务

Status: implemented

[English](2026-11-10-desktop-external-account-sign-in.md) | 中文

## Problem

挂载了自有账号服务的发行版需要让用户在首次启动时就用该账号登录，而不用 DeepSeek 账号或官方服务商密钥。此前的欢迎窗口只提供 DeepSeek 登录和 API-key 表单，启动检查读起来像是专门要求 DeepSeek。

## Decision

启动检查从来没有指定厂商。[`needsWelcome`](../../../../apps/desktop/src/welcome-api.ts) 只在账号没有已存凭证 **且** [`read()`](../../../../apps/desktop/src/welcome-backend.ts) 在全部可配置服务商路由上都找不到已配置的凭证引用时才打开欢迎窗口；`hasApiKey` 是对 `llm` 服务商目录求并集，任何声明了 `apiKeyEnv` 的 `llm-pi-ai` 路由都会并入其中。因此，只要 profile 挂载的账号服务把令牌写到这样的引用下，就完成了认证，桌面壳里不需要任何厂商分支。`desktop-wainao-sign-in` 分支只增加了产出该令牌的入口。

[`external-sign-in.ts`](../../../../apps/desktop/src/external-sign-in.ts) 负责执行一次尝试：在 `127.0.0.1` 上启动回环 HTTP 监听应答厂商的回调路径，桌面壳用系统浏览器打开发授权地址，返回的授权码交给 profile 的服务，换取、凭证写入、模型路由和令牌续期都由该服务负责。描述符只列出插件在 Host 上的 RPC 路径与端点名，桌面壳里没有厂商协议，也没有品牌端点。不提供这些端点的 Host 探测失败，于是原生 DSH profile 保留原有入口。探测在第一次需要欢迎窗口时进行且有上限，因此不答复的 Host 无法阻止窗口打开。回显了另一次尝试 state 的回调会被拒绝，完成回调后的页面不回显任何请求参数。

## Alternatives considered

在桌面壳内实现 OAuth 换取，需要为授权记录新增 Host RPC，并再维护一条续期路径；profile 的服务本来就同时保存两者，所以桌面壳保持为消费者即可。用 `dsh://` 作为回调地址，则要求该服务接受非 HTTP 的回调 URI，而它的 Host RPC 无法表达这种地址。厂商目前只因为该服务请求了开发模式才接受未登记的回环回调；发行前必须登记真实回调地址。

## Consequences

只有在挂载的 profile 提供这些端点时，欢迎窗口才显示这个额外入口。换取成功后冷启动直接进入工作区；令牌过期或被吊销则回到欢迎窗口，用同一个入口即可恢复。DeepSeek 的入口与官方 API-key 路径保持不变，与之并列可用。
