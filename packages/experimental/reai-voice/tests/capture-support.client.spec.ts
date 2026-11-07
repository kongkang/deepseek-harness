import { afterEach, expect, test, vi } from 'vitest'
import { captureSupport } from '../src/client/audio.ts'

afterEach(() => { vi.unstubAllGlobals() })

test('a plain http page reports the insecure context that hides the microphone', () => {
  vi.stubGlobal('window', { isSecureContext: false })
  vi.stubGlobal('navigator', {})
  expect(captureSupport()).toBe('insecure')
})

test('a secure context without the recording interface reports an unsupported browser', () => {
  vi.stubGlobal('window', { isSecureContext: true })
  vi.stubGlobal('navigator', {})
  expect(captureSupport()).toBe('unsupported')
})

test('a secure context with both interfaces is ready to record', () => {
  vi.stubGlobal('window', { isSecureContext: true })
  vi.stubGlobal('navigator', { mediaDevices: {} })
  vi.stubGlobal('MediaRecorder', vi.fn())
  expect(captureSupport()).toBe('ready')
})

test('a missing audio input keeps the browser supported but the device absent', () => {
  vi.stubGlobal('window', { isSecureContext: true })
  vi.stubGlobal('navigator', { mediaDevices: undefined })
  expect(captureSupport()).toBe('unsupported')
})
