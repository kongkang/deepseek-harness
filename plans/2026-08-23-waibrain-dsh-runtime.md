# WaiBrain DSH Runtime Demo

## Goal

Turn the standalone WaiBrain interface into a runnable 1+N conversation demo. The UI reads the model catalog and reasoning levels from the same DSH Host APIs as DSH Web, creates one durable Session for the main persona and one Session per brain branch, drives real model turns, and pushes each completed branch report back into the main conversation.

## Scope

- Keep `apps/waibrain` visually independent from the DSH Web shell.
- Load configured provider routes, models, and reasoning levels through `llm.models`.
- Let the main persona and every branch choose an independent provider, model, and reasoning effort.
- Create durable DSH Sessions carrying each agent's own System Prompt.
- Apply per-session model choices without rewriting the user's global default.
- Fan one user message out to the main Session and all active branch Sessions.
- Read completed assistant output from durable Session history and push branch reports into the main Session.
- Support attaching a branch while a conversation is running; the new branch participates from the next user message.
- Show connection, running, failure, and retry states in the existing interface.

## Non-goals

- No cache optimization or prefix-sharing measurement.
- No automatic Pro worker spawning in this round; the existing worker permission remains configuration for a later worker path.
- No replacement of DSH Web's Models settings editor.
- No migration of historical browser-only prototype turns into DSH Sessions.
- No multi-user authentication or remote deployment support; the demo remains a loopback product surface.

## Modules and files

- `packages/core/session`: durable optional System Prompt metadata on a Session.
- `packages/core/agent`: creation metadata propagation.
- `packages/session/session-persistence-jsonl`: System Prompt header serialization and validation.
- `packages/host/apiproxy`: `session.create` System Prompt admission and restored composition; per-session model selection without changing the global default.
- `packages/client/connection`: fixture behavior and browser-safe contract projections.
- `apps/cli/config/agent-presets/waibrain`: tool-free Agent preset for main and branch Sessions.
- `apps/waibrain/src`: DSH RPC client, runtime orchestration, model selectors, and live status rendering.
- `apps/waibrain/tests`: unit acceptance tests and a real Host/browser replay E2E.
- Existing WaiBrain README and Agent Note pairs: current runtime contract, limitations, and verification.

## Implementation order

1. Add failing Host contract tests for System Prompt persistence/restoration and non-default model selection.
2. Add failing WaiBrain tests for catalog rendering, session creation, fan-out, branch-to-main report delivery, dynamic attachment, and failures.
3. Implement the Host contract and JSONL persistence changes.
4. Add the tool-free WaiBrain Agent preset.
5. Replace the in-memory timer runtime with a DSH RPC orchestrator while retaining the current layout.
6. Add keyless replay fixtures and a browser E2E using the real DSH Web Host composition.
7. Run focused unit, type, build, document, and browser checks; run one minimal real-provider smoke only when an existing configured credential is available.

## Risks and mitigations

- A custom System Prompt could disappear after Host restart. Persist it in the Session header and rebuild the scoped persona during cold resume.
- Selecting one branch model could overwrite the DSH global default. Add an explicit `saveAsDefault: false` request option; preserve current DSH Web behavior when omitted.
- Parallel model calls can settle out of order. Correlate every user turn, Session, and report locally; derive assistant completion from each Session's durable history rather than timer order.
- A branch report could be mistaken for a human message. Prefix the pushed prompt as internal branch input and keep it out of the public user-message rendering; the timeline retains the report and resulting main response.
- A provider-local catalog failure could hide working routes. Render successful groups and failures independently, matching `llm.models` semantics.
- Browser refresh cannot reconstruct the local 1+N graph in this demo. Keep this as an explicit limitation; Session transcripts remain durable in DSH.

## Verification

- Host unit tests prove wire validation, Session header persistence, cold-resume prompt restoration, and default-preservation behavior.
- WaiBrain unit tests prove catalog-driven controls and orchestration without network credentials.
- Keyless browser E2E boots the real DSH Host composition with replayed model streams, serves the standalone WaiBrain UI through a proxy, and verifies 1+N creation, model/effort selection, real prompt fan-out, branch reports, main follow-up, timeline alignment, and dynamic branch attachment.
- `waibrain:typecheck`, `waibrain:build`, focused package type/tests, documentation pairing checks, and `git diff --check` pass.
- A real-provider smoke creates a throwaway 1+1 conversation and observes both assistant outputs when an existing DSH credential is available; absence of credentials is reported separately from keyless E2E.

## Rollback

Remove the optional API fields and Session header field together, remove the WaiBrain preset, and restore `apps/waibrain` to the browser-only runtime. Existing Sessions without the optional header field remain valid throughout this pre-release format.
