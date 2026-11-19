// I4 逐连接 foreign_keys 断言——拒开路径（plugin-project 1.7 RED 锚①）：
// 回读非 1 即 ForeignKeysUnavailableError（vi.mock better-sqlite3 桩模拟 FK 不可用环境——
// SQLite 编译剔除 FK 时 PRAGMA 写入不生效；逐连接生效的 happy path 断言在 db.test.ts）。
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// 桩匹配真实 Database 形状的最小面（openDatabase 只触 pragma/prepare/transaction/exec/close）。
function stubDb(fkReadback: number) {
  return {
    pragma: vi.fn((sql: string, opts?: { simple?: boolean }) => {
      if (sql === 'foreign_keys') return opts?.simple ? fkReadback : [{ foreign_keys: fkReadback }]
      if (sql === 'journal_mode = WAL') return opts?.simple ? 'wal' : [{ journal_mode: 'wal' }]
      return []
    }),
    prepare: vi.fn(() => ({ get: vi.fn(() => undefined), run: vi.fn() })),
    transaction: vi.fn((fn: () => unknown) => () => fn()),
    exec: vi.fn(),
    close: vi.fn(),
  }
}

type Stub = ReturnType<typeof stubDb>
let seeded: Stub | undefined

vi.mock('better-sqlite3', () => {
  const DatabaseCtor = function () {
    if (!seeded) throw new Error('stub db not seeded')
    return seeded
  }
  return { default: DatabaseCtor }
})

const { openDatabase } = await import('./open.js')
const { ForeignKeysUnavailableError, isForeignKeysUnavailableError } = await import('./errors.js')

describe('I4 foreign_keys 逐连接断言（拒开路径）', () => {
  it('回读非 1 → ForeignKeysUnavailableError 拒开（句柄已关闭）', () => {
    const stub = stubDb(0)
    seeded = stub
    expect(() => openDatabase(join(tmpdir(), `lib-db-fk-off-${Date.now()}.db`))).toThrow(
      ForeignKeysUnavailableError,
    )
    expect(stub.close).toHaveBeenCalledOnce()
    expect(isForeignKeysUnavailableError(new ForeignKeysUnavailableError())).toBe(true)
    expect(isForeignKeysUnavailableError(new Error('x'))).toBe(false)
  })
})
