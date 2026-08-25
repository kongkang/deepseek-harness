# WaiBrain interface

English | [中文](README.zh.md)

This standalone interface manages durable WaiBrain Agents, their external brains, and permanent conversations through the Host-owned `waibrain` Remote API. It uses the configured model directory without importing the existing DeepSeek Harness Web UI.

## Run

From the repository root:

```sh
pnpm run waibrain:dev
pnpm run waibrain:test
pnpm run waibrain:typecheck
pnpm run waibrain:build
```

`pnpm run waibrain:dev` starts the Host on `127.0.0.1:4174` and this interface on `http://127.0.0.1:5173/`. `WAIBRAIN_UI_PORT` and `WAIBRAIN_DSH_PORT` override those ports.

`pnpm run waibrain:test` runs both the unit suite and the keyless browser workflow for Agent persistence, right-rail external-brain editing, result reinjection, and permanent conversations.

## Product workflow

1. Create an Agent, complete its persona, select the main model, and save it. Every save creates an immutable configuration revision in the Host.
2. Add, edit, enable, disable, or remove external brains in the authoring view or directly in the conversation's right rail. A saved change affects the next admitted user message; work already running keeps its frozen revision.
3. Create a conversation. The selected Agent remains active, prior conversations remain selectable, and only an explicit New Conversation action creates an empty transcript.
4. Send a message. The main dialog and every enabled external brain start from the same completed history. External brains run independently; a failure or timeout cannot block the main dialog or a sibling.
5. Inspect the cognitive timeline for the configuration revision, main-lane status, external-brain status, and retained result for every admitted message.

Refreshing the page reloads the selected Agent and conversation from the Host. Restarting the Host lazily resumes a conversation only when an operation needs a live Agent; interrupted lanes are recorded as terminated rather than silently restarted.

## Conversation lifecycle

Closing a conversation rejects later user input and prevents late external-brain results from waking the main dialog. Branches admitted before close may still settle and retain their result on that conversation. Closing a browser tab or navigating away does not close the conversation.

The interface shows public messages and concise external-brain results, never hidden reasoning. Each external brain has its own provider, model, reasoning effort, responsibility, and persona. The deployment sets the enabled-branch cap, timeout, token limit, and retained-result byte limit.

## Current boundary

WaiBrain Agents do not yet configure tools, skills, memory, or automatic self-modification. The main dialog and external brains use the tool-free `waibrain-dialog` preset, and dynamic changes are user-authored through the Host API.
