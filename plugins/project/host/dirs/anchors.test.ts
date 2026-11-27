// dirKey 声明缝单测（forge-dirs-unification §2.2/§2.5）：基座声明直通 lib/path 单源、
// dirKeys.* 反向拉取缝（形状校验 fail-soft）、工作区分区键表派生、注册表解析器四类
// 报错用例（撞名/缺依赖/成环/参数不合法——同一组注入事实驱动注册表与解析器逐键相同）。
import { describe, expect, it } from 'vitest'
import { deriveDirName, resolveForgeDirs, type ForgeDirDeclaration, type ForgeDirSources } from '@dsh-forge/lib-path'
import {
  DECLARED_DIR_KEYS_PREFIX,
  FORGE_DIRS_BASE_DECLARATION,
  FORGE_DIR_KEYS,
  collectDeclaredDirKeys,
  declaredDirKeys,
  declaredEntryOf,
  mergeDeclarations,
  resolveDeclaredDirs,
  workspacePartitionsOf,
  type DirKeysPullDiagFace,
  type ReflectDeclarePullFace,
} from './anchors.js'
import { PROJECT_DIR_ENTRIES, PROJECT_DIR_KEYS } from './project-entries.js'

const WS = 'Z:\\ws\\proj'
const SOURCES: ForgeDirSources = { dshHome: 'X:\\dsh-home', projectRoot: 'Z:\\ws\\proj-main', workspaceRoot: WS }

/** knowledge.root 第三方条目（deps workspaceRoot——声明合并用例标准件） */
const knowledgeRootEntry = {
  description: '项目知识库根（.knowledge/）',
  deps: ['workspaceRoot'] as const,
  resolve: (deps: { workspaceRoot: string }) => `${deps.workspaceRoot}\\.knowledge`,
}
const knowledgeDeclaration: ForgeDirDeclaration = { source: 'dirKeys.knowledge', entries: { 'knowledge.root': knowledgeRootEntry } }

/** warn 收集桩（DirKeysPullDiagFace 同形） */
function diagSpy(): { calls: { level: string; event: string; message: string }[]; messages: () => readonly string[] } & DirKeysPullDiagFace {
  const calls: { level: string; event: string; message: string }[] = []
  const face = (payload: { readonly level: 'warn'; readonly event: string; readonly message: string }): void => {
    calls.push(payload)
  }
  return Object.assign(face, {
    calls,
    messages: (): readonly string[] => calls.map((c) => c.message),
  }) as never
}

