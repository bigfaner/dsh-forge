// W4 激活自证探针编排（boot 竞速根治——1.2 复核欠账 R2-竞速支 client 半；fix-2 语义修正）：
// hero 自证/早期消费面的 forgeProjects.list 轻探可能先于官方 forge remote contribution
// mount 完成（host 半遥控器注册未落 reflect.props / gateway 首个 /api 探测竞速）——
// 该窗口的 404（transport failure HTTP 404）与「官方 forge remote 面缺席」降级不是
// 数据通路断裂，是装配时序竞速。fix-2 修正：固定 2s 兜底时延对 electron 冷启不够
// （mount 可超 2s，兜底先于 mount 触发重试 → 重试仍在窗口内 → 误 fail-loud），改
// mount 事件驱动——竞速窗口内等待 internal/service mount 事件触发轻探（无固定短窗，
// 竞速类失败继续等待下一事件），仅设长诊断超时（≥15s：有事件缝 = 仅出一条诊断不
// fail-loud；mount 事件缝缺席 = 兜底终态 fail-loud）。非竞速类失败（typed business
// error 等）保持即时 fail-loud 语义不变。
// 编排面独立成文件（self-check 可测性——plugin.ts apply 只做装配接线）。

/** 长诊断超时 ms（mount 事件驱动——本值不做重试调度，只承担诊断/兜底终态） */
export const SELF_CHECK_DIAG_TIMEOUT_MS = 15_000

/**
 * boot 竞速窗口失败分类（404 / 面缺席 / 通道未装配族）：
 * - `transport failure … HTTP 404`：官方 connection 层 404（端点未被 serve 层认领——
 *   host 半遥控器注册竞速窗口特征文案）；
 * - `官方 forge remote 面缺席`：ui/rpc.ts faceSeamOf 诚实降级文案（face 解析缝未安装/
 *   resolver 现查缺席——mount 前窗口特征）。
 */
export function isBootRaceWindowFailure(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause)
  return (
    message.includes('HTTP 404') ||
    message.includes('transport failure') ||
    message.includes('官方 forge remote 面缺席')
  )
}

export interface ActivationSelfProbeParams {
  /** 单次轻探（失败 reject——调用方 forgeRpc.projects.list 直透） */
  readonly probe: () => Promise<void>
  /** 轻探成功回调（selfCheck.rpcProbe = 'ok'） */
  readonly onSuccess: () => void
  /** 首败判竞速窗口：静默挂起回调（selfCheck 呈 pending，零 console 记录） */
  readonly onRacePending: () => void
  /** 终态失败回调（fail-loud——console.error + selfCheck 失败因一行） */
  readonly onTerminalFailure: (line: string) => void
  /**
   * mount 事件缝（官方 cordis `internal/service`——remote contribution mount 落座触发
   * 服务事件；fix-2：竞速窗口内的事件驱动轻探主通道，无固定短窗）。入参 = 回调，
   * 返回撤销 dispose。缺席宿主 = 诊断超时兜底终态。
   */
  readonly onServiceEvent?: (fn: () => void) => () => void
  /** 长诊断超时 ms（缺省 SELF_CHECK_DIAG_TIMEOUT_MS——测试注入收敛节拍） */
  readonly diagTimeoutMs?: number
  /** 诊断超时回调（有事件缝时超时仅出诊断不 fail-loud——client 束豁免面） */
  readonly onDiag?: (line: string) => void
}

/**
 * 激活自证探针编排（mount 事件驱动，fix-2）：首败判竞速窗口 → 静默挂起 + 订阅
 * internal/service 事件，事件每次触发轻探（探呼在途则跳过本次事件），竞速类失败继续
 * 等待下一事件，无固定短窗。长诊断超时（diagTimeoutMs）：有事件缝 = 仅出一条诊断
 * （onDiag）不 fail-loud；事件缝缺席（onServiceEvent undefined = mount 事件缺席）=
 * 兜底终态 fail-loud。非竞速类失败即时终态；成功后撤链，晚到事件不重复轻探。
 */
export function runActivationSelfProbe(params: ActivationSelfProbeParams): void {
  let settled = false
  let inFlight = false
  let raceArmed = false
  let diagEmitted = false
  let disposeEvent: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const settle = (): void => {
    settled = true
    disposeEvent?.()
    disposeEvent = undefined
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const terminal = (cause: unknown): void => {
    settle()
    params.onTerminalFailure(
      `dsh-forge web-client: 激活自证失败——forgeProjects Typert 轻探不通（数据通路断裂）：${String(cause)}`,
    )
  }

  const run = (): void => {
    if (settled || inFlight) return
    inFlight = true
    void params
      .probe()
      .then(() => {
        inFlight = false
        settle()
        params.onSuccess()
      })
      .catch((cause: unknown) => {
        inFlight = false
        if (settled) return
        if (!isBootRaceWindowFailure(cause)) {
          terminal(cause)
          return
        }
        if (!raceArmed) {
          raceArmed = true
          params.onRacePending()
          if (params.onServiceEvent !== undefined) {
            disposeEvent = params.onServiceEvent(() => run())
          }
          timer = setTimeout(() => {
            timer = undefined
            if (settled) return
            if (params.onServiceEvent !== undefined) {
              // 长诊断超时（有事件缝）：仅出诊断，不 fail-loud——继续等待 mount 事件。
              if (!diagEmitted) {
                diagEmitted = true
                params.onDiag?.(
                  `dsh-forge web-client: 激活自证竞速窗口超 ${params.diagTimeoutMs ?? SELF_CHECK_DIAG_TIMEOUT_MS}ms 未见 remote mount 事件（诊断——继续等待）`,
                )
              }
            } else {
              // mount 事件缝缺席：无重试通道可用，兜底终态 fail-loud。
              terminal(new Error('remote mount 事件缝缺席（internal/service 事件不可用）'))
            }
          }, params.diagTimeoutMs ?? SELF_CHECK_DIAG_TIMEOUT_MS)
        }
        // 竞速类失败：保持挂起，继续等待下一 mount 事件（无固定短窗）。
      })
  }

  run()
}
