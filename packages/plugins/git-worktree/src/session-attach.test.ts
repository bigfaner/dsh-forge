// @dsh-forge/git-worktree —— 会话绑定面单测（挂靠事件唯一写入口 + 读尾部 + meta.cwd 注入 + 封存判定）。
// 外部依赖取证门（AGENTS.md）：写入/读回/恢复全部跑真实官方包——
// @deepseek-ai/cordis + dsh-session-persistence-jsonl（真 JSONL 落盘）+ dsh-session（SessionStore 恢复路径）。
// 配方依据：探针报告 .forge/docs/probes/worktree-attach-event/probe-report.md。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { SessionStore } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHandle } from '@deepseek-ai/dsh-session-persistence'
import {
  WORKTREE_ATTACH_EVENT_TYPE,
  createWorktreeAttachWriter,
  latestAttachEvent,
  readLatestAttach,
  withWorktreeCwd,
} from './session-attach.js'
import { SessionCwdMismatchError, SessionSealedError, assertSendable, assertSessionCwdMatches, evaluateSeal } from './seal-guard.js'

let root: string
let ctx: Context
let persistence: {
  create(header: {
    id: string
    createdAt: number
    isSeeded: boolean
    version: 4
  }): Promise<SessionHandle>
  open(id: string, access: 'read' | 'write'): Promise<SessionHandle>
}
let store: SessionStore

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'git-worktree-attach-'))
  ctx = new Context()
  await ctx.plugin(JsonlSessionPersistence as never, { root, compression: 'none' })
  persistence = (ctx as unknown as { sessionPersistence: typeof persistence }).sessionPersistence
  store = new SessionStore(ctx)
})

afterAll(async () => {
  await ctx.shutdown?.()
  ctx.destroy?.()
  rmSync(root, { recursive: true, force: true })
})

const header = (id: string, cwd?: string) => ({
  id,
  createdAt: Date.now(),
  isSeeded: false as const,
  version: 4 as const,
  ...(cwd !== undefined ? { cwd } : {}),
})

/** 建立一个已落盘（空日志）的会话，返回其 id（cwd = SessionHeader.cwd，cwd 守护测试用） */
async function seedSession(prefix: string, cwd?: string): Promise<string> {
  const id = `${prefix}-${Math.random().toString(36).slice(2, 8)}`
  const h = await persistence.create(header(id, cwd))
  await h.flush()
  await h.close()
  return id
}

/** 读取全会话事件 */
async function readAll(id: string): Promise<readonly SessionEvent[]> {
  const h = await persistence.open(id, 'read')
  try {
    return (await h.read()).events
  } finally {
    await h.close()
  }
}