describe('内置声明（lib/path 基座 + project 条目）', () => {
  it('基座键仅 forge.home；project 四键登记序 pin', () => {
    expect(FORGE_DIR_KEYS).toEqual(['forge.home'])
    expect(FORGE_DIRS_BASE_DECLARATION.source).toContain('forge')
    expect(Object.keys(PROJECT_DIR_ENTRIES)).toEqual([...PROJECT_DIR_KEYS])
  })

  it('同一组注入事实驱动注册表与解析器：逐键输出相同（AC 单测同源判据）', () => {
    const declarations = mergeDeclarations([knowledgeDeclaration])
    const resolved = resolveForgeDirs(declarations, SOURCES)
    // 无参条目 = 基座键 + project 四键 + 第三方键（project 条目内置并入，不走 dirKeys.* 拉取）
    const parameterless = ['forge.home', 'project.runtime_dir', 'project.docs_dir', 'project.probes_dir', 'project.spikes_dir', 'project.tmp_dir', 'project.worktrees_dir', 'knowledge.root']
    expect(Object.keys(resolved)).toEqual(parameterless)
    const projectRuntime = `${SOURCES.dshHome}\\forge\\projects\\${deriveDirName(SOURCES.projectRoot)}`
    expect(resolved['forge.home']).toBe('X:\\dsh-home\\forge')
    expect(resolved['project.runtime_dir']).toBe(projectRuntime)
    expect(resolved['project.docs_dir']).toBe(`${WS}\\.forge\\docs`)
    expect(resolved['project.tmp_dir']).toBe(`${WS}\\.forge\\tmp`)
    expect(resolved['project.worktrees_dir']).toBe(`${WS}\\.forge\\worktrees`)
    // declaredDirKeys/declaredEntryOf 与解析器同源同键序
    expect(declaredDirKeys(declarations)).toEqual([...FORGE_DIR_KEYS, ...PROJECT_DIR_KEYS, 'knowledge.root'])
    expect(declaredEntryOf(declarations, 'knowledge.root')!.description).toBe(knowledgeRootEntry.description)
    expect(declaredEntryOf(declarations, 'forge.nope')).toBeUndefined()
  })

  it('解析器四类报错：撞名点名两方 / 缺依赖点名缺席键 / 成环点名环上键 / 参数不合法点名参数', () => {
    const dup: ForgeDirDeclaration = { source: 'dirKeys.other', entries: { 'knowledge.root': knowledgeRootEntry } }
    expect(() => resolveForgeDirs([knowledgeDeclaration, dup], SOURCES)).toThrow(/撞名.*knowledge\.root/)
    const orphan: ForgeDirDeclaration = {
      source: 'dirKeys.orphan',
      entries: { 'orphan.key': { description: 'x', deps: ['forge.home', 'missing.dep'] as never, resolve: () => 'x' } },
    }
    expect(() => resolveForgeDirs([FORGE_DIRS_BASE_DECLARATION, orphan], SOURCES)).toThrow(/依赖缺席.*missing\.dep/)
    const cycle = (name: string, deps: readonly string[]): ForgeDirDeclaration => ({
      source: name,
      entries: { [name]: { description: 'x', deps: deps as never, resolve: () => 'x' } },
    })
    expect(() => resolveForgeDirs([cycle('a.key', ['b.key']), cycle('b.key', ['a.key'])], SOURCES)).toThrow(/依赖成环/)
    const paramed: ForgeDirDeclaration = {
      source: 'dirKeys.paramed',
      entries: { 'paramed.dir': { description: 'x', deps: ['workspaceRoot'], params: ['slug', 'localId'], resolve: () => 'x' } },
    }
    expect(() => resolveForgeDirs([FORGE_DIRS_BASE_DECLARATION, paramed], SOURCES, { slug: '../evil' })).toThrow(/slug/)
  })
})

