// chip-restore（定位：装配——bug 4b34e5d8 重建缝）：官方草稿搬迁（selectWorkspace inject
// nextId≠sessionId 时 from.snapshot.draft 纯文本 → next.setDraft）与持久化种子
// （setDraft(storedDraft)）两缝都只搬 clipboard 投影文本、不搬 chip 节点——@bug 引用 chip
// 一旦离开活编辑器即退化为明文 @[摘要](bug:<id>)。本缝在会话作用域内订阅 InputState，
// 扫出未 chip 化投影段（pendingBugChipRestores 单源），经官方 scoped 事件
// `slash/input-insert-reference` span-CAS 逐段还原为 chip。
//
// 收敛不变量：reference.clipboardText 逐字等于命中文本 → 重建后 clipboard 投影不变、
// occurrence 覆盖命中段 → pending 清零，订阅通知不再触发（零环路）。
// 相位安全：bail 由官方相位守卫（claimed/submitting 拒）+ span-CAS 把关；拒绝即停——
// 同帧不重试（投影未变则无新通知，无复发环）。
//
// bundle 自含纪律（client-plugin 同族）：上游服务面以结构同型镜像窄接口承载（open-session
// 同径）；本文件零上游 import。
import { pendingBugChipRestores } from './bug-source.js'
import {
  INPUT_INSERT_REFERENCE_EVENT,
  type ComposerInputFace,
  type ReferenceInsertMirror,
  type ReferenceInsertServices,
  type TokenSpanMirror,
} from './open-session.js'

/** 重建用 source 名（= FORGE_BUG_SOURCE_NAME 字面；此处字面承载避免反向依赖 plugin.ts） */
const RESTORE_SOURCE_NAME = 'dswf-bug'

/** 单轮重建上限（防御性——正常至多逐段收敛即停） */
const MAX_REBUILDS_PER_PASS = 8

/**
 * 解析会话输入面（binding 缺席 / for 抛错 / state 窄面缺席 = undefined）。
 */
function faceOf(services: ReferenceInsertServices, sessionId: string): ComposerInputFace | undefined {
  const binding = services.sessions.binding(sessionId)
  if (binding === undefined) return undefined
  try {
    const face = services.conversation.input.for(binding.ctx)
    return face?.state === undefined ? undefined : face
  } catch {
    return undefined
  }
}

/**
 * 应用判据（bug 4b34e5d8 重建径专用——比 open-session 尾插复核严）：occurrences 增长
 * 才算落位。草稿尾接投影兜底（referenceApplied 第二判）在重建径误报——重建命中段可在
 * 草稿任意位置，明文草稿天然以投影结尾。occurrences 窄面缺席 = 判未落（停，不重试）。
 */
function restoreApplied(
  before: { readonly occurrences?: readonly unknown[] },
  after: { readonly occurrences?: readonly unknown[] } | undefined,
): boolean {
  if (after === undefined) return false
  if (before.occurrences === undefined || after.occurrences === undefined) return false
  return after.occurrences.length > before.occurrences.length
}

/**
 * 单轮重建：左起逐段——每段重取快照（span-CAS 的 draftRev 随插入递增，帧帧刷新），
 * 应用判据 = restoreApplied（occurrences 增长），未落即停（同帧不重试）。
 * 返回是否应用过至少一段。
 */
function rebuildPass(services: ReferenceInsertServices, sessionId: string): boolean {
  const face = faceOf(services, sessionId)
  if (face === undefined) return false
  let appliedAny = false
  for (let i = 0; i < MAX_REBUILDS_PER_PASS; i += 1) {
    let before: ReturnType<NonNullable<ComposerInputFace['state']>['getSnapshot']> | undefined
    try {
      before = face.state?.getSnapshot()
    } catch {
      return appliedAny
    }
    if (before === undefined) return appliedAny
    const pending = pendingBugChipRestores(before)
    const first = pending[0]
    if (first === undefined) return appliedAny
    const reference: ReferenceInsertMirror = {
      source: RESTORE_SOURCE_NAME,
      ref: `bug:${first.bugId}`,
      label: first.label,
      clipboardText: first.clipboardText,
    }
    const span: TokenSpanMirror = { start: first.start, end: first.end, draftRev: before.draftRev }
    let applied: unknown
    try {
      applied = services.bail(
        services.sessions.binding(sessionId)?.ctx,
        INPUT_INSERT_REFERENCE_EVENT,
        { reference, span },
      )
    } catch {
      return appliedAny
    }
    let after: { readonly occurrences?: readonly unknown[] } | undefined
    try {
      after = face.state?.getSnapshot()
    } catch {
      return appliedAny
    }
    if (applied !== true && !restoreApplied(before, after)) {
      return appliedAny
    }
    appliedAny = true
  }
  return appliedAny
}

/**
 * 会话作用域 chip 重建缝：挂载即单轮重建 + （state.subscribe 在场）订阅通知驱动重建。
 * 返回解绑 disposer（订阅缺席 = no-op disposer——一次性重建已完成）。
 * 零聚焦：重建是后台还原本体，不得抢键盘焦点（open-session 快速路径的 focus 语义不同径）。
 *
 * 通知重入防御（bug 4b34e5d8 修复期实证）：官方 setDraft 种子在 Lexical discrete update
 * 内同步 publish → 监听若就地重建，插入落进中途态、随种子的 clear() 一起被提交吞掉
 * （刷新后草稿整条蒸发）。故通知驱动的重建恒推离当前栈（microtask）+ 合并突发。
 */
export function watchBugChipRestore(services: ReferenceInsertServices, sessionId: string): () => void {
  const face = faceOf(services, sessionId)
  if (face === undefined) return () => undefined
  rebuildPass(services, sessionId)
  const subscribe = face.state?.subscribe
  if (typeof subscribe !== 'function') return () => undefined
  let scheduled = false
  try {
    return subscribe.call(face.state, () => {
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        rebuildPass(services, sessionId)
      })
    })
  } catch {
    return () => undefined
  }
}
