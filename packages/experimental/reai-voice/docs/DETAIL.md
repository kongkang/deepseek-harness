![ReAI Voice feature preview](../icon.svg)

ReAI Voice puts two actions in the composer: **dictation** (microphone button; recorded speech becomes draft text) and **voice translation** (globe button; the translation lands in the draft, auto-detecting Chinese ↔ English). Recognition runs local SenseVoice; translation rides this bundle's translator service.

Keyboard commands (rebindable in shortcut settings):

- Go to conversation input (Web default ⌘/Ctrl+Alt+I) — returns to the composer from anywhere, creating a session when none exists;
- Voice dictation (⌘/Ctrl+Alt+V) and voice translate (⌘/Ctrl+Alt+T) — start or finish one capture;
- Toggle conversation list (⌘/Ctrl+Alt+L) — ↑↓ to select, Enter to open, Esc to close.

The bundle details page carries the recognition engine setting (local model / cloud model, coming soon) and the local model preparation card: it shows whether SenseVoice is downloaded, offers **Download and prepare**, cancel and retry, and a Hugging Face mirror option for slow networks. Clicking either composer button before the model is ready opens the same card with the setup guidance instead of starting a recording. Browsers expose the microphone only in a secure context, so a plain `http://` LAN address such as `http://192.168.1.5:3081` cannot record: the console then says the browser blocks the microphone and points at `https://` or `localhost`. Serve DSH over TLS, or use the machine's own `http://localhost:<port>`, before recording.