describe('挂靠事件唯一写入口（createWorktreeAttachWriter）', () => {
  it('经 SessionHandle.append 直写 forge/worktree-attach：ignorable:true、data 可序列化、seq 自管理连续', async () => {
    const id = await seedSession('seq')
    const writer = createWorktreeAttachWriter({
      openWrite: (sid) => persistence.open(sid, 'write'),
    })
    await writer.attach(id, { worktreePath: 'Z:/repo/.forge/worktrees/wt-a', branch: 'feat/a' })
    await writer.attach(id, { worktreePath: 'Z:/repo/.forge/worktrees/wt-a', branch: 'feat/a' })

    const events = await readAll(id)
    const attachEvents = events.filter((e) => e.type === WORKTREE_ATTACH_EVENT_TYPE)
    expect(attachEvents).toHaveLength(2)
    for (const ev of attachEvents) {
      expect(ev.ignorable).toBe(true) // 强制信封：漏写即毒化整条日志
      expect(JSON.parse(JSON.stringify(ev.data))).toEqual({
        worktreePath: 'Z:/repo/.forge/worktrees/wt-a',
        branch: 'feat/a',
      })
    }
    expect(attachEvents.map((e) => e.seq)).toEqual([0, 1]) // 本进程内重读：seq 连续
  })

  it('写入后重新 open/read 会话日志成功且事件保留（非 ignorable 毒化面被封装挡住）', async () => {
    const id = await seedSession('reopen')
    const writer = createWorktreeAttachWriter({
      openWrite: (sid) => persistence.open(sid, 'write'),
    })
    await writer.attach(id, { worktreePath: 'C:/wt/b', branch: 'feat/b' })

    const events = await readAll(id) // fresh open：validateStoredEvents 放行 ignorable
    expect(events.some((e) => e.type === WORKTREE_ATTACH_EVENT_TYPE && e.ignorable === true)).toBe(true)
  })

  it('会话恢复路径安全跳过：SessionStore seed 含 ignorable 挂靠事件可恢复且事件保留', async () => {
    const id = await seedSession('restore')
    const writer = createWorktreeAttachWriter({
      openWrite: (sid) => persistence.open(sid, 'write'),
    })
    await writer.attach(id, { worktreePath: 'C:/wt/c', branch: 'feat/c' })
    const stored = await readAll(id)

    const restored = store.create(`${id}-child`, { seed: structuredClone([...stored]) })
    const snapshot = restored.snapshotEvents()
    const attach = snapshot.find((e) => e.type === WORKTREE_ATTACH_EVENT_TYPE)
    expect(attach?.ignorable).toBe(true) // 未知类型 + ignorable → surface 恢复安全跳过（不入 surface、保留 opaque）
  })

  it('封装面锁定：唯一写入口之外无自定义事件写通道', async () => {
    const writer = createWorktreeAttachWriter({
      openWrite: (sid) => persistence.open(sid, 'write'),
    })
    // 写入口只暴露 attach：不泄漏 append/信封构造，调用方无法写任意自定义事件
    expect(Object.keys(writer).sort()).toEqual(['attach'])
    // 模块公开面不含通用 append/信封构造器
    const module = await import('./session-attach.js')
    for (const key of Object.keys(module)) {
      expect(key.startsWith('append') || key.includes('Envelope')).toBe(false)
    }
  })
})

describe('读尾部挂靠事件（会话绑定反查）', () => {
  it('latestAttachEvent / readLatestAttach 反查最近一次绑定的 worktree 与分支', async () => {
    // cwd 守护基准：header.cwd = 最新绑定树（预铸配方形态）
    const id = await seedSession('tail', 'C:/wt/new')
    const writer = createWorktreeAttachWriter({
      openWrite: (sid) => persistence.open(sid, 'write'),
    })
    await writer.attach(id, { worktreePath: 'C:/wt/old', branch: 'feat/old' })
    await writer.attach(id, { worktreePath: 'C:/wt/new', branch: 'feat/new' })

    const events = await readAll(id)
    expect(latestAttachEvent(events)).toEqual({
      seq: 1,
      worktreePath: 'C:/wt/new',
      branch: 'feat/new',
    })
    await expect(readLatestAttach(id, { openRead: (sid) => persistence.open(sid, 'read') })).resolves.toEqual({
      worktreePath: 'C:/wt/new',
      branch: 'feat/new',
    })
  })

  it('v3→v4 迁移兼容：plugin: 前缀形态的挂靠事件读回可识别（迁移把未知事件 type 加 plugin: 前缀）', async () => {
    const migrated = [
      {
        type: 'plugin:forge/worktree-attach',
        seq: 0,
        time: Date.now(),
        data: { worktreePath: 'C:/wt/migrated', branch: 'feat/m' },
        ignorable: true,
      },
    ] as unknown as readonly SessionEvent[]
    expect(latestAttachEvent(migrated)).toEqual({
      seq: 0,
      worktreePath: 'C:/wt/migrated',
      branch: 'feat/m',
    })
  })

  it('无挂靠事件的会话返回 null', async () => {
    const id = await seedSession('empty')
    await expect(latestAttachEvent(await readAll(id))).toBeNull()
    await expect(readLatestAttach(id, { openRead: (sid) => persistence.open(sid, 'read') })).resolves.toBeNull()
  })
})

