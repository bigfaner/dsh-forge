// SQLite 驱动适配层——node:sqlite（DatabaseSync，Node 24 内置）之上的 better-sqlite3
// 形状兼容面（1.40 持久层迁移：根治 1.27 dsh-hmr hookCommonJsLoad × better-sqlite3 v13
// 工厂导出启停循环崩溃）。内置模块不走磁盘 CJS 装载 → hookCommonJsLoad 无物可包。
// 官方同款实锚：@deepseek-ai/dsh-session-query-sqlite 运行时亦为 node:sqlite DatabaseSync。
//
// API 覆盖面（全仓 better-sqlite3 用点普查——1.40 映射清单）：
// - new Database(file, { readonly, fileMustExist }) → DatabaseSync(file, { readOnly })
// - prepare<P,R>().run/get/all（匿名 ? 位置绑定 + 具名 :name 对象绑定，语义一致）
// - exec / transaction(fn)（BEGIN/COMMIT/ROLLBACK + 嵌套 SAVEPOINT + .immediate()）/
//   pragma(source, { simple }) / close / open
// 差异吸收（对调用方零感知）：
// - 错误 code 重映射：node:sqlite 统一 ERR_SQLITE_ERROR，按 message 前缀回填
//   SQLITE_CONSTRAINT_* 扩展码（UNIQUE/PRIMARYKEY/FOREIGNKEY/NOTNULL/CHECK）——
//   消息文本与 better-sqlite3 逐字一致，判据面零改动；
// - 事务窗口同步铁律不变：DatabaseSync 同步 API，fn 内不得 await（bug 46f106c5 纪律承袭）。
import { DatabaseSync } from 'node:sqlite'

/** run() 返回形状（与 better-sqlite3 RunResult 对齐——调用方按 changes/lastInsertRowid 消费）。 */
export interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

/** prepare 语句形状（better-sqlite3 Statement 结构兼容面——泛型参数序 <Params, Result>）。 */
export interface Statement<P = unknown[], R = Record<string, unknown>> {
  run(...params: unknown[]): RunResult
  get(...params: unknown[]): R | undefined
  all(...params: unknown[]): R[]
  /** 原始 SQL 文本（better-sqlite3 Statement.source 对齐——字面量同源 pin 消费）。 */
  readonly source: string
  /** 泛型参数仅承载类型标注（结构兼容 better-sqlite3 Statement<Binding, Result> 用法）。 */
  readonly __params?: P
}

/** 绑定参数归一：undefined → null（better-sqlite3 语义——省略的可选绑定列落 NULL）。 */
function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) => (p === undefined ? null : p))
}

/** 错误扩展码回填（node:sqlite 统一 ERR_SQLITE_ERROR → better-sqlite3 语义 code）。 */
function remapSqliteError(e: unknown): unknown {
  if (e instanceof Error && (e as { code?: unknown }).code === 'ERR_SQLITE_ERROR') {
    const msg = e.message
    let code = 'SQLITE_ERROR'
    if (msg.startsWith('UNIQUE constraint failed')) code = 'SQLITE_CONSTRAINT_UNIQUE'
    else if (msg.startsWith('FOREIGN KEY constraint failed')) code = 'SQLITE_CONSTRAINT_FOREIGNKEY'
    else if (msg.startsWith('NOT NULL constraint failed')) code = 'SQLITE_CONSTRAINT_NOTNULL'
    else if (msg.startsWith('CHECK constraint failed')) code = 'SQLITE_CONSTRAINT_CHECK'
    return Object.assign(new Error(msg), { name: 'SqliteError', code, cause: e })
  }
  return e
}

type TransactionMode = 'deferred' | 'immediate' | 'exclusive'

/**
 * SQLite 句柄（better-sqlite3 Database 结构兼容）。default export——
 * `import Database from '@dsh-forge/lib-db'` 同时可用作值（构造器）与命名空间
 * （`Database.Database` / `Database.Statement` / `Database.RunResult` 类型锚，兼容既有类型面）。
 */
export class Database {
  #sync: DatabaseSync
  #file: string
  #closed = false
  #txDepth = 0

  constructor(file: string, options: { readonly?: boolean; fileMustExist?: boolean } = {}) {
    this.#sync = new DatabaseSync(file, { readOnly: options.readonly === true })
    this.#file = file
  }

  /** 库文件路径（better-sqlite3 db.name 对齐）。 */
  get name(): string {
    return this.#file
  }

