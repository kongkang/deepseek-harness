# Agent Note: Durable WaiBrain Agent Conversations

Status: proposed

English | [中文](2026-08-24-durable-waibrain-agent-conversations.zh.md)

## Problem

The established WaiBrain design supplies a data-driven 1+N runtime, but the standalone interface keeps the Agent roster, branch switches, Session bindings, and selected conversation in browser memory. Refreshing the page reconstructs the sample role instead of the user's Agent, and durable DSH Sessions cannot reconstruct which Agent, branch configuration, or lifecycle produced a historical turn.

WaiBrain needs one Host-owned record that connects an Agent's current configuration, every conversation held with that Agent, the exact configuration used by each user message, and every external-brain result. The record must preserve the existing 1+N execution model rather than replacing it with a browser-owned orchestrator.

## Proposal

Add a durable WaiBrain domain and Host-side coordinator. The browser becomes a client of this domain: it edits Agent configuration, selects conversations, and renders durable state, while the coordinator owns Session creation, parallel dispatch, result delivery, lifecycle transitions, and recovery.

The [data-driven 1+N decision](../../../../docs/handoff/handoff-2026-08-22-2235-waibrain-dialog.md) and its [follow-up behavior](../../../../docs/handoff/handoff-2026-08-23-1817-waibrain-continuation.md) remain the runtime foundation. The [standalone interface](../../implemented/feature/2026-08-23-standalone-waibrain-interface.md) remains the product surface, but its browser-local graph and branch-to-main orchestration move behind the Host API.

### Agent and conversation identity

- An Agent is a stable first-class identity owned by the local user. Its current record contains every field exposed by the role form, the main model selection, the ordered external-brain definitions, and their current enabled states.
- A conversation belongs to both the local user and one Agent. It binds one public main Session and the internal Sessions or runs created for that conversation; no result may cross that conversation identity.
- New Conversation keeps the selected Agent and its latest external-brain configuration, creates a new conversation record and Session set, and preserves every older conversation for later inspection.
- Selecting another Agent selects that Agent's own configuration and conversation history. Conversation records never change ownership when the UI selection changes.

### Parallel 1+N runtime

- The public main conversation is the Talker: Flash, reasoning off, and zero tools. It maintains natural conversation and verbalizes admitted thoughts; it does not search, orchestrate, or perform deep reasoning.
- Each enabled external brain is one product-level N branch. A branch may internally use the established recognition-shadow and worker stages, but those stages remain implementation details under one card and one attachment lifecycle.
- Admitting one user message starts the Talker and every enabled branch from the same completed conversation prefix without awaiting another lane. Completion order is unconstrained; a usually faster Talker is a performance property, not an ordering guarantee.
- The coordinator, not a model and not browser JavaScript, performs fan-out and correlation. Keyword routing remains rejected; every enabled branch runs its configured recognition path for every admitted user message.
- A completed branch result is recorded against its originating conversation, user message, branch identity, and configuration revision. While the conversation is open, the established first-person `【闪念】` follow-up path may wake the Talker to express it naturally. The UI shows status and concise results, never hidden reasoning.
- Search-derived speech states its source honestly with wording such as “I checked” rather than “I remembered.” Empty or failed branches cannot block the Talker or another branch.

### Conversation lifecycle

- Browser refresh, navigation, tab close, or loss of the client connection changes no Host process or conversation state. In-flight main and branch work continues, and reconnection reloads the durable conversation.
- An explicit Close Conversation action closes input admission and stops the main conversation immediately. The main conversation sends no further public message after the close commit.
- Branch work admitted before that close continues to completion. Its result is appended to the original conversation for inspection, but it does not wake the closed Talker and never enters a newer conversation.
- Closing does not create a cancellation tree. Once the admitted branches settle, no new user message can start another branch, so the conversation reaches quiescence naturally.
- A normal external-brain toggle is a configuration change, not a conversation close. It takes effect on the next admitted user message and does not alter work already admitted for the current message.

### Configuration revisions and dynamic external brains

