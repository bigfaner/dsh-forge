// dirKey 数据源单测（forge-dirs-query-tool §2.1/§2.2 + 验收 AC1/AC1a）：
// 锚键注册表 5 键（纯函数零 IO——ctx 构造即测）+ 目的地注册表 3 目的地（requires 校验 +
// 锚绑定单点）+ declare merge 注册面四断言（第三方键合并可见 / forge.* 占用拒绝 / 同名
// 互撞 fail-loud 点名两方 / forge 缺席环境零生效零抛）+ 锚解析缝与 projects 服务现值同源。
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  createDirKeyRegistry,
  declareDirKeys,
  DIR_DESTINATIONS,
  DIR_KEY_REGISTRY,
  dossierIssuesDirOf,
  docsRootOfForgeDir,
  forgeDirOfWorkspace,
  resolveDestination,
  taskLogsDirOf,
  workspaceDocsRoot,
  type DirKeyEntry,
} from './forge-paths.js'
import { createForgePathsAnchors } from './faces.js'

const WS = 'Z:\\project\\dsh\\demo'
const CTX = {
  projectHome: 'D:\\software\\dsh-forge\\data\\forge-workspaces',
  taskHome: 'D:\\software\\dsh-forge\\data\\forge-workspaces\\Z-project-dsh-demo@deadbeef',
  forgeDir: `${WS}\\.forge`,
}

describe('锚键注册表（AC1：5 键全量——每项纯函数解析 + description 在场）', () => {
  it('恰 5 锚键，dirKey 集合 = 提案 §2.1 锚键表', () => {
    expect(DIR_KEY_REGISTRY.map((e) => e.dirKey)).toEqual([
      'forge.projectHome',
      'forge.taskHome',
      'forge.docsRoot',
      'forge.tmp',
      'forge.worktrees',
    ])
  })

  it('同构解析器（纯函数零 IO——同入参同出参；docsRoot/tmp/worktrees 由 forgeDir 派生）', () => {
    expect(DIR_KEY_REGISTRY.map((e) => e.resolve(CTX))).toEqual([
      'D:\\software\\dsh-forge\\data\\forge-workspaces',
      'D:\\software\\dsh-forge\\data\\forge-workspaces\\Z-project-dsh-demo@deadbeef',
      `${WS}\\.forge\\docs`,
      `${WS}\\.forge\\tmp`,
      `${WS}\\.forge\\worktrees`,
    ])
    // 纯函数可重放（同入参同出参）
    for (const e of DIR_KEY_REGISTRY) expect(e.resolve(CTX)).toBe(e.resolve({ ...CTX }))
  })

  it('docsRoot 显式注入优先（ctx 装配层可覆盖派生缺省）；锚前提缺席 = fail-loud 不静默', () => {
    const docsRoot = DIR_KEY_REGISTRY.find((e) => e.dirKey === 'forge.docsRoot')!
    expect(docsRoot.resolve({ ...CTX, docsRoot: 'W:\\ext\\docs' })).toBe('W:\\ext\\docs')
    expect(() => docsRoot.resolve({})).toThrow('forgeDir')
    expect(() => DIR_KEY_REGISTRY[0]!.resolve({})).toThrow('projectHome')
  })

  it('description 与注册表同源（每键一句话语义在场——工具输出零二次维护）', () => {
    for (const e of DIR_KEY_REGISTRY) {
      expect(e.description.length).toBeGreaterThan(0)
      expect(e.declaredBy).toBe('plugin-forge')
    }
  })
})

describe('目的地注册表（AC1：3 目的地受控枚举 + requires + 锚绑定单点）', () => {
  it('恰 3 目的地——锚与模板与提案 §2.1 表逐行一致', () => {
    expect(DIR_DESTINATIONS.map((d) => [d.dest, d.anchor, d.template, ...d.requires])).toEqual([
      ['dossier', 'forge.docsRoot', 'proposals/{slug}/issues/{localId}', 'slug', 'localId'],
      ['taskLogs', 'forge.taskHome', 'logs/{slug}/{localId}', 'slug', 'localId'],
      ['proposalDir', 'forge.docsRoot', 'proposals/{slug}', 'slug'],
    ])
  })

  it('解析 = 锚 + 模板占位替换（§2.6 判例样张：dossier/proposalDir 锚 docsRoot、taskLogs 锚 taskHome）', () => {
    const params = { slug: 'prompt-scoping-and-desc-trim', localId: 'fix-1' }
    expect(resolveDestination(DIR_DESTINATIONS[0]!, CTX, params)).toBe(
      `${WS}\\.forge\\docs\\proposals\\prompt-scoping-and-desc-trim\\issues\\fix-1`,
    )
    expect(resolveDestination(DIR_DESTINATIONS[1]!, CTX, params)).toBe(
      'D:\\software\\dsh-forge\\data\\forge-workspaces\\Z-project-dsh-demo@deadbeef\\logs\\prompt-scoping-and-desc-trim\\fix-1',
    )
    expect(resolveDestination(DIR_DESTINATIONS[2]!, CTX, { slug: 'demo' })).toBe(`${WS}\\.forge\\docs\\proposals\\demo`)
  })
})

