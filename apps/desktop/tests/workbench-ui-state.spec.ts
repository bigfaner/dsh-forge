import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import {
  DEFAULT_PROJECT_LAYOUT,
  RIGHTBAR_WIDTH_PCT_MAX,
  RIGHTBAR_WIDTH_PCT_MIN,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  TAB_KINDS,
  TOPIC_MAX_LENGTH,
  sanitizeProjectLayout,
  type ProjectLayout,
} from '../src/main/workbench/ui-state/layout-schema.ts'
import { getProjectUiStateRow, saveProjectLayout } from '../src/main/workbench/ui-state/ui-state-repo.ts'
import { registerProject, removeProject } from '../src/main/workbench/repos/projects.ts'
import { WorkbenchRepoError, type RepoDb } from '../src/main/workbench/repos/types.ts'
import { createWorkbenchIpcServices, type WorkbenchPerceptionSeam } from '../src/main/workbench/ipc/services.ts'
import type { WorkbenchVerbServices } from '../src/main/workbench/ipc/types.ts'
// Client twin (2.2's table):type-only imports in the source are erased at
// transform, so the runtime import stays self-contained — same cross-package
// test pattern as workbench-projection-lifecycle.spec.ts (relay).
import { RIGHTBAR_TAB_KINDS } from '../../../packages/plugins/forge-workbench/src/client/views/rightbar/tab-kinds.ts'

// 任务 4.1 — ui-state 域(tech-design §Interfaces·Interface 4 ProjectLayout v1
// + §Interface 1 v3·P4 批两动词 + §Security T5 白名单 + §Error Handling
// ERR_LAYOUT_INVALID;er-diagram project_ui_state FK cascade)。矩阵:
//   AC-2 schema 白名单:合法 / sidebar 越界 / 未知 kind / 超长·空 topic /
//        version 前向 / 未知键(白名单)/ widthPct 钳制(修复非违规);
//   AC-1 repo:无行 = 默认 / 读写往返 / updated_at 刷新 / 违规·损坏 blob
//        读侧重置 / 项目删除 FK cascade 清除;
//   AC-3/4 动词:注册 + 读写往返 / 服务端二次校验(非法落库默认 +
//        ERR_LAYOUT_INVALID 仅 log,不拒动词面)/ ERR_PROJECT_NOT_FOUND;
//   Hard Rule:分组×排序视图选项(localStorage 用户级)不入 blob —— 白名单
//        对该等字段恒拒;
//   TabKind lockstep:kernel canonical ≡ client 2.2 表(drift 断言)。

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-ui-state-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

function projPath(name: string): string {
  return join(tmpdir(), `dsh-forge-ui-state-p-${name}`).replaceAll('\\', '/')
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

async function withDb(run: (db: RepoDb) => void | Promise<void>): Promise<void> {
  const { db } = await openDatabase(makeScratch())
  try {
    await run(db as RepoDb)
  } finally {
    db.close()
  }
}

function stdoutSink(): string[] {
  const lines: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  }) as typeof process.stdout.write)
  return lines
}

/** WorkbenchRepoError 断言:code 为属性位(message 不含码;repos 惯例)。 */
function expectProjectNotFound(run: () => unknown): void {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(WorkbenchRepoError)
    expect((error as WorkbenchRepoError).code).toBe('ERR_PROJECT_NOT_FOUND')
    return
  }
  throw new Error('expected an ERR_PROJECT_NOT_FOUND rejection')
}

/** 合法全量样本(每节可选位均在场)。 */
const LEGAL: ProjectLayout = {
  version: 1,
  sidebar: { collapsed: true, width: 300 },
  tree: { expandedProjects: ['p-1'], expandedSessions: ['s-1'], overflowOpen: [] },
  rightbar: {
    widthPct: 42,
    panes: [{ tabs: [{ kind: 'guide' }, { kind: 'doc', topic: 'dsh-forge-m4/prd' }] }],
  },
  detached: [{
    view: 'conversation',
    target: { sessionId: 's-9' },
    rect: { x: 10, y: 20, width: 960, height: 640 },
  }],
}

/** 最小合法样本(仅必填位)。 */
const MINIMAL: ProjectLayout = {
  version: 1,
  sidebar: { collapsed: false },
  tree: { expandedProjects: [], expandedSessions: [], overflowOpen: [] },
  rightbar: { panes: [] },
  detached: [],
}