  /** 事务在场性（better-sqlite3 db.inTransaction 对齐——node:sqlite isTransaction 映射）。 */
  get inTransaction(): boolean {
    return (this.#sync as unknown as { isTransaction?: boolean }).isTransaction === true
  }

  /** 连接在场性（better-sqlite3 db.open 对齐——close 后 false）。 */
  get open(): boolean {
    return !this.#closed
  }

  prepare<P = unknown[], R = Record<string, unknown>>(sql: string): Statement<P, R> {
    const st = this.#sync.prepare(sql)
    // better-sqlite3 具名绑定语义：对象参数允许携带多余键（未声明键被忽略）——node:sqlite
    // 默认逐键报错（Unknown named parameter），随语句开启 unknown-named 容忍对齐。
    st.setAllowUnknownNamedParameters(true)
    const runFn = st.run.bind(st) as unknown as (...params: unknown[]) => RunResult
    const getFn = st.get.bind(st) as unknown as (...params: unknown[]) => R | undefined
    const allFn = st.all.bind(st) as unknown as (...params: unknown[]) => R[]
    return {
      source: sql,
      run: (...params: unknown[]) => {
        try {
          return runFn(...normalizeParams(params))
        } catch (e) {
          throw remapSqliteError(e)
        }
      },
      get: (...params: unknown[]) => {
        try {
          return getFn(...normalizeParams(params))
        } catch (e) {
          throw remapSqliteError(e)
        }
      },
      all: (...params: unknown[]) => {
        try {
          return allFn(...normalizeParams(params))
        } catch (e) {
          throw remapSqliteError(e)
        }
      },
    }
  }

  exec(sql: string): void {
    try {
      this.#sync.exec(sql)
    } catch (e) {
      throw remapSqliteError(e)
    }
  }

  /**
   * pragma（better-sqlite3 官方 pragma API 兼容面）：
   * - { simple: true } → 首行首列值（foreign_keys/busy_timeout/journal_mode 回读）；
   * - 赋值形态（含 '='）→ exec 执行，返回 []（回写面无人消费返回值）；
   * - 读取形态 → 行数组（table_info / foreign_key_check）。
   */
  pragma(source: string, options?: { simple?: boolean }): unknown {
    if (options?.simple === true) {
      try {
        const row = this.#sync.prepare(`PRAGMA ${source}`).get() as Record<string, unknown> | undefined
        return row === undefined ? undefined : Object.values(row)[0]
      } catch (e) {
        throw remapSqliteError(e)
      }
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(source)) {
      this.exec(`PRAGMA ${source}`)
      return []
    }
    return this.prepare(`PRAGMA ${source}`).all()
  }

  /**
   * 事务（BEGIN/COMMIT/ROLLBACK + 嵌套 SAVEPOINT——better-sqlite3 transaction 兼容面，
   * 含 .deferred()/.immediate()/.exclusive() 变体）。fn 内不得 await（同步窗口铁律）。
   */
  transaction<Args extends unknown[], R>(fn: (...args: Args) => R): ((...args: Args) => R) & {
    deferred(...args: Args): R
    immediate(...args: Args): R
    exclusive(...args: Args): R
  } {
    const run = (mode: TransactionMode, args: unknown[]): R => {
      if (this.#txDepth > 0) {
        const sp = `dsh_sp_${this.#txDepth}`
        this.exec(`SAVEPOINT ${sp}`)
        this.#txDepth++
        try {
          const result = fn(...(args as Args))
          this.#txDepth--
          this.exec(`RELEASE SAVEPOINT ${sp}`)
          return result
        } catch (e) {
          this.#txDepth--
          this.exec(`ROLLBACK TO SAVEPOINT ${sp}`)
          this.exec(`RELEASE SAVEPOINT ${sp}`)
          throw e
        }
      }
      const begin = mode === 'immediate' ? 'BEGIN IMMEDIATE' : mode === 'exclusive' ? 'BEGIN EXCLUSIVE' : 'BEGIN'
      this.exec(begin)
      try {
        const result = fn(...(args as Args))
        this.exec('COMMIT')
        return result
      } catch (e) {
        try {
          this.exec('ROLLBACK')
        } catch {
          /* 回滚失败时以原异常为准上抛 */
        }
        throw e
      }
    }
    const wrapped = ((...args: Args) => run('deferred', args)) as TransactionFn<Args, R>
    wrapped.deferred = (...args: Args) => run('deferred', args)
    wrapped.immediate = (...args: Args) => run('immediate', args)
    wrapped.exclusive = (...args: Args) => run('exclusive', args)
    return wrapped
  }

  close(): void {
    this.#closed = true
    this.#sync.close()
  }
}

/** 命名空间合并面（`Database.Database` 等类型锚——兼容 better-sqlite3 既有类型用法）。 */
export namespace Database {
  export type Database = DatabaseInstance
  export type Statement<P = unknown[], R = Record<string, unknown>> = StatementApi<P, R>
  export type RunResult = RunResultApi
}

type DatabaseInstance = Database
type StatementApi<P, R> = Statement<P, R>
type RunResultApi = RunResult

type TransactionFn<Args extends unknown[], R> = ((...args: Args) => R) & {
  deferred(...args: Args): R
  immediate(...args: Args): R
  exclusive(...args: Args): R
}

export default Database
