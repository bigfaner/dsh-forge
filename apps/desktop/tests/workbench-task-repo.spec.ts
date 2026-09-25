import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import { registerProject } from '../src/main/workbench/repos/projects.ts'
import { recordSessionLink } from '../src/main/workbench/repos/session-links.ts'
import { upsertTaskSnapshot } from '../src/main/workbench/repos/task-snapshots.ts'
import { WorkbenchRepoError, type Project } from '../src/main/workbench/repos/types.ts'
import { ALL_STATUSES, type TaskStatus } from '../src/main/workbench/tasks/model.ts'
import { validateTransition } from '../src/main/workbench/tasks/statemachine.ts'
import {
  generateAutoTaskId,
  getProjectTaskAuthority,
  insertTask,
  isBoardTaskKey,
  TaskDomainError,
  updateTaskStatus,
  type AuthoritativeTask,
} from '../src/main/workbench/tasks/task-repo.ts'
import { createTaskVerbService } from '../src/main/workbench/tasks/task-service.ts'
import type { TaskDetail, TaskSummary } from '../src/main/workbench/ipc/types.ts'

// Task 1.3 (M3) — authoritative task table repo + the CRUD write-set verbs +
// read routing. Authorities: docs/features/dsh-forge-m3/design/tech-design.md
// §Interface 1 (verb signatures, Authority/Actor), design/er-diagram.md (task
// entity invariants), design/schema.sql (v2 DDL, shipped by task 1.1), and the
// forge-cli Go source as the semantic port authority for the verbs (claim.go
// checkDependenciesMet / add.go AddTask+generateAutoID / submit.go /
// transition.go / reopen.go).
//
// Read-routing tests flip projects.data_authority with raw SQL deliberately:
// the column is placed only by the migration transaction (task 1.4); this task
// only reads it. Raw seeding of task rows goes through the repo write path
// (insertTask/updateTaskStatus) — the sanctioned single write entry.

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-task-repo-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

async function withDb(run: (db: DatabaseSyncLike) => void | Promise<void>): Promise<void> {
  const { db } = await openDatabase(makeScratch())
  try {
    await run(db)
  } finally {
    db.close()
  }
}

function capture(fn: () => unknown): unknown {
  try {
    return fn()
  } catch (error) {
    return error
  }
}

