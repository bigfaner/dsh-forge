// 任务 3.4 — 生命周期 × 投影全链集成矩阵(tech-design §Overview 交付线 3
// 「四操作同步」+ §Interface 1/2;PRD 必答④⑤)。与 3.1(纯函数)/3.2(对账
// service)/3.3(relay)的分单元面不同,本 spec 的价值 = **真实服务对象串成
// 的端到端链**:动词(createWorkbenchIpcServices 全装配)→ plan(3.1 组装)
// → relay(3.3 createProjectionRelay,真实现)→ mock channel(上游
// workspace remote 四动词的 dsh 侧替身)→ 快照随行上报 → outcome 回填 →
// 状态机落库 —— 唯一替身 = 上游通道(dsh 宿主子进程)。
//
// AC 映射:
//   AC-1 四操作:注册 ensure push(同名同序 = sort_order 权威)/改名 rename
//        同步/归档恢复零 op(workspace 保留)/删除 delete op + FK cascade
//        (期望快照 + 布局记忆随清)—— T1/T2/T3/T4;
//   AC-2 降级不阻断:op 注错 → degraded + 动词成功;relay 缺席 → plan 保留
//        → 回场重放/重试恢复 healthy —— T5;
//   AC-3 偏差链路:dsh 侧手改(改名/删除/乱序)→ follow 快照 → diff →
//        deviation + DeviationRow;零反向写(偏差仅呈现,reconcile 零通道
//        调用、零 push 事件)—— T6;
//   AC-5 复连:dsh 侧删除/重建 → ensure 按 path 收养 → workspace_id 更新
//        —— T7。
// (AC-4 派发会话归组 = DF002 原生承载,零 forge 代码 —— 独立 spec
//  workbench-projection-df002-native-grouping.spec.ts 以真实 vendored
//  workspaceRegistry 验证;e2e 口径归 3.6。)
//
// Hard Rules 断言面:
//   - 单向投影:T6 零反向写(偏差永不驱动通道写;收敛仅经显式
//     retryProjection = 用户动作,非偏差自动回流);
//   - 归档 ≠ 删除:T3 归档/恢复期间零通道调用、workspace 保留。

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { createWorkbenchIpcServices, type WorkbenchPerceptionSeam } from '../src/main/workbench/ipc/services.ts'
import { getWorkspaceProjectionRow } from '../src/main/workbench/projection/expectation-repo.ts'
import type { Project, WorkbenchEvent, WorkbenchVerbServices } from '../src/main/workbench/ipc/types.ts'
import { createProjectionRelay } from '../../../packages/plugins/forge-workbench/src/client/projection/relay.ts'
import type { WorkspaceChannel } from '../../../packages/plugins/forge-workbench/src/client/projection/workspace-channel.ts'
import type { WorkspaceSnapshotEntry } from '../src/main/workbench/projection/plan.ts'

// ---------------------------------------------------------------------------
// Harness:真 services 装配 + 真 relay + mock 上游通道
// ---------------------------------------------------------------------------

/**
 * dsh 侧替身:上游 workspace remote 四动词的内存注册表(语义对齐 vendored
 * workspace-controller:create = create-or-adopt(同 path 幂等收养,新建则
 * 前插注册表序);rename 拒绝缺席目标;delete 拒绝缺席目标
 * ('workspace/not-found');insertBefore 应答完整注册表序)。「dsh 侧手改」
 * = manual* 直改内存行(不经 forge 通道)。
 */
/** mock 行(可变:rename/manual* 原地改;结构上是 WorkspaceRow 的可变孪生)。 */
interface MutRow {
  workspaceId: string
  path: string
  title: string
}

