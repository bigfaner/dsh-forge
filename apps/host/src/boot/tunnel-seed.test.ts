import { afterEach, describe, expect, it } from 'vitest'
import { officialCloudflaredSeedCandidates } from './child.js'

const envKeys = ['APPDATA'] as const
const saved = new Map<string, string | undefined>(
  envKeys.map((k) => [k, process.env[k]]),
)

afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

/** tunnel-seed：dsh-desktop cloudflared 种子候选按平台取位（win=APPDATA，mac=~/Library/Application Support，linux=~/.config） */
describe('officialCloudflaredSeedCandidates', () => {
  const platform = process.platform

  it('win32：APPDATA 形态候选', { skip: platform !== 'win32' }, () => {
    process.env['APPDATA'] = 'C:\\Users\\u\\AppData\\Roaming'
    expect(officialCloudflaredSeedCandidates()).toEqual([
      'C:\\Users\\u\\AppData\\Roaming\\dsh-desktop\\bin\\cloudflared.exe',
    ])
  })

  it('win32：APPDATA 缺席 = 空候选', { skip: platform !== 'win32' }, () => {
    delete process.env['APPDATA']
    expect(officialCloudflaredSeedCandidates()).toEqual([])
  })

  it('darwin：~/Library/Application Support 形态候选', { skip: platform !== 'darwin' }, () => {
    delete process.env['APPDATA']
    expect(officialCloudflaredSeedCandidates()).toEqual([
      `${process.env['HOME']}/Library/Application Support/dsh-desktop/bin/cloudflared`,
    ])
  })

  it('linux：~/.config 形态候选', { skip: platform !== 'linux' }, () => {
    delete process.env['APPDATA']
    expect(officialCloudflaredSeedCandidates()).toEqual([
      `${process.env['HOME']}/.config/dsh-desktop/bin/cloudflared`,
    ])
  })

  it('HOME 缺席的非 win 平台 = 空候选（fail-soft，纯下载链自洽）', { skip: platform === 'win32' }, () => {
    const home = process.env['HOME']
    delete process.env['HOME']
    try {
      expect(officialCloudflaredSeedCandidates()).toEqual([])
    } finally {
      if (home !== undefined) process.env['HOME'] = home
    }
  })
})