function expectTaskError(error: unknown, code: string, messagePattern?: RegExp): void {
  expect(error, `expected TaskDomainError ${code}, got ${String(error)}`).toBeInstanceOf(TaskDomainError)
  const taskError = error as TaskDomainError
  expect(taskError.code).toBe(code)
  if (messagePattern !== undefined) expect(taskError.message).toMatch(messagePattern)
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** 注册项目并置权威通道(sqlite 置位 = 迁移事务效果的测试投影;1.4 前无动词面)。 */
function registerSqliteProject(db: DatabaseSyncLike, codeRoot: string, authority: 'files' | 'sqlite' = 'sqlite'): Project {
  const project = registerProject(db, { codeRoot, docLocationType: 'in_repo' })
  if (authority === 'sqlite') {
    db.prepare("UPDATE projects SET data_authority = 'sqlite' WHERE id = ?").run(project.id)
  }
  return project
}

interface SeedOptions {
  readonly blockers?: readonly string[]
  readonly taskType?: string | null
  readonly descPath?: string | null
  readonly title?: string
  readonly updatedBy?: string
  readonly updatedAt?: string
}

/** 权威行种子(经仓储唯一写入口;动词测试的铺底面)。 */
function seedTask(db: DatabaseSyncLike, projectId: string, taskKey: string, status: TaskStatus, opts: SeedOptions = {}): AuthoritativeTask {
  return insertTask(db, {
    projectId,
    taskKey,
    featureSlug: taskKey.slice(0, taskKey.indexOf('/')),
    title: opts.title ?? taskKey,
    status,
    blockers: [...(opts.blockers ?? [])],
    taskType: opts.taskType ?? null,
    descPath: opts.descPath ?? null,
    updatedBy: opts.updatedBy ?? 'kernel',
    updatedAt: opts.updatedAt ?? new Date().toISOString(),
  })
}

/** files 分支详情假体(记录注入调用;M2 行为由 services 层既有实现承载)。 */
function makeService(db: DatabaseSyncLike, featuresRoot?: (projectId: string) => string | null) {
  const filesDetailCalls: Array<[string, string]> = []
  const filesDetail: TaskDetail = {
    summary: {
      key: 'files-branch',
      title: 'files detail (M2 behavior)',
      status: 'pending',
      featureSlug: 'alpha',
      blockers: [],
      branch: null,
      worktree: false,
      source: null,
      updatedAt: '1970-01-01T00:00:00.000Z',
    },
    descriptionMarkdown: '# files-branch',
    depChain: [],
    records: [],
    links: [],
  }
  const service = createTaskVerbService({
    db,
    readFilesTaskDetail: (projectId, taskKey) => {
      filesDetailCalls.push([projectId, taskKey])
      return filesDetail
    },
    resolveFeaturesRoot: featuresRoot ?? (() => null),
  })
  return { service, filesDetailCalls, filesDetail }
}

// ---------------------------------------------------------------------------
// taskKey 看板限定地址校验(AC-4:单 `/` + 两段非空 + 禁路径分隔/控制字符)
// ---------------------------------------------------------------------------

describe('board task-key validation', () => {
  it('accepts the qualified-address dialect including phase/letter keys (no numeric regex)', () => {
    for (const key of ['alpha/1.3', 'alpha/5.gate', 'alpha/5.summary', 'alpha/T-review-doc', 'alpha/disc-1', 'alpha/1.2-some-slug-name']) {
      expect(isBoardTaskKey(key), key).toBe(true)
    }
  })

  it('rejects malformed forms: bare single segment, multi-slash, empty segments, separators, control chars', () => {
    for (const key of [
      '1.3',            // 裸数字单段(弃裸 ID 假设的反面:无 `/` 即非法)
      '1.3.4',          // 无 `/` 的多段 ID 同为单段
      'alpha',          // 裸字母单段
      'alpha/1.1/extra',// 多于一个 `/`
      '/1.1',           // 前段空
      'alpha/',         // 后段空
      'alpha/1\\1',     // 反斜杠路径分隔
      'alpha/1\t1',     // 控制字符(tab)
      'alpha/1\n1',     // 控制字符(LF)
      'alp\x7fha/1.1',  // DEL
      '',               // 空串
    ]) {
      expect(isBoardTaskKey(key), JSON.stringify(key)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// taskAdd(AC-1/AC-4:插入面 + 权限界 + 自动 ID + 依赖闭合前置)
// ---------------------------------------------------------------------------

describe('taskAdd', () => {
  it('creates a pending authoritative row with actor audit and returns the summary', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-a')
      const { service } = makeService(db)
      const summary = service.taskAdd(
        { projectId: project.id, featureSlug: 'alpha', title: 'port the verbs', taskType: 'coding.feature' },
        'session:s-1',
      )
      expect(summary.key).toBe('alpha/disc-1') // Go generateAutoID 默认前缀
      expect(summary.status).toBe('pending')
      expect(summary.updatedBy).toBe('session:s-1')
      expect(summary.source).toBe('session')
      const row = db.prepare('SELECT * FROM task WHERE project_id = ?').get(project.id) as Record<string, unknown>
      expect(row.task_key).toBe('alpha/disc-1')
      expect(row.status).toBe('pending')
      expect(row.updated_by).toBe('session:s-1')
      expect(String(row.updated_at)).toMatch(ISO_PATTERN)
      expect(row.task_type).toBe('coding.feature')
      expect(row.blockers).toBe('[]')
    })
  })

  it('auto-increments disc-N within the feature namespace and skips taken numbers', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-b')
      const { service } = makeService(db)
      expect(service.taskAdd({ projectId: project.id, featureSlug: 'alpha', title: 'one' }, 'kernel').key).toBe('alpha/disc-1')
      seedTask(db, project.id, 'alpha/disc-3', 'pending') // 手工占位 disc-3
      expect(service.taskAdd({ projectId: project.id, featureSlug: 'alpha', title: 'two' }, 'kernel').key).toBe('alpha/disc-4')
      expect(service.taskAdd({ projectId: project.id, featureSlug: 'beta', title: 'other feature' }, 'kernel').key).toBe('beta/disc-1')
    })
  })

  it('generateAutoTaskId matches the Go generateAutoID scan (prefix cut + numeric max + 1)', () => {
    expect(generateAutoTaskId('disc', [])).toBe('disc-1')
    expect(generateAutoTaskId('disc', ['1.1', '1.2', 'disc-2'])).toBe('disc-3')
    expect(generateAutoTaskId('disc', ['disc-10', 'disc-9'])).toBe('disc-11')
    expect(generateAutoTaskId('disc', ['disc-x', 'disc-', 'disc-007'])).toBe('disc-8')
  })

  it('rejects an explicit duplicate taskKey (ERR_TASK_EXISTS) and a foreign-prefix key (ERR_TASK_KEY_INVALID)', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-c')
      const { service } = makeService(db)
      seedTask(db, project.id, 'alpha/1.1', 'pending')
      const duplicate = capture(() => service.taskAdd({ projectId: project.id, featureSlug: 'alpha', title: 'again', taskKey: 'alpha/1.1' }, 'kernel'))
      expectTaskError(duplicate, 'ERR_TASK_EXISTS', /alpha\/1\.1 already exists/)
      const mismatch = capture(() => service.taskAdd({ projectId: project.id, featureSlug: 'alpha', title: 'wrong prefix', taskKey: 'beta/9.9' }, 'kernel'))
      expectTaskError(mismatch, 'ERR_TASK_KEY_INVALID', /prefix must match featureSlug alpha/)
      const malformed = capture(() => service.taskAdd({ projectId: project.id, featureSlug: 'alpha', title: 'bad key', taskKey: 'alpha/1.1/x' }, 'kernel'))
      expectTaskError(malformed, 'ERR_TASK_KEY_INVALID', /board address/)
      expect(db.prepare('SELECT COUNT(*) AS c FROM task').get()).toMatchObject({ c: 1 }) // 零部分写入
    })
  })

  it('enforces the add-time dependency closure (Go AddTask): exact deps must exist, wildcards must match', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-d')
      const { service } = makeService(db)
      seedTask(db, project.id, 'alpha/1.1', 'completed')
      const unknown = capture(() => service.taskAdd({ projectId: project.id, featureSlug: 'alpha', title: 't', blockers: ['9.9'] }, 'kernel'))
      expectTaskError(unknown, 'ERR_TASK_NOT_FOUND', /dependency not found: 9\.9/)
      const wildcardMiss = capture(() => service.taskAdd({ projectId: project.id, featureSlug: 'alpha', title: 't', blockers: ['7.x'] }, 'kernel'))
      expectTaskError(wildcardMiss, 'ERR_TASK_NOT_FOUND', /wildcard dependency/)
      const ok = service.taskAdd({ projectId: project.id, featureSlug: 'alpha', title: 't', blockers: ['1.1'] }, 'session:s-2')
      expect(ok.blockers).toEqual(['1.1']) // 原词落库
    })
  })

  it('guards the authority boundary: files projects and unknown projects never receive writes', async () => {
    await withDb((db) => {
      const files = registerSqliteProject(db, 'Z:/demo-files', 'files')
      const { service } = makeService(db)
      for (const run of [
        () => service.taskAdd({ projectId: files.id, featureSlug: 'alpha', title: 't' }, 'kernel'),
        () => service.taskClaim({ projectId: files.id, taskKey: 'alpha/1.1' }, 'kernel'),
        () => service.taskTransition({ projectId: files.id, taskKey: 'alpha/1.1', to: 'blocked' }, 'kernel'),
        () => service.taskSubmit({ projectId: files.id, taskKey: 'alpha/1.1' }, 'kernel'),
        () => service.taskReopen({ projectId: files.id, taskKey: 'alpha/1.1' }, 'kernel'),
      ]) {
        expectTaskError(capture(run), 'ERR_TASK_NOT_AUTHORITATIVE', /use the forge CLI/)
      }
      const unknown = capture(() => service.taskAdd({ projectId: 'nope', featureSlug: 'alpha', title: 't' }, 'kernel'))
      expect(unknown).toBeInstanceOf(WorkbenchRepoError)
      expect((unknown as WorkbenchRepoError).code).toBe('ERR_PROJECT_NOT_FOUND')
      expect(db.prepare('SELECT COUNT(*) AS c FROM task').get()).toMatchObject({ c: 0 })
    })
  })

  it('rejects malformed featureSlug and malformed blocker keys', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-e')
      const { service } = makeService(db)
      expectTaskError(
        capture(() => service.taskAdd({ projectId: project.id, featureSlug: 'al/ph/a', title: 't' }, 'kernel')),
        'ERR_TASK_KEY_INVALID',
        /single address segment/,
      )
      expectTaskError(
        capture(() => service.taskAdd({ projectId: project.id, featureSlug: 'alpha', title: 't', blockers: ['1.1/x'] }, 'kernel')),
        'ERR_TASK_KEY_INVALID',
        /local key/,
      )
    })
  })
})

