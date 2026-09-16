# Agent Note: macOS Edit 菜单恢复桌面输入框的复制粘贴

Status: implemented

[English](2026-09-16-macos-edit-menu-paste.md) | 中文

## 问题

桌面壳的应用菜单只注册了插件管理、检查更新和退出。macOS 通过应用菜单的 key equivalent 分发复制粘贴等效键（Cmd+C/V/X/A/Z），因此没有注册 Edit 菜单时，所有渲染进程输入框——包括凭据输入框——都收不到这些按键。Windows 和 Linux 把这些键直接交给 Chromium，不受影响。

## 决策

`main.ts` 只在 darwin 上向应用菜单模板追加 `{ role: 'editMenu' }`。Electron 对该 role 子菜单使用固定的英文标签（"Edit"、"Copy"、"Paste"），不随 app locale 变化——已对照 Electron 44 的 role 源码验证，标签是字面量；没有新增壳自有文案，桌面 i18n gate 不受影响。非 darwin 平台保持单菜单布局，因为其快捷键不经过 NSMenu。

## 备选方案

**在所有平台注册该菜单。** 冗余：Windows 和 Linux 的 Chromium 不经菜单注册即处理 Ctrl+C/V，多出的菜单栏项只会改变 Windows 壳布局而不修复任何问题。

**通过渲染进程 IPC 调用 `webContents.paste()`。** 需要新的 preload 面和逐输入框的接线；菜单 role 是 Electron 文档化机制，还同时覆盖复制、剪切、全选和撤销。

**用壳自有的本地化标签手写子菜单。** 需要为菜单栏外观本地化新增约八条桌面文案并走 i18n gate；粘贴修复不依赖它。

## 后果

macOS 用户可以用 Cmd+V 向凭据和设置输入框粘贴，macOS 菜单栏新增一个在任何语言环境下标签均为英文的 Edit 菜单。启动测试在显式 darwin 平台 stub 下断言该 role 存在（Linux/Windows CI 矩阵因此评估相同分支）、在 win32 stub 下断言不存在，并断言构建出的菜单恰好安装一次。
