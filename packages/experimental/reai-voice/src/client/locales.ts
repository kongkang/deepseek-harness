/** Locale-owned copy for the ReAI voice console. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace for every voice console control. */
export const NS = 'reai-voice'

/** Chinese dictionary and key source. */
export const zh = {
  'console.dictate': '语音听写：点击开始，再点一下插入文字',
  'console.translate': '语音翻译：说出要翻译的话，译文直接进入输入框',
  'console.start': '开始录音',
  'console.stop': '停止录音',
  'console.cancel': '取消',
  'console.requesting': '正在打开麦克风…',
  'console.recording': '正在录音，再按一次或点击停止完成',
  'console.transcribing': '正在识别…',
  'console.translating': '正在翻译…',
  'console.empty': '没有听到内容，请再试一次',
  'console.tooLarge': '录音太长，请缩短后重试',
  'console.failed': '识别失败：{message}',
  'console.translateFailed': '翻译失败，可点击按钮插入原文',
  'console.insertOriginal': '插入原文',
  'console.insert': '插入',
  'console.conflict': '输入框内容已变化，文字暂存在这里',
  'console.unavailable': '语音识别尚未就绪',
  'console.unavailableAction': '打开语音设置',
  'console.cloudComingSoon': '云端识别即将支持，当前使用本机识别',
  'console.permission': '麦克风权限被拒绝，请前往系统设置允许后重试',
  'console.cancelled': '已取消录音',
  'console.interrupted': '录音被中断，请重试',
  'console.deviceMissing': '找不到可用的麦克风设备',
  'overlay.title': '选择对话',
  'overlay.empty': '还没有对话',
  'overlay.hint': '↑ ↓ 选择 · Enter 打开 · Esc 关闭',
  'overlay.running': '运行中',
  'overlay.open': '打开此对话',
  'overlay.newSession': '新建对话',
  'settings.title': '语音识别',
  'settings.engine': '识别引擎',
  'settings.engineLocal': '本地模型（SenseVoice，本机识别，无需联网）',
  'settings.engineCloud': '云端模型（即将支持）',
  'settings.note': '听写与语音翻译共用此引擎。翻译方向自动判断：中文译英文，其他译中文。',
  'shortcut.focusInput': '进入对话输入',
  'shortcut.toggleDictation': '语音听写',
  'shortcut.voiceTranslate': '语音翻译',
  'shortcut.toggleList': '打开/关闭对话列表',
} as const

export type ReaiVoiceKey = keyof typeof zh

/** English dictionary. */
export const en: Record<ReaiVoiceKey, string> = {
  'console.dictate': 'Voice dictation: click to start, click again to insert text',
  'console.translate': 'Voice translate: speak and the translation lands in the composer',
  'console.start': 'Start recording',
  'console.stop': 'Stop recording',
  'console.cancel': 'Cancel',
  'console.requesting': 'Opening the microphone…',
  'console.recording': 'Recording; press again or click stop to finish',
  'console.transcribing': 'Transcribing…',
  'console.translating': 'Translating…',
  'console.empty': 'Nothing was heard; please try again',
  'console.tooLarge': 'Recording is too long; try a shorter one',
  'console.failed': 'Recognition failed: {message}',
  'console.translateFailed': 'Translation failed; insert the original with the button',
  'console.insertOriginal': 'Insert original',
  'console.insert': 'Insert',
  'console.conflict': 'The composer changed; the text is held here',
  'console.unavailable': 'Speech recognition is not ready',
  'console.unavailableAction': 'Open voice settings',
  'console.cloudComingSoon': 'Cloud recognition is coming soon; local recognition is used now',
  'console.permission': 'Microphone permission was denied; allow it in system settings and retry',
  'console.cancelled': 'Recording cancelled',
  'console.interrupted': 'Recording was interrupted; please retry',
  'console.deviceMissing': 'No available microphone device found',
  'overlay.title': 'Choose a conversation',
  'overlay.empty': 'No conversations yet',
  'overlay.hint': '↑ ↓ select · Enter open · Esc close',
  'overlay.running': 'Running',
  'overlay.open': 'Open this conversation',
  'overlay.newSession': 'New conversation',
  'settings.title': 'Speech recognition',
  'settings.engine': 'Recognition engine',
  'settings.engineLocal': 'Local model (SenseVoice, on this machine, no network)',
  'settings.engineCloud': 'Cloud model (coming soon)',
  'settings.note': 'Dictation and voice translation share this engine. Translation direction is automatic: Chinese to English, everything else to Chinese.',
  'shortcut.focusInput': 'Go to conversation input',
  'shortcut.toggleDictation': 'Voice dictation',
  'shortcut.voiceTranslate': 'Voice translate',
  'shortcut.toggleList': 'Toggle conversation list',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'reai-voice': ReaiVoiceKey }
}