function makeUpstream() {
  let seq = 0
  const rows: MutRow[] = [] // 数组序 = 宿主注册表序
  const calls: Array<{ verb: string; request: unknown }> = []
  let failCreateCode: string | undefined
  const titleOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
  const byPath = (path: string): MutRow | undefined => rows.find(row => row.path === path)
  const findById = (workspaceId: string): MutRow | undefined => rows.find(row => row.workspaceId === workspaceId)
  const channel: WorkspaceChannel = {
    async create({ path }) {
      calls.push({ verb: 'create', request: { path } })
      if (failCreateCode !== undefined) {
        return { ok: false, error: { code: failCreateCode, message: `injected failure ${failCreateCode}` } }
      }
      const existing = byPath(path)
      if (existing !== undefined) return { ok: true, value: { workspace: existing, created: false } }
      const row: MutRow = { workspaceId: `ws-${String(++seq)}`, path, title: titleOf(path) }
      rows.unshift(row)
      return { ok: true, value: { workspace: { ...row }, created: true } }
    },
    async rename({ workspaceId, title }) {
      calls.push({ verb: 'rename', request: { workspaceId, title } })
      const row = findById(workspaceId)
      if (row === undefined) {
        return { ok: false, error: { code: 'workspace/not-found', message: `unknown workspace ${workspaceId}` } }
      }
      if (title.trim() === '') {
        return { ok: false, error: { code: 'workspace/name-conflict', message: 'blank title' } }
      }
      row.title = title
      return { ok: true, value: { workspace: { ...row } } }
    },
    async delete({ workspaceId }) {
      calls.push({ verb: 'delete', request: { workspaceId } })
      const index = rows.findIndex(row => row.workspaceId === workspaceId)
      if (index === -1) {
        return { ok: false, error: { code: 'workspace/not-found', message: `unknown workspace ${workspaceId}` } }
      }
      rows.splice(index, 1)
      return { ok: true, value: { deleted: true } }
    },
    async insertBefore({ workspaceId, beforeWorkspaceId }) {
      calls.push({ verb: 'insertBefore', request: { workspaceId, beforeWorkspaceId } })
      const index = rows.findIndex(row => row.workspaceId === workspaceId)
      if (index === -1) {
        return { ok: false, error: { code: 'workspace/move-invalid', message: `unknown workspace ${workspaceId}` } }
      }
      const row = rows.splice(index, 1)[0] as MutRow
      const at = beforeWorkspaceId === undefined
        ? rows.length
        : rows.findIndex(candidate => candidate.workspaceId === beforeWorkspaceId)
      rows.splice(at === -1 ? rows.length : at, 0, row)
      return { ok: true, value: { workspaceIds: rows.map(entry => entry.workspaceId) } }
    },
  }
  return {
    channel,
    calls,
    rows,
    /** op 注错缝(AC-2 故障注入;undefined = 恢复)。 */
    setFailCreate(code: string | undefined): void {
      failCreateCode = code
    },
    /** 快照(follow 流物化形态;数组序 = 注册表序)。 */
    entries(): WorkspaceSnapshotEntry[] {
      return rows.map((row, index) => ({ workspaceId: row.workspaceId, path: row.path, title: row.title, orderIdx: index }))
    },
    byPath,
    findById,
    /** dsh 侧手改:改名(不经 forge)。 */
    manualRename(workspaceId: string, title: string): void {
      const row = findById(workspaceId)
      if (row !== undefined) row.title = title
    },
    /** dsh 侧手改:删除(不经 forge)。 */
    manualDelete(workspaceId: string): void {
      const index = rows.findIndex(row => row.workspaceId === workspaceId)
      if (index !== -1) rows.splice(index, 1)
    },
    /** dsh 侧手改:整表重排(不经 forge;to = 目标下标)。 */
    manualMove(workspaceId: string, to: number): void {
      const index = rows.findIndex(row => row.workspaceId === workspaceId)
      if (index === -1) return
      const row = rows.splice(index, 1)[0] as MutRow
      rows.splice(to, 0, row)
    },
    /** dsh 侧手改:删除重建(同 path 新 id —— 复连语料)。 */
    manualRecreate(path: string): string {
      const index = rows.findIndex(row => row.path === path)
      if (index !== -1) rows.splice(index, 1)
      const row: MutRow = { workspaceId: `ws-${String(++seq)}`, path, title: titleOf(path) }
      rows.unshift(row)
      return row.workspaceId
    },
  }
}

interface MatrixHarness {
  readonly db: DatabaseSyncLike
  readonly verbs: WorkbenchVerbServices
  readonly events: WorkbenchEvent[]
  readonly upstream: ReturnType<typeof makeUpstream>
  makeDir(name: string): string
  /** 安装真 relay(3.3 createProjectionRelay;订阅登记 = relayPresence 在场)。 */
  installRelay(): void
  /** relay 是否在场(= 内核 relayPresence 判据)。 */
  relayInstalled(): boolean
  dispose(): void
}

