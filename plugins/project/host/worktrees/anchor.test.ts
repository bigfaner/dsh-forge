// anchor 归属解析链测试（plugin-project 1.13——R3 RED 锚③）：fake probe 注入构造
// tasksHome 不可读证据（禁真权限操作——Windows CI 造 ACL 拒读不稳定），无 warn emit 即 RED。
import { describe, expect, it } from 'vitest'
import { resolveProjectKey, type AnchorDeps, type GitProbe } from './anchor.js'

/** fake probe 工厂：三动词逐字段可覆写 */
function fakeProbe(overrides: Partial<GitProbe> = {}): GitProbe {
  return {
    revParse: async () => 'D:/repo/.git',
    listDirs: async () => ['Z-project-dsh@9d2471be'],
    exists: async () => true,
    ...overrides,
  }
}

function deps(probe: GitProbe, overrides: Partial<AnchorDeps> = {}): AnchorDeps & { warns: string[] } {
  const warns: string[] = []
  return {
    probe,
    tasksHome: 'D:/tasks-home',
    dirNameOf: () => 'Z-project-dsh@9d2471be',
    mainRowOf: () => 'pk-1',
    onDiag: (message) => warns.push(message),
    warns,
    ...overrides,
  }
}

describe('anchor 四态 Resolution（GitProbe 构造注入——零真 git/真权限）', () => {
  it('非 git（revParse null）→ unattached，恒零注入不误归组', async () => {
    const d = deps(fakeProbe({ revParse: async () => null }))
    await expect(resolveProjectKey('C:/plain', d)).resolves.toEqual({ kind: 'unattached' })
  })

  it('目录未注册（dirName 不在清单）→ unattached', async () => {
    const d = deps(fakeProbe({ listDirs: async () => [] }))
    await expect(resolveProjectKey('C:/repo', d)).resolves.toEqual({ kind: 'unattached' })
  })

  it('目录命中 + 主行在册 + 实体在场 → attached（projectKey/projectRoot 注入）', async () => {
    const d = deps(fakeProbe())
    await expect(resolveProjectKey('C:/repo', d)).resolves.toEqual({
      kind: 'attached',
      projectKey: 'pk-1',
      projectRoot: 'C:/repo',
    })
  })

  it('目录命中但 main 行缺席（mainRowOf null）→ degraded', async () => {
    const d = deps(fakeProbe(), { mainRowOf: () => null })
    await expect(resolveProjectKey('C:/repo', d)).resolves.toEqual({ kind: 'degraded' })
  })

  it('主行在册但实体缺席（exists false）→ degraded', async () => {
    const d = deps(fakeProbe({ exists: async () => false }))
    await expect(resolveProjectKey('C:/repo', d)).resolves.toEqual({ kind: 'degraded' })
  })

  it('R3 RED 锚③：tasksHome 不可读（listDirs 抛错）→ unreadable + warn emit 留痕（无 emit 即 RED，禁静默当空集）', async () => {
    const d = deps(fakeProbe({ listDirs: async () => { throw new Error('EACCES 拒读') } }))
    const resolution = await resolveProjectKey('C:/repo', d)
    expect(resolution).toEqual({ kind: 'unreadable' })
    expect(d.warns.length).toBe(1)
    expect(d.warns[0]).toContain('tasksHome 不可读')
  })

  it('listDirs 抛错且诊断缝缺席 → 仍 unreadable（不抛断、不静默空集误判）', async () => {
    const bare = deps(fakeProbe({ listDirs: async () => { throw new Error('ENOENT') } }), { onDiag: undefined })
    await expect(resolveProjectKey('C:/repo', bare)).resolves.toEqual({ kind: 'unreadable' })
  })
})
