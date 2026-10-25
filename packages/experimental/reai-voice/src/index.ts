/** ReAI voice console Host half: translation Remote and the engine preference. */
import { Context, type Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-experimental-translator'
import type { TranslationSpec } from '@deepseek-ai/dsh-experimental-translator/types'
import { defaultTranslationTarget, type ReaiVoiceEngine, type ReaiVoiceInfo, type ReaiVoiceTranslateRequest } from './types.ts'

/** Live preferences presented on the bundle's Plugins page. */
export interface Config {
  /** Speech recognition engine; cloud stays a preview placeholder in 0.1.0. */
  engine: Volatile<ReaiVoiceEngine>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Remote consumer of the ReAI voice console. */
    reaiVoice: ReaiVoiceController
  }
}

/**
 * The @deepseek-ai/dsh-reai-voice Host service. Speech capture and recognition are composed
 * from the official experimental speech rows in this bundle's patch; this class
 * only exposes the engine preference and one translation round trip.
 */
export default class ReaiVoiceController extends TypertRemoteService {
  static inject = ['translator', 'typert']
  static Config = z.object({
    engine: z.union(['local', 'cloud']).default('local').volatile(),
  })

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'reaiVoice', { namespace: 'reaiVoice' })
    ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  }

  /**
   * Read the engine preference and cloud availability without touching audio.
   * @returns facts the settings card and the console render.
   */
  @Remote
  info(): ReaiVoiceInfo {
    return { engine: this.config.engine.get(), cloudAvailable: false }
  }

  /**
   * Translate one dictated fragment through the bundle's translator row.
   * @param request - dictated text and an optional explicit target language.
   * @param signal - browser cancellation or Remote contribution withdrawal.
   * @returns translated plain text.
   */
  @Remote
  async translate(request: ReaiVoiceTranslateRequest, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    const targetLanguage = request.targetLanguage?.trim() || defaultTranslationTarget(request.text)
    const spec: TranslationSpec = this.ctx.translator.resolve({
      text: request.text,
      sourceLanguage: 'auto',
      targetLanguage,
    })
    try {
      return await this.ctx.translator.translate(spec, signal)
    } catch (_error) {
      signal.throwIfAborted()
      throw new RemoteError('reaiVoice/translation-failed', 'Translation failed', {})
    }
  }
}
