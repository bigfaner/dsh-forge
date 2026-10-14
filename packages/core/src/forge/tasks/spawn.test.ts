// recordSpawn 测试——spawn 审计动词（执行会话事实诞生即入库）：append 行形制
// （verb='spawn'/from·to 空/actor='plugin-tool'/session_id = worker 子会话）+ 零状态效应
// （不转移不重算相位）+ 未命中 ERR_TASK_NOT_FOUND + 重入再派发旧行保留（append-only）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTasksHarness, seedFeature, seedTask, type TasksHarness } from './harness.js'
import { recordSpawn } from './spawn.js'

let h: TasksHarness | undefined
beforeEach(() => {
  h ??= createTasksHarness()
})
afterEach(() => {
  h?.dispose()
  h = undefined
})

const deps = () => ({ store: h!.store, events: h!.events })
const P = () => h!.projectId
const rows = (sql: string, ...args: unknown[]): unknown[] =>
  h!.db.prepare(sql).all(...args) as unknown[]

describe('recordSpawn：spawn 审计行落库（执行会话事实库侧单源）', () => {
  it('append 行形制：verb=spawn / from·to 空 / actor=plugin-tool / session_id = worker', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    await recordSpawn(deps(), { projectId: P(), taskId: 't-f-1.1', sessionId: 'worker-9' })
    expect(rows(`SELECT verb, from_status, to_status, actor, session_id FROM task_records ORDER BY id`)).toEqual([
      { verb: 'spawn', from_status: null, to_status: null, actor: 'plugin-tool', session_id: 'worker-9' },
    ])
  })
  it('零状态效应：任务状态不动（spawn 非生命周期动词——仅审计）', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    await recordSpawn(deps(), { projectId: P(), taskId: 't-f-1.1', sessionId: 'worker-9' })
    expect(rows(`SELECT task_status FROM tasks WHERE id = 't-f-1.1'`)).toEqual([{ task_status: 'in_progress' }])
  })
  it('claim 重入再派发：旧行保留（append-only），解析侧取最新行', async () => {
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' })
    await recordSpawn(deps(), { projectId: P(), taskId: 't-f-1.1', sessionId: 'worker-old' })
    await recordSpawn(deps(), { projectId: P(), taskId: 't-f-1.1', sessionId: 'worker-new' })
    expect(rows(`SELECT session_id FROM task_records WHERE verb = 'spawn' ORDER BY id`)).toEqual([
      { session_id: 'worker-old' },
      { session_id: 'worker-new' },
    ])
  })
  it('taskId 未命中 → ERR_TASK_NOT_FOUND', async () => {
    await expect(recordSpawn(deps(), { projectId: P(), taskId: 't-missing', sessionId: 'w' })).rejects.toMatchObject({
      code: 'ERR_TASK_NOT_FOUND',
    })
  })
})
