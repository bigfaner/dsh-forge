// core-anchors 单测（基本信息区 2026-11-13——core 项目服务 → 锚三键解析缝；
// 派生链镜像 plugin-forge faces.createForgePathsAnchors 语义断言同径）。
import { describe, expect, it } from 'vitest'
import { createCoreAnchorsOf, type CoreProjectPathsFace } from './core-anchors.js'

function faceOf(overrides: Partial<CoreProjectPathsFace> & { project?: unknown; dir?: string } = {}): CoreProjectPathsFace {
  return {
    getProject: async () => (overrides.project !== undefined ? (overrides.project as never) : { wsPath: 'Z:\\ws\\demo', forgeDir: 'Z:\\ws\\demo\\.forge' }),
    deriveTaskStoreDir: async () => ({ dir: overrides.dir ?? 'D:\\tasks\\demo@abcd1234' }),
    ...overrides,
  }
}

describe('createCoreAnchorsOf（锚三键派生链）', () => {
  it('forgeDir = 项目行单源；taskHome = 派生行；projectHome = env DSH_FORGE_TASKS_HOME 优先', async () => {
    const anchors = await createCoreAnchorsOf(faceOf(), { DSH_FORGE_TASKS_HOME: 'X:\\tasks-home' })('p-1')
    expect(anchors).toEqual({ projectHome: 'X:\\tasks-home', taskHome: 'D:\\tasks\\demo@abcd1234', forgeDir: 'Z:\\ws\\demo\\.forge' })
  })

  it('env 缺席 = taskHome 倒数一段（{tasksHome}/{flatten}@{hash8} 布局派生根）', async () => {
    const anchors = await createCoreAnchorsOf(faceOf(), {})('p-1')
    expect(anchors.projectHome).toBe('D:\\tasks')
  })

  it('项目未注册 / forgeDir 缺席 / 派生空 = plain Error fail-loud（点名缺口）', async () => {
    await expect(createCoreAnchorsOf(faceOf({ project: null }))('p-x')).rejects.toThrow(/anchors unavailable/)
    await expect(createCoreAnchorsOf(faceOf({ project: { wsPath: 'Z:\\ws', forgeDir: '' } }))('p-1')).rejects.toThrow(/anchors unavailable/)
    await expect(createCoreAnchorsOf(faceOf({ dir: '' }))('p-1')).rejects.toThrow(/taskHome derivation empty/)
  })

  it('与 DIR_KEY_REGISTRY 解析器闭环：锚入注册表 → docs_root/worktrees 逐字节等价 node:path join', async () => {
    const { DIR_KEY_REGISTRY } = await import('./anchors.js')
    const anchors = await createCoreAnchorsOf(faceOf(), {})('p-1')
    const docs = DIR_KEY_REGISTRY.find((e) => e.dirKey === 'forge.docs_root')!.resolve(anchors)
    const worktrees = DIR_KEY_REGISTRY.find((e) => e.dirKey === 'forge.worktrees')!.resolve(anchors)
    expect(docs).toBe('Z:\\ws\\demo\\.forge\\docs')
    expect(worktrees).toBe('Z:\\ws\\demo\\.forge\\worktrees')
  })
})
