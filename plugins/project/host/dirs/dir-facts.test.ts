// DirFactsPort provider 单测（plugin-project 1.12——seam 表 forge.dirFacts 契约实现）：
// 输出完全由注册表条目派生（resolveForgeDirs 单源）——常驻 provider 全量声明集、
// 最小兜底 provider 本体声明 + 同一声明拉取（reflectOf 注入）；单键查询/未知键拒绝、
// 带参 dest 枚举派生、audit 分区键表派生。
import { describe, expect, it } from 'vitest'
import { deriveDirName, type ForgeDirDeclaration, type ForgeDirSources } from '@dsh-forge/lib-path'
import { FORGE_DIRS_BASE_DECLARATION } from './anchors.js'
import { createDirFactsPort, minimalDirFactsPort } from './dir-facts.js'

const SOURCES: ForgeDirSources = { dshHome: 'X:\\home', projectRoot: 'Z:\\ws\\main', workspaceRoot: 'Z:\\ws' }

const knowledgeDeclaration: ForgeDirDeclaration = {
  source: 'dirKeys.knowledge',
  entries: {
    'knowledge.root': {
      description: '项目知识库根（.knowledge/）',
      deps: ['workspaceRoot'],
      resolve: (deps) => `${deps.workspaceRoot}\\.knowledge`,
    },
  },
}

function depsOf(declarations: readonly ForgeDirDeclaration[], onDiag?: DirKeysPullDiagFace) {
  return { sourcesOf: async () => SOURCES, declarations: () => declarations, onDiag }
}

describe('DirFactsPort provider（forge.dirFacts seam——常驻 + 最小兜底）', () => {
  it('常驻 provider：无参条目逐键 resolve + description（本体七个无参键 + 第三方键）', async () => {
    const port = createDirFactsPort(depsOf([FORGE_DIRS_BASE_DECLARATION, knowledgeDeclaration]))
    const anchors = await port.listAnchors('p-1')
    expect(anchors.map((a) => a.dirKey)).toEqual([
      'forge.home',
      'forge.db',
      'forge.project_runtime_dir',
      'forge.task_runtime_dir',
      'forge.docs_root',
      'forge.tmp',
      'forge.worktrees',
      'knowledge.root',
    ])
    expect(anchors.every((a) => a.dir.length > 0 && a.description.length > 0)).toBe(true)
    expect(anchors.find((a) => a.dirKey === 'knowledge.root')!.dir).toBe('Z:\\ws\\.knowledge')
    expect(anchors.find((a) => a.dirKey === 'forge.home')!.dir).toBe('X:\\home\\forge')
  })

  it('单键查询 = 仅该键；未知 dirKey 拒绝并列出全部合法键', async () => {
    const port = createDirFactsPort(depsOf([FORGE_DIRS_BASE_DECLARATION, knowledgeDeclaration]))
    const single = await port.listAnchors('p-1', 'forge.docs_root')
    expect(single).toHaveLength(1)
    expect(single[0]!.dirKey).toBe('forge.docs_root')
    await expect(port.listAnchors('p-1', 'forge.nope')).rejects.toThrow(/unknown dirKey 'forge\.nope' — legal keys: .*knowledge\.root/)
  })

  it('带参 dest 枚举由条目派生（dest 即键名）；未知 dest 拒绝列法集', async () => {
    const port = createDirFactsPort(depsOf([FORGE_DIRS_BASE_DECLARATION]))
    const dir = await port.resolveDestination('p-1', 'forge.task_logs_dir', { slug: 's', localId: '1.1' })
    expect(dir).toBe(`X:\\home\\forge\\projects\\${deriveDirName(SOURCES.projectRoot)}\\logs\\s\\1.1`)
    await expect(port.resolveDestination('p-1', 'unknown', {})).rejects.toThrow(
      /legal destinations: forge\.spec_dir \(requires: slug\); forge\.dossier_dir \(requires: slug, localId\); forge\.task_logs_dir \(requires: slug, localId\)/,
    )
  })

  it('最小兜底 provider：reflect 缺席 = 仅本体十条；reflect 在场 = 本体 + 声明拉取（同一拉取缝）', async () => {
    const bare = minimalDirFactsPort({ sourcesOf: async () => SOURCES })
    expect((await bare.listAnchors('p-1')).filter((a) => a.dirKey.startsWith('forge.')).length).toBe(7)
    const pulled = minimalDirFactsPort({
      sourcesOf: async () => SOURCES,
      reflectOf: () => ({ props: { 'dirKeys.knowledge': knowledgeDeclaration.entries }, get: () => knowledgeDeclaration.entries }),
    })
    expect((await pulled.listAnchors('p-1')).map((a) => a.dirKey)).toContain('knowledge.root')
  })

  it('audit：分区由键表派生（缺失分区/越位目录与 init 同源）', () => {
    const port = createDirFactsPort(depsOf([FORGE_DIRS_BASE_DECLARATION]))
    const diff = port.audit('Z:\\ws')
    expect(diff.missingPartitions).toEqual(['.forge/docs', '.forge/tmp', '.forge/worktrees'])
  })
})
