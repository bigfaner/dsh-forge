// 锚解析缝单测（faces.createForgePathsAnchors——与 projects 服务现值同源断言）。
// plugin-project 1.12 目录事实面归拢：注册表/目的地/declare merge 纯函数面随本体迁
// plugins/project host/dirs/anchors.test.ts；本文件只留装配层锚解析缝（faces 属
// plugin-forge 装配壳，不随迁）。
import { describe, expect, it } from 'vitest'
import { createForgePathsAnchors } from './faces.js'

const WS = 'Z:\\project\\dsh\\demo'

describe('锚解析缝（faces.createForgePathsAnchors——与 projects 服务现值同源断言）', () => {
  const projects = {
    getProject: async () => ({
      id: 'p-1',
      workspaceId: 'w-1',
      wsPath: WS,
      name: 'demo',
      forgeDir: `${WS}\\.forge`,
      forgeDirExternal: false,
      archived: false,
      createdAt: '',
      updatedAt: '',
    }),
    deriveTaskStoreDir: async () => ({ dir: 'D:\\software\\dsh-forge\\data\\forge-workspaces\\Z-project-dsh-demo@deadbeef' }),
  }

  it('锚四键 = projects 服务现值同源（forgeDir ← getProject.forgeDir；taskHome ← deriveTaskStoreDir 单源）', async () => {
    const anchors = createForgePathsAnchors(projects, {})
    expect(await anchors.anchorsOf('p-1')).toEqual({
      projectHome: 'D:\\software\\dsh-forge\\data\\forge-workspaces', // dirname(taskHome)——{tasksHome}/{flatten}@{hash8} 布局
      taskHome: 'D:\\software\\dsh-forge\\data\\forge-workspaces\\Z-project-dsh-demo@deadbeef',
      forgeDir: `${WS}\\.forge`,
      docsRoot: undefined,
    })
  })

  it('projectHome：env DSH_FORGE_TASKS_HOME 非空优先（宿主 paths.ts resolveTasksHome 同键）', async () => {
    const anchors = createForgePathsAnchors(projects, { DSH_FORGE_TASKS_HOME: 'X:\\ws\\tasks-home' })
    expect((await anchors.anchorsOf('p-1')).projectHome).toBe('X:\\ws\\tasks-home')
  })

  it('项目未注册 / 派生空 = fail-loud（装配缺口不静默）', async () => {
    await expect(createForgePathsAnchors({ ...projects, getProject: async () => null }, {}).anchorsOf('p-x')).rejects.toThrow(/unavailable/)
    await expect(
      createForgePathsAnchors({ ...projects, deriveTaskStoreDir: async () => ({ dir: '' }) }, {}).anchorsOf('p-1'),
    ).rejects.toThrow(/taskHome derivation empty/)
  })
})
