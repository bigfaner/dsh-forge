// extension-points seam 化测试（plugin-project 1.13）：ProjectResolutionPort 双形态 +
// 劣形注入三形态 fail-soft 退默认（code-design §6 S1 判据）。
import { describe, expect, it } from 'vitest'
import {
  adoptInjectedPort,
  createDefaultExtensionPoints,
  defaultGetWorktreeDir,
} from './extension-points.js'

describe('ProjectResolutionPort seam（默认 provider / 注入 provider 双形态 + 劣形三形态 fail-soft）', () => {
  it('默认 provider：resolveProject 恒 null（独立模式）、目录 ‹root›/.forge/worktrees', async () => {
    const port = createDefaultExtensionPoints()
    await expect(port.resolveProject('C:/any')).resolves.toBeNull()
    expect(port.getWorktreeDir('C:/root')).toBe(defaultGetWorktreeDir('C:/root'))
  })

  it('注入 provider 在场即覆写：resolveProject/getWorktreeDir 双面透传', async () => {
    const injected = adoptInjectedPort({
      resolveProject: async () => ({ projectId: 'p9', projectRoot: 'C:/proj', isGit: true }),
      getWorktreeDir: () => 'D:/wt',
    })
    const port = createDefaultExtensionPoints(injected)
    await expect(port.resolveProject('C:/x')).resolves.toEqual({ projectId: 'p9', projectRoot: 'C:/proj', isGit: true })
    expect(port.getWorktreeDir('C:/root')).toBe('D:/wt')
  })

  it('劣形①：注册值非对象 / 逐面非函数 → 拒收面退默认（逐面独立收窄）', async () => {
    expect(adoptInjectedPort('not-a-port')).toBeUndefined()
    expect(adoptInjectedPort(null)).toBeUndefined()
    const half = adoptInjectedPort({ resolveProject: async () => null, getWorktreeDir: 42 })
    expect(half?.resolveProject).toBeTypeOf('function')
    expect(half?.getWorktreeDir).toBeUndefined()
  })

  it('劣形③：注入面首调抛错 → fail-soft 退默认面（resolveProject 退 null / 目录退默认）', async () => {
    const port = createDefaultExtensionPoints(
      adoptInjectedPort({
        resolveProject: async () => {
          throw new Error('首调炸')
        },
        getWorktreeDir: () => {
          throw new Error('首调炸')
        },
      }),
    )
    await expect(port.resolveProject('C:/x')).resolves.toBeNull()
    expect(port.getWorktreeDir('C:/root')).toBe(defaultGetWorktreeDir('C:/root'))
  })
})
