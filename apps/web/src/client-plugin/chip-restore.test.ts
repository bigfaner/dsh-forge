// chip-restore 测试（定位：单测——bug 4b34e5d8 重建缝：纯文本草稿 → 官方 scoped 事件
// span-CAS 重建 chip；零 DOM / 零真实 RPC——bail/state 全注入替身）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { INPUT_INSERT_REFERENCE_EVENT, type ReferenceInsertServices } from './open-session.js'
import { watchBugChipRestore } from './chip-restore.js'

/** 可编程输入面（快照队列 + 订阅收集——重放循环逐帧取帧） */
function fixture(options: {
  /** 每次 getSnapshot 依序出帧；末帧重复取用 */
  frames: Array<{ draft: string; draftRev: number; occurrences?: Array<{ offset: number; length: number }> }>
  bailResult?: unknown
  bailThrows?: boolean
  subscribe?: boolean
}) {
  const frames = [...options.frames]
  let index = 0
  const unsub = vi.fn()
  const listeners: Array<() => void> = []
  const face = {
    // 窄面同型（setDraft/submit/focus 重建径零消费——占位满足 ComposerInputFace 形状）
    setDraft: () => undefined,
    submit: () => undefined,
    focus: () => undefined,
    state: {
      getSnapshot: vi.fn(() => {
        const frame = frames[Math.min(index, frames.length - 1)] as {
          draft: string
          draftRev: number
          occurrences?: Array<{ offset: number; length: number }>
        }
        index += 1
        return frame
      }),
      ...(options.subscribe === true
        ? { subscribe: (listener: () => void) => {
            listeners.push(listener)
            return unsub
          } }
        : {}),
    },
  }
  const bail = vi.fn((..._args: unknown[]) => {
    if (options.bailThrows === true) throw new Error('bail boom')
    return options !== undefined && 'bailResult' in options ? options.bailResult : true
  })
  const actx = { bail }
  const services: ReferenceInsertServices = {
    sessions: { binding: (id) => (id === 's-1' ? { ctx: actx } : undefined) },
    conversation: { input: { for: () => face } },
    bail: (subject, name, payload) => bail(subject, name, payload),
  }
  return { services, face, bail, actx, unsub, listeners }
}

const AFTER = vi.fn()

afterEach(() => {
  AFTER.mockReset()
})

describe('watchBugChipRestore（bug 4b34e5d8——纯文本草稿 chip 重建缝）', () => {
  it('首帧明文投影 → bail 收 span-CAS + T1 同构 reference；chip 落位（occurrences 增长）后循环收敛', () => {
    const f = fixture({
      frames: [
        { draft: 'x @[修 bug](bug:bg-1) 尾', draftRev: 3 },
        { draft: 'x @[修 bug](bug:bg-1) 尾', draftRev: 4, occurrences: [{ offset: 2, length: '@[修 bug](bug:bg-1)'.length }] },
      ],
    })
    const dispose = watchBugChipRestore(f.services, 's-1')
    expect(f.bail).toHaveBeenCalledTimes(1)
    expect(f.bail).toHaveBeenCalledWith(f.actx, INPUT_INSERT_REFERENCE_EVENT, {
      reference: {
        source: 'dswf-bug',
        ref: 'bug:bg-1',
        label: '修 bug',
        clipboardText: '@[修 bug](bug:bg-1)',
      },
      span: { start: 2, end: 2 + '@[修 bug](bug:bg-1)'.length, draftRev: 3 },
    })
    dispose()
  })

  it('零 pending（已是 chip / 无引用）= 零 bail', () => {
    const f = fixture({ frames: [{ draft: '普通文本', draftRev: 1 }] })
    const dispose = watchBugChipRestore(f.services, 's-1')
    expect(f.bail).not.toHaveBeenCalled()
    dispose()
  })

  it('多命中逐个重建：左起逐帧推进，draftRev 随帧刷新', () => {
    const len1 = '@[a](bug:bg-1)'.length
    // 每轮迭代消耗两帧（before + after 复核）——f0 before / f1 after / f2 before / f3 after
    const f = fixture({
      frames: [
        { draft: '@[a](bug:bg-1) 中 @[b](bug:bg-2)', draftRev: 1 },
        { draft: '@[a](bug:bg-1) 中 @[b](bug:bg-2)', draftRev: 2, occurrences: [{ offset: 0, length: len1 }] },
        { draft: '@[a](bug:bg-1) 中 @[b](bug:bg-2)', draftRev: 2, occurrences: [{ offset: 0, length: len1 }] },
        { draft: '@[a](bug:bg-1) 中 @[b](bug:bg-2)', draftRev: 3, occurrences: [{ offset: 0, length: len1 }, { offset: len1 + 2, length: '@[b](bug:bg-2)'.length }] },
      ],
    })
    const dispose = watchBugChipRestore(f.services, 's-1')
    expect(f.bail).toHaveBeenCalledTimes(2)
    const second = f.bail.mock.calls[1]?.[2] as { span: { start: number; draftRev: number } }
    expect(second.span.draftRev).toBe(2)
    dispose()
  })

  it('bail 拒绝 = 循环即停（同帧不重试——防投影未变时的复发环）', () => {
    const f = fixture({
      frames: [
        { draft: '@[a](bug:bg-1)', draftRev: 1 },
        { draft: '@[a](bug:bg-1)', draftRev: 1 },
      ],
      bailResult: undefined,
    })
    const dispose = watchBugChipRestore(f.services, 's-1')
    expect(f.bail).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('订阅在场：通知驱动重建（microtask 推离——同步栈内不落编辑）；disposer 解绑', async () => {
    const f = fixture({
      subscribe: true,
      frames: [
        { draft: '空', draftRev: 0 },
        { draft: '@[a](bug:bg-1)', draftRev: 5 },
        { draft: '@[a](bug:bg-1)', draftRev: 6, occurrences: [{ offset: 0, length: 14 }] },
      ],
    })
    const dispose = watchBugChipRestore(f.services, 's-1')
    expect(f.bail).not.toHaveBeenCalled() // 首帧零 pending
    const listener = f.listeners[0]
    expect(listener).toBeDefined()
    listener?.()
    expect(f.bail).not.toHaveBeenCalled() // 同步栈内不重建（重入防御）
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(f.bail).toHaveBeenCalledTimes(1)
    expect(f.unsub).not.toHaveBeenCalled()
    dispose()
    expect(f.unsub).toHaveBeenCalledTimes(1)
  })

  it('binding 缺席 / state 窄面缺席 = no-op disposer（fail-soft 不外溢）', () => {
    const absent = watchBugChipRestore({ ...emptyServices() }, 's-other')
    absent()
    const faceless = fixture({ frames: [{ draft: '', draftRev: 0 }] })
    delete (faceless.face as { state?: unknown }).state
    const dispose = watchBugChipRestore(faceless.services, 's-1')
    dispose()
  })
})

function emptyServices(): ReferenceInsertServices {
  return {
    sessions: { binding: () => undefined },
    conversation: { input: { for: () => undefined as never } },
    bail: () => undefined,
  }
}
