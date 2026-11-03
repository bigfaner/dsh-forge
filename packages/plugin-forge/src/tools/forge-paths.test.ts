// 双工具单测（forge-dirs-query-tool §2.3/§2.6 + 验收 AC1 工具面）：
// forgeDirs（缺省全量/单 key/未知 key typed 拒绝列合法集——输出与提案 §2.6 示例结构一致）
// + forgeResolvePath（三目的地/缺参 typed 拒绝/未知 dest 拒绝列法集——schema 即证无锚选择面
// 无自由路径面）+ declare merge 第三方键经 forgeDirs 全量可见 + deps.paths 缺席 fail-loud。
import { describe, expect, it } from 'vitest'
import { createDirKeyRegistry, DIR_KEY_REGISTRY, type DirKeyEntry } from '../forge-paths.js'
import type { ForgePathsAnchorContext } from '../faces.js'
import { createForgeDirsTool, createForgeResolvePathTool, type ForgePathsToolFace } from './forge-paths.js'
import type { ForgeToolDeps } from './index.js'

const WS = 'Z:\\project\\dsh\\demo'
const TASK_HOME = 'D:\\software\\dsh-forge\\data\\forge-workspaces\\Z-project-dsh-demo@deadbeef'
const ANCHORS: ForgePathsAnchorContext = {
  projectHome: 'D:\\software\\dsh-forge\\data\\forge-workspaces',
  taskHome: TASK_HOME,
  forgeDir: `${WS}\\.forge`,
}
const EXEC = { agent: { session: { id: 's-1', header: { cwd: WS } } } } as Parameters<
  ReturnType<typeof createForgeDirsTool>['execute']
>[1]

function depsOf(paths?: Partial<ForgePathsToolFace> & { extraKeys?: readonly DirKeyEntry[] }): ForgeToolDeps {
  const registry = createDirKeyRegistry()
  registry.registerDirKeys(paths?.extraKeys ?? [])
  return {
    tasks: {} as ForgeToolDeps['tasks'],
    proposals: {} as ForgeToolDeps['proposals'],
    bugs: {} as ForgeToolDeps['bugs'],
    checkpoints: {} as ForgeToolDeps['checkpoints'],
    resolveProjectId: () => 'p-1',
    paths: {
      anchorsOf: paths?.anchorsOf ?? (async () => ANCHORS),
      dirKeys: () => registry.entries(),
    },
  }
}

const knowledgeRoot: DirKeyEntry = {
  dirKey: 'knowledge.root',
  description: '工作区知识库根（.knowledge/）',
  resolve: (ctx) => `${ctx.forgeDir}\\.knowledge`,
  declaredBy: 'knowledge',
}

