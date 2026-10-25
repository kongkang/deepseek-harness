/** Shared shapes between the @deepseek-ai/dsh-reai-voice Host service and its browser UI. */

/** Speech recognition engine selection; mirrors the official ReAI Voice setting. */
export type ReaiVoiceEngine = 'local' | 'cloud'

/**
 * Translation request from the browser: dictated text plus an optional explicit
 * target language. Without a target the Host picks the sensible opposite of the
 * source script instead of the interface locale.
 */
export interface ReaiVoiceTranslateRequest {
  readonly text: string
  readonly targetLanguage?: string
}

/** Bundle facts the settings card and the console render. */
export interface ReaiVoiceInfo {
  readonly engine: ReaiVoiceEngine
  /** Whether cloud transcription is wired in this release. */
  readonly cloudAvailable: boolean
}

/**
 * Default translation direction for dictated speech: mostly Han speech
 * translates to English, anything else to Simplified Chinese. Explicitly not
 * derived from the interface or recognizer locale.
 */
export function defaultTranslationTarget(text: string): 'en' | 'zh' {
  const chars = [...text.trim()]
  if (chars.length === 0) return 'en'
  const han = chars.reduce((count, char) => count + (/\p{Script=Han}/u.test(char) ? 1 : 0), 0)
  return han / chars.length >= 0.3 ? 'en' : 'zh'
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Provider or input failure, without original text or response details. */
    'reaiVoice/translation-failed': Record<string, never>
  }
}