- Every Agent mutation creates a new immutable configuration revision. A conversation records the revision used by every admitted user message, and its timeline shows the message boundary at which an edit, attachment, enable, or disable operation became effective.
- Main persona changes and external-brain changes both take effect on the next user message. Historical messages retain their original revision and remain reproducible.
- A newly attached branch receives the current public conversation context before its first live message. The complete transcript remains durable; model context uses the complete visible history while it fits, otherwise a durable summary plus recent messages.
- New conversations inherit the Agent's latest branch roster and the enabled states left by the preceding conversation. Branch state remains part of the Agent's continuing capability rather than a browser-only default.
- Future self-update may create, edit, enable, disable, or expire an external brain from a user instruction. Time-limited attachments, including a 24-hour lifetime, use the same revision and lifecycle model; automatic self-update is outside the first implementation phase.

### First implementation phase

- Persist and restore every field currently editable in the Agent and external-brain forms, including model and reasoning selections and branch switches.
- Persist the Agent roster, conversation index, selected conversation, Session bindings, configuration revisions, lifecycle events, messages, and branch results through Host-owned DSH persistence.
- Restore the exact Agent and last selected conversation after page refresh and Host restart. Only New Conversation creates an empty transcript.
- Support Agent creation and selection, New Conversation, historical conversation viewing, dynamic branch attachment, branch edits, enable/disable changes, message fan-out, and explicit conversation close.
- Reuse registered DSH model catalogs, Agent presets, Session logs, storage-domain, and Host Remote APIs. Do not create a second browser persistence model or a private model-call protocol.
- Do not add skill, tool, or memory attachment UI or execution in this phase. Their later configuration belongs to each Agent or external brain and extends the same stable identities.

## Alternatives considered

- **Keep the graph in browser memory or localStorage.** This cannot survive another browser, reconstruct Host-owned background work, or prove which configuration produced a durable Session turn.
- **Store the complete Agent graph only in Session headers.** Headers are immutable creation metadata and cannot represent multiple conversations, next-message configuration revisions, branch lifecycle events, or a current Agent record without rewriting history.
- **Let the standalone page orchestrate independent Session calls.** Page closure would remove the operation owner, recovery would depend on reconstructed JavaScript queues, and the implementation would diverge from the existing Host-side 1+N runtime.
- **Cancel every branch when a conversation closes.** This loses admitted background work and contradicts the required natural settlement model.
- **Serialize the Talker before external brains.** This turns a latency difference into a dependency and violates the parallel 1+N model.

## Acceptance criteria

- Creating an Agent, filling every current form field, adding multiple external brains, and saving produces a durable Host record.
- Browser refresh and Host restart restore the exact Agent configuration, branch states, selected conversation, and transcript without recreating Sessions.
- New Conversation retains the Agent and latest external-brain state, starts an empty transcript, and leaves prior conversations selectable and unchanged.
- One admitted user message starts the Talker and every enabled branch before any lane is allowed to settle; tests make no assertion that the Talker finishes first.
- Disabling, enabling, editing, or attaching a branch affects the next user message, and the timeline identifies the exact configuration revision used before and after the change.
- A newly attached branch receives the derived context of the conversation it joins and no context or result from another conversation.
- Closing the browser while work is running does not cancel any Host work; reopening shows the completed results.
- Explicitly closing a conversation prevents new input and all later public main replies while allowing already admitted branches to finish and record results in that same conversation.
- A branch failure or timeout is recorded without blocking the Talker or sibling branches.
- Keyless unit, real-composition, Session-log snapshot, and browser tests prove persistence, recovery, parallel admission, close races, and cross-conversation isolation; a configured real-provider smoke verifies the assembled model path separately.

## Risks

- Agent-domain writes and Session-log appends can diverge across a crash unless every operation has one documented commit point and idempotent recovery.
- Close, result delivery, configuration update, and new-message admission can race; the coordinator needs per-conversation serialization and explicit admission snapshots.
- Unbounded external-brain counts can exhaust provider or Host resources. Product configuration has no fixed card limit, but deployment-owned concurrency, timeout, and retained-data bounds must fail visibly.
- Adding model-visible configuration or result inputs without Session events would make resumed history differ from the original request. Every model-visible input must remain reconstructable from the log.
- Existing standalone demo Sessions have no durable Agent graph. They remain inspectable as Sessions, but the first phase does not infer or migrate browser-only configuration that was never persisted.
