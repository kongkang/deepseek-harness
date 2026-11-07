/** Bundle-details settings card: the recognition engine and the local model it needs. */
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsFormScope } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReaiVoiceEngine, ReaiVoiceInfo } from '../types.ts'
import { ModelPreparation, type ModelPreparationActions } from './ModelPreparation.tsx'
import type { SpeechReadiness } from './readiness.ts'
import { NS } from './locales.ts'
import css from './SettingsCard.module.css'

/** Host-backed form scope, the Remote info mirror, and the shared speech readiness. */
export interface SettingsCardInjected extends ModelPreparationActions {
  readonly form: SettingsFormScope<{ engine?: ReaiVoiceEngine }>
  readonly hooks: {
    readonly info: HostObservable<ReaiVoiceInfo>
    readonly speechReadiness: HostObservable<SpeechReadiness>
  }
}

export type SettingsCardProps = PropsLocale<typeof NS> & InjectFace<SettingsCardInjected>

/** Render the engine radio and the selected recognizer's preparation card. */
export function SettingsCard({ useInfo, useSpeechReadiness, prepare, cancelPreparation, form, t }: SettingsCardProps) {
  const mirror = useInfo(value => value)
  const readiness = useSpeechReadiness(value => value), catalog = readiness.catalog
  const provider = catalog?.providers.find(item => item.id === catalog.selection.providerId)
  const scope = form.getSnapshot()
  const engine = scope.value?.engine ?? mirror.engine
  const saving = scope.status !== 'ready' || !scope.writable
  const select = async (next: ReaiVoiceEngine): Promise<void> => {
    if (next === 'cloud' || next === engine || saving) return
    await form.mutate([{ op: 'set', path: ['engine'], value: next }], scope.revision)
  }
  return <section className={css.card}>
    <h3 className={css.title}>{t('settings.title')}</h3>
    <div className={css.field} role="radiogroup" aria-label={t('settings.engine')}>
      <label className={css.choice}>
        <input type="radio" name="reai-voice-engine" checked={engine !== 'cloud'} disabled={saving}
          onChange={() => { void select('local') }} />
        <span>{t('settings.engineLocal')}</span>
      </label>
      <label className={css.choice} title={t('settings.engineCloud')}>
        <input type="radio" name="reai-voice-engine" checked={engine === 'cloud'} disabled />
        <span>{t('settings.engineCloud')}</span>
      </label>
    </div>
    <p className={css.note}>{t('settings.note')}</p>
    <ModelPreparation provider={provider} connected={readiness.connected} error={readiness.error ?? undefined}
      prepare={prepare} cancelPreparation={cancelPreparation} t={t} />
  </section>
}
