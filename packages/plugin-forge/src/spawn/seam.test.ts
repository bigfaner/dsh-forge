// spawn 替换缝 + 回放计划驱动器 pin（worker-exec-evidence-replay fix-1——AC1 注入面）。
// 覆盖：一次性替换缝取摘语义；计划驱动器（taskKey, occurrence）匹配 / abort 无结算死亡 /
// script 动作序（tool→runTool 会话身份、fs-write 工作区围栏、git-commit 哈希代位 '$commit'
// 哨兵）/ 键漂移 spawn 拒绝 / 计划载入形状门。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SpawnWorker, SpawnWorkerRequest } from '../dispatch-core/index.js'
import {
  createPlanReplaySpawn,
  loadReplayPlanFromEnv,
  setForgeSpawnOverride,
  takeForgeSpawnOverride,
  writeReplayPlan,
  type PlanToolRunner,
  type ReplayPlan,
} from './seam.js'

function requestOf(label: string, signal: AbortSignal = new AbortController().signal): SpawnWorkerRequest {
  return { prompt: 'P', parent: {}, signal, toolFilter: { deny: [] }, label }
}

/** 隔离 git 仓工作区（fs-write/git-commit 动作作用域） */
function makeWs(): string {
  const ws = mkdtempSync(join(tmpdir(), 'forge-seam-ws-'))
  execFileSync('git', ['init'], { cwd: ws, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.email', 'seam@example.invalid'], { cwd: ws, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.name', 'seam-test'], { cwd: ws, stdio: 'pipe' })
  writeFileSync(join(ws, 'base.txt'), 'base\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: ws, stdio: 'pipe' })
  execFileSync('git', ['commit', '-m', 'base'], { cwd: ws, stdio: 'pipe' })
  return ws
}

const noopRunner: PlanToolRunner = async () => undefined

describe('spawn 一次性替换缝', () => {
  afterEach(() => {
    takeForgeSpawnOverride() // 清残留——测试隔离
  })

  it('take 即摘：装配取走后二次取为 undefined（防跨装配泄漏）', async () => {
    expect(takeForgeSpawnOverride()).toBeUndefined()
    const seen: string[] = []
    const stub: SpawnWorker = async (req) => {
      seen.push(req.label ?? '')
      return { workerSessionId: 'w1', result: Promise.resolve({ stopReason: 'completed', output: '' }), dispose: async () => {} }
    }
    const dispose = setForgeSpawnOverride(stub)
    expect(takeForgeSpawnOverride()).toBe(stub)
    expect(takeForgeSpawnOverride()).toBeUndefined()
    dispose() // 摘除器幂等不误伤
  })

  it('摘除器：未取走径直接摘除（装配结束清理）', async () => {
    const stub: SpawnWorker = async () => {
      throw new Error('not used')
    }
    const dispose = setForgeSpawnOverride(stub)
    dispose()
    expect(takeForgeSpawnOverride()).toBeUndefined()
  })
})

describe('回放计划驱动器（taskKey × occurrence 匹配）', () => {
  it('script：动作依序执行——tool 会话身份（裸 uuid + cwd 路由）、fs-write、git-commit 哨兵代位', async () => {
    const ws = makeWs()
    try {
      const toolCalls: { name: string; args: Record<string, unknown>; sessionId: string }[] = []
      const plan: ReplayPlan = {
        version: 1,
        workspaceDir: ws,
        entries: [
          {
            taskKey: 'feat-x/1.1',
            occurrence: 1,
            behavior: 'script',
            actions: [
              { kind: 'fs-write', relPath: join('docs', 'out.md'), content: 'done\n' },
              { kind: 'git-commit', message: 'docs: out', paths: ['docs/out.md'] },
              { kind: 'tool', name: 'submitTask', args: { slug: 'feat-x', local_id: '1.1', commit_hash: '$commit' } },
            ],
          },
        ],
      }
      const spawn = createPlanReplaySpawn(plan, async (name, args, sessionId) => {
        toolCalls.push({ name, args, sessionId })
        return 'ok'
      })
      const handle = await spawn(requestOf('feat-x/1.1 · 创建 out.md'))
      expect(handle.workerSessionId).toMatch(/^[0-9a-f-]{36}$/)
      const settled = await handle.result
      expect(settled.stopReason).toBe('completed')
      expect(readFileSync(join(ws, 'docs', 'out.md'), 'utf8')).toBe('done\n')
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls[0]!.name).toBe('submitTask')
      expect(toolCalls[0]!.sessionId).toBe(handle.workerSessionId)
      expect((toolCalls[0]!.args.commit_hash as string).length).toBeGreaterThanOrEqual(7)
      expect(toolCalls[0]!.args.commit_hash).not.toBe('$commit')
      const gitLog = execFileSync('git', ['log', '--format=%s'], { cwd: ws, encoding: 'utf8' })
      expect(gitLog).toContain('docs: out')
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })

  it('abort：句柄即回（spawn 成功）而 result 拒绝——无结算死亡面', async () => {
    const plan: ReplayPlan = {
      version: 1,
      workspaceDir: 'unused',
      entries: [{ taskKey: 'feat-x/1.1', occurrence: 1, behavior: 'abort', message: 'worker run ended without a settlement (replay halt)' }],
    }
    const handle = await createPlanReplaySpawn(plan, noopRunner)(requestOf('feat-x/1.1 · halted 靶'))
    expect(handle.workerSessionId).toMatch(/^[0-9a-f-]{36}$/)
    await expect(handle.result).rejects.toThrow('worker run ended without a settlement')
  })

  it('occurrence 递增：同任务两次派发命中两条目；同键同次重派拒绝（幂等重入面外漂移）', async () => {
    const plan: ReplayPlan = {
      version: 1,
      workspaceDir: 'unused',
      entries: [
        { taskKey: 'f/1.1', occurrence: 1, behavior: 'abort', message: 'abort #1' },
        { taskKey: 'f/1.1', occurrence: 2, behavior: 'script', actions: [{ kind: 'tool', name: 'submitTask', args: {} }] },
      ],
    }
    const spawn = createPlanReplaySpawn(plan, noopRunner)
    const h1 = await spawn(requestOf('f/1.1 · a'))
    await expect(h1.result).rejects.toThrow('abort #1')
    const h2 = await spawn(requestOf('f/1.1 · a'))
    await expect(h2.result).resolves.toMatchObject({ stopReason: 'completed' })
    await expect(spawn(requestOf('f/1.1 · a'))).rejects.toThrow('回放键漂移')
  })

  it('键漂移：无匹配条目 = spawn 拒绝（绝不回落真实模型）', async () => {
    const plan: ReplayPlan = { version: 1, workspaceDir: 'unused', entries: [] }
    const spawn = createPlanReplaySpawn(plan, noopRunner)
    await expect(spawn(requestOf('other/9.9 · x'))).rejects.toThrow('回放键漂移')
  })

  it('cwd 钉定核销（1.14）：钉定检出 = 计划工作区（拼写变体归一）→ 照常；错位检出 → spawn 拒绝并自解释', async () => {
    const ws = makeWs()
    try {
      const plan: ReplayPlan = {
        version: 1,
        workspaceDir: ws,
        entries: [{ taskKey: 'f/1.1', occurrence: 1, behavior: 'abort', message: 'abort #pin' }],
      }
      const spawn = createPlanReplaySpawn(plan, noopRunner)
      const h = await spawn({ ...requestOf('f/1.1 · x'), workspaceCwd: ws.replaceAll('\\', '/') })
      await expect(h.result).rejects.toThrow('abort #pin')
      await expect(
        spawn({ ...requestOf('f/1.1 · x'), workspaceCwd: join(ws, '..') }),
      ).rejects.toThrow(/\[replay-plan\] cwd 钉定冲突/)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })

  it('fs-write 路径逃逸工作区 = 拒绝（围栏）', async () => {
    const ws = makeWs()
    try {
      const plan: ReplayPlan = {
        version: 1,
        workspaceDir: ws,
        entries: [
          { taskKey: 'f/1.1', occurrence: 1, behavior: 'script', actions: [{ kind: 'fs-write', relPath: join('..', 'escape.md'), content: 'x' }] },
        ],
      }
      const handle = await createPlanReplaySpawn(plan, noopRunner)(requestOf('f/1.1 · x'))
      await expect(handle.result).rejects.toThrow('fs-write 路径逃逸工作区')
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  })

  it('dispose 后续步拒绝（回放收尾中止）', async () => {
    const plan: ReplayPlan = {
      version: 1,
      workspaceDir: 'unused',
      entries: [
        {
          taskKey: 'f/1.1',
          occurrence: 1,
          behavior: 'script',
          actions: [
            { kind: 'tool', name: 'submitTask', args: {} },
            { kind: 'tool', name: 'submitTask', args: {} },
          ],
        },
      ],
    }
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const handle = await createPlanReplaySpawn(plan, async () => {
      calls += 1
      if (calls === 2) await gate // 第二步挂起——为 dispose 中止制造在途回放窗
      return 'ok'
    })(requestOf('f/1.1 · x'))
    await handle.dispose() // 先置 disposed 再放行——第二步恢复即撞收尾中止
    release()
    await expect(handle.result).rejects.toThrow('disposed')
    expect(calls).toBe(2)
  })
})

describe('回放计划载入（env 缝）', () => {
  it('env 缺席 = undefined（缝不生效——生产装配零影响）', () => {
    expect(loadReplayPlanFromEnv({})).toBeUndefined()
    expect(loadReplayPlanFromEnv({ DSH_FORGE_REPLAY_PLAN: '' })).toBeUndefined()
  })

  it('在场但文件缺席 = fail-loud；形状违例 = fail-loud；合法计划照载', () => {
    expect(() => loadReplayPlanFromEnv({ DSH_FORGE_REPLAY_PLAN: join(tmpdir(), 'definitely-missing-plan.json') })).toThrow('不存在')
    const dir = mkdtempSync(join(tmpdir(), 'forge-seam-plan-'))
    try {
      const bad = join(dir, 'bad.json')
      writeFileSync(bad, JSON.stringify({ version: 2, entries: [] }), 'utf8')
      expect(() => loadReplayPlanFromEnv({ DSH_FORGE_REPLAY_PLAN: bad })).toThrow('形状违例')
      const emptyScript = join(dir, 'empty.json')
      writeFileSync(emptyScript, JSON.stringify({ version: 1, workspaceDir: 'w', entries: [{ taskKey: 'f/1', occurrence: 1, behavior: 'script', actions: [] }] }), 'utf8')
      expect(() => loadReplayPlanFromEnv({ DSH_FORGE_REPLAY_PLAN: emptyScript })).toThrow('动作列不可为空')
      const good = join(dir, 'good.json')
      const plan: ReplayPlan = { version: 1, workspaceDir: 'w', entries: [{ taskKey: 'f/1', occurrence: 1, behavior: 'abort' }] }
      writeReplayPlan(good, plan)
      expect(loadReplayPlanFromEnv({ DSH_FORGE_REPLAY_PLAN: good })).toEqual(plan)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
