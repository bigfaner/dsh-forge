// @dsh-forge/git-worktree —— 会话绑定留痕面单测（forge/worktree-bind ignorable 事件：
// Session.append 直写格式 + 读尾部反查 + 词表运行期注册）。
// 外部依赖取证门（AGENTS.md）：写入/读回/恢复全部跑真实官方包——
// @deepseek-ai/cordis + dsh-session-persistence-jsonl（真 JSONL 落盘）+ dsh-session
// （Session.append 公开追加 + SessionStore 恢复路径）。append 生产调用面 = host 进程内
// Session.append 直调（官方 model/selection 同缝——binding-derivation §2.2）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { KNOWN_SESSION_EVENT_TYPES, SessionStore } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHandle } from '@deepseek-ai/dsh-session-persistence'
import {
  WORKTREE_BIND_EVENT_TYPE,
  appendWorktreeBind,
  isWorktreeBindEventType,
  latestWorktreeBindEvent,
  readLatestWorktreeBind,
  registerWorktreeBindVocabulary,
} from './session-attach.js'

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
  root = mkdtempSync(join(tmpdir(), 'git-worktree-bind-'))
  ctx = new Context()
  await ctx.plugin(JsonlSessionPersistence as never, { root, compression: 'none' })
  persistence = (ctx as unknown as { sessionPersistence: typeof persistence }).sessionPersistence
  store = new SessionStore(ctx)
  registerWorktreeBindVocabulary()
})

afterAll(async () => {
  await ctx.shutdown?.()
  ctx.destroy?.()
  rmSync(root, { recursive: true, force: true })
})

const BINDING = { worktreeName: 'wt-a', branch: 'feat/a' } as const

/** 建立一个已落盘（空日志）的会话，返回其 id */
async function seedSession(prefix: string): Promise<string> {
  const id = `${prefix}-${Math.random().toString(36).slice(2, 8)}`
  const h = await persistence.create({ id, createdAt: Date.now(), isSeeded: false, version: 4 })
  await h.flush()
  await h.close()
  return id
}

/** 测试造数：在已持有的写句柄上落一条留痕事件（生产同信封——词表已注册，无 ignorable 标记） */
async function appendBind(handle: Pick<SessionHandle, 'read' | 'append' | 'flush'>, data: { worktreeName: string; branch: string }): Promise<void> {
  const events = (await handle.read()).events
  const nextSeq = events.length > 0 ? events[events.length - 1]!.seq + 1 : 0
  await handle.append([{ type: WORKTREE_BIND_EVENT_TYPE, seq: nextSeq, time: Date.now(), data }])
  await handle.flush()
}