// ---------------------------------------------------------------------------
// 写集动词 7 态矩阵(AC-1:全部经状态机合法边;非法 → ERR_TASK_STATE_INVALID
// 且零部分写入)。期望值直接由 1.2 对拍锁定过的 validateTransition 推导 ——
// 动词 = 状态机的忠实执行面。
// ---------------------------------------------------------------------------

describe('write-set verbs across the 7-state matrix', () => {
  interface VerbCase {
    readonly label: string
    readonly target: TaskStatus
    readonly role: 'claim' | 'submit' | 'reopen' | 'manual'
    readonly run: (service: ReturnType<typeof makeService>['service'], projectId: string, taskKey: string) => TaskSummary
  }

  const makeCases = (): readonly VerbCase[] => [
    { label: 'taskClaim → in_progress', target: 'in_progress', role: 'claim', run: (s, p, key) => s.taskClaim({ projectId: p, taskKey: key }, 'session:s-1') },
    { label: 'taskSubmit → completed', target: 'completed', role: 'submit', run: (s, p, key) => s.taskSubmit({ projectId: p, taskKey: key }, 'session:s-1') },
    { label: 'taskReopen → pending', target: 'pending', role: 'reopen', run: (s, p, key) => s.taskReopen({ projectId: p, taskKey: key }, 'session:s-1') },
    ...ALL_STATUSES.map((to): VerbCase => ({
      label: `taskTransition → ${String(to)} (manual)`,
      target: to,
      role: 'manual',
      run: (s, p, key) => s.taskTransition({ projectId: p, taskKey: key, to, reason: 'matrix' }, 'session:s-1'),
    })),
  ]

  it('each verb matches the statemachine verdict per (from, to, role); rejections leave the row untouched', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-matrix')
      const { service } = makeService(db)
      const CASES = makeCases()
      const DEPS_GUARD = 'dependencies must be checked first'
      const mismatches: string[] = []
      for (const from of ALL_STATUSES) {
        const taskKey = `alpha/${String(from)}`
        for (const testCase of CASES) {
          // 每用例独立种子(from 态 + 旧审计位),断言后丢弃。
          seedTask(db, project.id, taskKey, from, { updatedBy: 'kernel', updatedAt: '2026-01-01T00:00:00.000Z' })
          const verdict = validateTransition(from, testCase.target, testCase.role)
          const needsDeps = verdict !== null && verdict.guardMsg === DEPS_GUARD
          const expectedLegal = verdict === null || needsDeps // 无 blockers → 依赖检查恒过
          const result = capture(() => testCase.run(service, project.id, taskKey))
          if (expectedLegal) {
            if (result instanceof Error) {
              mismatches.push(`${testCase.label} from ${String(from)}: expected legal, got ${(result as Error).message}`)
            } else {
              const summary = result as TaskSummary
              if (summary.status !== testCase.target) mismatches.push(`${testCase.label} from ${String(from)}: landed ${String(summary.status)}`)
              if (summary.updatedBy !== 'session:s-1') mismatches.push(`${testCase.label} from ${String(from)}: updatedBy ${String(summary.updatedBy)}`)
            }
          } else if (!(result instanceof TaskDomainError) || (result as TaskDomainError).code !== 'ERR_TASK_STATE_INVALID') {
            mismatches.push(`${testCase.label} from ${String(from)}: expected ERR_TASK_STATE_INVALID, got ${String(result)}`)
          } else {
            // 零部分写入:status/updated_by/updated_at 原样。
            const row = db.prepare('SELECT * FROM task WHERE task_key = ?').get(taskKey) as Record<string, unknown>
            if (row.status !== from || row.updated_by !== 'kernel' || row.updated_at !== '2026-01-01T00:00:00.000Z') {
              mismatches.push(`${testCase.label} from ${String(from)}: rejected but row mutated`)
            }
          }
          db.prepare('DELETE FROM task WHERE task_key = ?').run(taskKey)
        }
      }
      expect(mismatches, mismatches.join('\n')).toEqual([])
    })
  })

  it('ERR_TASK_STATE_INVALID carries the Go rejection message verbatim (Go guardMsg passthrough)', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-msg')
      const { service } = makeService(db)
      seedTask(db, project.id, 'alpha/1.1', 'completed')
      const submit = capture(() => service.taskSubmit({ projectId: project.id, taskKey: 'alpha/1.1' }, 'session:s-1'))
      expectTaskError(submit, 'ERR_TASK_STATE_INVALID', /task already completed, create a subtask if re-work needed/)
      seedTask(db, project.id, 'alpha/1.2', 'in_progress')
      const reopen = capture(() => service.taskReopen({ projectId: project.id, taskKey: 'alpha/1.2' }, 'session:s-1'))
      expectTaskError(reopen, 'ERR_TASK_STATE_INVALID', /reopen is only for rejected or skipped tasks/)
      seedTask(db, project.id, 'alpha/1.3', 'suspended')
      const submitSuspended = capture(() => service.taskSubmit({ projectId: project.id, taskKey: 'alpha/1.3' }, 'session:s-1'))
      expectTaskError(submitSuspended, 'ERR_TASK_STATE_INVALID', /use forge task transition to resume task first/)
    })
  })

  it('unknown taskKey → ERR_TASK_NOT_FOUND; malformed taskKey → ERR_TASK_KEY_INVALID on every verb', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-nf')
      const { service } = makeService(db)
      for (const run of [
        () => service.taskClaim({ projectId: project.id, taskKey: 'alpha/9.9' }, 'kernel'),
        () => service.taskTransition({ projectId: project.id, taskKey: 'alpha/9.9', to: 'blocked' }, 'kernel'),
        () => service.taskSubmit({ projectId: project.id, taskKey: 'alpha/9.9' }, 'kernel'),
        () => service.taskReopen({ projectId: project.id, taskKey: 'alpha/9.9' }, 'kernel'),
        () => service.taskGet({ projectId: project.id, taskKey: 'alpha/9.9' }),
      ]) {
        expectTaskError(capture(run), 'ERR_TASK_NOT_FOUND', /alpha\/9\.9/)
      }
      for (const run of [
        () => service.taskClaim({ projectId: project.id, taskKey: '1.1' }, 'kernel'),
        () => service.taskGet({ projectId: project.id, taskKey: 'alpha/1.1/x' }),
      ]) {
        expectTaskError(capture(run), 'ERR_TASK_KEY_INVALID')
      }
    })
  })
})

