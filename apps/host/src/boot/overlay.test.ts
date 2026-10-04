// 4.2 boot overlay pin：产品插件行 config 的装配期注入形状（patchFiles 叠层——
// 用户层之后应用，按 row id 整体替换 config；YAML 双引号标量承载 Windows 路径）。
// fix-12：welcome ack 预置行形状 + 上游版本常量 pin（升级窗口机械核查）。
// fix-26：凭据桥行形状（credentialsPath 在场注入 / 缺席不桥）+ 官方缝 pin。
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

  it('凭据桥行（fix-26）：credentialsPath 在场 → credentials 行 config.path 注入（反斜杠转义同产品行）', () => {
    const text = renderBootOverlay({
      stateDb: '/x/state.db',
      bindingsFile: '/x/b.json',
      credentialsPath: 'C:\\Users\\u\\.dsh\\.credentials.yaml',
    })
    expect(text).toContain(
      '- id: credentials\n  config:\n    path: "C:\\\\Users\\\\u\\\\.dsh\\\\.credentials.yaml"',
    )
  })

  it('凭据桥门（fix-26）：credentialsPath 缺席 → 无 credentials 行（e2e/测试隔离态不读真凭据）', () => {
    const text = renderBootOverlay({ stateDb: '/x/s.db', bindingsFile: '/x/b.json' })
    expect(text).not.toContain('- id: credentials')
    expect(text).not.toContain('credentials.yaml')
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

// fix-26 凭据桥官方缝 pin——上游升级窗口机械核查（同 welcome ack 常量 pin 惯例）：桥合法性
// 全押三处官方形状——resolveSpec 显式 path 优先缝（桥的机制前提）、credentials 文档名
// （paths.ts resolveCredentialsBridge 硬编码名等值）、dsh-base roster 行 id（overlay 按
// row id 整体替换 config——id 漂移 = 注入落空成新行）
describe('凭据桥官方缝 pin（fix-26）', () => {
  it('dsh-credentials-local：resolveSpec config.path 显式优先于 home 拼接 + 文档名常量', () => {
    const vendored = join(
      hostRoot(),
      'profile.dev',
      'node_modules',
      '@deepseek-ai',
      'dsh-credentials-local',
      'lib',
      'index.js',
    )
    expect(existsSync(vendored)).toBe(true) // 前置：profile.dev 未安装 = 环境缺口（welcome ack pin 同依赖）
    const text = readFileSync(vendored, 'utf8')
    expect(text).toContain('config.path ?? join(resolveDshHome(config.dshHome)') // 显式 path 缝在场
    expect(text).toMatch(/CREDENTIALS_FILENAME = "\.credentials\.yaml"/) // 文档名 = 桥路径文件名
  })

  it('dsh-base cordis.patch.yml：credentials 行在场（overlay 行 id 匹配官方 roster）', () => {
    const patch = join(
      hostRoot(),
      'profile.dev',
      'node_modules',
      '@deepseek-ai',
      'dsh-base',
      'cordis.patch.yml',
    )
    expect(existsSync(patch)).toBe(true)
    expect(readFileSync(patch, 'utf8')).toContain(
      "- id: credentials\n      name: '@deepseek-ai/dsh-credentials-local'",
    )
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