/** 违规断言:重置默认 + reason 非空(reset 产物即 ERR_LAYOUT_INVALID 的 log 面)。 */
function expectReset(value: unknown): void {
  const result = sanitizeProjectLayout(value)
  expect(result.reset).toBe(true)
  expect(result.reason).toBeTruthy()
  expect(result.layout).toEqual(DEFAULT_PROJECT_LAYOUT)
}

// ---------------------------------------------------------------------------
// AC-2:schema 白名单校验矩阵(合法 / 越界 / 未知 kind / 超长 topic / version)
// ---------------------------------------------------------------------------

describe('layout schema whitelist — sanitizeProjectLayout (AC-2)', () => {
  it('合法全量样本:规范化产物逐字段保真(reset = false)', () => {
    const result = sanitizeProjectLayout(LEGAL)
    expect(result.reset).toBe(false)
    expect(result.reason).toBeNull()
    expect(result.layout).toEqual(LEGAL)
  })

  it('最小合法样本(仅必填位)通过;每 kind 各一枚均合法', () => {
    expect(sanitizeProjectLayout(MINIMAL).layout).toEqual(MINIMAL)
    for (const kind of TAB_KINDS) {
      const layout = { ...MINIMAL, rightbar: { panes: [{ tabs: [{ kind }] }] } }
      expect(sanitizeProjectLayout(layout).reset, kind).toBe(false)
    }
  })

  it('version 前向/缺形 = 违规(不猜迁移)', () => {
    expectReset({ ...LEGAL, version: 2 })
    expectReset({ ...LEGAL, version: '1' })
    const { version: _omitted, ...withoutVersion } = LEGAL
    expectReset(withoutVersion)
  })

  it('sidebar.width 值域 [264, 420]:越界 = 违规;边界值合法', () => {
    expectReset({ ...LEGAL, sidebar: { collapsed: false, width: SIDEBAR_WIDTH_MIN - 1 } })
    expectReset({ ...LEGAL, sidebar: { collapsed: false, width: SIDEBAR_WIDTH_MAX + 1 } })
    expectReset({ ...LEGAL, sidebar: { collapsed: false, width: Number.NaN } })
    expectReset({ ...LEGAL, sidebar: { collapsed: false, width: 'wide' } })
    expect(sanitizeProjectLayout({ ...LEGAL, sidebar: { collapsed: true, width: SIDEBAR_WIDTH_MIN } }).reset).toBe(false)
    expect(sanitizeProjectLayout({ ...LEGAL, sidebar: { collapsed: true, width: SIDEBAR_WIDTH_MAX } }).reset).toBe(false)
    expectReset({ ...LEGAL, sidebar: { width: 300 } }) // collapsed 缺形 = 违规
    expectReset({ ...LEGAL, sidebar: { collapsed: 'yes', width: 300 } })
  })

  it('rightbar.widthPct 钳制 [30, 70](修复型,非违规;layout 仍合法)', () => {
    const low = sanitizeProjectLayout({ ...LEGAL, rightbar: { ...LEGAL.rightbar, widthPct: 0 } })
    expect(low.reset).toBe(false)
    expect(low.layout.rightbar.widthPct).toBe(RIGHTBAR_WIDTH_PCT_MIN)
    const high = sanitizeProjectLayout({ ...LEGAL, rightbar: { ...LEGAL.rightbar, widthPct: 100 } })
    expect(high.reset).toBe(false)
    expect(high.layout.rightbar.widthPct).toBe(RIGHTBAR_WIDTH_PCT_MAX)
    const inRange = sanitizeProjectLayout({ ...LEGAL, rightbar: { ...LEGAL.rightbar, widthPct: 42.5 } })
    expect(inRange.reset).toBe(false)
    expect(inRange.layout.rightbar.widthPct).toBe(42.5)
    expect(sanitizeProjectLayout(MINIMAL).layout.rightbar.widthPct).toBeUndefined()
    expectReset({ ...LEGAL, rightbar: { ...LEGAL.rightbar, widthPct: Number.NaN } })
  })

  it('未知 tab kind = 违规(TabKind 枚举白名单)', () => {
    expectReset({ ...LEGAL, rightbar: { panes: [{ tabs: [{ kind: 'chat' }] }] } })
    expectReset({ ...LEGAL, rightbar: { panes: [{ tabs: [{ kind: 42 }] }] } })
  })

  it('topic 界长:>512 或空串 = 违规;512 字符合法', () => {
    const atBound = 'x'.repeat(TOPIC_MAX_LENGTH)
    const tab = { kind: 'doc', topic: atBound }
    expect(sanitizeProjectLayout({ ...LEGAL, rightbar: { panes: [{ tabs: [tab] }] } }).reset).toBe(false)
    expectReset({ ...LEGAL, rightbar: { panes: [{ tabs: [{ kind: 'doc', topic: `${atBound}x` }] }] } })
    expectReset({ ...LEGAL, rightbar: { panes: [{ tabs: [{ kind: 'doc', topic: '' }] }] } })
  })

  it('未知键(任意层级)= 违规 —— 白名单语义;Hard Rule:分组×排序视图选项永不入 blob', () => {
    // Hard Rule 双轨边界:分组×排序 = localStorage 用户级(C3 口径),项目域
    // blob 的属性白名单对该等字段恒拒(无论挂在顶层还是嵌套位)。
    expectReset({ ...LEGAL, groupBy: 'status', sortBy: 'updatedAt' })
    expectReset({ ...LEGAL, viewOptions: { groupBy: 'status', sortBy: 'updatedAt' } })
    expectReset({ ...LEGAL, sidebar: { collapsed: false, pinned: true } })
    expectReset({ ...LEGAL, tree: { ...LEGAL.tree, collapsedAll: true } })
    expectReset({ ...LEGAL, rightbar: { panes: [{ tabs: [{ kind: 'guide', pinned: true }] }] } })
    expectReset({ ...LEGAL, detached: [{ view: 'board', fullscreen: true }] })
  })

  it('tree 三集成员 = 非空字符串(空串/非串 = 违规)', () => {
    expectReset({ ...LEGAL, tree: { ...LEGAL.tree, expandedProjects: [''] } })
    expectReset({ ...LEGAL, tree: { ...LEGAL.tree, expandedSessions: [42] } })
    expectReset({ ...LEGAL, tree: { ...LEGAL.tree, overflowOpen: 'p-1' } })
  })

  it('detached:view 词表 / target 恰一形态 / rect 四元有限数', () => {
    expectReset({ ...LEGAL, detached: [{ view: 'chat' }] })
    expectReset({ ...LEGAL, detached: [{ view: 'board', target: { sessionId: '' } }] })
    expectReset({
      ...LEGAL,
      detached: [{ view: 'board', target: { sessionId: 's-1', parentSessionId: 's-0', childSessionId: 's-1', mode: 'one-shot' } }],
    })
    expectReset({ ...LEGAL, detached: [{ view: 'board', target: { parentSessionId: 's-0', childSessionId: 's-1', mode: 'async' } }] })
    expectReset({ ...LEGAL, detached: [{ view: 'board', rect: { x: 0, y: 0, width: Number.NaN, height: 1 } }] })
    expectReset({ ...LEGAL, detached: [{ view: 'board', rect: { x: 0, y: 0, width: 1 } }] })
    const subagent = sanitizeProjectLayout({
      ...LEGAL,
      detached: [{ view: 'board', target: { parentSessionId: 's-0', childSessionId: 's-1', mode: 'continuable' } }],
    })
    expect(subagent.reset).toBe(false)
  })

  it('非对象形态(null/数组/标量/undefined)= 违规', () => {
    for (const bad of [null, undefined, 'layout', 42, [], [{ version: 1 }]]) {
      expectReset(bad)
    }
  })
})

