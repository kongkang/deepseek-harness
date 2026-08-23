# WaiBrain interface prototype

English | [中文](README.zh.md)

This directory contains a standalone product interface for running one public conversation with multiple persistent brain branches on DeepSeek Harness. It does not import the existing DeepSeek Harness Web UI, but it uses the same Host API and configured model providers.

## Run

Run these commands from the repository root:

```sh
pnpm run waibrain:dev
pnpm run waibrain:test
pnpm run waibrain:typecheck
pnpm run waibrain:build
```

The development command prints the local preview URL.

`WAIBRAIN_UI_PORT` and `WAIBRAIN_DSH_PORT` override the default UI and Host ports (`5173` and `4174`) when another local process already owns them.

## Product interactions

- Configure one persona card before creating a conversation. The card separates identity, personality, voice, relationship scenario, greeting, dialogue examples, and the main system prompt.
- Configure, edit, pause, and resume brain branches. Each branch has one responsibility, its own system prompt, model, reasoning level, and optional permission to start a worker.
- Attach a new branch from the live conversation rail. The branch immediately joins the current system and receives later user messages.
- Send one user message to the public conversation first and then to every active branch concurrently. Each lane runs in its own durable DSH Session.
- Observe the main reply first, then concise branch reports and their delivery status.
- Align each user message, public reply, and branch report with one shared lane grid on the cognitive timeline. Small screens replace the lanes with stacked, labelled cards.

## Current boundary

The interface reads the deployment's model catalog through `llm.models`; it does not read or expose settings documents. Main and branch choices are applied with session-local `session.selectModel` calls, so the demo cannot replace the shared DSH default. Persona and branch System Prompts are stored in their Session headers and survive persistence, resume, and fork. The interface publishes bindings only after the complete 1+N Session set succeeds, so a retry after partial creation uses the current configuration for every lane. Branch reports are sent to the main Session as concise injected context, while `[[silence]]` remains internal. Starting a worker from a branch remains outside this slice: the permission is configurable and visible, but does not invoke a third-layer agent yet. The interface never exposes hidden reasoning transcripts.
