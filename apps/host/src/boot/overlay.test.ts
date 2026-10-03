// 4.2 boot overlay pin：产品插件行 config 的装配期注入形状（patchFiles 叠层——
// 用户层之后应用，按 row id 整体替换 config；YAML 双引号标量承载 Windows 路径）。
// fix-12：welcome ack 预置行形状 + 上游版本常量 pin（升级窗口机械核查）。
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderBootOverlay, WELCOME_NOTICE_ACK_VERSION, writeBootOverlay } from './overlay.js'
import { hostRoot } from '../profile/paths.js'

describe('renderBootOverlay（纯函数形状）', () => {
  it('两产品行 config 注入：dbFile / bindingsFile 双引号标量（反斜杠转义）', () => {
    const text = renderBootOverlay({
      stateDb: 'C:\\app-data\\dsh-forge\\state.db',
      bindingsFile: 'C:\\app-data\\dsh-forge\\knowledge-bindings.json',
    })
    expect(text).toBe(
      [
        '# dsh-forge boot overlay（host 每启重写——产品插件行 config 注入；非用户层状态）',
        '- id: dsh-forge-core',
        '  config:',
        '    dbFile: "C:\\\\app-data\\\\dsh-forge\\\\state.db"',
        '- id: dsh-forge-knowledge',
        '  config:',
        '    bindingsFile: "C:\\\\app-data\\\\dsh-forge\\\\knowledge-bindings.json"',
        '- id: ui-settings-general',
        '  config:',
        `    welcomeNoticeVersion: "${WELCOME_NOTICE_ACK_VERSION}"`,
        '',
      ].join('\n'),
    )
  })

  it('行 id 定位用户层产品行（patch 按 row id 整体替换 config——非 insert 新行）', () => {
    const text = renderBootOverlay({ stateDb: '/x/state.db', bindingsFile: '/x/b.json' })
    expect(text).toContain('- id: dsh-forge-core')
    expect(text).toContain('- id: dsh-forge-knowledge')
    expect(text).not.toContain('- insert')
    expect(text).not.toContain('disabled')
  })

  it('正斜杠路径不转义（POSIX 形态原样）', () => {
    const text = renderBootOverlay({ stateDb: '/tmp/ud/state.db', bindingsFile: '/tmp/ud/b.json' })
    expect(text).toContain('dbFile: "/tmp/ud/state.db"')
  })

  it('welcome ack 预置行：官方等值比对常量双引号标量（fix-12）', () => {
    const text = renderBootOverlay({ stateDb: '/x/s.db', bindingsFile: '/x/b.json' })
    // 官方 WelcomeNoticeStore 逐字等值比对（===）——YAML 引号标量防日期式再解析
    expect(text).toContain(`- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: "${WELCOME_NOTICE_ACK_VERSION}"`)
  })
})

describe('welcome ack 常量 pin（fix-12——上游升级窗口机械核查）', () => {
  it('overlay 常量 === 官方 vendored 副本内 WELCOME_NOTICE_VERSION（bump 即红）', () => {
    // dev 形态运行时真实消费副本（profile.dev/node_modules——loader 插件链装载面）
    const vendored = join(
      hostRoot(),
      'profile.dev',
      'node_modules',
      '@deepseek-ai',
      'dsh-client-ui-settings-models',
      'lib',
      'client.js',
    )
    expect(existsSync(vendored)).toBe(true) // 前置：profile.dev 未安装 = 环境缺口（paths.test 同依赖）
    const match = readFileSync(vendored, 'utf8').match(/WELCOME_NOTICE_VERSION = "([^"]+)"/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe(WELCOME_NOTICE_ACK_VERSION)
  })
})

describe('writeBootOverlay（落地机制）', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-forge-overlay-'))
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('返回目标路径并写入渲染文本（深层目录自动创建；重写幂等）', () => {
    const target = join(dir, 'nested', 'boot-overlay.yml')
    expect(writeBootOverlay(target, { stateDb: 'C:\\s.db', bindingsFile: 'C:\\b.json' })).toBe(target)
    expect(readFileSync(target, 'utf8')).toBe(renderBootOverlay({ stateDb: 'C:\\s.db', bindingsFile: 'C:\\b.json' }))
    writeBootOverlay(target, { stateDb: 'C:\\s2.db', bindingsFile: 'C:\\b2.json' })
    expect(readFileSync(target, 'utf8')).toContain('s2.db')
  })
})