// ---------------------------------------------------------------------------
// AC-1:repo(project_ui_state 读写 / 无行 = 默认 / updated_at / FK cascade)
// ---------------------------------------------------------------------------

describe('ui-state repo — project_ui_state read/write (AC-1)', () => {
  it('无行 = null(调用方以默认布局应答);写入后往返保真 + updated_at 落库', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      expect(getProjectUiStateRow(db, project.id)).toBeNull()
      saveProjectLayout(db, project.id, LEGAL, '2026-09-30T08:00:00.000Z')
      const row = getProjectUiStateRow(db, project.id)
      expect(row?.reset).toBe(false)
      expect(row?.updatedAt).toBe('2026-09-30T08:00:00.000Z')
      expect(row?.layout).toEqual(LEGAL)
    })
  })

  it('重复写 = UPSERT 覆盖 + updated_at 刷新(verb 每笔落库时戳)', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      saveProjectLayout(db, project.id, LEGAL, '2026-09-30T08:00:00.000Z')
      saveProjectLayout(db, project.id, MINIMAL, '2026-09-30T09:00:00.000Z')
      const row = getProjectUiStateRow(db, project.id)
      expect(row?.updatedAt).toBe('2026-09-30T09:00:00.000Z')
      expect(row?.layout).toEqual(MINIMAL)
    })
  })

  it('行内违规 blob / 损坏 JSON / DDL 缺省空对象 → 读侧重置默认 + reset 标记', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const insert = db.prepare('INSERT INTO project_ui_state (project_id, layout_json, updated_at) VALUES (?, ?, ?)')
      insert.run(project.id, JSON.stringify({ ...LEGAL, version: 2 }), '2026-09-30T08:00:00.000Z')
      let row = getProjectUiStateRow(db, project.id)
      expect(row?.reset).toBe(true)
      expect(row?.layout).toEqual(DEFAULT_PROJECT_LAYOUT)
      db.prepare('DELETE FROM project_ui_state').run()
      insert.run(project.id, 'not-json{', '2026-09-30T08:00:00.000Z')
      row = getProjectUiStateRow(db, project.id)
      expect(row?.reset).toBe(true)
      expect(row?.layout).toEqual(DEFAULT_PROJECT_LAYOUT)
      db.prepare('DELETE FROM project_ui_state').run()
      insert.run(project.id, '{}', '2026-09-30T08:00:00.000Z') // schema-v3 DDL DEFAULT 形态
      row = getProjectUiStateRow(db, project.id)
      expect(row?.reset).toBe(true)
      expect(row?.layout).toEqual(DEFAULT_PROJECT_LAYOUT)
    })
  })

  it('项目删除 → FK cascade 清除行(schema-v3 DDL 既置;集成断言)', async () => {
    await withDb((db) => {
      const project = registerProject(db, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      saveProjectLayout(db, project.id, LEGAL, '2026-09-30T08:00:00.000Z')
      expect(getProjectUiStateRow(db, project.id)).not.toBeNull()
      removeProject(db, project.id)
      expect(getProjectUiStateRow(db, project.id)).toBeNull()
      const count = (db.prepare('SELECT COUNT(*) AS n FROM project_ui_state').get() as { readonly n: number }).n
      expect(count).toBe(0)
    })
  })

  it('未知项目写入 → ERR_PROJECT_NOT_FOUND(前置校验惯例,优于裸 FK 错误)', async () => {
    await withDb((db) => {
      expectProjectNotFound(() => saveProjectLayout(db, 'nope', LEGAL, '2026-09-30T08:00:00.000Z'))
    })
  })
})

