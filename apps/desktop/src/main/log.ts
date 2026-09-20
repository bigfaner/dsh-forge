// Structured main-process log (design: 壳层错误全部收敛于主进程结构化 log,
// 含错误码). One JSON object per line on stdout; local file sink lands with
// the paths/runtime-tree task. `code` is a stable machine-readable error code
// (see tech-design error table, e.g. ERR_TRAY_UNAVAILABLE, ERR_UPDATE_FEED_UNREACHABLE).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface ShellLogFields {
  readonly code: string
  readonly message: string
  readonly data?: Record<string, unknown>
}

export interface ShellLogRecord {
  readonly ts: string
  readonly level: LogLevel
  readonly code: string
  readonly message: string
  readonly data?: Record<string, unknown>
}

export function formatShellLog(level: LogLevel, fields: ShellLogFields): ShellLogRecord {
  return {
    ts: new Date().toISOString(),
    level,
    code: fields.code,
    message: fields.message,
    ...(fields.data === undefined ? {} : { data: fields.data }),
  }
}

function writeShellLog(level: LogLevel, fields: ShellLogFields): void {
  const line = JSON.stringify(formatShellLog(level, fields))
  if (level === 'error') process.stderr.write(`${line}\n`)
  else process.stdout.write(`${line}\n`)
}

export const shellLog = {
  debug: (fields: ShellLogFields): void => writeShellLog('debug', fields),
  info: (fields: ShellLogFields): void => writeShellLog('info', fields),
  warn: (fields: ShellLogFields): void => writeShellLog('warn', fields),
  error: (fields: ShellLogFields): void => writeShellLog('error', fields),
}