describe('declare merge 注册面（AC1a 四断言）', () => {
  const knowledgeRoot: DirKeyEntry = {
    dirKey: 'knowledge.root',
    description: '工作区知识库根（.knowledge/）',
    resolve: (ctx) => `${ctx.forgeDir ?? ''}\\..\\.knowledge`,
    declaredBy: 'knowledge',
  }

  it('第三方键注册后全量可见（forge 本体五键在前 + knowledge.root 追加）', () => {
    const registry = createDirKeyRegistry()
    registry.registerDirKeys([knowledgeRoot])
    const keys = registry.entries().map((e) => e.dirKey)
    expect(keys).toEqual([...DIR_KEY_REGISTRY.map((e) => e.dirKey), 'knowledge.root'])
  })

  it('forge.* 前缀第三方声明拒绝（本体命名空间保留）', () => {
    const registry = createDirKeyRegistry()
    expect(() =>
      registry.registerDirKeys([{ ...knowledgeRoot, dirKey: 'forge.custom', declaredBy: 'knowledge' }]),
    ).toThrow(/reserved for plugin-forge/)
  })

  it('无插件前缀（无点分隔）拒绝；description/resolve 缺席拒绝（fail-loud 形状校验）', () => {
    const registry = createDirKeyRegistry()
    expect(() => registry.registerDirKeys([{ ...knowledgeRoot, dirKey: 'orphankey' }])).toThrow(/plugin prefix/)
    expect(() => registry.registerDirKeys([{ ...knowledgeRoot, description: '' }])).toThrow(/description/)
    expect(() => registry.registerDirKeys([{ ...knowledgeRoot, resolve: undefined as unknown as DirKeyEntry['resolve'] }])).toThrow(/resolve/)
  })

  it('同名互撞 fail-loud 点名两方（不遮蔽不覆盖——原键保持）', () => {
    const registry = createDirKeyRegistry()
    registry.registerDirKeys([knowledgeRoot])
    expect(() => registry.registerDirKeys([{ ...knowledgeRoot, declaredBy: 'another-plugin' }])).toThrow(
      /'knowledge\.root' already declared by knowledge.*another-plugin rejected/,
    )
    expect(registry.entries().filter((e) => e.dirKey === 'knowledge.root')).toHaveLength(1)
  })

  it('forge 服务缺席环境第三方声明零生效零抛（declareDirKeys fail-soft——AGENTS 1.6 现查）', () => {
    let registered: readonly DirKeyEntry[] | undefined
    expect(() => declareDirKeys(() => undefined, [knowledgeRoot])).not.toThrow()
    expect(() => declareDirKeys(() => { throw new Error('cannot get property') }, [knowledgeRoot])).not.toThrow()
    expect(() => declareDirKeys(() => ({}), [knowledgeRoot])).not.toThrow()
    expect(registered).toBeUndefined()
    // 在场且面齐备 = 声明生效（读取闭包现查，不缓存）
    declareDirKeys(() => ({ registerDirKeys: (e: readonly DirKeyEntry[]) => { registered = e } }), [knowledgeRoot])
    expect(registered).toEqual([knowledgeRoot])
  })
})

describe('锚解析缝（faces.createForgePathsAnchors——与 projects 服务现值同源断言）', () => {
  const projects = {
    getProject: async () => ({
      id: 'p-1',
      workspaceId: 'w-1',
      wsPath: WS,
      name: 'demo',
      forgeDir: `${WS}\\.forge`,
      forgeDirExternal: false,
      knowledgeDir: `${WS}\\.knowledge`,
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

describe('§2.8 散点收编派生导出（AC2 逐字节等价——每收编点一条等价断言，平台原生拼写）', () => {
  it('dossierIssuesDirOf === join(ws, .forge, docs, proposals, slug, issues, localId)（settle 回收 + recurrence 探测双探测位单点收口）', () => {
    expect(dossierIssuesDirOf(WS, 'feat-x', '2.1')).toBe(join(WS, '.forge', 'docs', 'proposals', 'feat-x', 'issues', '2.1'))
    expect(dossierIssuesDirOf('C:\\ws\\proj', 'a-slug', 'fix-1')).toBe(join('C:\\ws\\proj', '.forge', 'docs', 'proposals', 'a-slug', 'issues', 'fix-1'))
  })

  it('taskLogsDirOf === join(taskHome, logs, slug, localId)（运行时任务目录同径）', () => {
    expect(taskLogsDirOf(CTX.taskHome, 'feat-x', '2.1')).toBe(join(CTX.taskHome, 'logs', 'feat-x', '2.1'))
  })

  it('contracts 派生导出等价：forgeDirOfWorkspace / workspaceDocsRoot / docsRootOfForgeDir（与 node join 及 prompt 旧实现逐字节等价）', () => {
    expect(forgeDirOfWorkspace(WS)).toBe(join(WS, '.forge'))
    expect(workspaceDocsRoot(WS)).toBe(join(WS, '.forge', 'docs'))
    // prompt docsRootOfForgeDir 旧实现口径（平台独立单段连接）
    const sep = /^[A-Za-z]:[\\/]/.test(WS) || WS.startsWith('\\\\') ? '\\' : '/'
    expect(docsRootOfForgeDir(`${WS}\\.forge`)).toBe(`${WS}\\.forge${sep}docs`)
  })
})
