// 任务 3.4 AC-4 — 派发会话归组 = DF002 原生承载的零代码验证(tech-design
// §Interface 2「会话归组零代码:上游按 header.cwd canonical 匹配 workspace
// path」+ §PRD Coverage Map S4-3)。
//
// 与集成矩阵 spec(workbench-projection-lifecycle.spec.ts)不同,本 spec
// 断言的对象 = **真实 vendored workspaceRegistry**(`@deepseek-ai/dsh-workspace`
// c36ba648 构建 lib;lineage-corpus 同款 file-URL 动态导入,闭包经 vendored
// node_modules 符号链接解析)在桩存储/桩持久化之上的原生行为 —— forge 侧
// 零参与(「零 forge 代码」的机器验证:本 spec 不触任何 forge 投影写路径,
// 仅消费同一注册表实现):
//
//   ① 启动 bootstrap:存储的会话头按 canonical cwd(realpath)分组—— 同
//      一 anchor 的两种路径写法(反斜杠/正斜杠)折叠为同一 workspace;
//      cwd 无效(目录不存在)的会话不归组(未分组);
//   ② attachSession(运行期派发会话的归组通道):cwd = anchor 的会话挂接
//      成功并入 sessionIds;cwd ≠ workspace path 的挂接被拒(原生校验);
//   ③ 投影 ensure 的 path = 原生分组键:内核 canonicalizePath(realpath.
//      native → 前缀剥离 → 正斜杠)与注册表 create/attach 的
//      realpathNormalize 落到同一 canonical 目标 —— forge ensure 推送的
//      workspace path 正是 cwd=anchor 会话的归组键(e2e 口径归 3.6)。
//
// 桩 infra:fake storageDomain(内存 KvTable + global;surface = 注册表
// 消费面 put/get/delete/update/entries/keys/size)+ fake sessionPersistence
// (list() 返回种子会话头)。真 cordis Context(vendored vendor/cordis)
// 经 ctx.provide 注入两桩 → ctx.plugin(WorkspaceRegistry) 真启动。

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalizePath } from '../src/main/workbench/projects-identity/normalize.ts'

/** One seeded session header (SessionHeader v3 的结构子集:归组消费位)。 */
interface SeedSession {
  readonly sessionId: string
  readonly cwd: string
  readonly createdAt: number
}

/** WorkspaceEntity 的结构子集(注册表公开面;sessionIds 已按 canonical 过滤)。 */
interface NativeWorkspace {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly string[]
  attachSession(sessionId: string): Promise<void>
}

interface NativeRegistry {
  list(): NativeWorkspace[]
  create(path: string, title?: string): Promise<NativeWorkspace>
}

/** vendored 构建 lib 的 file-URL 动态导入(闭包解析同宿主;lineage-corpus 先例)。 */
async function vendoredWorkspace(): Promise<{
  readonly Context: new () => { provide(name: string, value: unknown): unknown; plugin(plugin: unknown): unknown }
  readonly WorkspaceRegistry: new (ctx: never) => never
}> {
  const asUrl = (relative: string): string => pathToFileURL(join(process.cwd(), relative)).href
  const cordis = await import(asUrl('packages/desktop-host-vendor/vendored/vendor/cordis/lib/index.js'))
  const workspace = await import(asUrl('packages/desktop-host-vendor/vendored/packages/workspace/workspace/lib/index.js'))
  return { Context: cordis.Context, WorkspaceRegistry: workspace.WorkspaceRegistry }
}

/** 内存 KvTable(surface = workspaceRegistry 消费面)。 */
function makeFakeTable() {
  const records = new Map<string, unknown>()
  return {
    get: (key: string) => records.get(key),
    entries: () => [...records.entries()][Symbol.iterator]() as IterableIterator<[string, unknown]>,
    keys: () => records.keys(),
    get size() { return records.size },
    put: async (key: string, value: unknown) => { records.set(key, value) },
    delete: async (key: string) => records.delete(key),
    update: async (key: string, fn: (current: unknown) => unknown) => {
      if (!records.has(key)) throw new Error(`fake domain: no record '${key}' to update`)
      const next = fn(records.get(key))
      records.set(key, next)
      return next
    },
  }
}

/**
 * 启动真实 vendored WorkspaceRegistry:内存域(initial = 未初始化,除非
 * 预置行)+ 种子会话头。返回 (registry, dispose)。
 */
async function bootNativeRegistry(seeds: readonly SeedSession[]): Promise<{
  readonly registry: NativeRegistry
  readonly table: ReturnType<typeof makeFakeTable>
}> {
  const { Context, WorkspaceRegistry } = await vendoredWorkspace()
  const ctx = new Context()
  const state: { initialized: boolean; workspaceIds: string[]; archivedSessionIds: string[] } = {
    initialized: false,
    workspaceIds: [],
    archivedSessionIds: [],
  }
  const table = makeFakeTable()
  const domain = {
    name: 'workspace',
    table: () => table,
    get global() {
      return {
        get: () => state,
        set: async (value: typeof state) => { Object.assign(state, value) },
      }
    },
    close: async () => {},
  }
  ctx.provide('storageDomain', { open: async () => domain })
  ctx.provide('sessionPersistence', {
    list: async () => seeds.map(seed => ({ header: { version: 3, id: seed.sessionId, createdAt: seed.createdAt, cwd: seed.cwd } })),
  })
  const fiber = ctx.plugin(WorkspaceRegistry)
  await (fiber as Promise<unknown>)
  return { registry: (ctx as unknown as { workspaceRegistry: NativeRegistry }).workspaceRegistry, table }
}