describe('dirKeys.* 反向拉取缝（collectDeclaredDirKeys——消费点现查）', () => {
  const reflectOf = (props: Record<string, unknown>, get?: (name: string) => unknown): ReflectDeclarePullFace => ({
    props,
    get: get ?? ((name: string) => props[name]),
  })

  it('对象形态声明收集为 ForgeDirDeclaration（source = 约定名，条目原样）', () => {
    const pulled = collectDeclaredDirKeys(reflectOf({ 'dirKeys.knowledge': { 'knowledge.root': knowledgeRootEntry } }))
    expect(pulled).toEqual([knowledgeDeclaration])
  })

  it('reflect 缺席 = 零贡献零抛零发射（非降级径）', () => {
    const onDiag = diagSpy()
    expect(collectDeclaredDirKeys(undefined, onDiag)).toEqual([])
    expect(onDiag.calls).toHaveLength(0)
  })

  it('reflect 在场 props 缺席 = 降级 warn', () => {
    const onDiag = diagSpy()
    expect(collectDeclaredDirKeys({ get: () => undefined }, onDiag)).toEqual([])
    expect(onDiag.messages().some((m) => m.includes('props 名表缺席'))).toBe(true)
  })

  it('malformed 条目跳过 + warn；forge.* 保留名跳过 + warn；合格条目照常收集', () => {
    const onDiag = diagSpy()
    const pulled = collectDeclaredDirKeys(
      reflectOf({
        'dirKeys.knowledge': {
          'forge.custom': knowledgeRootEntry, // 保留名
          'nodot': knowledgeRootEntry, // 无前缀
          'bad.resolve': { ...knowledgeRootEntry, resolve: 42 }, // resolve 非函数
          'knowledge.global': { description: '全局知识库目录', deps: ['forge.home'], resolve: () => 'X:\\global' },
        },
      }),
      onDiag,
    )
    expect(Object.keys(pulled[0]!.entries)).toEqual(['knowledge.global'])
    expect(onDiag.messages().filter((m) => m.includes('保留命名空间'))).toHaveLength(1)
    expect(onDiag.messages().filter((m) => m.includes('malformed'))).toHaveLength(3) // 保留名 warn 亦经 malformed 包装
  })

  it('取值抛 = 该名零贡献 + warn；零产出约定名留痕', () => {
    const onDiag = diagSpy()
    const pulled = collectDeclaredDirKeys(
      reflectOf({ 'dirKeys.throw': { 'knowledge.root': knowledgeRootEntry } }, () => {
        throw new Error('cannot get property')
      }),
      onDiag,
    )
    expect(pulled).toEqual([])
    expect(onDiag.messages().some((m) => m.includes('cannot get property'))).toBe(true)
  })

  it('撞名键不吞：两条声明原样收集，解析当次报错点名两个声明方（bug 32532117——不取先到者）', () => {
    const onDiag = diagSpy()
    const reflect = reflectOf({
      'dirKeys.first': { 'knowledge.root': knowledgeRootEntry },
      'dirKeys.second': { 'knowledge.root': knowledgeRootEntry },
    })
    // 原断言「先到者胜出（只收 dirKeys.first）+ 撞名 warn」已废——撞名不吞是新口径
    const pulled = collectDeclaredDirKeys(reflect, onDiag)
    expect(pulled.map((d) => d.source)).toEqual(['dirKeys.first', 'dirKeys.second'])
    expect(pulled.every((d) => 'knowledge.root' in d.entries)).toBe(true)
    expect(onDiag.calls).toHaveLength(0) // 撞名不再是拉取缝降级径——零 warn
    // 当次解析调用报错并点名两个声明方（注册表撞名报错——拒绝取先到者）
    expect(() => resolveDeclaredDirs(mergeDeclarations(pulled), SOURCES)).toThrow(
      /撞名：knowledge\.root 同时由声明方 dirKeys\.first 与 dirKeys\.second 提供/,
    )
  })

  it('约定名前缀常量 pin（跨插件装配契约）', () => {
    expect(DECLARED_DIR_KEYS_PREFIX).toBe('dirKeys.')
  })
})

describe('工作区分区派生（workspacePartitionsOf——init/audit 键表单源）', () => {
  it('.forge 下的键入分区（声明序）；docs/tmp/worktrees 三员；工作区外键不入（knowledge.root）', () => {
    const onDiag = diagSpy()
    const partitions = workspacePartitionsOf(WS, mergeDeclarations([knowledgeDeclaration]), onDiag)
    expect(partitions).toEqual(['.forge/docs', '.forge/probes', '.forge/spikes', '.forge/tmp', '.forge/worktrees'])
    expect(onDiag.calls).toHaveLength(0)
  })

  it('解析失败 = warn 降级内置声明集（基座 + project——分区仍派生，不炸消费面）', () => {
    const broken: ForgeDirDeclaration = {
      source: 'dirKeys.broken',
      entries: { 'broken.key': { description: 'x', deps: ['missing.dep'] as never, resolve: () => 'x' } },
    }
    const onDiag = diagSpy()
    const partitions = workspacePartitionsOf(WS, [FORGE_DIRS_BASE_DECLARATION, broken], onDiag)
    expect(partitions).toEqual(['.forge/docs', '.forge/probes', '.forge/spikes', '.forge/tmp', '.forge/worktrees'])
    expect(onDiag.messages().some((m) => m.includes('解析降级'))).toBe(true)
  })
})
