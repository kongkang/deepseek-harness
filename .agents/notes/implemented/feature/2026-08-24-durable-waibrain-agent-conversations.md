# Agent Note: Durable WaiBrain Agent Conversations

Status: implemented

English | [中文](2026-08-24-durable-waibrain-agent-conversations.zh.md)

## Problem

WaiBrain needs one public persona and a dynamically managed set of external brains, but browser-local drafts and a static preset roster cannot preserve Agent identity, configuration changes, permanent conversations, or work that outlives a page. Standard Session logs alone do not identify the owning Agent, the revision admitted for one message, or the product lifecycle of every external-brain result.

## Decision

The `@deepseek-ai/dsh-host-waibrain` service owns a versioned storage domain and the `waibrain` Typert Remote namespace. An Agent has a stable opaque id and immutable configuration revisions containing every role field, main model selection, and ordered external-brain definition. The Host owns selected Agent and conversation state; the standalone browser only edits and renders that domain.

Each permanent conversation belongs to one Agent and one standard main Session using `waibrain-dialog`. Any number of conversations may retain the same Agent identity. Creating a conversation has a durable pending-operation record, so startup either completes or clears an interrupted creation without publishing an unrelated Session.

For each admitted user message, the coordinator serializes the admission commit, freezes the current Agent revision, and logs it with the message identity. The main lane and every enabled external brain start from the same completed conversation prefix. External brains use ordinary forked child Sessions with independent model selections, timeouts, and failure settlement; the complete child output is authoritative, while the main Session retains a bounded display projection.

A useful external-brain result uses a commit-before-delivery sequence. `waibrain/wake-pending` makes the result durable before an inbox wake can occur; `waibrain/wake-delivered` makes that wake exactly once. The main model receives it as a first-person `【闪念】`, may respond naturally, and never receives hidden reasoning or external-brain tools.

Closing a conversation commits an input and output boundary. It rejects later user messages and prevents pending or late external-brain results from waking the main dialog. Work admitted before close may settle and retain its result in the original conversation; close does not create a cancellation tree.

Host restart marks interrupted main and external lanes as `host-restarted`, reconciles committed wakes, and leaves cold conversations unpublished. Reads inspect persistence, while an operation that requires a live Agent resumes that conversation on demand. A non-Host user message is rejected before reaching the model, so browser or plugin callers cannot bypass revision admission.

The standalone interface keeps the right conversation rail editable. Adding, editing, enabling, disabling, or removing an external brain saves a new Agent revision and affects the next admitted user message. The deployment limits enabled branches, per-branch time, output tokens, and retained result bytes without imposing a fixed product roster.

## Alternatives considered

**Keep Agent state in page memory or localStorage.** This cannot reconstruct Host-owned work after navigation or process restart and cannot prove which revision produced a durable model request.

**Keep `config.shadows` as the runtime roster.** A static preset can execute 1+N, but it cannot create arbitrary external brains, apply next-message edits, preserve Agent-specific rosters, or provide permanent conversation selection.

**Run permanent Sessions for every external brain.** Long-lived sibling Sessions add ownership, synchronization, and stale-context states. Forked child Sessions preserve ordinary Session evidence while each admitted round starts from one authoritative completed prefix.

**Let browser JavaScript fan out Session calls.** Page closure would remove the operation owner, crash recovery would depend on reconstructed client queues, and close races could deliver a result into the wrong conversation.

**Cancel every branch when a conversation closes.** Cancellation loses admitted background work. Commit-and-discard retains inspectable results while keeping the closed public transcript immutable.

**Eagerly resume every conversation at Host startup.** Publishing all stored Sessions increases startup work and revives inactive Agents. Lazy resume separates durable inspection from live execution.

## Consequences

WaiBrain data now survives browser refresh and Host restart, multiple permanent conversations share one evolving Agent, and each message identifies the exact revision and branch results that produced its public transcript. Independent lanes keep the public dialog responsive, and exactly-once wake markers make crash recovery deterministic.

The implementation adds a Host package, Remote methods, storage-domain version 1, Session event types, a dedicated preset companion, and bounded recovery policy. Model-visible text remains reconstructable from standard Session logs, and the child Session remains the evidence source when the bounded main projection is unavailable.

The first product phase remains user-managed and tool-free. Automatic external-brain mutation, expiry, skills, tools, and memory attachments require later authorization and composition decisions rather than implicit access through this Host service.