// ---------------------------------------------------------------------------
// taskClaim 依赖终态前置(AC-2:Go claim.go checkDependenciesMet 语义)
// ---------------------------------------------------------------------------

describe('taskClaim dependency terminal-state precondition', () => {
  it('blocks on resolvable non-terminal blockers with their ids verbatim; terminal blockers pass', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-deps')
      const { service } = makeService(db)
      const seedStatus = (localId: string, status: TaskStatus): void => {
        seedTask(db, project.id, `alpha/${localId}`, status)
      }
      seedStatus('1.1', 'completed')
      seedStatus('1.2', 'skipped')
      seedStatus('1.3', 'rejected')
      seedStatus('1.4', 'pending')
      seedStatus('1.5', 'in_progress')
      seedStatus('1.6', 'blocked')
      seedStatus('1.7', 'suspended')

      const claim = (localId: string, blockers: readonly string[]): unknown =>
        capture(() => {
          seedTask(db, project.id, `alpha/${localId}`, 'pending', { blockers })
          return service.taskClaim({ projectId: project.id, taskKey: `alpha/${localId}` }, 'session:s-1')
        })

      expect(claim('2.1', ['1.1'])).not.toBeInstanceOf(Error) // completed 满足
      expect(claim('2.2', ['1.2'])).not.toBeInstanceOf(Error) // skipped 满足
      for (const [localId, blocker] of [['2.3', '1.3'], ['2.4', '1.4'], ['2.5', '1.5'], ['2.6', '1.6'], ['2.7', '1.7']] as const) {
        const error = claim(localId, [blocker])
        expectTaskError(error, 'ERR_TASK_DEPS_UNSATISFIED', new RegExp(`terminal-state precondition.*${blocker}`))
      }
      // 多依赖:任一未终态即拒,消息含全部 unmet 原词。
      const multi = claim('2.8', ['1.1', '1.2', '1.4'])
      expectTaskError(multi, 'ERR_TASK_DEPS_UNSATISFIED', /1\.4/)
    })
  })

  it('rejected blockers do NOT satisfy deps (Go satisfiedStatuses = completed/skipped only)', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-rejected')
      const { service } = makeService(db)
      seedTask(db, project.id, 'alpha/1.1', 'rejected')
      seedTask(db, project.id, 'alpha/2.1', 'pending', { blockers: ['1.1'] })
      expectTaskError(
        capture(() => service.taskClaim({ projectId: project.id, taskKey: 'alpha/2.1' }, 'session:s-1')),
        'ERR_TASK_DEPS_UNSATISFIED',
        /1\.1/,
      )
    })
  })

  it('dangling blockers are vacuously satisfied for claim (Go claim authority) and stored verbatim', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-dangling')
      const { service } = makeService(db)
      // 悬空 9.9:claim 不阻断;blockers 原词保留(显式标记不改写)。
      seedTask(db, project.id, 'alpha/2.1', 'pending', { blockers: ['9.9'] })
      const summary = service.taskClaim({ projectId: project.id, taskKey: 'alpha/2.1' }, 'session:s-7')
      expect(summary.status).toBe('in_progress')
      const row = db.prepare('SELECT blockers FROM task WHERE task_key = ?').get('alpha/2.1') as { blockers: string }
      expect(JSON.parse(row.blockers)).toEqual(['9.9'])
    })
  })

  it('wildcard deps expand over business tasks in the feature namespace (unmet expansions block)', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-wild')
      seedTask(db, project.id, 'alpha/1.1', 'completed')
      seedTask(db, project.id, 'alpha/1.2', 'pending')
      const { service } = makeService(db)
      seedTask(db, project.id, 'alpha/2.1', 'pending', { blockers: ['1.x'] })
      expectTaskError(
        capture(() => service.taskClaim({ projectId: project.id, taskKey: 'alpha/2.1' }, 'session:s-1')),
        'ERR_TASK_DEPS_UNSATISFIED',
        /1\.2/,
      )
      // 满足后放行。
      updateTaskStatus(db, project.id, 'alpha/1.2', 'completed', 'kernel', new Date().toISOString())
      expect(service.taskClaim({ projectId: project.id, taskKey: 'alpha/2.1' }, 'session:s-1').status).toBe('in_progress')
    })
  })

  it('dependency resolution is feature-scoped: a same local id in another feature neither satisfies nor blocks', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-scope')
      seedTask(db, project.id, 'alpha/1.1', 'pending')  // alpha 命名空间内未终态
      seedTask(db, project.id, 'beta/1.1', 'completed') // 别的 feature 的同 id
      const { service } = makeService(db)
      seedTask(db, project.id, 'alpha/2.1', 'pending', { blockers: ['1.1'] })
      expectTaskError(
        capture(() => service.taskClaim({ projectId: project.id, taskKey: 'alpha/2.1' }, 'session:s-1')),
        'ERR_TASK_DEPS_UNSATISFIED',
        /1\.1/,
      )
      seedTask(db, project.id, 'beta/2.1', 'pending', { blockers: ['1.1'] })
      expect(service.taskClaim({ projectId: project.id, taskKey: 'beta/2.1' }, 'session:s-1').status).toBe('in_progress')
    })
  })

  it('blocked-origin claim: unmet deps → ERR_TASK_DEPS_UNSATISFIED; satisfied deps unblock into in_progress', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-blocked')
      const { service } = makeService(db)
      seedTask(db, project.id, 'alpha/1.1', 'in_progress')
      seedTask(db, project.id, 'alpha/2.1', 'blocked', { blockers: ['1.1'] })
      expectTaskError(
        capture(() => service.taskClaim({ projectId: project.id, taskKey: 'alpha/2.1' }, 'session:s-1')),
        'ERR_TASK_DEPS_UNSATISFIED',
      )
      updateTaskStatus(db, project.id, 'alpha/1.1', 'completed', 'kernel', new Date().toISOString())
      expect(service.taskClaim({ projectId: project.id, taskKey: 'alpha/2.1' }, 'session:s-1').status).toBe('in_progress')
    })
  })

  it('manual transition blocked→pending bypasses the dependency check (Go manual-allow edge)', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-manual')
      const { service } = makeService(db)
      seedTask(db, project.id, 'alpha/1.1', 'in_progress')
      seedTask(db, project.id, 'alpha/2.1', 'blocked', { blockers: ['1.1'] })
      const summary = service.taskTransition({ projectId: project.id, taskKey: 'alpha/2.1', to: 'pending', reason: 'operator override' }, 'external')
      expect(summary.status).toBe('pending')
      expect(summary.updatedBy).toBe('external')
    })
  })
})

