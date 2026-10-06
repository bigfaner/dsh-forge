// 三小域测试共享夹具（任务 2.7）——features/proposals/docs 三测试文件共用的装配底盘：
// 中央 state.db（projects 行种入）+ tasksHome 派生根 + ForgeWorkspaceStore（routing 组装
// resolveDir——生产装配同构）+ 事件 spy。本文件不进任何生产 import 图（testutil 同口径）。
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type { TasksChangedEvent } from '@dsh-forge/contracts'
import { openDatabase } from '../../db/index.js'
import { deriveTaskStoreDir } from '../workspace/derive-dir.js'
import type { ForgeTaskEvents } from '../workspace/events.js'
import { createProjectRouting, type CentralProjectRouting } from '../workspace/routing.js'
import { createWorkspaceStore, type ForgeWorkspaceStore } from '../workspace/store.js'

/** 事件 spy（emitTasksChanged 记账 + onTasksChanged 结构兼容——断言面 = emitted 清单） */
export interface EventSpy extends ForgeTaskEvents {
  readonly emitted: TasksChangedEvent[]
}

export interface SmallDomainHarness {
  /** 中央 projects.id（services 一切方法路由键） */
  readonly projectId: string
  /** 工作区目录（ws_path 落库值） */
  readonly wsDir: string
  /** forge_dir（文档读域守卫基准——中央行落库值） */
  readonly forgeDir: string
  /** 每工作区任务库惰性句柄（测试种行直写面） */
  readonly store: ForgeWorkspaceStore
  /** 事件 spy（写动词发射断言） */
  readonly events: EventSpy
  /** 中央行路由（生产装配同构） */
  readonly routing: CentralProjectRouting
  /** 工作区库句柄（= store.ensureOpen(projectId)——种行/读行直用） */
  readonly wsDb: Database.Database
  dispose(): void
}

/** 起夹具：临时根 + 中央库（projects 行）+ tasksHome + store + events spy */
export function createHarness(): SmallDomainHarness {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-small-'))
  const projectId = randomUUID()
  const wsDir = join(root, 'ws')
  const forgeDir = join(wsDir, '.forge')
  mkdirSync(forgeDir, { recursive: true })
  const tasksHome = join(root, 'tasks-home')
  mkdirSync(tasksHome, { recursive: true })

  const central = openDatabase(join(root, 'state.db'))
  central
    .prepare(
      `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, knowledge_dir, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(projectId, randomUUID(), wsDir, 'demo', forgeDir, join(wsDir, '.knowledge'), '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')

  const routing = createProjectRouting(central)
  const store = createWorkspaceStore({
    resolveDir: (pid: string) => deriveTaskStoreDir(tasksHome, routing.wsPath(pid)),
  })
  const emitted: TasksChangedEvent[] = []
  const events: EventSpy = {
    emitted,
    emitTasksChanged(pid: string): void {
      emitted.push({ projectId: pid })
    },
    onTasksChanged(): () => void {
      return () => undefined
    },
  }
  const wsDb = store.ensureOpen(projectId)
  return {
    projectId,
    wsDir,
    forgeDir,
    store,
    events,
    routing,
    wsDb,
    dispose(): void {
      store.dispose()
      central.close()
      rmSync(root, { recursive: true, force: true })
    },
  }
}
