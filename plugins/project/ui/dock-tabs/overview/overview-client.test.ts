// 概览数据路测试钉：
//   fix-19（bug 24311b78）：bugs 读缝自 core forge:bugs/* preload 退役；
//   fix-20（bug 145b3d3b）：bugs 行集/计数 chips 数据源 = 插件本地 forgeBugs
//   （plugins/project/host/bugs = project.db）经本地 preload 通道（window.dshForge.invoke）
//   投影——宿主 forge:bugs/list 供数缝自本版起改接插件 forge.bugs 缝（child.ts wiring）；
//   T1-head（overview-dockkit-alignment）：头路（projects/stats/features）= Typert 单通路
//   （forgeProjects namespace——官方宿主零依赖 preload transport；window.dshForge.invoke
//   官方宿主构造期即抛）。测试钉：
//   ① 无 forge remote 面环境 bugs 行集投影成立：face 缺席 + 本地通道由插件本地服务供数——
//     seed → 行集/计数可见（RED→GREEN 锚）；
//   ② 本地通道在席时 bugs 通道 Typert face 零消费（本地读缝单源——face 缺席仍解析）；
//   ③ 本地通道失败 → Typert 回落解析（fail-soft 加速——本地缝正常时零回落）；
//   ④ 头路 Typert 单通路（T1-head）：projects.list 走 forgeProjects namespace——preload
//     通道零调用（window.dshForge 缺席环境解析成立）。
import { afterEach, describe, expect, it } from 'vitest'
import { BUGS_CHANNELS, type ListBugsQuery } from '@dsh-forge/contracts'
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

/** 无 forge remote 面环境（resolver 恒 undefined——Typert 通道不可达形态） */
function withoutForgeRemoteFace(): void {
  installForgeRemoteFace(() => undefined)
  delete (globalThis as { dshForge?: unknown }).dshForge
}

/** 本地 preload 通道替身：forge:bugs/list 由插件本地 forgeBugs 服务供数（宿主 wiring 同径） */
function withLocalBugsChannel(listBugs: (q: ListBugsQuery) => Promise<unknown>, channels?: string[]): void {
  ;(globalThis as Record<string, unknown>).dshForge = {
    invoke: async (channel: string, payload?: unknown) => {
      channels?.push(channel)
      if (channel === BUGS_CHANNELS.list) {
        return { ok: true, data: await listBugs(payload as ListBugsQuery) }
      }
      return { ok: false, error: { code: 'internal', message: `unexpected channel: ${channel}` } }
    },
  }
}

afterEach(() => {
  delete (globalThis as { dshForge?: unknown }).dshForge
})

describe('概览行集读缝自洽化（fix-20 bug 145b3d3b——本地 forgeBugs 投影）', () => {
  it('① 无 forge remote 面环境行集投影成立：本地通道（插件本地 forgeBugs）seed → 行集/计数可见', async () => {
    withoutForgeRemoteFace()
    const { service } = writeSeamOf()
    await service.registerBug({
      projectId: 'p-1',
      summary: '概览行集本地读缝投影复现',
      bugDesc: '注入 bug',
      triggerDesc: 'journey 注入',
      expected: '概览行集可见',
      actual: 'forge remote 面缺席恒空',
    })
    withLocalBugsChannel((q) => service.listBugs(q))
    const client = overviewRpcClientFactory()
    const out = await fetchOverviewList(client, { projectId: 'p-1', subtab: 'bugs', search: '', sort: 'active' })
    expect(out?.ok).toBe(true)
    if (out?.ok && out.data.kind === 'bugs') {
      expect(out.data.bugs.map((b) => b.summary)).toContain('概览行集本地读缝投影复现')
      expect(out.data.counts.open).toBe(1)
    }
  })

  it('② 本地通道在席时 Typert face 零消费（本地读缝单源）', async () => {
    withoutForgeRemoteFace()
    const { service } = writeSeamOf()
    const channels: string[] = []
    withLocalBugsChannel((q) => service.listBugs(q), channels)
    const client = overviewRpcClientFactory()
    await expect(client.bugs.list({ projectId: 'p-1' })).resolves.not.toThrow()
    expect(channels).toEqual([BUGS_CHANNELS.list])
  })

  it('③ 本地通道失败 → Typert 回落解析（fail-soft 加速——不作数据源）', async () => {
    withoutForgeRemoteFace()
    ;(globalThis as Record<string, unknown>).dshForge = {
      invoke: async () => {
        throw new Error('forge:bugs/list 通道未注册（本地缝不可达）')
      },
    }
    installForgeRemoteFace(() => ({
      forgeBugs: { list: async () => ({ ok: true, value: [] }) },
    }) as never)
    const client = overviewRpcClientFactory()
    await expect(client.bugs.list({ projectId: 'p-1' })).resolves.toEqual([])
  })

  it('④ 头路 Typert 单通路（T1-head）：projects.list 走 forgeProjects namespace——preload 通道零调用', async () => {
    // window.dshForge 缺席（官方宿主形态）——preload transport 构造期即抛
    delete (globalThis as { dshForge?: unknown }).dshForge
    const calls: string[] = []
    installForgeRemoteFace(() => ({
      forgeProjects: {
        list: async () => {
          calls.push('forgeProjects.list')
          return { ok: true, value: [{ id: 'p-1', name: 'demo' }] }
        },
      },
    }) as never)
    const client: ForgeRpcClient = overviewRpcClientFactory()
    await expect(client.projects.list()).resolves.not.toThrow()
    expect(calls).toEqual(['forgeProjects.list'])
  })
})