// ---------------------------------------------------------------------------
// actor 审计(AC-4:每笔写动词记 updated_by + updated_at;updated_by → source 投影)
// ---------------------------------------------------------------------------

describe('actor audit on every write verb', () => {
  it('records updated_by and a fresh updated_at on add/claim/transition/submit/reopen', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-audit')
      const { service } = makeService(db)
      const before = '2026-01-01T00:00:00.000Z'

      const added = service.taskAdd({ projectId: project.id, featureSlug: 'alpha', title: 't', taskKey: 'alpha/1.1' }, 'session:s-1')
      expect(added.updatedBy).toBe('session:s-1')
      expect(added.updatedAt).not.toBe(before)

      db.prepare('UPDATE task SET updated_at = ? WHERE task_key = ?').run(before, 'alpha/1.1')
      const claimed = service.taskClaim({ projectId: project.id, taskKey: 'alpha/1.1' }, 'external')
      expect(claimed.updatedBy).toBe('external')
      const afterClaim = db.prepare('SELECT updated_at FROM task WHERE task_key = ?').get('alpha/1.1') as { updated_at: string }
      expect(afterClaim.updated_at).not.toBe(before)
      expect(afterClaim.updated_at).toMatch(ISO_PATTERN)

      db.prepare('UPDATE task SET updated_at = ? WHERE task_key = ?').run(before, 'alpha/1.1')
      service.taskTransition({ projectId: project.id, taskKey: 'alpha/1.1', to: 'blocked' }, 'kernel')
      expect(db.prepare('SELECT updated_by FROM task WHERE task_key = ?').get('alpha/1.1')).toMatchObject({ updated_by: 'kernel' })

      service.taskTransition({ projectId: project.id, taskKey: 'alpha/1.1', to: 'in_progress' }, 'session:s-2')
      const submitted = service.taskSubmit({ projectId: project.id, taskKey: 'alpha/1.1', recordPath: 'records/alpha-1.1.md' }, 'session:s-2')
      expect(submitted.updatedBy).toBe('session:s-2')

      // reopen 走 rejected/skipped → pending 边。
      seedTask(db, project.id, 'alpha/1.2', 'rejected')
      const reopened = service.taskReopen({ projectId: project.id, taskKey: 'alpha/1.2' }, 'kernel')
      expect(reopened.status).toBe('pending')
      expect(reopened.updatedBy).toBe('kernel')
    })
  })

  it('maps updated_by to the v1 source vocabulary on the sqlite read branch (session/terminal/null)', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-src')
      const { service } = makeService(db)
      seedTask(db, project.id, 'alpha/1.1', 'pending', { updatedBy: 'session:s-9' })
      seedTask(db, project.id, 'alpha/1.2', 'pending', { updatedBy: 'external' })
      seedTask(db, project.id, 'alpha/1.3', 'pending', { updatedBy: 'kernel' })
      const rows = service.taskQuery({ projectId: project.id })
      const byKey = new Map(rows.map(row => [row.key, row]))
      expect(byKey.get('alpha/1.1')).toMatchObject({ source: 'session', updatedBy: 'session:s-9' })
      expect(byKey.get('alpha/1.2')).toMatchObject({ source: 'terminal', updatedBy: 'external' })
      expect(byKey.get('alpha/1.3')).toMatchObject({ source: null, updatedBy: 'kernel' })
    })
  })
})

