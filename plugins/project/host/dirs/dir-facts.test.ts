// DirFactsPort provider 单测（plugin-project 1.12——seam 表 forge.dirFacts 契约实现）：
// 输出完全由注册表条目派生（resolveForgeDirs 单源）——常驻 provider 全量声明集、
// 最小兜底 provider 本体声明 + 同一声明拉取（reflectOf 注入）；单键查询/未知键拒绝、
// 带参 dest 枚举派生、audit 分区键表派生。
import { describe, expect, it } from 'vitest'
import { deriveDirName, type ForgeDirDeclaration, type ForgeDirSources } from '@dsh-forge/lib-path'
import { FORGE_DIRS_BASE_DECLARATION } from './anchors.js'
import { createDirFactsPort, minimalDirFactsPort } from './dir-facts.js'
import { PROJECT_DIR_KEYS, PROJECT_DIRS_DECLARATION } from './project-entries.js'

const SOURCES: ForgeDirSources = { dshHome: 'X:\\home', projectRoot: 'Z:\\ws\\main', workspaceRoot: 'Z:\\ws' }

const knowledgeDeclaration: ForgeDirDeclaration = {
  source: 'dirKeys.knowledge',
  entries: {
    'knowledge.root': {
      description: '项目知识库（.knowledge/）',
      deps: ['workspaceRoot'],
      resolve: (deps) => `${deps.workspaceRoot}\\.knowledge`,
    },
  },
}

/** task-loop 插件声明替身（带参插件键——汇总面的枚举与跨插件依赖链解析） */
const taskLoopDeclaration: ForgeDirDeclaration = {
  source: 'dirKeys.task_loop',
  entries: {
    'task_loop.runtime_dir': {
      description: '任务循环运行时目录',
      deps: ['project.runtime_dir'],
      params: ['slug'],
      resolve: (deps, params) => `${deps['project.runtime_dir']}\\${params.slug}`,
    },
    'task_loop.task_dir': {
      description: '任务目录',
      deps: ['task_loop.runtime_dir'],
      params: ['slug', 'localId'],
      resolve: (deps, params) => `${deps['task_loop.runtime_dir']}\\${params.localId}`,
    },
  },
}

/** 内置声明集（基座 + project——生产装配 mergeDeclarations 的无第三方形态） */
const BUILTIN: readonly ForgeDirDeclaration[] = [FORGE_DIRS_BASE_DECLARATION, PROJECT_DIRS_DECLARATION]

function depsOf(declarations: readonly ForgeDirDeclaration[], onDiag?: DirKeysPullDiagFace) {
  return { sourcesOf: async () => SOURCES, declarations: () => declarations, onDiag }
}

describe('DirFactsPort provider（forge.dirFacts seam——常驻 + 最小兜底）', () => {
  it('常驻 provider：无参条目逐键 resolve + description（基座键 + project 四键 + 第三方键）', async () => {
    const port = createDirFactsPort(depsOf([...BUILTIN, knowledgeDeclaration]))
    const anchors = await port.listAnchors('p-1')
    expect(anchors.map((a) => a.dirKey)).toEqual(['forge.home', ...PROJECT_DIR_KEYS, 'knowledge.root'])
    expect(anchors.every((a) => a.dir.length > 0 && a.description.length > 0)).toBe(true)
    expect(anchors.find((a) => a.dirKey === 'knowledge.root')!.dir).toBe('Z:\\ws\\.knowledge')
    expect(anchors.find((a) => a.dirKey === 'forge.home')!.dir).toBe('X:\\home\\forge')
  })

  it('单键查询 = 仅该键；未知 dirKey 拒绝并列出全部合法键', async () => {
    const port = createDirFactsPort(depsOf([...BUILTIN, knowledgeDeclaration]))
    const single = await port.listAnchors('p-1', 'project.docs_dir')
    expect(single).toHaveLength(1)
    expect(single[0]!.dirKey).toBe('project.docs_dir')
    await expect(port.listAnchors('p-1', 'forge.nope')).rejects.toThrow(/unknown dirKey 'forge\.nope' — legal keys: .*knowledge\.root/)
  })

  it('带参 dest 枚举由条目派生（dest 即键名）；插件键依赖链取内置键解析结果；未知 dest 拒绝列法集', async () => {
    const port = createDirFactsPort(depsOf([...BUILTIN, taskLoopDeclaration]))
    const projectRuntime = `X:\\home\\forge\\projects\\${deriveDirName(SOURCES.projectRoot)}`
    const dir = await port.resolveDestination('p-1', 'task_loop.task_dir', { slug: 's', localId: '1.1' })
    expect(dir).toBe(`${projectRuntime}\\s\\1.1`)
    expect(await port.resolveDestination('p-1', 'task_loop.runtime_dir', { slug: 's' })).toBe(`${projectRuntime}\\s`)
    await expect(port.resolveDestination('p-1', 'unknown', {})).rejects.toThrow(
      /legal destinations: task_loop\.runtime_dir \(requires: slug\); task_loop\.task_dir \(requires: slug, localId\)/,
    )
  })

  it('内置声明无带参键：合法目的地为空（业务目录键归插件，未装载即缺席）', async () => {
    const port = createDirFactsPort(depsOf(BUILTIN))
    await expect(port.resolveDestination('p-1', 'task_loop.task_dir', { slug: 's', localId: '1.1' })).rejects.toThrow(
      "unknown dest 'task_loop.task_dir' — legal destinations: ",
    )
  })

  it('最小兜底 provider：reflect 缺席 = 仅内置声明（基座 + project）；reflect 在场 = 内置 + 声明拉取（同一拉取缝）', async () => {
    const bare = minimalDirFactsPort({ sourcesOf: async () => SOURCES })
    expect((await bare.listAnchors('p-1')).map((a) => a.dirKey)).toEqual(['forge.home', ...PROJECT_DIR_KEYS])
    const pulled = minimalDirFactsPort({
      sourcesOf: async () => SOURCES,
      reflectOf: () => ({ props: { 'dirKeys.knowledge': knowledgeDeclaration.entries }, get: () => knowledgeDeclaration.entries }),
    })
    expect((await pulled.listAnchors('p-1')).map((a) => a.dirKey)).toContain('knowledge.root')
  })

  it('audit：分区由键表派生（缺失分区/越位目录与 init 同源）', () => {
    const port = createDirFactsPort(depsOf(BUILTIN))
    const diff = port.audit('Z:\\ws')
    expect(diff.missingPartitions).toEqual(['.forge/docs', '.forge/probes', '.forge/spikes', '.forge/tmp', '.forge/worktrees'])
  })
})
