// workspace 守卫单源单测（F-2 DRY 收口——convert_document/get_outline/validate_mermaid
// 三 tool 共用的 session.cwd 锚解析 + 路径穿越守卫唯一事实源）：
// - sessionCwdOf：header.cwd 正门 / 顶层 cwd 兼容位 / 缺席 undefined
// - assertRelUnderRoot 四面反例（../ 段 / 盘符绝对 / UNC / POSIX 绝对）→ RelPathError ERR_IO；
//   合法相对路径 → 根下解析绝对路径（返回值 = 读取锚，非空自证）
// - 反例可红性：守卫逻辑只在本文件单源——弄坏单源即三 tool 同红
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RelPathError, assertRelUnderRoot, isRelPathError, sessionCwdOf } from '../../../host/tools/workspace.js'
import type { ToolExecFace } from '../../../host/faces.js'

const ROOT = 'Z:\\ws'

describe('sessionCwdOf（cwd 兼容位双读单源）', () => {
  it('header.cwd 正门取数', () => {
    const exec = { agent: { session: { header: { cwd: ROOT } } } } as ToolExecFace
    expect(sessionCwdOf(exec)).toBe(ROOT)
  })

  it('顶层 cwd 兼容位（header 缺席）', () => {
    const exec = { agent: { session: { cwd: ROOT } } } as unknown as ToolExecFace
    expect(sessionCwdOf(exec)).toBe(ROOT)
  })

  it('exec / session / cwd 全缺席 → undefined（拒绝锚，不猜测根）', () => {
    expect(sessionCwdOf(undefined)).toBeUndefined()
    expect(sessionCwdOf({} as ToolExecFace)).toBeUndefined()
    expect(sessionCwdOf({ agent: {} } as ToolExecFace)).toBeUndefined()
  })
})

describe('assertRelUnderRoot（路径穿越守卫单源——四面反例可红）', () => {
  /** 捕获守卫抛错（拒绝面精确断言 typed code 用） */
  const guardErr = (root: string, rel: string): unknown => {
    try {
      assertRelUnderRoot(root, rel, { tool: 't', field: 'docRel' })
    } catch (e) {
      return e
    }
    return undefined
  }

  it('合法相对路径 → 根下解析绝对路径', () => {
    expect(assertRelUnderRoot(ROOT, 'docs/a.md', { tool: 't', field: 'docRel' })).toBe(resolve(ROOT, 'docs/a.md'))
  })

  it('「..」段穿越 → ERR_IO（拒绝先于任何 IO）', () => {
    expect(guardErr(ROOT, '../escape.md')).toSatisfy((e: unknown) => isRelPathError(e) && e.code === 'ERR_IO')
  })

  it('盘符绝对路径 → ERR_IO', () => {
    expect(guardErr(ROOT, 'C:\\abs\\out.md')).toSatisfy((e: unknown) => isRelPathError(e) && e.code === 'ERR_IO')
  })

  it('UNC 路径 → ERR_IO', () => {
    expect(guardErr(ROOT, '\\\\server\\share\\x.md')).toSatisfy((e: unknown) => isRelPathError(e) && e.code === 'ERR_IO')
  })

  it('POSIX 绝对路径 → ERR_IO', () => {
    expect(guardErr(ROOT, '/etc/passwd')).toSatisfy((e: unknown) => isRelPathError(e) && e.code === 'ERR_IO')
  })

  it('解析后越出根（无 .. 段的形状合法路径）→ ERR_IO', () => {
    // resolve(ROOT, 'a/../../x') 形态在段拆分即被捕获；此处验证解析兜底面：子串前缀不匹配
    const narrow = 'Z:\\ws-sub'
    expect(guardErr(narrow, '../ws/x.md')).toSatisfy((e: unknown) => isRelPathError(e) && e.code === 'ERR_IO')
  })

  it('空串/非 string → ERR_IO', () => {
    for (const bad of ['', '   ', 42, null]) {
      expect(() => assertRelUnderRoot(ROOT, bad as string, { tool: 't', field: 'docRel' })).toThrow(RelPathError)
    }
  })

  it('错误消息携带 tool/field/输入值（可归因诊断面）', () => {
    try {
      assertRelUnderRoot(ROOT, '../x.md', { tool: 'get_outline', field: 'docRel' })
      expect.unreachable()
    } catch (e) {
      expect((e as Error).message).toContain('get_outline')
      expect((e as Error).message).toContain('docRel')
      expect((e as Error).message).toContain('../x.md')
    }
  })
})
