// bug 1dd4b437 根治：手机已读游标原存页面 localStorage（按 origin 含端口隔离）——
// 实例重启端口更换即游标表整体丢失，未读全量误报。Root cause: 状态载体选型以
// 「origin 稳定」为承重前提（mobile-ui/1.12 裁决），该前提被端口 churn 实证推翻。
// 修复 = host 侧持久 store（JSON 0600 同型缝——psk-gate createDevicePubStore 范式），
// 单调写与原 read-cursor 同口径（seq ≤ 现值拒绝——防旧值回退）。
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 已读游标持久 store（sessionId → lastReadSeq；跨重启/跨端口存活）。 */
export interface ReadCursorStore {
  get(sessionId: string): number | undefined
  getAll(): Record<string, number>
  /** 单调写：seq ≤ 现值时静默拒绝。 */
  set(sessionId: string, seq: number): void
}

export function createReadCursorStore(file: string): ReadCursorStore {
  const map = new Map<string, number>()
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    for (const [sessionId, seq] of Object.entries(raw)) {
      if (sessionId !== '' && typeof seq === 'number' && Number.isSafeInteger(seq)) map.set(sessionId, seq)
    }
  } catch {
    /* 缺席/损坏 = 空表起算 */
  }
  const persist = (): void => {
    try {
      const out: Record<string, number> = {}
      for (const [sessionId, seq] of map) out[sessionId] = seq
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(out), { mode: 0o600 })
    } catch {
      /* 持久化失败不阻调用面（未读仅 UX 面） */
    }
  }
  return {
    get: (sessionId) => map.get(sessionId),
    getAll: () => Object.fromEntries(map),
    set: (sessionId, seq) => {
      if (sessionId === '' || !Number.isSafeInteger(seq)) return
      if (seq <= (map.get(sessionId) ?? -1)) return
      map.set(sessionId, seq)
      persist()
    },
  }
}