async function withMatrixHarness(run: (harness: MatrixHarness) => void | Promise<void>): Promise<void> {
  const root = join(tmpdir(), `wb-proj-lifecycle-${Date.now()}-${String(Math.floor(Math.random() * 1e6))}`)
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const resources = join(root, 'resources')
  mkdirSync(resources, { recursive: true })
  const manifest = join(resources, 'plugin-bundles.json')
  writeFileSync(manifest, JSON.stringify({ bundles: [{ name: '@deepseek-ai/dsh-base', mandatory: true }] }))
  const { db } = await openDatabase(userData)
  const events: WorkbenchEvent[] = []
  // 两 WorkbenchEvent 声明(内核 indexer/diff vs 插件 ipc-types)结构互不隶属;
  // 运行时同载荷 —— 订阅面以 unknown 承载,边界断言(测试装配,非生产代码)。
  const listeners: Array<(batch: readonly unknown[]) => void> = []
  const upstream = makeUpstream()
  const perception: WorkbenchPerceptionSeam = { retarget: () => {}, rescan: () => {} }
  const assembly = createWorkbenchIpcServices({
    db,
    pluginBundlesPath: manifest,
    userDataPath: userData,
    onEvents: (batch) => {
      events.push(...batch)
      for (const listener of [...listeners]) listener(batch as readonly unknown[])
    },
    perception,
    // 生产装配 = 事件订阅登记非空(boot 接线注入 workbenchEvents.size)。
    relayPresence: () => listeners.length > 0,
  })
  const relays: Array<{ dispose(): void }> = []
  const harness: MatrixHarness = {
    db,
    verbs: assembly.verbs,
    events,
    upstream,
    makeDir(name: string): string {
      const dir = join(root, name)
      mkdirSync(dir, { recursive: true })
      return dir.replaceAll('\\', '/')
    },
    installRelay(): void {
      // 生产形态(installProjectionRelay):entries = relay 本地合并视图,
      // 执行后快照与 getEntries 同源 —— 非实况直读。装载时以当前实况为
      // follow 基线(生产 = snapshot reporter 的首帧)。
      let entries: readonly WorkspaceSnapshotEntry[] = [...upstream.entries()]
      const submitEntries = async (workspaces: readonly WorkspaceSnapshotEntry[]): Promise<void> => {
        entries = [...workspaces]
        await assembly.verbs.submitWorkspaceSnapshot({ workspaces: [...workspaces] })
      }
      relays.push(createProjectionRelay({
        getChannel: () => upstream.channel,
        subscribeEvents: (listener) => {
          listeners.push(listener as unknown as (batch: readonly unknown[]) => void)
          return () => {
            const index = listeners.indexOf(listener as unknown as (batch: readonly unknown[]) => void)
            if (index !== -1) listeners.splice(index, 1)
          }
        },
        getEntries: () => entries,
        submitSnapshot: submitEntries,
        reportOutcome: async input => assembly.verbs.reportProjectionOutcome(input),
        getProjectionStatus: async () => assembly.verbs.getProjectionStatus({}),
        retryProjection: async input => assembly.verbs.retryProjection(input),
        armPollMs: 1,
        armMaxTries: 1,
        log: () => {},
      }))
    },
    relayInstalled: () => listeners.length > 0,
    dispose(): void {
      for (const relay of relays.splice(0)) relay.dispose()
      db.close()
      rmSync(root, { recursive: true, force: true, maxRetries: 10 })
    },
  }
  try {
    await run(harness)
  } finally {
    harness.dispose()
  }
}

/** 排空链路:内核 debounce(250ms)+ 通道缺席重试(500ms)+ relay 微任务队列。 */
async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await vi.advanceTimersByTimeAsync(300)
  }
  await vi.advanceTimersByTimeAsync(0)
}

function pushRequired(events: readonly WorkbenchEvent[]): WorkbenchEvent[] {
  return events.filter(event => event.type === 'projection_push_required')
}

function projectionUpdated(events: readonly WorkbenchEvent[]): WorkbenchEvent[] {
  return events.filter(event => event.type === 'projection_updated')
}