/** 落盘会话 + 写留痕事件一步到位 */
async function seedWithBind(
  prefix: string,
  data: { worktreeName: string; branch: string },
): Promise<string> {
  const id = `${prefix}-${Math.random().toString(36).slice(2, 8)}`
  const h = await persistence.create({ id, createdAt: Date.now(), isSeeded: false, version: 4 })
  try {
    await appendBind(h, data)
  } finally {
    await h.close()
  }
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

describe('词表运行期注册（ignorable 分类的官方机制——#35 先例同径）', () => {
  it('registerWorktreeBindVocabulary 把类型登入官方 KNOWN_SESSION_EVENT_TYPES（幂等）', () => {
    registerWorktreeBindVocabulary()
    registerWorktreeBindVocabulary()
    expect(KNOWN_SESSION_EVENT_TYPES.has(WORKTREE_BIND_EVENT_TYPE)).toBe(true)
  })

  it('appendWorktreeBind 调用即注册（未预注册的干净构建也安全）', () => {
    const calls: Array<{ type: string; data: unknown }> = []
    appendWorktreeBind(
      { append: (type, data) => void calls.push({ type, data }) },
      { worktreeName: 'wt-vocab', branch: 'feat/v' },
    )
    expect(KNOWN_SESSION_EVENT_TYPES.has(WORKTREE_BIND_EVENT_TYPE)).toBe(true)
    expect(calls).toEqual([{ type: WORKTREE_BIND_EVENT_TYPE, data: { worktreeName: 'wt-vocab', branch: 'feat/v' } }])
  })
})

describe('appendWorktreeBind（Session.append 进程内直调——官方活会话面）', () => {
  it('真实官方 Session 上 append 成功：事件入日志、数据快照保真、非模型面', () => {
    const session = store.create(`bind-live-${Math.random().toString(36).slice(2, 8)}`)
    appendWorktreeBind(session, BINDING)
    const events = session.snapshotEvents()
    const bind = events.find((e) => e.type === WORKTREE_BIND_EVENT_TYPE)
    expect(bind).toBeDefined()
    expect(bind?.data).toEqual(BINDING)
    expect(bind?.ignorable).toBeUndefined() // Session.append 信封无 ignorable 设置口——词表注册承担分类
  })

  it('append 抛错原样上抛（fail-soft 与诊断 emit 由调用方承担）；空字段拒绝', () => {
    const boom = new Error('session closed')
    expect(() =>
      appendWorktreeBind(
        { append: () => {
          throw boom
        } },
        BINDING,
      ),
    ).toThrow(boom)
    expect(() => appendWorktreeBind({ append: () => {} }, { worktreeName: '  ', branch: 'feat/a' })).toThrow(
      /worktreeName 必须为非空字符串/,
    )
    expect(() => appendWorktreeBind({ append: () => {} }, { worktreeName: 'wt', branch: '' })).toThrow(
      /branch 必须为非空字符串/,
    )
  })
})

describe('留痕事件落盘格式（真实 JSONL——词表注册后读路径放行）', () => {
  it('句柄写入后重新 open/read 会话日志成功且事件保留（词表注册 = 非毒化）', async () => {
    const id = await seedWithBind('reopen', BINDING)
    const events = await readAll(id)
    const bind = events.find((e) => e.type === WORKTREE_BIND_EVENT_TYPE)
    expect(bind).toBeDefined()
    expect(JSON.parse(JSON.stringify(bind?.data))).toEqual(BINDING)
  })

  it('会话恢复路径安全跳过：SessionStore seed 含留痕事件可恢复且事件保留', async () => {
    const id = await seedWithBind('restore', BINDING)
    const stored = await readAll(id)
    const restored = store.create(`${id}-child`, { seed: structuredClone([...stored]) })
    const snapshot = restored.snapshotEvents()
    const bind = snapshot.find((e) => e.type === WORKTREE_BIND_EVENT_TYPE)
    expect(bind?.data).toEqual(BINDING)
  })
})

describe('读尾部留痕事件（branch 漂移警示数据源）', () => {
  it('latestWorktreeBindEvent / readLatestWorktreeBind 反查最近一次留痕快照', async () => {
    const id = await seedWithBind('tail', { worktreeName: 'wt-old', branch: 'feat/old' })
    const h = await persistence.open(id, 'write')
    try {
      await appendBind(h, BINDING)
    } finally {
      await h.close()
    }
    const events = await readAll(id)
    expect(latestWorktreeBindEvent(events)).toEqual({ seq: 1, ...BINDING })
    await expect(readLatestWorktreeBind(id, { openRead: (sid) => persistence.open(sid, 'read') })).resolves.toEqual(BINDING)
  })

  it('v3→v4 迁移兼容：plugin: 前缀形态的留痕事件读回可识别（迁移把未知事件 type 加 plugin: 前缀）', () => {
    const migrated = [
      {
        type: `plugin:${WORKTREE_BIND_EVENT_TYPE}`,
        seq: 0,
        time: Date.now(),
        data: { worktreeName: 'wt-m', branch: 'feat/m' },
        ignorable: true,
      },
    ] as unknown as readonly SessionEvent[]
    expect(latestWorktreeBindEvent(migrated)).toEqual({ seq: 0, worktreeName: 'wt-m', branch: 'feat/m' })
    expect(isWorktreeBindEventType(`plugin:${WORKTREE_BIND_EVENT_TYPE}`)).toBe(true)
    expect(isWorktreeBindEventType(WORKTREE_BIND_EVENT_TYPE)).toBe(true)
    expect(isWorktreeBindEventType('forge/other')).toBe(false)
  })

  it('无留痕事件的会话返回 null（惰性补写的判定源）', async () => {
    const id = await seedSession('empty')
    expect(latestWorktreeBindEvent(await readAll(id))).toBeNull()
    await expect(readLatestWorktreeBind(id, { openRead: (sid) => persistence.open(sid, 'read') })).resolves.toBeNull()
  })

  it('载荷形状残缺（非字符串字段）不识别——他形不猜', () => {
    const malformed = [
      { type: WORKTREE_BIND_EVENT_TYPE, seq: 0, time: Date.now(), data: { worktreeName: 1, branch: 'b' } },
    ] as unknown as readonly SessionEvent[]
    expect(latestWorktreeBindEvent(malformed)).toBeNull()
  })
})
