// e2e dsh 会话文件解码族（fix-37 ① 收编——flywheel/krf/sw/installer 四份同源拷贝单源）。
// 真实轨迹可查面：{dshHome}/sessions/<sanitized-cwd>/session-<id>/session[.vN].jsonl[.zstd]
// ——多 zstd 帧逐帧解出 JSONL 事件（帧界 = zstd magic 28 B5 2F FD；实测全帧可解，
// magic 误报帧/帧内非 JSON 行跳过）。事件面 = system/message（模型实收系统提示词）+
// tool/call（工具调用轨迹）+ …（krf 超集形状）。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/** dsh 会话事件（krf 超集形状——sw/installer 只消费 type/name） */
export interface SessionEvent {
  readonly type: string
  readonly seq?: number
  readonly data?: {
    readonly name?: string
    readonly arguments?: string
    readonly message?: { readonly content?: readonly { readonly type?: string; readonly text?: string }[] }
  }
}

/** 解码 session[.vN].jsonl[.zstd]（逐帧 zstd → JSONL 事件流） */
export function decodeSessionFile(path: string): readonly SessionEvent[] {
  const buf = readFileSync(path)
  const frames: number[] = []
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) frames.push(i)
  }
  frames.push(buf.length)
  const events: SessionEvent[] = []
  for (let i = 0; i < frames.length - 1; i++) {
    try {
      const text = zstdDecompressSync(buf.subarray(frames[i]!, frames[i + 1]!)).toString('utf8')
      for (const line of text.split('\n')) {
        if (line === '') continue
        try {
          events.push(JSON.parse(line) as SessionEvent)
        } catch {
          // 帧内非 JSON 行跳过
        }
      }
    } catch {
      // magic 误报帧（压缩载荷内偶现字节序）跳过——事件面以可解帧为准
    }
  }
  return events
}

/**
 * 会话目录内的现行日志文件（canonical generation 名——版本无关：
 * session.jsonl[.zstd] / session.vN.jsonl[.zstd]，多代并存取最高代）。
 */
export function bestSessionLog(sessionDir: string): string | undefined {
  if (!existsSync(sessionDir)) return undefined
  const files = readdirSync(sessionDir).filter((f) => /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/.test(f))
  if (files.length === 0) return undefined
  const versionOf = (f: string): number => Number(/^session(?:\.v([1-9]\d*))?\.jsonl/.exec(f)?.[1] ?? 0)
  return join(sessionDir, files.sort((a, b) => versionOf(b) - versionOf(a))[0] as string)
}

/**
 * 定位夹具工作区名下最新会话（目录名 session-<uuid> = 账本 id；文件可滞后于目录——
 * 目录级即认）。工作区目录名 = 会话 cwd 的扁平化（夹具路径含 fixtureSegment 段）；
 * boot 期默认工作区会话（--D-…-default-workspace--）按段过滤排除。
 */
export function findFixtureSession(
  dshHome: string,
  fixtureSegment: string,
): { readonly sessionId: string } | undefined {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return undefined
  let newest: { sessionId: string; mtime: number } | undefined
  for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!wsDir.isDirectory() || !wsDir.name.includes(fixtureSegment)) continue
    for (const sDir of readdirSync(join(sessionsDir, wsDir.name), { withFileTypes: true })) {
      if (!sDir.isDirectory()) continue
      const log = bestSessionLog(join(sessionsDir, wsDir.name, sDir.name))
      const mtime = log !== undefined ? statSync(log).mtimeMs : 0
      if (newest === undefined || mtime >= newest.mtime) newest = { sessionId: sDir.name, mtime }
    }
  }
  return newest
}

/** 轮询等待夹具工作区会话目录出现（发送后会话落盘开户）——返回账本会话 id */
export async function waitForFixtureSession(
  dshHome: string,
  fixtureSegment: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = findFixtureSession(dshHome, fixtureSegment)
    if (found !== undefined) return found.sessionId
    if (Date.now() > deadline) {
      throw new Error(`等待夹具会话目录超时（${timeoutMs}ms）：${join(dshHome, 'sessions')}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}

/** 按会话 id（目录名 session-<uuid>）定位现行日志文件（隔离 DSH_HOME 内唯一） */
export function sessionLogById(dshHome: string, sessionId: string): string | undefined {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return undefined
  const target = sessionId.startsWith('session-') ? sessionId : `session-${sessionId}`
  for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!wsDir.isDirectory()) continue
    const log = bestSessionLog(join(sessionsDir, wsDir.name, target))
    if (log !== undefined) return log
  }
  return undefined
}

/** 轮询等待会话事件满足谓词（agent 往返落盘时序——flywheel 形态，按 id 定位） */
export async function waitForSessionEvents(
  dshHome: string,
  sessionId: string,
  predicate: (events: readonly SessionEvent[]) => boolean,
  timeoutMs: number,
): Promise<readonly SessionEvent[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const file = sessionLogById(dshHome, sessionId)
    if (file !== undefined) {
      const events = decodeSessionFile(file)
      if (predicate(events)) return events
    }
    if (Date.now() > deadline) {
      throw new Error(`等待会话事件超时（${timeoutMs}ms）：session=${sessionId} file=${file ?? '未落盘'}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}
