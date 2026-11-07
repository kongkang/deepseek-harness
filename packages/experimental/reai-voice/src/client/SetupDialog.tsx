/** Modal explaining why the microphone cannot record and where to fix it. */
import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS, type ReaiVoiceKey } from './locales.ts'

/** Why the console cannot start a capture; each reason has one guidance pair. */
export type SetupReason = 'install' | 'unavailable' | 'insecure' | 'unsupported'

const TITLES: Readonly<Record<SetupReason, ReaiVoiceKey>> = {
  install: 'setup.title', unavailable: 'setup.unavailableTitle',
  insecure: 'setup.insecureTitle', unsupported: 'setup.unsupportedTitle',
}

const BODIES: Readonly<Record<SetupReason, ReaiVoiceKey>> = {
  install: 'setup.body', unavailable: 'setup.unavailableBody',
  insecure: 'setup.insecureBody', unsupported: 'setup.unsupportedBody',
}

/** Visibility, the blocking reason, and the preparation body the dialog can host. */
export interface SetupDialogProps extends PropsLocale<typeof NS> {
  readonly open: boolean
  readonly reason: SetupReason
  readonly onDismiss: () => void
  /** Open the plugin details; the button is absent while it is undefined. */
  readonly onOpenDetails: (() => void) | undefined
  /** Preparation card for the Host-owned reasons; omitted when the browser blocks recording. */
  readonly children?: ReactNode
}

/**
 * Explain why the console cannot record and offer the matching next step.
 * @param props - visibility, reason, navigation, body, and copy.
 * @returns the dialog; nothing while closed.
 */
export function SetupDialog({ open, reason, onDismiss, onOpenDetails, children, t }: SetupDialogProps) {
  const hostOwned = reason === 'install' || reason === 'unavailable'
  return <Modal open={open} title={t(TITLES[reason])}
    closeLabel={t('console.cancel')} onClose={onDismiss}
    footer={<>
      <Button variant="ghost" onClick={onDismiss}>{t('setup.later')}</Button>
      {hostOwned && onOpenDetails !== undefined && <Button variant="outline" onClick={onOpenDetails}>{t('setup.details')}</Button>}
    </>}>
    <p>{t(BODIES[reason])}</p>
    {children}
  </Modal>
}
