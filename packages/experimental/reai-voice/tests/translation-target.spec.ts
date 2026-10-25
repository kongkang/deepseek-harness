import { expect, test } from 'vitest'
import { defaultTranslationTarget } from '../src/types.ts'

test('mostly-Han dictated text translates to English', () => {
  expect(defaultTranslationTarget('今天我们讨论一下发布计划')).toBe('en')
  expect(defaultTranslationTarget('你好，请帮我总结这段话。')).toBe('en')
})

test('non-Han dictated text translates to Chinese', () => {
  expect(defaultTranslationTarget('Let us ship the release today.')).toBe('zh')
  expect(defaultTranslationTarget('こんにちは、元気ですか')).toBe('zh')
})

test('proper nouns do not flip the direction', () => {
  // A Chinese sentence mentioning one English word stays Han-dominant.
  expect(defaultTranslationTarget('用 Whisper 模型做本地识别')).toBe('en')
  // An English sentence quoting a Chinese name stays Latin-dominant.
  expect(defaultTranslationTarget('Please greet 王小明 for me')).toBe('zh')
})

test('empty text falls back to English', () => {
  expect(defaultTranslationTarget('')).toBe('en')
  expect(defaultTranslationTarget('   ')).toBe('en')
})
