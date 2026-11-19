// desktop 通道实锚读面单测（1.15 收口批扩面——fix-23 定谳改锚 0.13.2 asar 实锚）。
// 覆盖：真实 userData / harness home / {userData}/harness/profiles/web profile 落点锚
// （0.13.2 asar 实锚——G3 {userData}/profile 旧锚已废）、desktop 已装清单读面、诊断事件解析
// （app-YYYYMMDD.jsonl / 非 JSON 行容忍 / forge-bundle-absent 过滤）、dump-config
// insert 条目断言字面（fix-7 序列化形状正例 + 三反例红面）。
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BARE_BUNDLES,
  FORGE_BUNDLE_ABSENT_EVENT,
  desktopAbsenceEvents,
  desktopDiagEvents,
  desktopHarnessHome,
  desktopInstalledBundles,
  desktopPkgEntryDir,
  desktopProfileDir,
  desktopProfileNodeModules,
  desktopRealUserData,
  insertEntryPattern,
} from '../../../e2e/support/forge-combo.js'

/** desktop 真实 userData 形态夹具（只测读面形状——不触真机盘面） */
function makeUserData(): string {
  const ud = mkdtempSync(join(tmpdir(), 'dsh-forge-combo-udtest-'))
  mkdirSync(join(ud, 'harness', 'profiles', 'web'), { recursive: true })
  return ud
}

describe('desktop 通道实锚读面（fix-23 定谳——0.13.2 {userData}/harness/profiles/web）', () => {
  it('desktopRealUserData 派生：%APPDATA% + dsh-desktop（asar configureAppIdentity 实锚）', () => {
    const prior = process.env.APPDATA
    process.env.APPDATA = 'C:\\Users\\x\\AppData\\Roaming'
    try {
      expect(desktopRealUserData()).toBe(join('C:\\Users\\x\\AppData\\Roaming', 'dsh-desktop'))
    } finally {
      if (prior === undefined) delete process.env.APPDATA
      else process.env.APPDATA = prior
    }
  })

  it('desktopRealUserData：APPDATA 缺席 fail-loud（不静默派生）', () => {
    const prior = process.env.APPDATA
    delete process.env.APPDATA
    try {
      expect(() => desktopRealUserData()).toThrow(/APPDATA/)
    } finally {
      if (prior !== undefined) process.env.APPDATA = prior
    }
  })

  it('desktopHarnessHome / desktopProfileDir / NodeModules / PkgEntryDir 落点形状（0.13.2 asar 实锚）', () => {
    expect(desktopHarnessHome('C:\\ud')).toBe(join('C:\\ud', 'harness'))
    expect(desktopProfileDir('C:\\ud')).toBe(join('C:\\ud', 'harness', 'profiles', 'web'))
    expect(desktopProfileNodeModules('C:\\ud')).toBe(join('C:\\ud', 'harness', 'profiles', 'web', 'node_modules'))
    expect(desktopPkgEntryDir('C:\\ud', '@dsh-forge/forge')).toBe(join('C:\\ud', 'harness', 'profiles', 'web', 'node_modules', '@dsh-forge', 'forge'))
  })

  it('desktopInstalledBundles 读 harness/profiles/web/package.json dsh.profile.bundles（缺席文件 = 空清单）', () => {
    const ud = makeUserData()
    expect(desktopInstalledBundles(ud), 'profile package.json 缺席 = 空清单').toEqual([])
    writeFileSync(
      join(desktopProfileDir(ud), 'package.json'),
      JSON.stringify({ dsh: { profile: { bundles: ['@dsh-forge/project', '@dsh-forge/forge'] } } }),
    )
    expect(desktopInstalledBundles(ud)).toEqual(['@dsh-forge/project', '@dsh-forge/forge'])
  })
})

describe('desktopDiagEvents / desktopAbsenceEvents（{userData}/logs app-*.jsonl）', () => {
  it('解析事件行 + forge-bundle-absent 过滤 + 非 JSON 行容忍', () => {
    const ud = makeUserData()
    mkdirSync(join(ud, 'logs'), { recursive: true })
    const lines = [
      JSON.stringify({ level: 'warn', event: FORGE_BUNDLE_ABSENT_EVENT, message: `bundle absent @dsh-forge/knowledge: no entry` }),
      'not-json-garbage-line',
      JSON.stringify({ level: 'info', event: 'session-bind', message: 'ok' }),
      JSON.stringify({ level: 'warn', event: FORGE_BUNDLE_ABSENT_EVENT, message: `bundle absent @dsh-forge/spec: no entry` }),
      '',
    ]
    writeFileSync(join(ud, 'logs', 'app-20261118.jsonl'), `${lines.join('\n')}\n`)
    const all = desktopDiagEvents(ud)
    expect(all.length, 'JSON 事件行全收（垃圾行容忍跳过）').toBe(3)
    const absent = desktopAbsenceEvents(ud)
    expect(absent.length, 'forge-bundle-absent 事件过滤').toBe(2)
    expect(absent.some((e) => e.message.includes('@dsh-forge/knowledge')), '缺席事件含缺席包名（CT-DISK-07 判据）').toBe(true)
  })

  it('logs 目录缺席 = 空事件集（冷启动前查询不炸）', () => {
    const ud = makeUserData()
    expect(desktopAbsenceEvents(ud)).toEqual([])
  })

  it('反例面：CT-DISK-11 零发射锚可红——任一 forge-bundle-absent 事件在场即非空', () => {
    const ud = makeUserData()
    mkdirSync(join(ud, 'logs'), { recursive: true })
    writeFileSync(
      join(ud, 'logs', 'app-20261118.jsonl'),
      `${JSON.stringify({ level: 'warn', event: FORGE_BUNDLE_ABSENT_EVENT, message: 'bundle absent @dsh-forge/project: no entry' })}\n`,
    )
    expect(desktopAbsenceEvents(ud).length, '残留件缺席告警在场 = 零发射锚红面').toBeGreaterThan(0)
  })
})

describe('insertEntryPattern（dump-config fix-7 序列化形状）', () => {
  it('正例：- id: 行 + 缩进 name: 行（CRLF 容忍）', () => {
    const sample = [
      'bundles:',
      '- id: project',
      "  name: '@dsh-forge/project'",
      '    config:',
      '      home: !!js process.env.DSH_HOME',
    ].join('\r\n')
    expect(sample).toMatch(insertEntryPattern('@dsh-forge/project'))
  })

  it('反例一：bug 13ffb081 旧单行形状（- name: bare 单行）不匹配', () => {
    expect("  - name: '@dsh-forge/project'").not.toMatch(insertEntryPattern('@dsh-forge/project'))
  })

  it('反例二：缩进漂移（三空格 name 行）不匹配', () => {
    expect("- id: project\r\n   name: '@dsh-forge/project'").not.toMatch(insertEntryPattern('@dsh-forge/project'))
  })

  it('反例三：错位裸名（project 行 vs knowledge 断言）不匹配——禁 OR 稀释', () => {
    const sample = "- id: project\r\n  name: '@dsh-forge/project'"
    for (const bare of BARE_BUNDLES) {
      if (bare === '@dsh-forge/project') continue
      expect(sample, `错位裸名不匹配 ${bare}`).not.toMatch(insertEntryPattern(bare))
    }
  })
})
