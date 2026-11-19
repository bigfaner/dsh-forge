// self-anchors 单测（fix-1——core 缺席锚解析自装配：workspaceRoot → forgeDir/docsRoot/taskHome
// 插件内派生，零 core 服务消费；锚四键语义镜像 core-anchors/core forgeProjects 同链）。
import { describe, expect, it } from 'vitest'
import { createSelfAnchorsOf } from './self-anchors.js'

describe('createSelfAnchorsOf（锚四键插件自装配派生链）', () => {
  const depsOf = (wsPath: string | null, overrides: { env?: Record<string, string | undefined>; home?: string } = {}) => ({
    wsPathOf: async () => wsPath,
    ...overrides,
  })

  it('env DSH_FORGE_TASKS_HOME 在场 = 派生根取 env；forgeDir/docsRoot = wsPath 派生（joinDirSegment 单源）', async () => {
    const anchors = await createSelfAnchorsOf(depsOf('Z:\\ws\\demo', { env: { DSH_FORGE_TASKS_HOME: 'X:\\tasks-home' } }))('p-1')
    expect(anchors.projectHome).toBe('X:\\tasks-home')
    expect(anchors.forgeDir).toBe('Z:\\ws\\demo\\.forge')
    expect(anchors.docsRoot).toBe('Z:\\ws\\demo\\.forge\\docs')
    expect(anchors.taskHome).toBe(`X:\\tasks-home\\${anchors.taskHome.split('\\').pop()}`)
    expect(anchors.taskHome?.split('\\').pop()).toContain('@') // {flatten}@{hash8} 布局（deriveDirName 单源）
  })

  it('env 缺席 = 宿主 home 约定派生（{home}/forge-workspaces）；projectHome = 派生根', async () => {
    const anchors = await createSelfAnchorsOf(depsOf('Z:\\ws\\demo', { home: 'D:\\dsh-home' }))('p-1')
    expect(anchors.projectHome).toBe('D:\\dsh-home\\forge-workspaces')
    expect(anchors.taskHome?.startsWith('D:\\dsh-home\\forge-workspaces\\')).toBe(true)
    expect(anchors.forgeDir).toBe('Z:\\ws\\demo\\.forge')
  })

  it('workspaceRoot 缺席 / 空串 = fail-loud（调用方按行 fail-soft 收口——锚缺口不静默）', async () => {
    await expect(createSelfAnchorsOf(depsOf(null))('p-x')).rejects.toThrow(/workspace root unavailable/)
    await expect(createSelfAnchorsOf(depsOf(''))('p-x')).rejects.toThrow(/workspace root unavailable/)
  })

  it('tasks 派生根双缺（env 与 home 双缺）= fail-loud', async () => {
    await expect(createSelfAnchorsOf(depsOf('Z:\\ws\\demo'))('p-1')).rejects.toThrow(/tasks root unavailable/)
  })
})
