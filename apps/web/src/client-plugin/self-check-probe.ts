// W4 激活自证探针编排（boot 竞速根治——1.2 复核欠账 R2-竞速支 client 半）：
// hero 自证/早期消费面的 forgeProjects.list 轻探可能先于官方 forge remote contribution
// mount 完成（host 半遥控器注册未落 reflect.props / gateway 首个 /api 探测竞速）——
// 该窗口的 404（transport failure HTTP 404）与「官方 forge remote 面缺席」降级不是
// 数据通路断裂，是装配时序竞速：按竞速窗口分类静默挂起，待 mount 完成后重试一次；
// 重试仍失败才落 fail-loud（console.error + selfCheck 呈现）。非竞速类失败（typed
// business error 等）保持即时 fail-loud 语义不变。
// 编排面独立成文件（self-check 可测性——plugin.ts apply 只做装配接线）。

/** 竞速窗口重试兜底时延 ms（internal/service mount 事件优先，本值兜底收敛） */
export const SELF_CHECK_RETRY_DELAY_MS = 2_000

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
   * mount 完成事件缝（官方 cordis `internal/service`——remote contribution mount 落座
   * 触发服务事件；缺席宿主 = 仅兜底时延重试）。入参 = 回调，返回撤销 dispose。
   */
  readonly onServiceEvent?: (fn: () => void) => () => void
  /** 重试兜底时延 ms（缺省 SELF_CHECK_RETRY_DELAY_MS——测试注入收敛节拍） */
  readonly retryDelayMs?: number
}

/**
 * 激活自证探针编排（两段式）：首跑失败且判竞速窗口 → 静默挂起 + 恰一次重试
 * （internal/service 事件优先、retryDelayMs 兜底，先到先重试）；重试成功 = ok
 * （全程零 console warn/error）；重试失败或首败非竞速类 = 终态 fail-loud。
 * 成功后再到的重试触发不重复轻探（幂等护栏）。
 */
export function runActivationSelfProbe(params: ActivationSelfProbeParams): void {
  let attempts = 0
  let settled = false
  let retryScheduled = false
  let disposeEvent: (() => void) | undefined

  const run = (): void => {
    attempts += 1
    void params
      .probe()
      .then(() => {
        settled = true
        disposeEvent?.()
        disposeEvent = undefined
        params.onSuccess()
      })
      .catch((cause: unknown) => {
        if (settled) return
        if (attempts === 1 && isBootRaceWindowFailure(cause)) {
          params.onRacePending()
          scheduleRetry()
          return
        }
        settled = true
        disposeEvent?.()
        disposeEvent = undefined
        params.onTerminalFailure(
          `dsh-forge web-client: 激活自证失败——forgeProjects Typert 轻探不通（数据通路断裂）：${String(cause)}`,
        )
      })
  }

  const scheduleRetry = (): void => {
    if (retryScheduled) return
    retryScheduled = true
    let fired = false
    const fire = (): void => {
      if (fired || settled) return
      fired = true
      disposeEvent?.()
      disposeEvent = undefined
      run()
    }
    const timer = setTimeout(fire, params.retryDelayMs ?? SELF_CHECK_RETRY_DELAY_MS)
    disposeEvent = () => clearTimeout(timer)
    const eventDispose = params.onServiceEvent?.(fire)
    if (eventDispose !== undefined) {
      const prevDispose = disposeEvent
      disposeEvent = () => {
        prevDispose()
        eventDispose()
      }
    }
  }

  run()
}
