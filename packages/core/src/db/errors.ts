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

/** 运行期判别（跨 IPC / 日志附载后仍可识别）。 */
export function isUnsupportedSchemaVersionError(e: unknown): e is UnsupportedSchemaVersionError {
  return e instanceof UnsupportedSchemaVersionError
}
