// openWorkspace 面安装器单测（bug 267dcac1）：
// ① 面返回 promise（装配层切换闸据此敛棋）；② beforeOpen 草稿迁移（官方 selectWorkspace
// 同语义：新 blank 写入、旧 blank 清空）；③ 同会话/附件在场/shell 缺席 = fail-soft 零动作。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installOpenWorkspaceFace, resolveDraftShellFace, type DraftShellFace } from './open-workspace-face-install.js'

interface Shell extends DraftShellFace {
  readonly attachmentIds: string[]
}

function shellOf(draft: string, attachments: string[] = []): Shell {
  return {
    snapshot: { draft, attachmentIds: attachments },
    // bug 4b89d984：this 敏感方法形态（官方 SessionInputShell.setDraft 依赖 this.draftEditor
    // ——拆出裸调丢 receiver 即 TypeError，真机实证）
    setDraft(this: { _seed?: string[] }, text: string) {
      (this._seed ??= []).push(text)
    },
  } as unknown as Shell
}

function fakeWorld(draft = 'typed text'): {
  openWorkspace: ReturnType<typeof vi.fn>
  face: () => Promise<void>
  from: Shell
  next: Shell
} {
  const from = shellOf(draft)
  const next = shellOf('')
  const openWorkspace = vi.fn(async (_id: string, beforeOpen?: (nextId: string) => void): Promise<void> => {
    beforeOpen?.('next-1')
  })
  const shells: Record<string, Shell> = { 'from-1': from, 'next-1': next }
  const warn = vi.fn()
  installOpenWorkspaceFace({
    uiWorkspace: { openWorkspace, mainReference: { sessionId: 'from-1' } },
    warn,
    resolveShell: (sessionId: string): DraftShellFace | undefined => shells[sessionId],
  })
  const face = (globalThis as unknown as Record<string, unknown>)['__dshForgeOpenWorkspace'] as () => Promise<void>
  return { openWorkspace, face, from, next }
}

describe('openWorkspace 面安装器（bug 267dcac1——promise 契约 + 草稿迁移）', () => {
  beforeEach(() => {
    delete (globalThis as unknown as Record<string, unknown>)['__dshForgeOpenWorkspace']
  })
  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>)['__dshForgeOpenWorkspace']
  })

  it('面返回 promise（官方 openWorkspace 敛棋即 resolve——切换闸敛棋锚）', async () => {
    const world = fakeWorld()
    const result = world.face()
    expect(result).toBeInstanceOf(Promise)
    await result
    expect(world.openWorkspace).toHaveBeenCalledTimes(1)
  })

  it('beforeOpen 草稿迁移：新 blank 写入、旧 blank 清空（官方 selectWorkspace 同语义；调用保 receiver——bug 4b89d984）', async () => {
    const world = fakeWorld('帮我修这个 bug')
    await world.face()
    expect((world.next as unknown as { _seed?: string[] })._seed).toEqual(['帮我修这个 bug'])
    expect((world.from as unknown as { _seed?: string[] })._seed).toEqual([''])
  })

  it('旧会话无草稿 → 零迁移零清空（新 blank 既有草稿不动）', async () => {
    const world = fakeWorld('')
    await world.face()
    expect((world.next as unknown as { _seed?: string[] })._seed).toBeUndefined()
    expect((world.from as unknown as { _seed?: string[] })._seed).toBeUndefined()
  })

  it('旧会话带附件 → 整体跳过（附件迁移依赖官方内部面，fail-soft 不搬）', async () => {
    const from = shellOf('x', ['att-1'])
    const next = shellOf('')
    const shells: Record<string, Shell> = { 'from-1': from, 'next-1': next }
    const openWorkspace = vi.fn(async (_id: string, beforeOpen?: (n: string) => void) => {
      beforeOpen?.('next-1')
    })
    installOpenWorkspaceFace({
      uiWorkspace: { openWorkspace, mainReference: { sessionId: 'from-1' } },
      resolveShell: (id: string) => shells[id],
    })
    const face = (globalThis as unknown as Record<string, unknown>)['__dshForgeOpenWorkspace'] as () => Promise<void>
    await face()
    expect((next as unknown as { _seed?: string[] })._seed).toBeUndefined()
    expect((from as unknown as { _seed?: string[] })._seed).toBeUndefined()
  })

  it('shell 缺席（会话未 retain/面漂移）→ fail-soft 零动作不抛', async () => {
    const openWorkspace = vi.fn(async (_id: string, beforeOpen?: (n: string) => void) => {
      beforeOpen?.('next-1')
    })
    installOpenWorkspaceFace({
      uiWorkspace: { openWorkspace, mainReference: { sessionId: 'from-1' } },
      resolveShell: () => undefined,
    })
    const face = (globalThis as unknown as Record<string, unknown>)['__dshForgeOpenWorkspace'] as () => Promise<void>
    await expect(face()).resolves.toBeUndefined()
  })
})

// ───────── bug 4b89d984 resolveDraftShellFace（形状适配单源；this 敏感 setDraft 保 receiver）─────────

describe('resolveDraftShellFace（bug 4b89d984）', () => {
  /** this 敏感官方 shell 同形桩（setDraft 依赖 this——拆出裸调即 TypeError） */
  function officialLikeShell(draft: string): unknown {
    return {
      snapshot: { draft, attachmentIds: [] },
      setDraft(text: string) {
        (this as { seeds?: string[] }).seeds ??= []
        ;(this as { seeds?: string[] }).seeds!.push(text)
      },
    }
  }

  function ctxOf(shell: unknown): { clientCtx: unknown; sessions: unknown } {
    const actx = { marker: 'actx' }
    const sessions = { binding: (id: string) => (id === 's-1' ? { ctx: actx } : undefined) }
    const clientCtx = {
      reflect: {
        get: (name: string) =>
          name === 'conversation'
            ? { input: { for: (a: unknown) => (a === actx ? shell : undefined) } }
            : undefined,
      },
    }
    return { clientCtx, sessions }
  }

  it('setDraft 经包装调用保 receiver——官方 this 敏感实现不炸且落 this 态（真机 4b89d984 回归钉）', () => {
    const shell = officialLikeShell('typed')
    const { clientCtx, sessions } = ctxOf(shell)
    const face = resolveDraftShellFace(clientCtx, sessions, 's-1')
    expect(face?.snapshot.draft).toBe('typed')
    expect(() => face!.setDraft('migrated')).not.toThrow()
    expect((shell as { seeds?: string[] }).seeds).toEqual(['migrated'])
  })

  it('未 retain 会话（binding 缺席）/ conversation 面缺席 / shell 形状漂移 → undefined fail-soft', () => {
    const shell = officialLikeShell('x')
    const { clientCtx, sessions } = ctxOf(shell)
    expect(resolveDraftShellFace(clientCtx, sessions, 's-other')).toBeUndefined()
    expect(resolveDraftShellFace({ reflect: { get: () => undefined } }, sessions, 's-1')).toBeUndefined()
    expect(resolveDraftShellFace(ctxOf({ snapshot: 1 }).clientCtx, ctxOf({ snapshot: 1 }).sessions, 's-1')).toBeUndefined()
  })
})
