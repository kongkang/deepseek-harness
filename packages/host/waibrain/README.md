---
description: "Host-owned WaiBrain Agent configuration, permanent conversation identity, and 1+N external-brain execution."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-waibrain

English | [中文](README.zh.md)

## Summary

The service provides `ctx.waibrainHost`, persists the `waibrain` storage domain, and exposes the Typert Remote namespace `waibrain`: durable Agent role revisions, permanent conversation identities bound to standard main Sessions, and 1+N execution that runs every enabled external brain from the same completed prefix and delivers settled results back as capped wake messages.

## Table of Contents

- [Configuration](#configuration)
- [Durable records and Remote methods](#durable-records-and-remote-methods)
- [Delivery and recovery](#delivery-and-recovery)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Configuration

- `maxAdmittedBranches` limits enabled external brains in a saved Agent revision and in one admitted message.
- `externalBrainTimeoutMs` bounds each external-brain run independently.
- `externalBrainMaxTokens` caps each child model request.
- `maxResultBytes` caps the UTF-8 result retained in the main Session projection; the child Session remains authoritative for its complete output.

All values are required positive safe integers. Misconfiguration fails during plugin initialization.

## Durable records and Remote methods

Each Agent has a stable opaque id and an append-only sequence of immutable configuration revisions. A revision contains the complete editable role, main model selection, and ordered external-brain roster. Saves use `expectedRevision` compare-and-set semantics; a stale write returns the current revision without overwriting it.

Each conversation belongs to one Agent and one standard main Session. `bootstrap`, `saveAgent`, `selectAgent`, `createConversation`, `selectConversation`, `conversation`, `prompt`, and `closeConversation` form the Remote API. Product rejections are returned as typed result branches rather than thrown transport errors.

`prompt` serializes admission per conversation, freezes the Agent revision, records `waibrain/round-admitted`, then starts the main lane and every enabled external brain from the same completed Session prefix. External brains use ordinary child Sessions through the configured fork provider. Their failures and timeouts settle independently.

The standard Session log owns all model-visible and lifecycle facts. The [persistence catalog](../../../docs/persistence-catalog.md) lists the WaiBrain events. Agent records, conversation ownership, selection, and create-conversation recovery metadata live in storage-domain version 1.

## Delivery and recovery

An external-brain result first commits `waibrain/wake-pending`; only then may it enter the main inbox as `【闪念】「<label>」<result>`. `waibrain/wake-delivered` makes that delivery exactly once. Closing the conversation commits a close sequence, rejects later prompts, and converts pending wakes into `waibrain/wake-discarded-on-close` without removing already-settled lane results.

Host startup marks live lanes interrupted by the previous process as `host-restarted`, reconciles committed wakes, and does not eagerly publish every stored Session. Operations that require a live main Agent resume it on demand. A cold read observes the Session through `sessionQuery` without resuming the Agent.

The `waibrain-dialog` preset mounts the separately exported `./session` plugin. It supplies the frozen persona and model selection, restricts tools to an empty set, and rejects user turns that did not pass through Host admission. Selecting the preset outside a bound WaiBrain Session produces a neutral tool-free dialog.

## Dev Note

Design history and the phase-one plan live in [the durable-agent-conversations note](../../../.agents/notes/implemented/feature/2026-08-24-durable-waibrain-agent-conversations.md); the product-level narrative is [docs/subsystems/waibrain.md](../../../docs/subsystems/waibrain.md). Cold reads go through `sessionQuery.observeSession` leases; live reads use `Session.snapshotEvents()`.

## Model Experience

### Main-dialog persona

#### What the model sees

Every main request receives a complete system prompt rendered from the admitted Agent revision: role name, optional tagline, personality, voice, relationship scenario, greeting, dialogue examples, user-authored system prompt, and the package-owned instruction to speak naturally, use no tools, and absorb useful `【闪念】` results without exposing the mechanism.

#### Token effect

The complete persona replaces every other system-prompt section for the lifetime of that request. Its size is data-dependent on the frozen role fields; later Agent revisions affect only later admitted user messages.

#### KV Cache effect

Requests using the same Agent revision retain a stable system-prompt prefix. Editing any role field changes that prefix on the next admitted message and may invalidate provider cache reuse for the system prompt.

### External-brain child request

#### What the model sees

Each enabled external brain receives the same completed conversation history and user message as the main lane, plus its frozen label, responsibility, persona, and instruction to answer independently without tools. The selected provider, model, and reasoning effort belong to that external brain revision.

#### Token effect

Each enabled external brain creates one independent model request capped by `externalBrainMaxTokens`. Disabled brains add no request. History length follows standard Session fork behavior.

#### KV Cache effect

Sibling external brains are independent requests and do not share a package-level cache identity. Unchanged history may preserve a provider-reusable prefix within one route; editing the external-brain persona or model selection changes that request and may invalidate reuse.

### Late result wake

#### What the model sees

While the conversation remains open, each non-empty settled result enters the main Session as the user-role plugin message `【闪念】「<label>」<result>`. Closed conversations retain the lane result but do not expose the wake to the main model.

#### Token effect

Each delivered wake appends one capped message and may start one additional main-model turn. Empty, failed, timed-out, interrupted, or discarded wakes add no result text to a model request.

#### KV Cache effect

A delivered wake appends after the completed prefix and preserves that prefix. Agent revision changes do not rewrite prior wake messages; closing before delivery avoids the additional request entirely.

## Known Limitations and Deferred Work

- **No autonomous configuration mutation** — the Host exposes user-authored CRUD but no model tool for creating, editing, enabling, disabling, expiring, or removing external brains.
- **No tool, skill, or memory attachment** — both main and external-brain Sessions are deliberately tool-free; adding those capabilities requires an explicit authorization and composition decision.
- **No legacy browser-draft migration** — browser-only WaiBrain drafts were never durable and cannot be reconstructed into Agent records.
