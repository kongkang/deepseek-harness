/** Global keyboard commands for the ReAI voice console. */
import type { Context } from '@deepseek-ai/cordis'
import type { ShortcutCommand, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { NS, type ReaiVoiceKey } from './locales.ts'

/** What the four registered commands need from the mount. */
export interface ReaiVoiceShortcutHandlers {
  /** Reveal the conversation and focus its composer, creating a Session when none exists. */
  focusInput(): void
  /** Start or finish one dictation capture. */
  toggleDictation(): void
  /** Start or finish one voice translation capture. */
  voiceTranslate(): void
  /** Open or close the keyboard session list. */
  toggleList(): void
}

type Modifier = 'primary' | 'alt' | 'shift'

/**
 * Register the console's editable commands. Defaults bind only Web profiles
 * (Mod+Alt+I/V/T/L); every command stays rebindable, so a hardware key such
 * as Tab can adopt `reai-voice.toggle-list` through the shortcut settings.
 */
export function installReaiVoiceShortcuts(ctx: Context, handlers: ReaiVoiceShortcutHandlers): void {
  const t = ctx.locale.bind(NS)
  const register = (id: string, labelKey: ReaiVoiceKey, code: string, web: readonly Modifier[], run: () => void): void => {
    const command: ShortcutCommand = {
      id: id as ShortcutCommandId, label: () => t(labelKey), aliases: [],
      defaults: { 'web:macos': { code, modifiers: web }, 'web:windows': { code, modifiers: web } },
      regions: ['page', 'editable', 'terminal'], modals: [],
      resolve: () => ({ status: 'handled', run }),
    }
    ctx.effect(() => ctx.shortcuts.register(command), `reai-voice: ${id}`)
  }
  register('reai-voice.focus-input', 'shortcut.focusInput', 'KeyI', ['primary', 'alt'], handlers.focusInput)
  register('reai-voice.toggle-dictation', 'shortcut.toggleDictation', 'KeyV', ['primary', 'alt'], handlers.toggleDictation)
  register('reai-voice.voice-translate', 'shortcut.voiceTranslate', 'KeyT', ['primary', 'alt'], handlers.voiceTranslate)
  register('reai-voice.toggle-list', 'shortcut.toggleList', 'KeyL', ['primary', 'alt'], handlers.toggleList)
}
