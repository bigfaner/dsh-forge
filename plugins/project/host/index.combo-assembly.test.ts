// 共库集成形态装配回归（bug ad14e904，recurrence_of 3c17010a）：forge patch 下发
// config { home, dbFile } 时——dbFile 消费即生效，project 落共库 forge/forge.db
// （project_ 前缀分表），不再自派生 {home}/forge/db/project/project.db 分库。
// fix-2 曾修下发键（dbFile→home）未覆盖本路径：当时 project 契约无 dbFile 消费键，
// 改发 home 后插件按 home 自派生域库——消费点在 openProjectsDomainDb 缺省派生，
// 本测试钉住 patch 下发即生效单一路径。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import Database from '@dsh-forge/lib-db'
import { openDomainDb } from './db/connection.js'
import { injectProjectSeam, PROJECT_SEAM_KEYS, stubProjectsService, type SeamCtxFace } from './assembly/seams.js'
import projectPlugin from './index.js'

/** 独立装配态 ctx（同 index.default-assembly.test.ts 形制——reflect 面 + workspaceRegistry 具名服务）。 */
function standaloneCtx(): SeamCtxFace & { workspaceRegistry: unknown } {
  const registry = new Map<string, { id: string; path: string; title: string }>()
  let seq = 0
  const provided = new Map<string, () => unknown>()
  return {
    workspaceRegistry: {
      list: async () => [...registry.values()],
      get: async (id: string) => registry.get(id),
      create: async (path: string, title?: string) => {
        const found = [...registry.values()].find((w) => w.path === path)
        if (found !== undefined) return found
        const w = { id: `ws-${++seq}`, path, title: title ?? path }
        registry.set(w.id, w)
        return w
      },
      delete: async (id: string) => {
        registry.delete(id)
      },
      resolveByPath: async (path: string) =>
        [...registry.values()].find((w) => w.path === path),
    },
    reflect: {
      provide: (name: string, value?: unknown) => {
        provided.set(name, value as () => unknown)
      },
      get: (name: string) => provided.get(name),
    },
  }
}

let dir: string | undefined
afterAll(() => {
  if (dir !== undefined) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // 插件装配态持有 db 句柄（Windows 锁文件）——临时目录留在盘上，不判失败
    }
  }
})

function comboDbFile(): string {
  dir ??= mkdtempSync(join(tmpdir(), 'project-combo-'))
  return join(dir, `combo-${Math.random().toString(36).slice(2)}.db`)
}

/** 模拟共库初态：异域先行迁移（旧形状 schema_meta 全局行 v1/v2 + 全局指纹行）。 */
function seedForeignDomainRows(file: string): void {
  const raw = new Database(file)
  try {
    raw.exec(`CREATE TABLE schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`)
    raw.exec(`CREATE TABLE migration_digests (version INTEGER PRIMARY KEY, digest TEXT NOT NULL)`)
    raw.prepare(`INSERT INTO schema_meta VALUES (?, ?)`).run(1, '2026-01-01T00:00:00.000Z')
    raw.prepare(`INSERT INTO schema_meta VALUES (?, ?)`).run(2, '2026-01-02T00:00:00.000Z')
    raw.prepare(`INSERT INTO migration_digests VALUES (?, ?)`).run(1, 'foreign-spec-digest-v1')
    raw.prepare(`INSERT INTO migration_digests VALUES (?, ?)`).run(2, 'foreign-knowledge-digest-v2')
  } finally {
    raw.close()
  }
}

describe('共库集成形态装配（patch 下发 home + dbFile——bug ad14e904）', () => {
  it('config { home, dbFile } → 落共库 dbFile（project_* 前缀分表），零自派生 project.db 分库；registerProject 成功落行', async () => {
    const home = mkdtempSync(join(tmpdir(), 'project-combo-home-'))
    const sharedDb = comboDbFile()
    seedForeignDomainRows(sharedDb)
    const ctx = standaloneCtx()
    const dispose = projectPlugin(ctx, { home, dbFile: sharedDb })
    try {
      const projects = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.projects, () => stubProjectsService())
      const result = await projects.registerProject({
        workspaceDir: 'Z:\\tmp\\combo-ws',
        name: 'combo-ws',
        forgeDir: 'Z:\\tmp\\combo-ws\\.forge\\docs',
      })
      expect(result.attachedToExisting).toBe(false)
      // 共库被写入（project_* 分表 + 注册行），异域版本行不动
      const db = openDomainDb(home, { prefix: 'project', file: sharedDb })
      expect(db.repos.projects.get(result.projectId)?.title).toBe('combo-ws')
      const domainRows = db.db
        .prepare<unknown[], { domain: string; version: number }>(`SELECT domain, version FROM schema_meta WHERE domain != '' ORDER BY domain`)
        .all()
      expect(domainRows).toEqual([{ domain: 'project', version: 1 }])
      db.db.close()
      // 自派生分库不存在（patch 下发即生效单一路径）
      expect(existsSync(join(home, 'forge', 'db', 'project', 'project.db'))).toBe(false)
    } finally {
      dispose()
    }
    try {
      rmSync(home, { recursive: true, force: true })
    } catch {
      // 句柄锁文件——留盘不判失败
    }
  })
})
