// 单装缺省装配 RED 锚（fix-7，bug b6fdf125）：无 forge 组合器 config 的独立装配态中，
// 插件以缺省值自装配——db 路径缺省 {DSH_HOME}/forge/db/project/project.db、registry 缺省
// 取 ctx.workspaceRegistry 具名服务、bugs 依赖缺省自 db 派生——registerProject 成功且
// project.db 落行，forge.bugs registerBug 可用（007 实证 register 拒不可用 → 必须成功）。
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { openDomainDb } from './db/connection.js'
import { injectProjectSeam, PROJECT_SEAM_KEYS, type SeamCtxFace } from './assembly/seams.js'
import { stubProjectsService } from './assembly/seams.js'
import projectPlugin from './index.js'

/** 独立装配态 ctx：reflect 面在（provide/get——五缝注册与消费缝），workspaceRegistry 具名服务在场。 */
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

describe('单装缺省装配（fix-7——无组合器 config 独立装配态）', () => {
  const home = mkdtempSync(join(tmpdir(), 'fix7-standalone-'))
  const previousDshHome = process.env.DSH_HOME
  const ctx = standaloneCtx()

  afterAll(() => {
    if (previousDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDshHome
    try {
      rmSync(home, { recursive: true, force: true })
    } catch {
      // 插件装配态持有 db 句柄（Windows 锁文件）——临时目录留在盘上，不判失败
    }
  })

  it('config 缺席 → db 落 {DSH_HOME}/forge/db/project/project.db，registerProject 成功落行', async () => {
    process.env.DSH_HOME = home
    const dispose = projectPlugin(ctx, {})
    try {
      const projects = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.projects, () =>
        stubProjectsService(),
      )
      const result = await projects.registerProject({
        workspaceDir: 'Z:\\tmp\\fix7-ws',
        name: 'fix7-ws',
        forgeDir: 'Z:\\tmp\\fix7-ws\\.forge\\docs',
      })
      expect(result.attachedToExisting).toBe(false)
      const dbFile = join(home, 'forge', 'db', 'project', 'project.db')
      expect(existsSync(dbFile)).toBe(true)
      const db = openDomainDb(home, { prefix: 'project', file: dbFile })
      expect(db.repos.projects.get(result.projectId)?.title).toBe('fix7-ws')
      db.db.close()
    } finally {
      dispose()
    }
  })

  it('bugs 缝独立装配态接真实现（registerBug 落行，非 ErrUnavailable）', async () => {
    process.env.DSH_HOME = home
    const dispose = projectPlugin(ctx, {})
    try {
      const projects = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.projects, () =>
        stubProjectsService(),
      )
      const registered = await projects.registerProject({
        workspaceDir: 'Z:\\tmp\\fix7-ws2',
        name: 'fix7-ws2',
        forgeDir: 'Z:\\tmp\\fix7-ws2\\.forge\\docs',
      })
      const bugs = injectProjectSeam(ctx, PROJECT_SEAM_KEYS.bugs, () => {
        throw new Error('bugs seam missing')
      })
      const result = await bugs.registerBug({
        projectId: registered.projectId,
        summary: '独立装配态登记',
        bugDesc: 'd',
        triggerDesc: 't',
        expected: 'e',
        actual: 'a',
      })
      expect(result.card.bugId).toBeTruthy()
      const dbFile = join(home, 'forge', 'db', 'project', 'project.db')
      const db = openDomainDb(home, { prefix: 'project', file: dbFile })
      const row = db.repos.bugs.get(result.card.bugId)
      expect(row?.projectKey).toBeTruthy()
      expect(db.repos.projects.get(registered.projectId)).toBeDefined()
      db.db.close()
    } finally {
      dispose()
    }
  })

  it('五缝在独立装配态全部注册（degraded=[]）', () => {
    process.env.DSH_HOME = home
    const ctx2 = standaloneCtx()
    const dispose = projectPlugin(ctx2, {})
    try {
      for (const key of Object.values(PROJECT_SEAM_KEYS)) {
        expect(typeof ctx2.reflect?.get?.(key)).toBe('function')
      }
    } finally {
      dispose()
    }
  })
})
