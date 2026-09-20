// Interface 7 tests: CopyKey union coverage (zh/en snapshots, zero missing
// keys), t() interpolation, and the frozen spike-3 locale-read rules
// ($DSH_HOME/settings.yaml `locale.preference`, read-only, default zh).

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dictionaries, en, zh, type CopyKey } from '../src/main/i18n/copy.ts'
import { getLocale, init, isInitialized, normalizeLocaleId, resetForTest, t } from '../src/main/i18n/index.ts'

let fixtureDir: string

beforeAll(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'dsh-forge-i18n-'))
})

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true })
  resetForTest()
})

function settingsPath(name: string): string {
  return join(fixtureDir, name)
}

describe('CopyKey union coverage', () => {
  const keys = Object.keys(zh) as CopyKey[]

  it('covers the full Interface 7 key union', () => {
    // The Record<CopyKey, string> typing guarantees compile-time completeness;
    // this pins the runtime shape against accidental removals.
    expect([...keys].sort()).toEqual([
      'crash.failed', 'crash.recovered', 'crash.restarting', 'crash.restoring', 'crash.title',
      'notify.turnEnd.body', 'notify.turnEnd.title', 'notify.waitInput.body', 'notify.waitInput.title',
      'toast.manualSwitch', 'toast.notifyDisabled',
      'tray.quit', 'tray.show',
      'update.aria.close', 'update.viewRelease',
    ].sort())
  })

  it('en dictionary has zero missing keys (exact key parity with zh)', () => {
    expect(Object.keys(en).sort()).toEqual([...keys].sort())
    expect(Object.keys(dictionaries.en).sort()).toEqual([...keys].sort())
  })

  it('no empty strings in either dictionary', () => {
    for (const dict of [zh, en]) {
      for (const value of Object.values(dict)) expect(value.length).toBeGreaterThan(0)
    }
  })

  it('zh snapshot', () => {
    expect(zh).toMatchSnapshot()
  })

  it('en snapshot', () => {
    expect(en).toMatchSnapshot()
  })
})

describe('locale resolution (spike-3 frozen rules)', () => {
  it('defaults to zh before init and when the file is missing', async () => {
    resetForTest()
    expect(isInitialized()).toBe(false)
    expect(getLocale()).toBe('zh')
    await init({ settingsFile: settingsPath('missing.yaml') })
    expect(getLocale()).toBe('zh')
    expect(isInitialized()).toBe(true)
  })

  it('reads locale.preference = zh', async () => {
    await writeFile(settingsPath('zh.yaml'), 'locale:\n  preference: zh\n', 'utf8')
    await init({ settingsFile: settingsPath('zh.yaml') })
    expect(getLocale()).toBe('zh')
  })

  it('reads locale.preference = en', async () => {
    await writeFile(settingsPath('en.yaml'), 'locale:\n  preference: en\n', 'utf8')
    await init({ settingsFile: settingsPath('en.yaml') })
    expect(getLocale()).toBe('en')
  })

  it('normalizes BCP 47 tags by primary subtag (zh-CN → zh, en-US → en)', async () => {
    await writeFile(settingsPath('zhcn.yaml'), 'locale:\n  preference: zh-CN\n', 'utf8')
    await init({ settingsFile: settingsPath('zhcn.yaml') })
    expect(getLocale()).toBe('zh')

    await writeFile(settingsPath('enus.yaml'), 'locale:\n  preference: en-US\n', 'utf8')
    await init({ settingsFile: settingsPath('enus.yaml') })
    expect(getLocale()).toBe('en')
  })

  it('falls back to zh on missing key / malformed yaml / non-string value', async () => {
    await writeFile(settingsPath('nokey.yaml'), 'other: 1\n', 'utf8')
    await init({ settingsFile: settingsPath('nokey.yaml') })
    expect(getLocale()).toBe('zh')

    await writeFile(settingsPath('bad.yaml'), 'locale: [unclosed\n', 'utf8')
    await init({ settingsFile: settingsPath('bad.yaml') })
    expect(getLocale()).toBe('zh')

    await writeFile(settingsPath('num.yaml'), 'locale:\n  preference: 42\n', 'utf8')
    await init({ settingsFile: settingsPath('num.yaml') })
    expect(getLocale()).toBe('zh')
  })

  it('unknown locales resolve to zh (no third language in the shell)', () => {
    expect(normalizeLocaleId('fr')).toBe('zh')
    expect(normalizeLocaleId('ja-JP')).toBe('zh')
    expect(normalizeLocaleId('')).toBe('zh')
    expect(normalizeLocaleId(undefined)).toBe('zh')
  })

  it('init does not rewrite the settings file (read-only)', async () => {
    const file = settingsPath('readonly.yaml')
    const before = 'locale:\n  preference: en\n# untouched\n'
    await writeFile(file, before, 'utf8')
    await init({ settingsFile: file })
    expect(getLocale()).toBe('en')
    const { readFile } = await import('node:fs/promises')
    expect(await readFile(file, 'utf8')).toBe(before)
  })
})

describe('t() interpolation', () => {
  it('interpolates {title} params', async () => {
    await init({ settingsFile: settingsPath('zh.yaml') })
    expect(t('toast.manualSwitch', { title: 'Refactor plan' })).toBe('请手动切换到会话 Refactor plan')
    expect(t('notify.waitInput.body', { title: '调研' })).toBe('会话「调研」等待你的输入')

    await init({ settingsFile: settingsPath('en.yaml') })
    expect(t('toast.manualSwitch', { title: 'Refactor plan' })).toBe('Please switch to session Refactor plan manually')
    expect(t('notify.turnEnd.body', { title: '调研' })).toBe('Session "调研" has finished its turn')
  })

  it('interpolates numeric params and leaves unknown placeholders verbatim', async () => {
    await init({ settingsFile: settingsPath('en.yaml') })
    expect(t('crash.restarting')).toBe('Restarting the app…')
    expect(t('notify.waitInput.body', { title: 3 })).toContain('3')
    expect(t('toast.manualSwitch', { other: 'x' })).toBe('Please switch to session {title} manually')
  })

  it('non-parametrized keys render identically across both locales', async () => {
    await init({ settingsFile: settingsPath('zh.yaml') })
    expect(t('tray.show')).toBe(zh['tray.show'])
    expect(t('toast.notifyDisabled')).toBe(zh['toast.notifyDisabled'])
  })
})