const scratches: string[] = []

function anchorDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `df002-${label}-`))
  scratches.push(dir)
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

// ---------------------------------------------------------------------------
// ① bootstrap 归组:canonical cwd 匹配(DF002 原生承载)
// ---------------------------------------------------------------------------

describe('DF002 native grouping — bootstrap canonical-cwd matching (AC-4)', () => {
  it('同 anchor 两种路径写法折叠为同一 workspace;cwd 无效的会话保持未分组', async () => {
    const anchorA = anchorDir('a')
    const anchorB = anchorDir('b')
    const { registry } = await bootNativeRegistry([
      // 同一 anchor 的反斜杠/正斜杠两种写法 —— canonical 折叠后同组。
      { sessionId: 'sess-a1', cwd: anchorA, createdAt: 2000 },
      { sessionId: 'sess-a2', cwd: anchorA.replaceAll('\\', '/'), createdAt: 1000 },
      { sessionId: 'sess-b1', cwd: anchorB, createdAt: 1500 },
      // cwd 指向不存在目录:归组校验失败 → 未分组(不出现在任何 sessionIds)。
      { sessionId: 'sess-ghost', cwd: join(anchorA, 'missing'), createdAt: 3000 },
    ])

    const list = registry.list()
    expect(list).toHaveLength(2) // ghost 未归组:不为无效 cwd 建 workspace
    const groupA = list.find(ws => ws.sessionIds.includes('sess-a1'))
    expect(groupA).toBeDefined()
    expect(groupA?.sessionIds).toEqual(['sess-a1', 'sess-a2']) // 新者在前(原生序)
    expect(list.find(ws => ws.sessionIds.includes('sess-b1'))?.sessionIds).toEqual(['sess-b1'])
    for (const ws of list) {
      expect(ws.sessionIds).not.toContain('sess-ghost')
    }
  })

  it('attachSession(派发会话运行期归组通道):cwd=anchor 挂接并入;cwd 不符被原生拒绝', async () => {
    const anchorA = anchorDir('a')
    const anchorB = anchorDir('b')
    const { registry } = await bootNativeRegistry([
      { sessionId: 'sess-a1', cwd: anchorA, createdAt: 2000 },
    ])
    const groupA = registry.list().find(ws => ws.sessionIds.includes('sess-a1'))
    expect(groupA).toBeDefined()

    // 派发会话 cwd=anchor(另一写法)→ 原生 canonical 匹配自动归组。
    // (先落一个新会话头:attachSession 的 readSessionHeader 经 persistence。)
    const { registry: refreshed } = await bootNativeRegistry([
      { sessionId: 'sess-a1', cwd: anchorA, createdAt: 2000 },
      { sessionId: 'sess-dispatch', cwd: anchorA.replaceAll('\\', '/'), createdAt: 5000 },
      { sessionId: 'sess-elsewhere', cwd: anchorB, createdAt: 4000 },
    ])
    const groupA2 = refreshed.list().find(ws => ws.path === groupA?.path)
    expect(groupA2?.sessionIds).toContain('sess-dispatch')

    // cwd ≠ workspace path 的挂接 = 原生校验拒绝(错误信息携带两侧 canonical)。
    const groupB = refreshed.list().find(ws => ws.sessionIds.includes('sess-elsewhere'))
    expect(groupB).toBeDefined()
    const rejected = await groupA2?.attachSession('sess-elsewhere').then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(rejected).toBeInstanceOf(Error)
    expect((rejected as Error).message).toContain('its cwd resolves to')
  })
})

// ---------------------------------------------------------------------------
// ③ 投影 ensure path = 原生分组键(canonical 等价)
// ---------------------------------------------------------------------------

describe('projection ensure path lands on the native grouping key (AC-4)', () => {
  it('内核 canonicalizePath(ensure 的 canonicalPath 源)与注册表 create 落同一 canonical;ensure 建的 workspace 即归组键', async () => {
    const anchor = anchorDir('ensure')
    // 内核侧:注册侦测管线的 canonical(ensure op 的 canonicalPath 形态)。
    const kernel = canonicalizePath(anchor)
    expect(kernel.canonicalPath).not.toBeNull()
    expect(kernel.identityVerified).toBe(true)

    // 原生侧:注册表 create(投影 relay 的 channel.create 最终动词)。
    const { registry } = await bootNativeRegistry([])
    const created = await registry.create(anchor, 'forge-project')
    expect(created.path.replaceAll('\\', '/')).toBe(kernel.canonicalPath)

    // 会话 cwd=anchor(混合写法)经 attachSession 归组到该 workspace ——
    // 投影 ensure 建的行正是派发会话的归组落点(方向恒 canonical 匹配)。
    const { registry: withSession } = await bootNativeRegistry([
      { sessionId: 'sess-dispatch', cwd: anchor.toUpperCase(), createdAt: 9000 },
    ])
    const native = withSession.list().at(0)
    expect(native?.path).toBe(created.path)
    expect(native?.sessionIds).toContain('sess-dispatch')
  })
})