describe('挂靠会话 cwd 强制守护（1.19）', () => {
  it('assertSessionCwdMatches：归一比对一致放行；不一致抛 SessionCwdMismatchError；缺席（历史会话）放行', () => {
    expect(() => assertSessionCwdMatches('C:/wt/a', 'C:\\WT\\A')).not.toThrow()
    expect(() => assertSessionCwdMatches('C:/wt/b', 'C:/wt/a')).toThrow(SessionCwdMismatchError)
    expect(() => assertSessionCwdMatches(undefined, 'C:/wt/a')).not.toThrow()
    expect(() => assertSessionCwdMatches('  ', 'C:/wt/a')).not.toThrow()
  })

  it('readLatestAttach：header.cwd = 绑定树 → 放行；漂移（绑定 A 树跑在 B 树）→ 显式报错不静默', async () => {
    const writer = createWorktreeAttachWriter({
      openWrite: (sid) => persistence.open(sid, 'write'),
    })
    const ok = await seedSession('cwd-ok', 'Z:/repo/.forge/worktrees/wt-a')
    await writer.attach(ok, { worktreePath: 'Z:/repo/.forge/worktrees/wt-a', branch: 'feat/a' })
    await expect(readLatestAttach(ok, { openRead: (sid) => persistence.open(sid, 'read') })).resolves.toMatchObject({
      worktreePath: 'Z:/repo/.forge/worktrees/wt-a',
    })

    const drift = await seedSession('cwd-drift', 'Z:/repo')
    await writer.attach(drift, { worktreePath: 'Z:/repo/.forge/worktrees/wt-a', branch: 'feat/a' })
    await expect(
      readLatestAttach(drift, { openRead: (sid) => persistence.open(sid, 'read') }),
    ).rejects.toThrow(SessionCwdMismatchError)
  })
})

describe('建会话 meta.cwd 注入（withWorktreeCwd）', () => {
  it('SessionHeader.cwd 生效：注入所选 worktree 路径', () => {
    const session = store.create('cwd-session', withWorktreeCwd({}, 'Z:/repo/.forge/worktrees/wt-a'))
    expect(session.header.cwd).toBe('Z:/repo/.forge/worktrees/wt-a')
  })

  it('既有 meta 字段保留，cwd 不覆盖调用方已设值之外的键', () => {
    const options = withWorktreeCwd({ meta: { agentPreset: 'p1' } }, 'C:/wt/x')
    expect(options).toMatchObject({ meta: { agentPreset: 'p1', cwd: 'C:/wt/x' } })
  })
})

describe('封存判定 + 发送拦截面（seal-guard）', () => {
  it('挂靠 worktree 在场 → 不封存', () => {
    expect(evaluateSeal({ worktreePath: 'C:/wt/a', branch: 'feat/a' }, ['C:/wt/a', 'C:/repo'])).toEqual({
      sealed: false,
    })
  })

  it('挂靠 worktree 缺失 → 封存（路径分隔符/大小写口径归一后比对）', () => {
    expect(evaluateSeal({ worktreePath: 'C:\\wt\\a', branch: 'feat/a' }, ['c:/WT/b'])).toEqual({
      sealed: true,
      reason: 'worktree-missing',
    })
  })

  it('无绑定的会话不受封存判定影响', () => {
    expect(evaluateSeal(null, [])).toEqual({ sealed: false })
  })

  it('1.27 主树绑定恒不封存（主树恒在场——worktreePath = 项目根在全量在场集内）', () => {
    // git worktree list 恒含主树本身 → 项目根绑定的封存判定恒假
    expect(evaluateSeal({ worktreePath: 'C:/repo', branch: 'main' }, ['C:/repo', 'C:/repo/.forge/worktrees/wt-a'])).toEqual({
      sealed: false,
    })
  })

  it('发送拦截面：封存会话 assertSendable 拒绝并给出明确错误提示', () => {
    expect(() => assertSendable({ sealed: true, reason: 'worktree-missing' })).toThrow(SessionSealedError)
    expect(() => assertSendable({ sealed: true, reason: 'worktree-missing' })).toThrow(/worktree 已删除/)
    expect(() => assertSendable({ sealed: false })).not.toThrow()
  })
})
