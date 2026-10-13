// 回放驱动器（worker-exec-evidence-replay/1.4——提案附录路径 B：唯一新建机制）。
// 在 spawn 缝注入「录制驱动器」：不走模型，按（dispatch digest, 步序号）键回放录制的
// assistant 动作序列（工具调用 + 文本回合）。录制源 = dogfood 真跑会话转录（e2e/support/
// replay/worker-script.ts 三源合并器扩展抓 assistant 回合——形状结构同源、类型双轨独立，
// digest 同式 sha256 前 12 防静默漂移）。失配哲学与 dogfood-record 完整性门同源：键漂移
// 拒绝（无录制 digest = spawn 拒绝面）、步失败 fail-loud 点名 diverge 步序号 + 工具名。
// 真绑定装配不变（createInProcessDriverSpawn 仍为默认 spawn）——回放驱动器经导出面由
// e2e 装配注入（dogfood 用例回放化改造面）。
import { createHash } from 'node:crypto'
import type { SpawnWorker, SpawnWorkerHandle } from '../dispatch-core/index.js'

/** 回放键：sha256(utf8 全文) 前 12 hex（core digest.ts 同式独立实现——与录制侧互证） */
export function digestOfPrompt(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex').slice(0, 12)
}

/** 录制的 assistant 工具调用（步序号 seq = 录制侧回放序——1 起步递增） */
export interface ReplayToolAction {
  readonly kind: 'tool'
  readonly seq: number
  readonly name: string
  readonly args: Record<string, unknown>
}

/** 录制的 assistant 文本回合（终态 output 投影源） */
export interface ReplayTextAction {
  readonly kind: 'text'
  readonly seq: number
  readonly text: string
}

export type ReplayAction = ReplayToolAction | ReplayTextAction

/** 一个 dispatch（digest 键）的录制动作序列 */
export interface ReplayScript {
  readonly digest: string
  readonly actions: readonly ReplayAction[]
}

/** 回放工具执行缝（e2e 装配注入——绑定测试钩子/工具 handler 真执行面） */
export type ReplayToolRunner = (name: string, args: Record<string, unknown>) => Promise<unknown>

/**
 * 回放驱动器工厂（SpawnWorker 同型——可整替 deps.spawn 装配位）。
 * spawn：digest 查键 → 无录制脚本 = 键漂移拒绝（spawn 拒绝面，ERR_SPAWN_FAILED 防线承接）；
 * result：按录制步序依序执行工具调用（失配 fail-loud 点名 diverge 步），文本回合聚合为
 * 终态 output（in-process-driver outputTextOf 同式 \n join）；dispose 幂等中止剩余回放。
 */
export function createReplayDriverSpawn(scripts: ReadonlyMap<string, ReplayScript>, runTool: ReplayToolRunner): SpawnWorker {
  return async (request) => {
    const digest = digestOfPrompt(request.prompt)
    const script = scripts.get(digest)
    if (script === undefined) {
      throw new Error(
        `[replay-driver] 回放键漂移：digest=${digest} 无录制脚本（回放面只认录制过的 dispatch——请先录制或核对简报全文漂移）`,
      )
    }
    if (script.actions.length === 0) {
      throw new Error(`[replay-driver] 空录制脚本：digest=${digest}（录制源不可带伤——拒绝回放）`)
    }
    let disposed = false
    let bail: ((err: Error) => void) | undefined
    const guard = new Promise<never>((_, reject) => {
      bail = reject
    })
    guard.catch(() => {}) // bail 晚于 race 挂接触发时防 unhandled rejection
    request.signal.addEventListener('abort', () =>
      bail?.(new Error(`[replay-driver] 回放中止：digest=${digest}（signal 已中止）`)),
    )
    const result = (async (): Promise<{ readonly stopReason: string; readonly output: string }> => {
      if (request.signal.aborted) throw new Error(`[replay-driver] 回放中止：digest=${digest}（signal 已中止）`)
      const texts: string[] = []
      for (const action of script.actions) {
        if (disposed) throw new Error(`[replay-driver] disposed：digest=${digest}（第 ${action.seq} 步前回放被收尾中止）`)
        if (action.kind === 'tool') {
          try {
            await Promise.race([runTool(action.name, action.args), guard])
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            throw new Error(
              `[replay-driver] 回放 diverge：digest=${digest} 第 ${action.seq} 步（tool ${action.name}）执行失败/失配——${msg}`,
            )
          }
        } else {
          texts.push(action.text)
        }
      }
      return { stopReason: 'completed', output: texts.join('\n') }
    })()
    const handle: SpawnWorkerHandle = {
      workerSessionId: `replay-${digest}`,
      result,
      dispose: async () => {
        disposed = true
        bail?.(new Error(`[replay-driver] disposed：digest=${digest}（回放被收尾中止）`))
      },
    }
    return handle
  }
}
