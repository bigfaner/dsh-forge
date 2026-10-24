// bug eb0aacc8：凭据播种源解析单测（真 home 单源 + 缺源 fail-soft + 全文复制含 refs 段）。
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCredentialsAt, seedDshHome, trueHomeCredentialsPath } from './dogfood.js'

describe('bug eb0aacc8：凭据播种源解析（真 home 单源）', () => {
  it('trueHomeCredentialsPath = {home}/.dsh/.credentials.yaml（真 home 凭据文档）', () => {
    expect(trueHomeCredentialsPath('C:/users/u')).toBe(join('C:/users/u', '.dsh', '.credentials.yaml'))
    expect(trueHomeCredentialsPath()).toBe(join(homedir(), '.dsh', '.credentials.yaml'))
  })

  it('readCredentialsAt 缺源 fail-soft = undefined（留痕 skip 前置门）', () => {
    expect(readCredentialsAt(join(tmpdir(), `dsh-cred-miss-${process.pid}`, '.credentials.yaml'))).toBeUndefined()
  })

  it('readCredentialsAt 在场 = 全文（含 refs 段）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-cred-hit-'))
    try {
      const file = join(dir, '.credentials.yaml')
      writeFileSync(file, 'version: 1\nrefs:\n  K: v\n', 'utf8')
      expect(readCredentialsAt(file)).toBe('version: 1\nrefs:\n  K: v\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('seedDshHome 全文播种进隔离 dsh-home（含 refs 段逐字节一致）', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-cred-seed-'))
    try {
      const text = 'version: 1\nrefs:\n  API_KEY: sk-x\nrecords: {}\n'
      seedDshHome(home, text)
      const seeded = join(home, '.credentials.yaml')
      expect(existsSync(seeded)).toBe(true)
      expect(readFileSync(seeded, 'utf8')).toBe(text)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
