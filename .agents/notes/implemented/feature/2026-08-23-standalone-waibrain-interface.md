# Agent Note: Standalone WaiBrain Interface

Status: implemented

English | [中文](2026-08-23-standalone-waibrain-interface.zh.md)

## Problem

The WaiBrain product model needs an inspectable interface before its orchestration details can be judged. Reusing the existing DeepSeek Harness Web UI would couple this experiment to a different product's navigation and conversation assumptions, while a text-only prototype would leave the relationship between the public conversation, persistent brain branches, and branch-started workers ambiguous.

## Decision

Add an internal standalone interface under `apps/waibrain/` without importing the existing Web UI or registering a publishable workspace package.

- Present two top-level product layers: one public main conversation and multiple internal brain branches. A worker remains a capability of its owning branch instead of becoming a third peer column.
- Use one role-and-branch workspace as the creation and later editing entry. A persona card separates stable identity, personality, voice, relationship scenario, greeting, dialogue examples, and the main system prompt; a conversation cannot start before its required identity fields are complete.
- Give every branch one responsibility, a separately visible system prompt, model, reasoning level, active state, and optional worker permission. Every user message starts the main request before entering each active branch concurrently, while branches return only concise reports to the main conversation.
- Keep the live conversation in two columns: the public conversation and the brain-branch rail. A branch attached from the rail immediately joins the current system and receives subsequent messages.
- Provide three focused views: role and branch authoring, the public conversation with live branch status, and a timeline aligned by the originating user message. Timeline headers and rows use the same lane grid; small screens render the lanes as labelled cards.
- Run the main conversation and every branch as independent durable DSH Sessions under a tool-free `waibrain` preset. `session.create.systemPrompt` stores each persona in its Session header; cold resume and fork reinstall that value, and an explicit-id retry cannot replace it.
- Read available models and reasoning efforts from the Host's `llm.models` directory. Apply each lane's choice through `session.selectModel({ saveAsDefault: false })` so the interface reuses configured providers without changing the deployment default or reading settings documents.
- Push each authored branch report into the main Session as injected context. `[[silence]]` remains internal and never appears in the public transcript.
- Keep worker permission as visible branch configuration without invoking a worker. A worker remains deferred until the branch-owned trigger and reporting lifecycle have their own runtime decision.
- Display authored branch reports and delivery status rather than raw hidden reasoning.
- Reuse the repository's installed Vite, TypeScript, and Vitest tooling through root commands, but keep the interface source independent from the existing Web UI modules.

## Consequences

The product logic runs through the real Host, configured model adapters, Session persistence, and browser transport while remaining independent from the existing Web UI. Replay-backed browser tests exercise one main Session, three branch Sessions, dynamic attachment, four model flows, three report pushes, silence filtering, and timeline alignment without requiring a live API key. Provider authentication and cache behavior remain deployment concerns. Worker invocation remains deferred.

## Alternatives considered

- **Extend the existing Web UI.** This would make the prototype faster to place inside the current shell, but it would inherit an unrelated product information architecture and make independent product decisions harder to see.
- **Add a separate onboarding wizard before role authoring.** This duplicates the same persona decisions across two interfaces. The role-and-branch workspace is both the creation surface and the later editing surface.
- **Model workers as a third top-level interface layer.** This mirrors the three runtime roles, but it gives temporary execution details the same visual weight as persistent brain branches. Nesting workers under their owning branch preserves operational ownership.
- **Keep model responses simulated in the interface.** This isolates layout behavior, but cannot validate Host routing, Session persistence, or branch-to-main delivery. The browser suite instead uses the real Host flow with replayed provider fixtures; a configured deployment uses its actual adapters.
