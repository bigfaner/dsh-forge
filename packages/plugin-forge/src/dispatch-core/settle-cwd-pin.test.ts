// 1.14 判例修复（bug 台账：worker 会话未钉定 worktree、提交落 main——判例 366bec6a）定向单测：
// ① settleWorkerRun 提交落点核验——success + commitHash + 容器检出现在场时核验「commit 所属
//    分支 = 容器检出分支」；不一致/核验故障 = landing-rejected 显式处置——任务 completed →
//    interrupted 真化（bug d8029b20：不得走 worker-abort 阶梯静默接受错分支提交）；
// ② 缺席容器检出（工具壳径）= 零核验，行为零变化；blocked 径不核验；
// ③ gitCommitLanding 真核验（临时 git 仓）：落点命中/落错分支/detached HEAD 三态。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService, QueryTaskResult, TaskSnapshot, TransitionTaskInput } from '@dsh-forge/contracts'
import { settleWorkerRun, gitCommitLanding } from './settle.js'
import type { CommitLandingVerifier } from './settle.js'
import type { SpawnWorkerHandle } from './spawn.js'

function snapshot(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    taskId: 't-1',
    slug: 'feat-x',
    localId: '2.5',
    source: { kind: 'feature', slug: 'feat-x' },
    title: 'Implement the thing',
    taskType: 'coding-feature',
    taskStatus: 'in_progress',
    breaking: false,
    complexity: 'high',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    ...over,
  }
}

function handle(): SpawnWorkerHandle {
  return { workerSessionId: 'worker-1', result: Promise.resolve({ stopReason: 'completed', output: '' }), dispose: async () => {} }
}

function tasksStub(query: QueryTaskResult, transitions?: TransitionTaskInput[]): ForgeTasksService {
  return {
    queryTask: async () => query,
    transitionTask: async (input: TransitionTaskInput) => {
      transitions?.push(input)
      return snapshot({ taskStatus: input.toStatus })
    },
    taskStats: async () => ({
      total: 1,
      byStatus: { pending: 0, in_progress: 0, blocked: 0, completed: 1, skipped: 0, rejected: 0, suspended: 0, interrupted: 0 },
      unmetPending: 0,
    }),
    listTasks: async () => [],
  } as unknown as ForgeTasksService
}

