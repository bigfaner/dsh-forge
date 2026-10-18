/**
 * 已读游标（mobile 页 localStorage 载体——mobile-ui/1.12 裁决：host read-state 面不建，
 * 未读游标归手机页自持，按配对域隔离；chat 触底写 / drawer 打开拉取 + 轮询合并消费）。
 *
 * 单调语义：写仅在 seq > 现值时落盘（与 host read-state 单调守卫同口径——
 * 防旧值回退）；存储不可用/形状损坏静默降级（models.ts recent 同族纪律）。
 */

export function readCursorKey(pairDomain: string): string {
  return `dshf.mobile.read.${pairDomain}`
}

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 读游标表（sessionId → lastReadSeq）；不可用/损坏 → 空。 */
export function loadReadCursors(storage: KeyValueStore | null, key: string): Record<string, number> {
  if (storage === null) return {}
  try {
    const raw = storage.getItem(key)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: Record<string, number> = {}
    for (const [sessionId, seq] of Object.entries(parsed as Record<string, unknown>)) {
      if (sessionId !== '' && typeof seq === 'number' && Number.isFinite(seq)) out[sessionId] = seq
    }
    return out
  } catch {
    return {}
  }
}

/** 单调写游标：seq > 现值才落盘；存储不可用 → 静默丢弃。 */
export function writeReadCursor(
  storage: KeyValueStore | null,
  key: string,
  sessionId: string,
  seq: number,
): void {
  if (storage === null || !Number.isFinite(seq)) return
  const cursors = loadReadCursors(storage, key)
  if (seq <= (cursors[sessionId] ?? -1)) return
  cursors[sessionId] = seq
  try {
    storage.setItem(key, JSON.stringify(cursors))
  } catch {
    /* 静默降级 */
  }
}