interface State {
  readonly projectionState: string
  readonly workspaceId: string | null
}

function projectState(harness: MatrixHarness, projectId: string): State {
  const row = harness.verbs.listProjects().find(project => project.id === projectId)
  // workspace_id = projects 信息位(DTO 未投影;期望快照行同值镜像)。
  const mirror = harness.db
    .prepare('SELECT workspace_id FROM projects WHERE id = ?')
    .get(projectId) as { workspace_id: string | null } | undefined
  return { projectionState: row?.projectionState ?? 'missing', workspaceId: mirror?.workspace_id ?? null }
}

/** 注册 v2 + settle(全链:plan → relay → 通道 → 快照 → outcome → healthy)。 */
async function registerHealthy(harness: MatrixHarness, name: string): Promise<Project> {
  const project = harness.verbs.registerProject({
    anchor: harness.makeDir(name),
    docsPlacement: 'repo-existing',
    displayName: name,
  }) as Project
  await settle()
  return project
}

// ---------------------------------------------------------------------------
// AC-1:四操作投影集成矩阵
// ---------------------------------------------------------------------------

describe('lifecycle × projection full chain — four-op matrix (AC-1)', () => {
  it('注册 → ensure push 全链:通道 create 同名 + outcome 回填 healthy;两项目注册序 = 通道收敛序(同名同序)', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      harness.installRelay()
      const a = await registerHealthy(harness, 'alpha')
      // 全链落点:通道行(同名)+ 期望回写(workspace_id 双落)+ healthy。
      const row = harness.upstream.byPath(a.codeRoot)
      expect(row).toMatchObject({ title: 'alpha', path: a.codeRoot })
      expect(getWorkspaceProjectionRow(harness.db, a.id)).toMatchObject({
        workspaceId: row?.workspaceId ?? '',
        title: 'alpha',
        orderIdx: 0,
        lastError: null,
      })
      expect(projectState(harness, a.id)).toEqual({ projectionState: 'healthy', workspaceId: row?.workspaceId ?? null })
      expect(projectionUpdated(harness.events).map(event => (event as { state: string }).state)).toEqual(['healthy'])

      // 第二项目:dsh 侧注册表序(新建前插)与 forge sort_order 漂移 →
      // 对账检出 reordered 偏差(呈现)→ retryProjection 收敛子集相对序。
      const b = await registerHealthy(harness, 'beta')
      harness.verbs.submitWorkspaceSnapshot({ workspaces: harness.upstream.entries() })
      await settle()
      const drifted = harness.verbs.getProjectionStatus({})
      expect(drifted.map(row => row.state)).toEqual(['deviation', 'deviation'])
      expect(drifted[0]?.deviations).toEqual([{ type: 'reordered', detail: expect.stringContaining('order drift') }])

      harness.verbs.retryProjection({ projectId: a.id })
      await settle()
      // 同名同序:通道注册表序 = forge sort_order(alpha 先注册在前)。
      expect(harness.upstream.rows.map(row => row.title)).toEqual(['alpha', 'beta'])
      const converged = harness.verbs.getProjectionStatus({})
      expect(converged.map(row => row.state)).toEqual(['healthy', 'healthy'])
      expect(converged.every(row => row.deviations.length === 0)).toBe(true)
      expect(projectState(harness, b.id).projectionState).toBe('healthy')
    })
  })

  it('改名 → rename op 同步:通道改名收敛 title;事件序 push_required → project_list_changed', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      harness.installRelay()
      const a = await registerHealthy(harness, 'alpha')
      const callsBefore = harness.upstream.calls.length
      harness.events.length = 0

      harness.verbs.renameProject({ projectId: a.id, displayName: 'alpha-two' })
      await settle()

      expect(harness.upstream.byPath(a.codeRoot)?.title).toBe('alpha-two')
      expect(getWorkspaceProjectionRow(harness.db, a.id)).toMatchObject({ title: 'alpha-two', lastError: null })
      expect(projectState(harness, a.id).projectionState).toBe('healthy')
      // 事件序:投影 push 先于列表变更(注册同款形态)。
      const ordered = harness.events
        .filter(event => event.type === 'projection_push_required' || event.type === 'project_list_changed')
        .map(event => event.type)
      expect(ordered[0]).toBe('projection_push_required')
      expect(ordered).toContain('project_list_changed')
      expect(harness.upstream.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  it('归档/恢复 → 零投影 op:零通道调用、零 push 事件、workspace 保留;归档态改名/重试同样零 op', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      harness.installRelay()
      const a = await registerHealthy(harness, 'alpha')
      const rowBefore = harness.upstream.byPath(a.codeRoot)
      expect(rowBefore).toBeDefined()
      const callsBefore = harness.upstream.calls.length
      harness.events.length = 0

      harness.verbs.archiveProject({ projectId: a.id })
      await settle()
      // 归档 ≠ 删除(Hard Rule):dsh 侧 workspace 原样保留,零通道零 push。
      expect(harness.upstream.calls.length).toBe(callsBefore)
      expect(pushRequired(harness.events)).toEqual([])
      expect(harness.upstream.byPath(a.codeRoot)!).toMatchObject(rowBefore!)
      expect(harness.events).toEqual([{ type: 'project_list_changed' }])
      // 归档态:改名/重试 = 零投影 op(期望不变;状态行仍可见)。
      harness.verbs.renameProject({ projectId: a.id, displayName: 'archived-name' })
      await settle()
      expect(harness.upstream.calls.length).toBe(callsBefore)
      expect(pushRequired(harness.events)).toEqual([])
      expect(harness.upstream.byPath(a.codeRoot)?.title).toBe('alpha') // dsh 侧不动
      const retryWhileArchived = harness.verbs.retryProjection({ projectId: a.id })
      expect(Object.keys(retryWhileArchived)).toEqual(['state']) // 形状钉定:{ state }
      expect(pushRequired(harness.events)).toEqual([])
      expect(harness.upstream.calls.length).toBe(callsBefore)

      harness.verbs.restoreProject({ projectId: a.id })
      await settle()
      expect(harness.upstream.calls.length).toBe(callsBefore) // 恢复同样零 op
      expect(harness.upstream.byPath(a.codeRoot)!).toMatchObject(rowBefore!)
    })
  })

  it('删除 → delete op push + FK cascade(期望快照/布局记忆随清);回填按终态 no-op;从未投影项目删除零 push', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      harness.installRelay()
      const a = await registerHealthy(harness, 'alpha')
      const workspaceId = projectState(harness, a.id).workspaceId
      expect(workspaceId).toMatch(/^ws-\d+$/)
      // 布局记忆行(P4 表先行占位,验证 FK cascade 语义)。
      harness.db
        .prepare("INSERT INTO project_ui_state (project_id, layout_json, updated_at) VALUES (?, '{}', '2026-09-29T00:00:00.000Z')")
        .run(a.id)
      harness.events.length = 0

      harness.verbs.removeProject(a.id)
      await settle()

      // 投影 delete:通道移除 dsh 侧 workspace(vendored delete 语义)。
      expect(harness.upstream.calls.at(-1)).toMatchObject({ verb: 'delete', request: { workspaceId } })
      expect(harness.upstream.findById(workspaceId ?? '')).toBeUndefined()
      // FK cascade:projects 行 + 期望快照 + 布局记忆随清。
      expect(harness.verbs.listProjects().find(project => project.id === a.id)).toBeUndefined()
      expect(harness.db.prepare('SELECT * FROM workspace_projection WHERE project_id = ?').get(a.id)).toBeUndefined()
      expect(harness.db.prepare('SELECT * FROM project_ui_state WHERE project_id = ?').get(a.id)).toBeUndefined()
      // 事件序:delete push 先于列表变更;状态面不再含该项目。
      const ordered = harness.events.map(event => event.type)
      expect(ordered[0]).toBe('projection_push_required')
      expect(ordered).toContain('project_list_changed')
      expect(harness.verbs.getProjectionStatus({}).map(row => row.projectId)).toEqual([])
      // 回填竞态:relay 的 outcome 到达时项目行已删 —— 终态 no-op(无异常,
      // 无 degraded 伪事件)。
      expect(projectionUpdated(harness.events)).toEqual([])
    })
  })

  it('relay 缺席世界注册后删除:dsh 侧无物可删 → 零 push(仅列表变更)', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      // 不装 relay(订阅登记空 = relayPresence 假 = 乐观直发世界外)。
      const a = harness.verbs.registerProject({
        anchor: harness.makeDir('orphan'),
        docsPlacement: 'repo-existing',
      }) as Project
      harness.events.length = 0
      harness.verbs.removeProject(a.id)
      expect(harness.events.map(event => event.type)).toEqual(['project_list_changed'])
      expect(harness.upstream.calls).toEqual([]) // 通道从未被触达
    })
  })
})