// ---------------------------------------------------------------------------
// AC-3/AC-4:动词面(getProjectUiState/setProjectUiState;服务端二次校验)
// ---------------------------------------------------------------------------

interface VerbHarness {
  readonly db: DatabaseSyncLike
  readonly verbs: WorkbenchVerbServices
  readonly stdout: string[]
}

async function withVerbHarness(run: (harness: VerbHarness) => void | Promise<void>): Promise<void> {
  const root = makeScratch()
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const resources = join(root, 'resources')
  mkdirSync(resources, { recursive: true })
  writeFileSync(join(resources, 'plugin-bundles.json'), JSON.stringify({ bundles: [{ name: '@deepseek-ai/dsh-base', mandatory: true }] }))
  const { db } = await openDatabase(userData)
  const perception: WorkbenchPerceptionSeam = { retarget: () => {}, rescan: () => {} }
  const assembly = createWorkbenchIpcServices({ db, pluginBundlesPath: join(resources, 'plugin-bundles.json'), userDataPath: userData, perception })
  const stdout = stdoutSink()
  try {
    await run({ db: db as DatabaseSyncLike, verbs: assembly.verbs, stdout })
  } finally {
    db.close()
  }
}

describe('ui-state verbs — get/setProjectUiState (AC-3/AC-4)', () => {
  it('无行 = 默认布局 + stored:false;合法写 → 读往返保真 + stored:true(fix-2 行存在信号)', async () => {
    await withVerbHarness(({ db, verbs }) => {
      const project = registerProject(db as RepoDb, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      expect(verbs.getProjectUiState({ projectId: project.id })).toEqual({ layout: DEFAULT_PROJECT_LAYOUT, stored: false })
      verbs.setProjectUiState({ projectId: project.id, layout: LEGAL })
      expect(verbs.getProjectUiState({ projectId: project.id })).toEqual({ layout: LEGAL, stored: true })
    })
  })

  it('服务端二次校验:非法 layout 落库为默认布局 + ERR_LAYOUT_INVALID log,动词不拒(行在 → stored:true)', async () => {
    await withVerbHarness(({ db, verbs, stdout }) => {
      const project = registerProject(db as RepoDb, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      // handler 面已保形状为对象;未知 kind = schema 违规 → 写面不拒、落库默认。
      const invalid = { ...LEGAL, rightbar: { panes: [{ tabs: [{ kind: 'chat' }] }] } } as unknown as ProjectLayout
      expect(() => verbs.setProjectUiState({ projectId: project.id, layout: invalid })).not.toThrow()
      expect(verbs.getProjectUiState({ projectId: project.id })).toEqual({ layout: DEFAULT_PROJECT_LAYOUT, stored: true })
      expect(stdout.some(line => line.includes('ERR_LAYOUT_INVALID'))).toBe(true)
    })
  })

  it('读侧违规 blob → 默认布局 + ERR_LAYOUT_INVALID log(不放大存储损伤;行在 → stored:true)', async () => {
    await withVerbHarness(({ db, verbs, stdout }) => {
      const project = registerProject(db as RepoDb, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      db.prepare('INSERT INTO project_ui_state (project_id, layout_json, updated_at) VALUES (?, ?, ?)')
        .run(project.id, JSON.stringify({ ...LEGAL, sidebar: { collapsed: false, width: 9999 } }), '2026-09-30T08:00:00.000Z')
      expect(verbs.getProjectUiState({ projectId: project.id })).toEqual({ layout: DEFAULT_PROJECT_LAYOUT, stored: true })
      expect(stdout.some(line => line.includes('ERR_LAYOUT_INVALID'))).toBe(true)
    })
  })

  it('widthPct 越界写 = 钳制后落库(非违规;零 ERR_LAYOUT_INVALID log)', async () => {
    await withVerbHarness(({ db, verbs, stdout }) => {
      const project = registerProject(db as RepoDb, { codeRoot: projPath('a'), docLocationType: 'in_repo', displayName: 'A' })
      const clamped = { ...LEGAL, rightbar: { ...LEGAL.rightbar, widthPct: 95 } }
      verbs.setProjectUiState({ projectId: project.id, layout: clamped })
      const expected: ProjectLayout = { ...LEGAL, rightbar: { ...LEGAL.rightbar, widthPct: 70 } }
      expect(verbs.getProjectUiState({ projectId: project.id })).toEqual({ layout: expected, stored: true })
      expect(stdout.some(line => line.includes('ERR_LAYOUT_INVALID'))).toBe(false)
    })
  })

  it('未知项目 → ERR_PROJECT_NOT_FOUND(读/写两面)', async () => {
    await withVerbHarness(({ verbs }) => {
      expectProjectNotFound(() => verbs.getProjectUiState({ projectId: 'nope' }))
      expectProjectNotFound(() => verbs.setProjectUiState({ projectId: 'nope', layout: LEGAL }))
    })
  })
})

// ---------------------------------------------------------------------------
// TabKind lockstep:kernel canonical ≡ client 2.2 表(Interface 4 单一声明策略)
// ---------------------------------------------------------------------------

describe('TabKind lockstep — kernel canonical vs client tab-kinds (Interface 4)', () => {
  it('TAB_KINDS ≡ client RIGHTBAR_TAB_KINDS(同序同集 drift 锁)', () => {
    expect([...TAB_KINDS]).toEqual([...RIGHTBAR_TAB_KINDS])
  })
})