// ---------------------------------------------------------------------------
// 读路由(AC-3:files → task_snapshot 派生投影;sqlite → task 权威表;
// 置位仅随迁移事务 —— 本任务只读该列)
// ---------------------------------------------------------------------------

describe('read routing by projects.data_authority', () => {
  it('files projects: taskGet/taskQuery serve the task_snapshot projection (M2 behavior unchanged)', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-files-read', 'files')
      upsertTaskSnapshot(db, {
        projectId: project.id,
        taskKey: 'alpha/1.1',
        featureSlug: 'alpha',
        title: 'snapshot title',
        status: 'pending',
        blockers: [],
        branch: null,
        worktree: false,
        source: 'terminal',
        updatedAt: '2026-09-01T00:00:00.000Z',
      })
      seedTask(db, project.id, 'alpha/1.1', 'completed', { title: 'authoritative title' }) // 权威表行存在也不被读
      const { service, filesDetailCalls } = makeService(db)
      const rows = service.taskQuery({ projectId: project.id })
      expect(rows).toHaveLength(1)
      const first = rows[0] as TaskSummary
      expect(first).toMatchObject({ key: 'alpha/1.1', title: 'snapshot title', source: 'terminal' })
      expect(first.updatedBy).toBeUndefined() // files 分支不携带权威审计列
      const detail = service.taskGet({ projectId: project.id, taskKey: 'alpha/1.1' })
      expect(filesDetailCalls).toEqual([[project.id, 'alpha/1.1']]) // M2 详情装配注入复用
      expect(detail.summary.key).toBe('files-branch')
      // 写集在 files 项目恒拒(读路由的另一面)。
      expectTaskError(
        capture(() => service.taskClaim({ projectId: project.id, taskKey: 'alpha/1.1' }, 'kernel')),
        'ERR_TASK_NOT_AUTHORITATIVE',
      )
    })
  })

  it('sqlite projects: reads serve the authoritative task table and ignore snapshots', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-sqlite-read')
      seedTask(db, project.id, 'alpha/1.1', 'completed', { title: 'authoritative title', updatedBy: 'session:s-1' })
      upsertTaskSnapshot(db, {
        projectId: project.id,
        taskKey: 'alpha/1.1',
        featureSlug: 'alpha',
        title: 'stale snapshot title',
        status: 'pending',
        blockers: [],
        branch: null,
        worktree: false,
        source: null,
        updatedAt: '2026-09-01T00:00:00.000Z',
      })
      const { service, filesDetailCalls } = makeService(db)
      const rows = service.taskQuery({ projectId: project.id })
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ key: 'alpha/1.1', title: 'authoritative title', status: 'completed', updatedBy: 'session:s-1' })
      const detail = service.taskGet({ projectId: project.id, taskKey: 'alpha/1.1' })
      expect(detail.summary.title).toBe('authoritative title')
      expect(filesDetailCalls).toEqual([]) // files 装配不参与
    })
  })

  it('flipping the authority column switches the served branch (placement follows the migration transaction)', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-flip', 'files')
      upsertTaskSnapshot(db, {
        projectId: project.id, taskKey: 'alpha/1.1', featureSlug: 'alpha', title: 'snap', status: 'pending',
        blockers: [], branch: null, worktree: false, source: null, updatedAt: '2026-09-01T00:00:00.000Z',
      })
      seedTask(db, project.id, 'alpha/1.1', 'in_progress', { title: 'auth' })
      const { service } = makeService(db)
      expect(getProjectTaskAuthority(db, project.id)).toBe('files')
      expect(service.taskQuery({ projectId: project.id })[0] as TaskSummary).toMatchObject({ title: 'snap' })
      // 迁移事务置位(1.4 前以原位置位模拟):读路由随列切换。
      db.prepare("UPDATE projects SET data_authority = 'sqlite' WHERE id = ?").run(project.id)
      expect(service.taskQuery({ projectId: project.id })[0] as TaskSummary).toMatchObject({ title: 'auth', updatedBy: 'kernel' })
    })
  })

  it('taskQuery filters by featureSlug and status on both branches with M2 ordering (updated_at DESC)', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-filter')
      seedTask(db, project.id, 'alpha/1.1', 'pending', { updatedAt: '2026-09-01T00:00:00.000Z' })
      seedTask(db, project.id, 'alpha/1.2', 'completed', { updatedAt: '2026-09-02T00:00:00.000Z' })
      seedTask(db, project.id, 'beta/1.1', 'pending', { updatedAt: '2026-09-03T00:00:00.000Z' })
      const { service } = makeService(db)
      expect(service.taskQuery({ projectId: project.id }).map(row => row.key)).toEqual(['beta/1.1', 'alpha/1.2', 'alpha/1.1'])
      expect(service.taskQuery({ projectId: project.id, featureSlug: 'alpha' }).map(row => row.key)).toEqual(['alpha/1.2', 'alpha/1.1'])
      expect(service.taskQuery({ projectId: project.id, status: 'pending' }).map(row => row.key)).toEqual(['beta/1.1', 'alpha/1.1'])
      expect(service.taskQuery({ projectId: project.id, featureSlug: 'alpha', status: 'completed' }).map(row => row.key)).toEqual(['alpha/1.2'])
    })
  })

  it('sqlite taskGet assembles the detail: desc_path body, record dialect, authoritative dep chain, session links', async () => {
    await withDb((db) => {
      const scratch = makeScratch()
      const featuresRoot = join(scratch, 'docs', 'features')
      const tasksDir = join(featuresRoot, 'alpha', 'tasks')
      mkdirSync(join(tasksDir, 'records'), { recursive: true })
      writeFileSync(join(tasksDir, '1.1-port.md'), '# port\n\nthe task body', 'utf8')
      writeFileSync(
        join(tasksDir, 'records', '1.1-port.md'),
        '---\ncompleted: 2026-09-24 10:00\nactor: session:s-9\n---\n\n## Summary\nported the repo\n',
        'utf8',
      )
      const project = registerSqliteProject(db, scratch.replaceAll('\\', '/'))
      seedTask(db, project.id, 'alpha/1.0', 'completed', { title: 'upstream zero' })
      seedTask(db, project.id, 'alpha/0.9', 'completed', { title: 'grand upstream', blockers: [] })
      // 1.0 的上游是 0.9 → 传递链两跳。
      db.prepare('UPDATE task SET blockers = ? WHERE task_key = ?').run(JSON.stringify(['0.9']), 'alpha/1.0')
      seedTask(db, project.id, 'alpha/1.1', 'in_progress', {
        blockers: ['1.0'],
        taskType: 'coding.feature',
        descPath: 'alpha/tasks/1.1-port.md',
      })
      recordSessionLink(db, { projectId: project.id, taskKey: 'alpha/1.1', sessionId: 's-42' })
      const { service } = makeService(db, () => featuresRoot)
      const detail = service.taskGet({ projectId: project.id, taskKey: 'alpha/1.1' })
      expect(detail.descriptionMarkdown).toBe('# port\n\nthe task body')
      expect(detail.records).toHaveLength(1)
      expect(detail.records[0]).toMatchObject({ kind: 'coding.feature', source: 'session', summary: 'ported the repo' })
      expect(detail.depChain.map(entry => entry.key)).toEqual(['alpha/0.9', 'alpha/1.0']) // 最上游在前
      expect(detail.links).toHaveLength(1)
      expect(detail.links[0]).toMatchObject({ sessionId: 's-42' })
      expect(detail.summary.updatedBy).toBe('kernel')
    })
  })

  it('sqlite taskGet with missing doc artifacts degrades to empty body/records, and a missing task errors', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-empty')
      seedTask(db, project.id, 'alpha/1.1', 'pending') // 无 desc_path
      const { service } = makeService(db, () => join(makeScratch(), 'docs', 'features'))
      const detail = service.taskGet({ projectId: project.id, taskKey: 'alpha/1.1' })
      expect(detail.descriptionMarkdown).toBe('')
      expect(detail.records).toEqual([])
      expectTaskError(capture(() => service.taskGet({ projectId: project.id, taskKey: 'alpha/9.9' })), 'ERR_TASK_NOT_FOUND')
    })
  })
})