// ---------------------------------------------------------------------------
// AC-2:降级不阻断(注入)→ degraded + plan 保留 → 恢复重试两侧一致
// ---------------------------------------------------------------------------

describe('degraded does not block lifecycle verbs (AC-2)', () => {
  it('通道 op 注错(workspace/invalid-path):注册/改名动词成功返回;degraded + ERR_PROJECTION_OP_FAILED 携原码;修复后 retryProjection → healthy 两侧一致', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      harness.installRelay()
      harness.upstream.setFailCreate('workspace/invalid-path')

      const a = harness.verbs.registerProject({
        anchor: harness.makeDir('alpha'),
        docsPlacement: 'repo-existing',
        displayName: 'alpha',
      }) as Project
      await settle()
      // 动词未被投影失败阻断(AC-2:本地落库即业务成功)。
      expect(a.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(projectState(harness, a.id).projectionState).toBe('degraded')
      expect(getWorkspaceProjectionRow(harness.db, a.id)?.lastError)
        .toBe('ERR_PROJECTION_OP_FAILED (upstream workspace/invalid-path): injected failure workspace/invalid-path')
      // plan 保留:期望行在库,可重试。

      // 降级持续期:改名动词同样本地生效不被阻断(display_name 已更新,
      // 投影 push 失败 → degraded 自旋,last_error 刷新)。
      const renamed = harness.verbs.renameProject({ projectId: a.id, displayName: 'alpha-renamed' }) as Project
      expect(renamed.displayName).toBe('alpha-renamed')
      await settle()
      expect(projectState(harness, a.id).projectionState).toBe('degraded')

      // 通道修复 → retryProjection(幂等全量重推)→ healthy 两侧一致。
      harness.upstream.setFailCreate(undefined)
      const retry = harness.verbs.retryProjection({ projectId: a.id })
      expect(retry).toEqual({ state: 'degraded' }) // 现态返回,恢复待 outcome 回填
      await settle()
      expect(projectState(harness, a.id).projectionState).toBe('healthy')
      expect(getWorkspaceProjectionRow(harness.db, a.id)?.lastError).toBeNull()
      // 两侧一致:dsh 侧同名(ensure 的 title 收敛经 create-后条件 rename)。
      expect(harness.upstream.byPath(a.codeRoot)?.title).toBe('alpha-renamed')
    })
  })

  it('relay 缺席:注册不被阻断 → 重试一次后 degraded(ERR_PROJECTION_CHANNEL_UNAVAILABLE)plan 保留;回场装载重放 → healthy', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      // 先缺席(渲染未装载/启动竞态)。
      const a = harness.verbs.registerProject({
        anchor: harness.makeDir('alpha'),
        docsPlacement: 'repo-existing',
        displayName: 'alpha',
      }) as Project
      expect(a.id).toMatch(/^[0-9a-f-]{36}$/) // 注册成功,降级不阻断
      expect(pushRequired(harness.events)).toEqual([]) // 缺席世界零直发(禁静默丢弃)
      await settle() // 通道缺席重试窗口(500ms)→ 仍缺席 → degraded
      expect(projectState(harness, a.id).projectionState).toBe('degraded')
      expect(getWorkspaceProjectionRow(harness.db, a.id)?.lastError).toContain('ERR_PROJECTION_CHANNEL_UNAVAILABLE')
      expect(getWorkspaceProjectionRow(harness.db, a.id)?.workspaceId).toBeNull() // plan 保留(期望在库)

      // relay 回场:装载即重放(degraded·通道缺席行 → retryProjection)。
      harness.installRelay()
      await settle()
      expect(harness.upstream.byPath(a.codeRoot)).toMatchObject({ title: 'alpha' })
      expect(projectState(harness, a.id).projectionState).toBe('healthy')
      expect(projectState(harness, a.id).workspaceId).toMatch(/^ws-\d+$/)
    })
  })
})

