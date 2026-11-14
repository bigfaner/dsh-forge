// 概览行集读缝自洽化（bug 24311b78——fix-19）测试钉：
//   ① 写缝→读缝闭环：journey 注入缝 = 插件 project.db（createBugsService→BugsRepo），
//     概览 bugs 子 tab 行集/计数读缝 = 同一 db（forgeBugs Typert namespace）——注入的
//     bug 在概览行集可见（RED→GREEN 锚）；
//   ② 无 core 环境读缝解析成立：window.dshForge（core forge:bugs/* preload 通道）缺席
//     时概览 bugs 读缝仍解析——core 读缝不作数据源；
//   ③ 非 bugs 通道路由不变：projects.list 仍走 preload 通道（读缝斩除只限 bugs 面）。
import { afterEach, describe, expect, it } from 'vitest'
import { BUGS_CHANNELS, PROJECTS_CHANNELS } from '@dsh-forge/contracts'
import { openDomainDb, PROJECT_DB_PREFIX, type DomainDb } from '../../../host/db/connection.js'
import { createBugsService } from '../../../host/bugs/service.js'
import { installForgeRemoteFace } from '../../rpc.js'
import { type ForgeRpcClient } from '../rpc-channels.js'
import { fetchOverviewList } from './overview-data.js'
import { overviewRpcClientFactory } from './overview-client.js'

/** 写缝夹具：project.db :memory: + 种项目行 + createBugsService（同 service.test.ts 口径） */
function writeSeamOf() {
  const domain: DomainDb = openDomainDb('.', { prefix: PROJECT_DB_PREFIX, file: ':memory:' })
  domain.repos.projects.insert({
    id: 'p-1',
    projectKey: 'key-1',
    title: 'p-1',
    forgeDir: 'Z:\\forge\\x',
    forgeDirExternal: false,
    worktreeDir: '',
    sortOrder: null,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })
  const service = createBugsService({
    bugs: domain.repos.bugs,
    resolveProjectKey: (projectId) => domain.repos.projects.get(projectId)?.projectKey ?? null,
    resolveMainPath: () => 'Z:/repo/main',
    execFile: (_cmd, args, _opts, cb) => {
      const err = Object.assign(new Error(`git ${args.join(' ')} failed`), { code: 1 })
      cb(err, '', '')
    },
  })
  return { domain, service }
}

/** 无传输环境（window.dshForge 缺席——core preload 读缝不可用形态） */
function withoutPreloadTransport(): void {
  delete (globalThis as { dshForge?: unknown }).dshForge
}

/** forgeBugs Typert face 替身（RemoteResult 信封——plugin forgeBugs 服务直挂） */
function forgeBugsFaceOf(listBugs: (q: unknown) => Promise<unknown>) {
  return {
    forgeBugs: { list: async (q: unknown) => ({ ok: true, value: await listBugs(q) }) },
  } as never
}

afterEach(() => {
  delete (globalThis as { dshForge?: unknown }).dshForge
})

describe('概览行集读缝自洽化（bug 24311b78——写缝 project.db → 读缝同库闭环）', () => {
  it('写缝 registerBug（project.db）→ 概览 bugs 行集/计数读缝（同库 forgeBugs）可见', async () => {
    withoutPreloadTransport()
    const { service } = writeSeamOf()
    await service.registerBug({
      projectId: 'p-1',
      summary: '概览行集读缝自洽化复现',
      bugDesc: '注入 bug',
      triggerDesc: 'journey 注入',
      expected: '概览行集可见',
      actual: 'core 读缝恒不可见',
    })
    installForgeRemoteFace(() => forgeBugsFaceOf((q) => service.listBugs(q as never)))
    const client = overviewRpcClientFactory()
    const out = await fetchOverviewList(client, { projectId: 'p-1', subtab: 'bugs', search: '', sort: 'active' })
    expect(out?.ok).toBe(true)
    if (out?.ok && out.data.kind === 'bugs') {
      expect(out.data.bugs.map((b) => b.summary)).toContain('概览行集读缝自洽化复现')
      expect(out.data.counts.open).toBe(1)
    }
  })

  it('无 core 环境（dshForge 缺席）概览 bugs 读缝解析成立——core 读缝不作数据源', async () => {
    withoutPreloadTransport()
    installForgeRemoteFace(() => forgeBugsFaceOf(async () => []))
    const client = overviewRpcClientFactory()
    await expect(client.bugs.list({ projectId: 'p-1' })).resolves.toEqual([])
  })

  it('非 bugs 通道路由不变：projects.list 仍走 preload 通道（window.dshForge.invoke）', async () => {
    const channels: string[] = []
    ;(globalThis as Record<string, unknown>).dshForge = {
      invoke: async (channel: string) => {
        channels.push(channel)
        return { ok: true, data: [] }
      },
    }
    const client: ForgeRpcClient = overviewRpcClientFactory()
    await client.projects.list()
    expect(channels).toEqual([PROJECTS_CHANNELS.list])
    expect(channels).not.toContain(BUGS_CHANNELS.list)
  })
})
