// 任务 3.3 装配收口测试 —— index.ts（插件装配入口，原 service.ts——fix-35 与 knowledge=index.ts
// 对称化）注册 ctx.forgeKnowledge 双服务面完整（Interface 2 逐项对齐：七法齐全 + 3.5 browse
// 聚合法 + 装配后端到端冒烟——含 listEntries 静默重建路径）。
// 形态：CoreContextFace 结构化桩（provide 记账）+ registry 桩（知识域冒烟不经注册链路，
// projects 行经第二连接直插——注册链路归 forge 域 2.2 已测）。
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import type { KnowledgeService } from '@dsh-forge/contracts'
import type { WorkspaceRegistryPort, WorkspaceRenamePort } from './forge/registry.js'
import { StubRegistry } from './testutil/registry-stub.js'
import corePlugin, { type CoreContextFace } from './index.js'
import { openDatabase } from './db/index.js'
import type Database from 'better-sqlite3'

const dirs: string[] = []
const dbs: Database.Database[] = []

afterAll(() => {
  for (const db of dbs) db.close()
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** registry 桩（本测试不经注册链路——形状兼容即可；fix-34 收编 testutil 单份） */
function stubRegistry(): WorkspaceRegistryPort {
  return new StubRegistry()
}

/** rename 结构化桩（fix-24 ②——workspaceController 窄面形状兼容即可） */
function stubRename(): WorkspaceRenamePort {
  return { rename: async () => ({}) }
}

/** 起插件（provide 记账）→ 返回 { services, dispose } */
function startPlugin(home: string): { services: Map<string, unknown>; dispose: () => void } {
  const services = new Map<string, unknown>()
  const ctx: CoreContextFace = {
    workspaceRegistry: stubRegistry(),
    workspaceController: stubRename(),
    reflect: {
      provide(name: string, value?: unknown) {
        services.set(name, value)
        return () => services.delete(name)
      },
    },
  }
  const dispose = corePlugin(ctx, { dbFile: join(home, 'state.db') })
  return { services, dispose }
}

it('ctx.forgeKnowledge 双服务面完整：Interface 2 七法 + 3.5 browse 聚合法（八法精确）', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-'))
  dirs.push(home)
  const { services, dispose } = startPlugin(home)
  try {
    expect([...services.keys()].sort()).toEqual(['forgeKnowledge', 'forgeProjects']) // 双服务面
    const knowledge = services.get('forgeKnowledge') as KnowledgeService
    expect(Object.keys(knowledge).sort()).toEqual([
      'browse', 'getEntryDetail', 'heatByEntry', 'listEntries', 'readAbstract',
      'rebuildIndex', 'search', 'sessionRecall',
    ])
  } finally {
    dispose()
  }
})

it('装配后端到端冒烟：forgeKnowledge.listEntries 经静默重建返回卡片（真实 SQLite + 知识目录）', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-'))
  dirs.push(home)
  const knowledgeDir = join(home, 'knowledge')
  mkdirSync(knowledgeDir)
  writeFileSync(join(knowledgeDir, '索引.md'), '---\nsummary: 冒烟摘要\nkeywords: [smoke]\n---\n冒烟正文', 'utf8')

  const { services, dispose } = startPlugin(home)
  try {
    // 插件已建库——第二连接直插 projects 行（WAL 多连接可见）
    const conn = openDatabase(join(home, 'state.db'))
    dbs.push(conn)
    const projectId = randomUUID()
    const now = new Date().toISOString()
    conn.prepare(
      `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
    ).run(projectId, randomUUID(), 'C:\\smoke-ws', '冒烟项目', join(home, '.forge'), knowledgeDir, now, now)

    const knowledge = services.get('forgeKnowledge') as KnowledgeService
    const cards = await knowledge.listEntries({ projectId }) // 零行索引 → 静默重建路径
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ title: '索引', summary: '冒烟摘要', keywords: ['smoke'], domainPath: '', heat: 0 })
    const detail = await knowledge.getEntryDetail({ projectId, entryId: cards[0]!.entryId })
    expect(detail.body).toBe('冒烟正文')
  } finally {
    dispose()
  }
})