// ---------------------------------------------------------------------------
// AC-3:偏差链路(dsh 侧手改 → follow 快照 → diff → deviation)+ 零反向写
// ---------------------------------------------------------------------------

describe('deviation chain — manual dsh edits surface, never flow back (AC-3)', () => {
  /** 双项目健康基线(实况与期望同序收敛后;零偏差)。 */
  async function seedTwoHealthy(harness: MatrixHarness): Promise<[Project, Project]> {
    const a = await registerHealthy(harness, 'alpha')
    const b = await registerHealthy(harness, 'beta')
    // 拉齐实况与期望(dsh 新建前插 vs forge 注册序):truth 上报 → 漂移呈现
    // → retry 收敛 —— 该收敛链的细粒度断言在 AC-1 首腿,此处仅作基线准备。
    harness.verbs.submitWorkspaceSnapshot({ workspaces: harness.upstream.entries() })
    await settle()
    harness.verbs.retryProjection({ projectId: a.id })
    await settle()
    expect(harness.upstream.rows.map(row => row.title)).toEqual(['alpha', 'beta'])
    const status = harness.verbs.getProjectionStatus({})
    expect(status.map(row => row.state)).toEqual(['healthy', 'healthy'])
    expect(status.every(row => row.deviations.length === 0)).toBe(true)
    return [a, b]
  }

  function channelVerbCount(harness: MatrixHarness): number {
    return harness.upstream.calls.length
  }

  it('手改改名 → deviation + DeviationRow(renamed);零反向写(零通道调用/零 push);显式 retry 收敛(用户动作,非偏差回流)', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      harness.installRelay()
      const [a] = await seedTwoHealthy(harness)
      const wsId = projectState(harness, a.id).workspaceId ?? ''
      const callsBefore = channelVerbCount(harness)
      harness.events.length = 0

      // dsh 侧手改(不经 forge 通道)→ follow 快照上报。
      harness.upstream.manualRename(wsId, 'alpha-hacked')
      harness.verbs.submitWorkspaceSnapshot({ workspaces: harness.upstream.entries() })
      await settle()

      expect(projectState(harness, a.id).projectionState).toBe('deviation')
      const rows = harness.verbs.getProjectionStatus({ projectId: a.id })
      expect(rows[0]?.deviations).toEqual([
        { type: 'renamed', detail: expect.stringContaining("pushed 'alpha' vs dsh 'alpha-hacked'") },
      ])
      // 零反向写(BIZ-006):偏差仅呈现 —— reconcile 零通道调用、零 push 事件。
      expect(channelVerbCount(harness)).toBe(callsBefore)
      expect(pushRequired(harness.events)).toEqual([])
      // dsh 侧手改值原样保留(未被 forge 回写)。
      expect(harness.upstream.findById(wsId)?.title).toBe('alpha-hacked')

      // 收敛 = 显式 retryProjection(用户重试面;期望 → 实况,方向恒单向)。
      harness.verbs.retryProjection({ projectId: a.id })
      await settle()
      expect(harness.upstream.findById(wsId)?.title).toBe('alpha')
      expect(projectState(harness, a.id).projectionState).toBe('healthy')
      expect(harness.verbs.getProjectionStatus({ projectId: a.id })[0]?.deviations).toEqual([])
    })
  })

  it('手改删除 → deviation + DeviationRow(deleted);零反向写', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      harness.installRelay()
      const [a] = await seedTwoHealthy(harness)
      const wsId = projectState(harness, a.id).workspaceId ?? ''
      const callsBefore = channelVerbCount(harness)
      harness.events.length = 0

      harness.upstream.manualDelete(wsId)
      harness.verbs.submitWorkspaceSnapshot({ workspaces: harness.upstream.entries() })
      await settle()

      expect(projectState(harness, a.id).projectionState).toBe('deviation')
      expect(harness.verbs.getProjectionStatus({ projectId: a.id })[0]?.deviations)
        .toEqual([{ type: 'deleted', detail: expect.stringContaining('workspace gone') }])
      expect(channelVerbCount(harness)).toBe(callsBefore)
      expect(pushRequired(harness.events)).toEqual([])
    })
  })

  it('手改乱序 → 子集成员各 deviation(DeviationRow reordered);零反向写', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      harness.installRelay()
      const [a, b] = await seedTwoHealthy(harness)
      const callsBefore = channelVerbCount(harness)
      harness.events.length = 0

      // dsh 侧把 beta 移到 alpha 前( forge 期望序 = alpha, beta)。
      harness.upstream.manualMove(projectState(harness, b.id).workspaceId ?? '', 0)
      harness.verbs.submitWorkspaceSnapshot({ workspaces: harness.upstream.entries() })
      await settle()

      const states = new Map(harness.verbs.listProjects().map(project => [project.id, project.projectionState]))
      expect(states.get(a.id)).toBe('deviation')
      expect(states.get(b.id)).toBe('deviation')
      for (const projectId of [a.id, b.id]) {
        expect(harness.verbs.getProjectionStatus({ projectId })[0]?.deviations)
          .toEqual([{ type: 'reordered', detail: expect.stringContaining('order drift') }])
      }
      expect(channelVerbCount(harness)).toBe(callsBefore)
      expect(pushRequired(harness.events)).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// AC-5:dsh 侧删除重建 → ensure 按 path 复连(workspace_id 更新)
// ---------------------------------------------------------------------------

describe('dsh-side delete/recreate — ensure reconnects by path (AC-5)', () => {
  it('手改删除(deviation)→ retryProjection ensure 重建新 id → workspace_id 更新 + healthy', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      harness.installRelay()
      const a = await registerHealthy(harness, 'alpha')
      const firstId = projectState(harness, a.id).workspaceId
      expect(firstId).toMatch(/^ws-\d+$/)

      harness.upstream.manualDelete(firstId ?? '')
      harness.verbs.submitWorkspaceSnapshot({ workspaces: harness.upstream.entries() })
      await settle()
      expect(projectState(harness, a.id).projectionState).toBe('deviation') // deleted 偏差呈现

      harness.verbs.retryProjection({ projectId: a.id })
      await settle()
      // ensure 按 path 复连:同 path 新 id 落账(er-diagram:path 冗余 anchor
      // 的存在理由 —— workspace_id 由 ensure 更新)。
      const secondId = projectState(harness, a.id).workspaceId
      expect(secondId).toMatch(/^ws-\d+$/)
      expect(secondId).not.toBe(firstId)
      expect(harness.upstream.byPath(a.codeRoot)).toMatchObject({ workspaceId: secondId, title: 'alpha' })
      expect(getWorkspaceProjectionRow(harness.db, a.id)?.workspaceId).toBe(secondId)
      expect(projectState(harness, a.id).projectionState).toBe('healthy')
    })
  })

  it('dsh 侧自行删除重建(同 path 异 id):不算 deleted 偏差;ensure 收养既有行并更新 workspace_id', async () => {
    vi.useFakeTimers()
    await withMatrixHarness(async (harness) => {
      harness.installRelay()
      const a = await registerHealthy(harness, 'alpha')

      const recreatedId = harness.upstream.manualRecreate(a.codeRoot)
      harness.verbs.submitWorkspaceSnapshot({ workspaces: harness.upstream.entries() })
      await settle()
      // 复连场景不算删除偏差(diff 口径:同 path 异 id = ensure 收养,非 drift)。
      expect(harness.verbs.getProjectionStatus({ projectId: a.id })[0]?.deviations).toEqual([])

      harness.verbs.retryProjection({ projectId: a.id })
      await settle()
      // create-or-adopt:收养 dsh 侧重建行(created=false),零新建,幂等。
      const adopted = harness.upstream.byPath(a.codeRoot)
      expect(adopted?.workspaceId).toBe(recreatedId)
      expect(harness.upstream.rows.filter(row => row.path === a.codeRoot)).toHaveLength(1)
      expect(projectState(harness, a.id).workspaceId).toBe(recreatedId)
      expect(getWorkspaceProjectionRow(harness.db, a.id)?.workspaceId).toBe(recreatedId)
      expect(projectState(harness, a.id).projectionState).toBe('healthy')
    })
  })
})