describe('forgeDirs（锚级查询）', () => {
  it('缺省全量：paths 数组每项 = dirKey + dir（绝对路径非空）+ description——结构与提案 §2.6 示例一致', async () => {
    const out = (await createForgeDirsTool(depsOf()).execute({}, EXEC)) as {
      ok: boolean
      paths: { dirKey: string; dir: string; description: string }[]
    }
    expect(out.ok).toBe(true)
    expect(out.paths.map((p) => p.dirKey)).toEqual(DIR_KEY_REGISTRY.map((e) => e.dirKey))
    for (const p of out.paths) {
      expect(Object.keys(p).sort()).toEqual(['description', 'dir', 'dirKey'])
      expect(p.dir.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
    }
    // §2.6 样张对照：五锚键的 dir 与 description 与注册表同源逐项一致
    const byKey = new Map(out.paths.map((p) => [p.dirKey, p]))
    expect(byKey.get('forge.project_home')).toMatchObject({
      dir: 'D:\\software\\dsh-forge\\data\\forge-workspaces',
      description: '宿主任务库派生根（env DSH_FORGE_TASKS_HOME > userData/forge-workspaces，随宿主形态解析）',
    })
    expect(byKey.get('forge.docs_root')!.dir).toBe(`${WS}\\.forge\\docs`)
  })

  it('单 key 查询返回同结构单项（§2.6：单 key 返回同结构单项）', async () => {
    const out = (await createForgeDirsTool(depsOf()).execute({ dirKey: 'forge.task_home' }, EXEC)) as {
      ok: boolean
      paths: { dirKey: string; dir: string; description: string }[]
    }
    expect(out.paths).toEqual([
      {
        dirKey: 'forge.task_home',
        dir: TASK_HOME,
        description: '本工作区任务管线状态库（forge.db 四域状态与任务运行日志所在；deriveTaskStoreDir 产物）',
      },
    ])
  })

  it('declare merge 第三方键全量可见（AC1a：knowledge.root 实例——注册后 forgeDirs 输出含第三方键）', async () => {
    const out = (await createForgeDirsTool(depsOf({ extraKeys: [knowledgeRoot] })).execute({}, EXEC)) as {
      paths: { dirKey: string; dir: string }[]
    }
    expect(out.paths.map((p) => p.dirKey)).toContain('knowledge.root')
    expect(out.paths.find((p) => p.dirKey === 'knowledge.root')!.dir).toBe(`${WS}\\.forge\\.knowledge`)
  })

  it('反向拉取缝（bug 04d445f4）：declaredDirKeys 现取第三方键全量可见；与注册表同键去重不双列', async () => {
    // 拉取径独有（注册表零注册）——跨 scope 装配形态的真机径
    const pullOnly = depsOf()
    pullOnly.paths = { ...pullOnly.paths!, declaredDirKeys: () => [knowledgeRoot] }
    const out = (await createForgeDirsTool(pullOnly).execute({}, EXEC)) as {
      paths: { dirKey: string; dir: string }[]
    }
    expect(out.paths.map((p) => p.dirKey)).toContain('knowledge.root')
    expect(out.paths).toHaveLength(DIR_KEY_REGISTRY.length + 1)
    // 推式已注册 + 拉取同键 = 去重单列（既有键胜出）
    const both = depsOf({ extraKeys: [knowledgeRoot] })
    both.paths = { ...both.paths!, declaredDirKeys: () => [knowledgeRoot] }
    const out2 = (await createForgeDirsTool(both).execute({}, EXEC)) as { paths: { dirKey: string }[] }
    expect(out2.paths.filter((p) => p.dirKey === 'knowledge.root')).toHaveLength(1)
  })

  it('未知 dirKey → typed 拒绝（ERR_DIR_PATH_INVALID）并列出全部合法键', async () => {
    const out = (await createForgeDirsTool(depsOf()).execute({ dirKey: 'forge.nope' }, EXEC)) as {
      ok: boolean
      code: string
      message: string
    }
    expect(out.ok).toBe(false)
    expect(out.code).toBe('ERR_DIR_PATH_INVALID')
    expect(out.message).toContain('forge.nope')
    for (const e of DIR_KEY_REGISTRY) expect(out.message).toContain(e.dirKey)
  })

  it('锚解析与 projects 服务现值同源断言（anchorsOf 透传——deriveTaskStoreDir 现值即 taskHome 输出）', async () => {
    const deps = depsOf({
      anchorsOf: async () => ({ ...ANCHORS, taskHome: 'D:\\real\\store\\dir' }),
    })
    const out = (await createForgeDirsTool(deps).execute({ dirKey: 'forge.task_home' }, EXEC)) as {
      paths: { dir: string }[]
    }
    expect(out.paths[0]!.dir).toBe('D:\\real\\store\\dir')
  })

  it('deps.paths 缺席 = 执行期 fail-loud（同 features 可选降级模式）', async () => {
    const { paths: _paths, ...bare } = depsOf()
    await expect(createForgeDirsTool(bare).execute({}, EXEC)).rejects.toThrow(/paths face not assembled/)
  })
})

describe('forgeResolvePath（目的地解析——受控枚举）', () => {
  const tool = () => createForgeResolvePathTool(depsOf())

  it('三目的地全解析（锚绑定单点——dossier/proposalDir 锚 docsRoot、taskLogs 锚 taskHome）', async () => {
    const dossier = (await tool().execute({ dest: 'dossier', slug: 'a-slug', localId: 'fix-1' }, EXEC)) as { dir: string }
    expect(dossier.dir).toBe(`${WS}\\.forge\\docs\\proposals\\a-slug\\issues\\fix-1`)
    const taskLogs = (await tool().execute({ dest: 'taskLogs', slug: 'a-slug', localId: '1.1' }, EXEC)) as { dir: string }
    expect(taskLogs.dir).toBe(`${TASK_HOME}\\logs\\a-slug\\1.1`)
    const proposalDir = (await tool().execute({ dest: 'proposalDir', slug: 'a-slug' }, EXEC)) as { dir: string }
    expect(proposalDir.dir).toBe(`${WS}\\.forge\\docs\\proposals\\a-slug`)
  })

  it('requires 缺参 typed 拒绝并指明缺参（§2.6 判例：dossier requires: slug, localId）', async () => {
    const out = (await tool().execute({ dest: 'dossier', slug: 'a-slug' }, EXEC)) as { ok: boolean; code: string; message: string }
    expect(out.ok).toBe(false)
    expect(out.code).toBe('ERR_DIR_PATH_INVALID')
    expect(out.message).toContain('dossier requires: slug, localId')
    const proposalOnly = (await tool().execute({ dest: 'proposalDir' }, EXEC)) as { message: string }
    expect(proposalOnly.message).toContain('proposalDir requires: slug')
  })

  it('未知 dest typed 拒绝列出全部合法目的地及各自 requires', async () => {
    const out = (await tool().execute({ dest: 'nowhere', slug: 's' }, EXEC)) as { ok: boolean; code: string; message: string }
    expect(out.ok).toBe(false)
    expect(out.code).toBe('ERR_DIR_PATH_INVALID')
    expect(out.message).toContain('dossier (requires: slug, localId)')
    expect(out.message).toContain('taskLogs (requires: slug, localId)')
    expect(out.message).toContain('proposalDir (requires: slug)')
  })

  it('schema 即证：入参面无锚选择参数、无自由路径参数（仅 dest/slug/localId 三参数）', () => {
    const params = (tool().parameters as { properties: Record<string, unknown> }).properties
    expect(Object.keys(params).sort()).toEqual(['dest', 'localId', 'slug'])
    for (const key of Object.keys(params)) expect((params[key] as { type: string }).type).toBe('string')
  })
})
