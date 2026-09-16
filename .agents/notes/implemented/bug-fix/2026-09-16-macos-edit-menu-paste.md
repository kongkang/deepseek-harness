# Agent Note: macOS Edit menu restores copy/paste in desktop inputs

Status: implemented

English | [中文](2026-09-16-macos-edit-menu-paste.zh.md)

## Problem

The desktop shell registered an application menu containing only plugin management, update check, and quit. macOS delivers copy/paste keyboard equivalents (Cmd+C/V/X/A/Z) through the application menu's key equivalents, so with no Edit menu registered every renderer input — including the credential field — ignored them. Windows and Linux deliver these keys directly to Chromium and were unaffected.

## Decision

`main.ts` appends `{ role: 'editMenu' }` to the application menu template on darwin only. Electron renders the role's submenu with fixed English labels ("Edit", "Copy", "Paste") regardless of app locale — verified against Electron 44 role sources, which define the labels as literals; no shell-owned strings are added, so the desktop i18n gate stays untouched. Non-darwin platforms keep the single-menu layout because their shortcuts bypass NSMenu.

## Alternatives considered

**Register the menu on all platforms.** Redundant: Windows and Linux Chromium handles Ctrl+C/V without menu registration, and the extra menubar entry would change the Windows shell layout without fixing anything.

**Wire paste through renderer IPC to `webContents.paste()`.** Requires new preload surface and per-input handling; the menu role is the documented Electron mechanism and additionally covers copy, cut, select-all, and undo.

**Hand-write the submenu with localized shell-owned labels.** Requires roughly eight new desktop messages routed through the i18n gate to cosmetically localize the menubar; the paste fix does not depend on it.

## Consequences

macOS users can paste into credential and settings inputs with Cmd+V, and the macOS menu bar gains an Edit menu whose labels stay English in every locale. Startup tests assert the role's presence on darwin (under an explicit darwin platform stub, so Linux/Windows CI matrices evaluate the same branches) and its absence under a win32 stub, and that the built menu is installed exactly once.
