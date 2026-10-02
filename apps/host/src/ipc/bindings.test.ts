// 4.2 knowledge 绑定表维护 pin：bindingsFile 数据缝（host 装配方 → knowledge 插件
// exec 点惰性读取）。形状锚定 + fail-soft 口径 + registerProject 增量刷新包装面。
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ProjectService, ProjectSummary, RegisterResult } from '@dsh-forge/contracts'
import {
  bindingsOf,
  refreshKnowledgeBindings,
  serializeBindings,
  withKnowledgeBindingsRefresh,
  writeKnowledgeBindings,
} from './bindings.js'

const summary = (id: string, wsPath: string): ProjectSummary => ({
  id,
  workspaceId: `ws-${id}`,
  name: id,
  wsPath,
  archived: false,
})

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-forge-bindings-'))
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('bindingsOf / serializeBindings（文件形状）', () => {
  it('项目摘要 → 版本化绑定表（wsPath 与 projects.ws_path 同口径）', () => {
    expect(bindingsOf([summary('p1', 'C:\\ws\\a'), summary('p2', 'C:\\ws\\b')])).toEqual({
      version: 1,
      projects: [
        { wsPath: 'C:\\ws\\a', projectId: 'p1' },
        { wsPath: 'C:\\ws\\b', projectId: 'p2' },
      ],
    })
  })

  it('序列化 = 两空格缩进 JSON + 尾换行（knowledge 插件 JSON.parse 消费面）', () => {
    expect(serializeBindings(bindingsOf([]))).toBe('{\n  "version": 1,\n  "projects": []\n}\n')
  })
})

describe('writeKnowledgeBindings（fail-soft 写入）', () => {
  it('全量写入成功返回 true（消费方可解析回等价结构）', () => {
    const target = join(dir, 'b1.json')
    expect(writeKnowledgeBindings(target, [summary('p1', 'C:\\ws\\a')])).toBe(true)
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual(bindingsOf([summary('p1', 'C:\\ws\\a')]))
  })

  it('写失败（目标为目录占位）→ 记日志返回 false，不抛', () => {
    const log = vi.fn()
    const blocked = join(dir, 'blocked.json')
    // 目录同名占位：writeFileSync 抛 EISDIR
    mkdirSync(blocked)
    expect(writeKnowledgeBindings(blocked, [], log)).toBe(false)
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]?.[0])).toContain('绑定表写入失败')
  })
})

describe('refreshKnowledgeBindings（boot 全量刷新）', () => {
  it('listProjects → 文件（异步面透传）', async () => {
    const target = join(dir, 'b2.json')
    const projects = { listProjects: async () => [summary('px', 'C:\\ws\\x')] }
    await expect(refreshKnowledgeBindings(projects, target)).resolves.toBe(true)
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual(bindingsOf([summary('px', 'C:\\ws\\x')]))
  })

  it('listProjects 抛错 → fail-soft 记日志返回 false', async () => {
    const log = vi.fn()
    const boom = {
      listProjects: async () => {
        throw new Error('db gone')
      },
    }
    await expect(refreshKnowledgeBindings(boom, join(dir, 'b3.json'), log)).resolves.toBe(false)
    expect(String(log.mock.calls[0]?.[0])).toContain('listProjects 异常')
  })
})

describe('withKnowledgeBindingsRefresh（registerProject 增量锚）', () => {
  const result: RegisterResult = { projectId: 'p9', workspaceId: 'ws9', attachedToExisting: false }

  function makeService(rows: ProjectSummary[], hooks: { registered?: (r: RegisterResult) => void } = {}): ProjectService {
    const base: ProjectService = {
      async registerProject() {
        hooks.registered?.(result)
        return result
      },
      async listProjects() {
        return rows
      },
      async getProject() {
        return null
      },
      async updateProject(_id, patch) {
        return { id: 'p1', workspaceId: 'w', name: patch.name ?? 'n', wsPath: 'C:\\w', forgeDir: 'C:\\w\\.forge', forgeDirExternal: false, knowledgeDir: 'C:\\w\\.knowledge', archived: false, createdAt: '', updatedAt: '' }
      },
      async reconcileAtStartup() {
        return { repaired: [], orphans: [] }
      },
    }
    return base
  }

  it('registerProject 成功后全量重写绑定表（新项目即时可见）', async () => {
    const target = join(dir, 'b4.json')
    const rows: ProjectSummary[] = []
    const wrapped = withKnowledgeBindingsRefresh(makeService(rows), target)
    rows.push(summary('p-new', 'C:\\ws\\new'))
    await wrapped.registerProject({ workspaceDir: 'C:\\ws\\new', name: 'new', forgeDir: 'C:\\ws\\new\\.forge', knowledgeDir: 'C:\\ws\\new\\.knowledge' })
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual(bindingsOf(rows))
  })

  it('注册成功但刷新 listProjects 失败 → 不抛（注册结果原样返回）', async () => {
    const log = vi.fn()
    const target = join(dir, 'b5.json')
    let fail = false
    const svc: ProjectService = {
      ...makeService([]),
      async listProjects() {
        if (fail) throw new Error('transient')
        return []
      },
    }
    const wrapped = withKnowledgeBindingsRefresh(svc, target, log)
    fail = true
    await expect(
      wrapped.registerProject({ workspaceDir: 'C:\\ws', name: 'n', forgeDir: 'C:\\ws\\.forge', knowledgeDir: 'C:\\ws\\.knowledge' }),
    ).resolves.toBe(result)
  })

  it('非注册四法原样透传（updateProject 不触发刷新——ws_path/id 不变量）', async () => {
    const target = join(dir, 'b6.json')
    const svc = makeService([])
    const refreshSpy = vi.spyOn(svc, 'listProjects')
    const wrapped = withKnowledgeBindingsRefresh(svc, target)
    await wrapped.updateProject('p1', { name: 'renamed' })
    expect(refreshSpy).not.toHaveBeenCalled()
  })
})
