# Agent Note: Patch the waibrain conversation view locally instead of re-rendering on every poll

Status: implemented

English | [中文](2026-08-25-waibrain-poll-local-dom-patch.zh.md)

## Problem

`apps/waibrain`'s `refreshConversation()` polled the Host every `pollIntervalMs` (500ms in production) and, on every successful response, unconditionally replaced `state.conversation` and called `render()`, which rewrites the whole app shell via `target.innerHTML`. Any interaction in flight — an open native `<select>`, a focused input, unsaved text in a role-card field — was destroyed on the next poll tick even when the conversation had not actually changed. The test suite did not catch this because its `pollIntervalMs` was fixed at 60 seconds, far longer than any test run, so polling never fired during a test.

## Decision

`refreshConversation()` first compares the polled `WaiBrainConversationView` against `state.conversation` with `JSON.stringify`; an unchanged result returns without touching state or the DOM. When the result differs, `state.conversation` is updated, and — outside the case described below — `patchConversationView()` runs instead of the full `render()`, patching by the current `state.view`:

- `studio` intentionally does nothing to the DOM. Nothing on the studio page reads `state.conversation`, so the poll only refreshes it in memory; the next real render (a tab switch, a save, etc.) picks up the latest value.
- `conversation` patches two subtrees, `.chat-scroll` and `.runtime-branch-list`, through `renderChatScrollContent` and `renderRuntimeBrainList` — the same functions the full render uses — so a real backend change (new messages, an external-brain lane finishing) still shows up without disturbing the composer, the header, or an open external-brain editor.
- `timeline` patches `.wb-round-list` only, through `renderRoundListContent`.

The conversation header and composer render `closed`/`busy`-derived text and `disabled` state (the "关闭对话" button's label, the composer's hint text, the send button's `disabled`) that the two patched subtrees do not cover. `refreshConversation()` therefore also compares `conversation.status` and `busy` between the previous and new `WaiBrainConversationView`; when either changed while `state.view === 'conversation'`, it falls back to the full `render()` instead of the local patch, so the header and composer stay correct — for example when another client closes the conversation while this tab is polling it. This flip is low-frequency, so paying for one full re-render on it is an acceptable trade against individually patching those two subtrees too.

## Alternatives considered

**Patch every subtree the header/composer depend on individually (status text, button label/disabled, composer hint/disabled) instead of falling back to a full render.** Rejected: it multiplies DOM patch call sites for an event (conversation opened/closed, busy toggling) that happens at most a few times per conversation, for no perceptible benefit over one `render()` call.

**Diff the DOM instead of comparing the fetched value.** Rejected: introduces a virtual-DOM/diffing dependency into a file that deliberately stays plain string templates plus direct DOM writes; targeted `querySelector` + `innerHTML` patches match the file's existing style.

**Hand-write a deep-equal instead of a `JSON.stringify` comparison.** Rejected: `WaiBrainConversationView` is a small, JSON-serializable, low-frequency-polled value with no functions or cycles; `JSON.stringify` equality is sufficient and needs no new dependency.

## Known limitation

`refreshConversation()` guards re-entrancy with the `refreshing` flag but not response ordering: if the user switches the selected conversation while a poll for the previous conversation is still in flight, that in-flight response can resolve after the new conversation's own fetch and briefly overwrite `state.conversation` with data for the conversation no longer selected. This race predates this change and is not fixed here. A future fix should tag each `runtime.conversation()` call with the conversation id it was issued for and discard a response whose id no longer matches `state.selectedConversationId`.

## Verification

`apps/waibrain/tests/app.spec.ts` covers: a short poll interval (120ms) across multiple cycles with an unchanged conversation leaves a focused input, its unsaved value, and the `<select>` node identity untouched; a real message added on the backend between polls appears through the local patch without replacing the composer node; and a conversation closed elsewhere between polls falls back to a full render so the header button label and the composer's `disabled` state update correctly.

## Consequences

Polling no longer destroys in-progress user interaction on the `studio` or `conversation` view when the conversation has not changed. A `status`/`busy` flip pays for one extra full render per occurrence, acceptable given how rarely it happens. The pre-existing out-of-order-response race across conversation switches remains open.
