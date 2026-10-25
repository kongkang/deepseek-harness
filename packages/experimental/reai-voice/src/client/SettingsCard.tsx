/** Bundle-details settings card: the one v1 preference, recognition engine. */
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsFormScope } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReaiVoiceEngine, ReaiVoiceInfo } from '../types.ts'
import { NS } from './locales.ts'
import css from './SettingsCard.module.css'

/** Host-backed form scope plus the Remote info mirror. */
export interface SettingsCardInjected {
  readonly form: SettingsFormScope<{ engine?: ReaiVoiceEngine }>
  readonly hooks: { readonly info: HostObservable<ReaiVoiceInfo> }
}

export type SettingsCardProps = PropsLocale<typeof NS> & InjectFace<SettingsCardInjected>

/** Render the engine radio; the cloud option stays visible but disabled. */
export function SettingsCard({ useInfo, form, t }: SettingsCardProps) {
  const mirror = useInfo(value => value)
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
  </section>
}
