// 4.2 boot overlay pin：产品插件行 config 的装配期注入形状（patchFiles 叠层——
// 用户层之后应用，按 row id 整体替换 config；YAML 双引号标量承载 Windows 路径）。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderBootOverlay, writeBootOverlay } from './overlay.js'

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