// ---------------------------------------------------------------------------
// task-repo 仓储面(唯一写入口的行级语义)
// ---------------------------------------------------------------------------

describe('task-repo row-level semantics', () => {
  it('updateTaskStatus rewrites status + audit columns only; unknown key → ERR_TASK_NOT_FOUND', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-row')
      const seeded = seedTask(db, project.id, 'alpha/1.1', 'pending', { title: 'keep me', blockers: ['1.0'] })
      const updated = updateTaskStatus(db, project.id, 'alpha/1.1', 'in_progress', 'session:s-1', '2026-09-24T00:00:00.000Z')
      expect(updated).toMatchObject({ status: 'in_progress', updatedBy: 'session:s-1', title: 'keep me', blockers: ['1.0'] })
      expectTaskError(
        capture(() => updateTaskStatus(db, project.id, 'alpha/9.9', 'pending', 'kernel', '2026-09-24T00:00:00.000Z')),
        'ERR_TASK_NOT_FOUND',
      )
      expect(seeded.status).toBe('pending')
    })
  })

  it('insertTask maps UNIQUE violations to ERR_TASK_EXISTS and CHECK rejects out-of-vocabulary status', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-uniq')
      seedTask(db, project.id, 'alpha/1.1', 'pending')
      expectTaskError(capture(() => seedTask(db, project.id, 'alpha/1.1', 'completed')), 'ERR_TASK_EXISTS')
      const bad = capture(() => {
        insertTask(db, {
          projectId: project.id, taskKey: 'alpha/1.2', featureSlug: 'alpha',
          title: 't', status: 'done' as unknown as TaskStatus, blockers: [],
          taskType: null, descPath: null, updatedBy: 'kernel', updatedAt: '2026-09-24T00:00:00.000Z',
        })
      })
      expect(bad).toBeInstanceOf(Error)
      expect(String((bad as Error).message)).toMatch(/CHECK/i)
    })
  })

  it('getProjectTaskAuthority defaults to files and resolves sqlite after placement', async () => {
    await withDb((db) => {
      const project = registerSqliteProject(db, 'Z:/demo-auth', 'files')
      expect(getProjectTaskAuthority(db, project.id)).toBe('files')
      db.prepare("UPDATE projects SET data_authority = 'sqlite' WHERE id = ?").run(project.id)
      expect(getProjectTaskAuthority(db, project.id)).toBe('sqlite')
      expect(getProjectTaskAuthority(db, 'missing')).toBeNull()
    })
  })
})
