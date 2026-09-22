import { describe, expect, it } from 'vitest'
import { SHELL_WEB_PREFERENCES } from '../src/main/web-preferences.ts'
import { formatShellLog } from '../src/main/log.ts'

// Security baseline (task 3.1 AC): webPreferences must be explicitly declared
// and match the upstream desktop configuration (deepseek-harness apps/desktop
// src/main.ts): contextIsolation on, nodeIntegration off, sandbox on, webSecurity on.
describe('shell webPreferences security baseline', () => {
  it('explicitly declares the isolation/sandbox baseline', () => {
    expect(SHELL_WEB_PREFERENCES.contextIsolation).toBe(true)
    expect(SHELL_WEB_PREFERENCES.nodeIntegration).toBe(false)
    expect(SHELL_WEB_PREFERENCES.sandbox).toBe(true)
    expect(SHELL_WEB_PREFERENCES.webSecurity).toBe(true)
  })

  it('loads the preload through the vendored bundle path', () => {
    expect(SHELL_WEB_PREFERENCES.preload).toBeTruthy()
    expect(String(SHELL_WEB_PREFERENCES.preload).endsWith('preload.cjs')).toBe(true)
  })

  it('is frozen so window code cannot relax the baseline', () => {
    expect(Object.isFrozen(SHELL_WEB_PREFERENCES)).toBe(true)
  })
})

describe('structured main-process log', () => {
  it('emits records with a machine-readable error code field', () => {
    const record = formatShellLog('error', {
      code: 'ERR_TRAY_UNAVAILABLE',
      message: 'tray creation failed',
      data: { platform: process.platform },
    })
    expect(record.code).toBe('ERR_TRAY_UNAVAILABLE')
    expect(record.level).toBe('error')
    expect(record.message).toBe('tray creation failed')
    expect(typeof record.ts).toBe('string')
  })

  it('omits the data field when no extra context is given', () => {
    const record = formatShellLog('info', { code: 'SHELL_READY', message: 'started' })
    expect(record.data).toBeUndefined()
  })
})
