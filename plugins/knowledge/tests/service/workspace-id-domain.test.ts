// fix-10（bug bb11c53e）锚 id 域对齐单测：官方宿主 projects 行 id 属宿主 workspace 域
//（workspaceRegistry 投影 id = workspaceId），knowledge 服务 requireProject 解析链须
// 增加「workspace 域 id → wsPath」归一步（装配缝经 ctx.workspaceRegistry 现查注入）；
// dsh-forge 集成宿主 projects 行 id 本就是 forge projectId（静态表/注册行命中在前），
// 归一步零参与零变化；真错 id fail-loud 语义保留但文案收敛（不暴露内部操作词）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../../host/storage/index.js'
import { createKnowledgeService } from '../../host/service/service.js'
import { projectKeyOf } from '../../host/project-key.js'
import { registryProjectsSource, type WorkspaceRegistryFace } from '../../host/connection-rpc.js'
import type { BrowseKnowledgeService } from '../../host/service/types.js'

let home: string
let wsDir: string
let knowledgeDir: string
let db: import('@dsh-forge/lib-db').Database

function md(title: string, id: string, keywords: readonly string[], summary: string): string {
  return `---\ntitle: ${title}\nid: ${id}\nstatus: confirmed\nsummary: ${summary}\nkeywords: [${keywords.join(', ')}]\n---\n正文`
}

/** 官方宿主形态服务：一级解析恒空（官方宿主零 config.projects 绑定表）+ workspace 域归一步 */
function officialHostService(): BrowseKnowledgeService {
  return createKnowledgeService({
    db,
    resolveWsPath: () => undefined,
    // 装配缝形态：host/index.ts 经 ctx.workspaceRegistry 逐调用现查（async 面）
    resolveWorkspacePath: async (workspaceId) => (workspaceId === 'ws-official' ? wsDir : undefined),
  })
}

/** dsh-forge 集成宿主形态服务：forge projectId 经静态表命中，归一步不参与 */
function forgeHostService(): BrowseKnowledgeService {
  return createKnowledgeService({
    db,
    resolveWsPath: (id) => (id === 'p-forge' ? wsDir : undefined),
    resolveWorkspacePath: () => undefined,
  })
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-wsidom-'))
  wsDir = join(home, 'ws')
  knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  writeFileSync(join(knowledgeDir, 'a.md'), md('Domain Note', 'wsidom-a', ['anchor'], '锚 id 域对齐样本条目'), 'utf8')
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  // 注册行唯一写径：官方宿主形态 project_id 列无 forge projectId（null 亦可）——
  // 注册键 = canonical ws_path，workspace 域 id 必须经归一步才可命中
  createKnowledgeRegistry(db).upsert(wsDir, knowledgeDir)
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

describe('requireProject 解析链 workspace 域 id 归一步（fix-10）', () => {
  it('官方宿主形态：workspace 域 id 经归一步命中注册行 → listEntries 正常供数（错误条消失）', async () => {
    const service = officialHostService()
    const rows = await service.listEntries({ projectId: 'ws-official' })
    expect(rows).toHaveLength(1)
    expect(typeof rows[0]?.entryId).toBe('number')
    expect(rows[0]?.title).toBe('Domain Note')
    // 多动词同链：browse / heatByEntry 同解析面
    await expect(service.browse({ projectId: 'ws-official' })).resolves.toBeDefined()
    await expect(service.heatByEntry('ws-official')).resolves.toBeDefined()
  })

  it('dsh-forge 集成宿主形态：forge projectId 经静态表命中，归一步缺席命中零变化', async () => {
    const service = forgeHostService()
    const rows = await service.listEntries({ projectId: 'p-forge' })
    expect(rows).toHaveLength(1)
    expect(typeof rows[0]?.entryId).toBe('number')
    expect(rows[0]?.title).toBe('Domain Note')
  })

  it('fail-loud 语义保留 + 文案收敛：真错 id 仍拒，消息不含内部操作词（listEntries 等动词）', async () => {
    const service = officialHostService()
    const err = await service.listEntries({ projectId: 'no-such-project' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    const message = (err as Error).message
    expect(message).toMatch(/项目不存在/)
    expect(message).not.toMatch(/listEntries|browse|search|readAbstract|rebuildIndex/)
    expect(message).toContain('no-such-project')
  })
})

describe('官方宿主全链派生键同域（fix-11 B 方案——身份统一）', () => {
  const officialRow = () => ({ id: 'ws-official', path: wsDir, title: 'ws' })

  /** projects.list 投影源（官方 workspaceRegistry 形态） */
  const projectsSource = () => registryProjectsSource({
    list: async () => [officialRow()],
    get: async (id: string) => (id === 'ws-official' ? officialRow() : undefined),
  } satisfies WorkspaceRegistryFace)

  it('注册 → projects.list(派生 key) → listEntries(派生 key) → requireProject 命中注册行（project_id 列 null 形态）', async () => {
    const key = projectKeyOf(wsDir)
    const summaries = await projectsSource().listProjects()
    expect(summaries[0]!.id).toBe(key)
    expect(summaries[0]!.workspaceId).toBe('ws-official')
    const rows = await officialHostService().listEntries({ projectId: key })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('Domain Note')
  })

  it('project_id 列为 core randomUUID 形态：派生 key 双域键命中（回查链不依赖该列）', async () => {
    const wsDir2 = join(home, 'ws-uuid')
    const knowledgeDir2 = join(wsDir2, '.knowledge')
    mkdirSync(knowledgeDir2, { recursive: true })
    writeFileSync(join(knowledgeDir2, 'b.md'), md('UUID Note', 'wsidom-b', ['anchor'], '双域键命中样本条目'), 'utf8')
    createKnowledgeRegistry(db).upsert(wsDir2, knowledgeDir2, '6f1c0aae-9b2c-4d3e-8f70-1a2b3c4d5e6f')
    const service = createKnowledgeService({
      db,
      resolveWsPath: () => undefined,
      resolveWorkspacePath: async () => undefined,
    })
    const rows = await service.listEntries({ projectId: projectKeyOf(wsDir2) })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('UUID Note')
  })
})