function completedQuery(commitHash: string | undefined): QueryTaskResult {
  return {
    task: snapshot({ taskStatus: 'completed' }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records: [
      {
        verb: 'submit',
        toStatus: 'completed',
        summary: '实现+单测绿',
        ...(commitHash !== undefined ? { commitHash } : {}),
        actor: 'plugin-tool',
        createdAt: '2026-10-11T01:00:00.000Z',
      },
    ],
  }
}

const okLanding: CommitLandingVerifier = async (dir) => ({ ok: true, branch: dir === 'Z:\\wt' ? 'feat-x' : 'other' })
const badLanding: CommitLandingVerifier = async () => ({ ok: false, branch: 'feat-x', commitBranches: ['main'] })
const boomLanding: CommitLandingVerifier = async () => {
  throw new Error('git not found')
}

describe('1.14 · 提交落点核验（settleWorkerRun cwd 钉定收口）', () => {
  it('落点命中（commit 分支 = 容器检出分支）→ settled 照常', async () => {
    const settlement = await settleWorkerRun(
      { tasks: tasksStub(completedQuery('abc1234')), commitLanding: okLanding },
      { projectId: 'p-1', task: snapshot(), digest: 'd', handle: handle(), spawnStartedAt: Date.now(), worktreeCwd: 'Z:\\wt' },
    )
    expect(settlement.case).toBe('settled')
  })

  it('跨分支结算特例：纯 .forge/docs/ 文档提交落错分支 → 放行 settled（用户裁决 2026-10-24）', async () => {
    const docsQuery: QueryTaskResult = {
      task: snapshot({ taskType: 'doc', taskStatus: 'completed', title: '撰写契约文档' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [
        {
          verb: 'submit',
          toStatus: 'completed',
          summary: '文档落盘',
          commitHash: 'abc1234',
          files: ['.forge/docs/features/feat-x/design/api-contract.md', '.forge/docs/proposals/feat-x/proposal.md'],
          actor: 'plugin-tool',
          createdAt: '2026-10-11T01:00:00.000Z',
        },
      ],
    }
    const settled = await settleWorkerRun(
      { tasks: tasksStub(docsQuery), commitLanding: badLanding },
      { projectId: 'p-1', task: snapshot({ taskType: 'doc', taskStatus: 'completed' }), digest: 'd', handle: handle(), spawnStartedAt: Date.now(), worktreeCwd: 'Z:\\wt' },
    )
    expect(settled.case).toBe('settled')
  })

  it('特例 fail-closed：files 缺席或含文档外路径 → 仍 landing-rejected', async () => {
    const base = (files?: string[]): QueryTaskResult => ({
      task: snapshot({ taskType: 'doc', taskStatus: 'completed' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [
        {
          verb: 'submit',
          toStatus: 'completed',
          summary: '提交',
          commitHash: 'abc1234',
          ...(files !== undefined ? { files } : {}),
          actor: 'plugin-tool',
          createdAt: '2026-10-11T01:00:00.000Z',
        },
      ],
    })
    const noFiles = await settleWorkerRun(
      { tasks: tasksStub(base(undefined)), commitLanding: badLanding },
      { projectId: 'p-1', task: snapshot(), digest: 'd', handle: handle(), spawnStartedAt: Date.now(), worktreeCwd: 'Z:\\wt' },
    )
    expect(noFiles.case).toBe('landing-rejected')
    const mixed = await settleWorkerRun(
      { tasks: tasksStub(base(['.forge/docs/a.md', 'packages/core/src/index.ts'])), commitLanding: badLanding },
      { projectId: 'p-1', task: snapshot(), digest: 'd', handle: handle(), spawnStartedAt: Date.now(), worktreeCwd: 'Z:\\wt' },
    )
    expect(mixed.case).toBe('landing-rejected')
  })

  it('落点不一致（判例 366bec6a 落 main）→ landing-rejected 显式处置：任务真化 interrupted（可恢复态）+ cause 自解释', async () => {
    const transitions: TransitionTaskInput[] = []
    const settlement = await settleWorkerRun(
      { tasks: tasksStub(completedQuery('abc1234'), transitions), commitLanding: badLanding },
      { projectId: 'p-1', task: snapshot(), digest: 'd', handle: handle(), spawnStartedAt: Date.now(), worktreeCwd: 'Z:\\wt' },
    )
    expect(settlement.case).toBe('landing-rejected')
    if (settlement.case !== 'landing-rejected') return
    expect(settlement.cause).toBeInstanceOf(Error)
    expect(settlement.cause.message).toContain('[settle-cwd-pin]')
    expect(settlement.cause.message).toContain('feat-x')
    expect(settlement.cause.message).toContain('main')
    // 显式处置：completed → interrupted（合法边——任务可恢复，不 completed 挂死）
    expect(transitions).toEqual([
      { projectId: 'p-1', taskId: 't-1', toStatus: 'interrupted', reason: expect.stringContaining('[settle-cwd-pin]'), actor: 'core' },
    ])
  })

  it('核验故障（git 不可用）→ landing-rejected 显式处置（fail-loud——落点判据不成立不静默）', async () => {
    const transitions: TransitionTaskInput[] = []
    const settlement = await settleWorkerRun(
      { tasks: tasksStub(completedQuery('abc1234'), transitions), commitLanding: boomLanding },
      { projectId: 'p-1', task: snapshot(), digest: 'd', handle: handle(), spawnStartedAt: Date.now(), worktreeCwd: 'Z:\\wt' },
    )
    expect(settlement.case).toBe('landing-rejected')
    if (settlement.case !== 'landing-rejected') return
    expect(settlement.cause.message).toContain('git not found')
    expect(transitions).toHaveLength(1)
    expect(transitions[0]?.toStatus).toBe('interrupted')
  })

  it('容器检出席席（工具壳径）= 零核验行为零变化；blocked 径与无 commitHash 径不核验', async () => {
    let called = 0
    const counting: CommitLandingVerifier = async () => {
      called += 1
      return { ok: false, branch: 'feat-x', commitBranches: ['main'] }
    }
    const noWorktree = await settleWorkerRun(
      { tasks: tasksStub(completedQuery('abc1234')), commitLanding: counting },
      { projectId: 'p-1', task: snapshot(), digest: 'd', handle: handle(), spawnStartedAt: Date.now() },
    )
    expect(noWorktree.case).toBe('settled')
    const noCommit = await settleWorkerRun(
      { tasks: tasksStub(completedQuery(undefined)), commitLanding: counting },
      { projectId: 'p-1', task: snapshot(), digest: 'd', handle: handle(), spawnStartedAt: Date.now(), worktreeCwd: 'Z:\\wt' },
    )
    expect(noCommit.case).toBe('settled')
    const blockedQuery: QueryTaskResult = {
      task: snapshot({ taskStatus: 'blocked' }),
      container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
      records: [{ verb: 'submit', toStatus: 'blocked', reason: 'e2e red', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }],
    }
    const blocked = await settleWorkerRun(
      { tasks: tasksStub(blockedQuery), commitLanding: counting },
      { projectId: 'p-1', task: snapshot(), digest: 'd', handle: handle(), spawnStartedAt: Date.now(), worktreeCwd: 'Z:\\wt' },
    )
    expect(blocked.case).toBe('settled')
    expect(called).toBe(0)
  })
})

describe('1.14 · gitCommitLanding 真核验（临时 git 仓）', () => {
  function initRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'settle-cwd-pin-'))
    const git = (args: string[]): void => {
      execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
    }
    git(['init', '-b', 'feat-x'])
    git(['config', 'user.email', 'settle-pin@example.invalid'])
    git(['config', 'user.name', 'settle-pin'])
    execFileSync('git', ['commit', '--allow-empty', '-m', 'base'], { cwd: dir })
    return dir
  }

  it('提交落当前检出分支 → ok:true', async () => {
    const dir = initRepo()
    try {
      const hash = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      await expect(gitCommitLanding(dir, hash)).resolves.toEqual({ ok: true, branch: 'feat-x' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('提交只在其它分支（落错分支形态）→ ok:false 带两分支名', async () => {
    const dir = initRepo()
    try {
      execFileSync('git', ['-C', dir, 'checkout', '-b', 'stray'], { encoding: 'utf8' })
      execFileSync('git', ['commit', '--allow-empty', '-m', 'stray commit'], { cwd: dir })
      const hash = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      execFileSync('git', ['-C', dir, 'checkout', 'feat-x'], { encoding: 'utf8' })
      const verdict = await gitCommitLanding(dir, hash)
      expect(verdict).toEqual({ ok: false, branch: 'feat-x', commitBranches: ['stray'] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('detached HEAD（无检出分支）→ 抛出（落点判据不成立）', async () => {
    const dir = initRepo()
    try {
      execFileSync('git', ['-C', dir, 'checkout', '--detach'], { encoding: 'utf8' })
      const hash = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      await expect(gitCommitLanding(dir, hash)).rejects.toThrow(/detached HEAD/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
