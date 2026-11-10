// db 层机制错误（非业务错误码——业务错误面归 @dsh-forge/contracts，本模块零域语义）。

/** 库内 schema 版本超出本应用支持上限（前向单向迁移：旧应用打开新 schema 不支持，明确拒绝）。 */
export class UnsupportedSchemaVersionError extends Error {
  readonly currentVersion: number
  readonly supportedVersion: number

  constructor(currentVersion: number, supportedVersion: number) {
    super(
      `数据库 schema 版本 ${currentVersion} 超出本应用支持上限 ${supportedVersion}` +
        `（前向迁移单向，旧应用不支持新 schema）——已拒绝打开`,
    )
    this.name = 'UnsupportedSchemaVersionError'
    this.currentVersion = currentVersion
    this.supportedVersion = supportedVersion
  }
}

/**
 * 已应用迁移的语句指纹与当前代码不一致（已发布迁移被直改——多谱系库的根源，明确拒开）。
 * 处置指引：恢复原语句，或重建库（删除库文件让迁移全量重放）。
 */
export class MigrationTamperedError extends Error {
  readonly version: number

  constructor(version: number) {
    super(
      `迁移版本 ${version} 的语句指纹与库内已录指纹不一致（已发布迁移被修改）——已拒绝打开。` +
        `处置：恢复该版本原语句，或删除库文件重建（数据如需保留，请先手工备份后按指引迁移）`,
    )
    this.name = 'MigrationTamperedError'
    this.version = version
  }
}

/** 运行期判别（跨 IPC / 日志附载后仍可识别）。 */
export function isMigrationTamperedError(e: unknown): e is MigrationTamperedError {
  return e instanceof MigrationTamperedError
}

/** 运行期判别（跨 IPC / 日志附载后仍可识别）。 */
export function isUnsupportedSchemaVersionError(e: unknown): e is UnsupportedSchemaVersionError {
  return e instanceof UnsupportedSchemaVersionError
}

/**
 * 逐连接 foreign_keys PRAGMA 断言失败（openDatabase I4：`PRAGMA foreign_keys = ON` 写入后
 * 回读非 1——SQLite 编译剔除 FK 等环境异常时约束会静默失效，明确拒开）。
 */
export class ForeignKeysUnavailableError extends Error {
  constructor() {
    super(
      `PRAGMA foreign_keys 写入后回读非 1（本连接外键约束不可用——SQLite 编译可能未启用 FK）——已拒绝打开`,
    )
    this.name = 'ForeignKeysUnavailableError'
  }
}

/** 运行期判别（跨 IPC / 日志附载后仍可识别）。 */
export function isForeignKeysUnavailableError(e: unknown): e is ForeignKeysUnavailableError {
  return e instanceof ForeignKeysUnavailableError
}
