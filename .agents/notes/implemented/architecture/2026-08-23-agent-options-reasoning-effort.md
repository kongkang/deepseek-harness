# Agent Note: Explicit reasoning effort on AgentOptions

Status: implemented

English | [中文](2026-08-23-agent-options-reasoning-effort.zh.md)

## Problem

A delegated child agent had no way to carry a per-child reasoning effort. `AgentOptions` declared only `provider`, `model`, and `maxTokens`, and the loop's request-proposal seeded the first request's `reasoningEffort` exclusively from the persisted session header: restore the header's effort when its provider/model matched the declared route and the header had not marked the value as an adapter default, otherwise send nothing and let the adapter default.

Two consequences followed. A forked child seeds its Session with the parent's completed-turn prefix, including the parent's `request/header` events. When a child ran on the same provider/model as its parent — a flash recognition shadow forking from a flash main dialogue — the loop restored the parent's `off` effort, silently discarding the delegation's requested effort. And children whose model differed from the parent's could not request any effort at all; every in-process child fell back to the adapter default because only the web app's and the headless bundle's model-selection installers ever set an effort, and both installers run on the parent plane only.

## Decision

`AgentOptions` gains an optional `reasoningEffort` (`packages/core/agent/src/runtime-types.ts`), the same `ReasoningEffortId` the model-selection surface already uses. The loop's request-proposal (`packages/core/agent-loop/src/agent.ts`) seeds the first request with the explicit options effort when present, and only otherwise falls back to the existing persisted-header restoration. Later requests follow the logged header unchanged, so the value is durable and reconstructable; a model-selection waterfall listener still strips and overrides it, which is how the web app's session model picker keeps precedence over anything an options object says.

`resolveChildAgentOptions` never copies the parent's effort: only an explicit `requested.reasoningEffort` reaches a child. The option is therefore the delegation boundary's exact choice — a recognition shadow asks for `low` and a worker for `high` independently of what the parent ran with — while existing sessions, resumes, and deployments that never set the option keep the previous behavior byte for byte.

## Consequences

Callers that request an explicit effort get exactly that value on the child's first request, logged in its `request/header` and restored across later steps — the waibrain recognition/worker tiers depend on this. The field is merge-extensible `AgentOptions`, so the subagent start request carries it without any seam change. Nothing sets it in the shipped web app or headless composition, so those paths keep their previous behavior; the package tests in `packages/core/agent-loop/tests/agent-options-effort.spec.ts` pin the precedence (explicit options effort > persisted-header restoration > adapter default, with the model-selection waterfall still on top).

## Alternatives considered

**A plugin-side `agent/request` listener keyed by child id.** The orchestrator could register its own waterfall listener and apply per-shadow effort from a run-id map, touching no repository code. Rejected: the mapping lives in an untyped import-free user module with no cleanup story, and it leaves the fork-seed restoration trap in place for every other caller of the seam — the same-model child would still see the parent's effort unless the listener raced it. The options field fixes the general defect at the one place the effort is seeded, with unit coverage.

**Let children inherit the parent's effort.** Spreading the parent's effort into `resolveChildAgentOptions` would make delegation cheap. Rejected: inheriting the main dialogue's `off` into a thinking shadow is exactly the trap this change removes, and explicitness at the delegation boundary matches the seam's existing provider/model override contract.
