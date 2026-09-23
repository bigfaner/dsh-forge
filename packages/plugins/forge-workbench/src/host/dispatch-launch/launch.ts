// host/dispatch-launch/launch — subagent 启动核(任务 3.5;decorator-free)。
//
// tech-design §Interface 3「subagent 创建(host)」+ spike-3 §3 裁决 ④ 的 M3 落地:
// 内核 dispatchTasks 已把预合成产物(组合首条消息 = 预合成内容 + 追加行,
// prompt_hash = sha256(该串),预铸 sessionId 随 dispatch 行落库)交给本半身;
// launch 的全部职责 = 经宿主 sessionController 通道(M2 session-launch 先例:
// create({sessionId, cwd}) caller-minted 幂等 adopt + prompt(mode:'queue')
// 持久化首条 user 消息)把该串**逐字符不改写**地交付成 subagent 的首条消息。
//
// 纪律(tech-design Hard Rules / spike-3 §5):
//   - 本模块仅持会话创建(host 半身会话创建权);不解析、不追加、不重排注入
//     内容 —— 追加行(FORGE_ACTOR 收窄语义)由内核预合成(3.4 定稿),host
//     侧零改写(注入内容对内核不透明传输,仅保证完整交付);
//   - 并行 = N 次独立 create(launchBatch = 逐请求独立 launch,零共享上下文,
//     G3);任一请求失败不影响同批其它请求(互不串扰);
//   - 契约三查(spike-3 §5.4,ERR_SYSTEM_PROMPT_CONTRACT):① 通道可解析
//     (sessionChannelOf 鸭类型面,host 侧唯一一查)② 预合成内容非空
//     ③ prompt_hash 已定型 —— 任一不满足 = 拒绝启动(派发行 failed 态面);
//   - requestId 确定性(deriveLaunchRequestId):同 (session, message) 重放
//     不双投(上游 hasPromptRequest 短路,M2 已验)。
//
// 降级链(tech-design §Interface 3「降级链」/§Error Handling):launch 失败 →
// {ok:false, code:'ERR_DISPATCH_LAUNCH_FAILED'}(派发 failed 态 + 原因 +
// 重派发,不弹模态);契约不满足 → code:'ERR_SYSTEM_PROMPT_CONTRACT'(派发前
// 检查拒绝)。两者都是显式结果,永不静默。
//
// 本文件是纯逻辑核(单测直载);cordis rpc 壳(装饰器封闭)在 ./rpc.ts。

import { randomUUID } from 'node:crypto'
import { deriveLaunchRequestId, SESSION_CHANNEL_TIMEOUT_MS, type SessionChannel } from '../session-launch'

/**
 * 一次派发启动请求(内核 launch-port DispatchLaunchInput 的 host 侧结构孪生
 * + create 所需 cwd;内核组合输入自 dispatch 行/预合成产物,renderer relay
 * 原样转交 —— 4.1 跨进程结构孪生先例,plugin 不依赖 app 包)。
 */
export interface DispatchLaunchRequest {
  readonly dispatchId: string
  readonly batchId: string
  readonly projectId: string
  readonly featureSlug: string
  /** 看板限定地址 `<featureSlug>/<localId>`。 */
  readonly taskKey: string
  /** 任务类型(预合成协议选择键);未落 = null。 */
  readonly taskType: string | null
  /**
   * 预合成组合首条消息(3.4 引擎产物,含追加行;host 零改写 —— SC3 逐字符
   * 断言锚点 = sha256(该串) === promptHash)。
   */
  readonly prompt: string
  /** 注入内容 sha256(与 dispatch 行 prompt_hash 同值)。 */
  readonly promptHash: string
  /** 预铸 sessionId(spike-3 §4;create({sessionId}) 幂等 adopt);null = 自铸。 */
  readonly sessionId: string | null
  /** subagent 会话 cwd(已注册项目 codeRoot,内核解析)。 */
  readonly cwd: string
}

/** launch 失败码(内核呈现口径:错误表 ERR_DISPATCH_LAUNCH_FAILED / ERR_SYSTEM_PROMPT_CONTRACT)。 */
export type DispatchLaunchFailureCode = 'ERR_SYSTEM_PROMPT_CONTRACT' | 'ERR_DISPATCH_LAUNCH_FAILED'

/**
 * 单次启动终局:成功回传 sessionId(= dispatch 行预铸 id,回填面);失败携带
 * code + 原因(内核落 failed 态 + 原因;契约拒绝同面)。
 */
export type DispatchLaunchOutcome =
  | { readonly ok: true; readonly sessionId: string }
  | { readonly ok: false; readonly code: DispatchLaunchFailureCode; readonly error: string }

/** 依赖缝(sessionChannelOf / stub 通道注入;per-call 解析,装载序容错)。 */
export interface DispatchLaunchDeps {
  /** 宿主 sessionController 通道解析(每次调用;undefined = 契约①查失败)。 */
  readonly getSessionChannel: () => SessionChannel | undefined
  /** 无预铸形态时的 sessionId 自铸(缺省 = 上游 `session-<uuid>` 形)。 */
  readonly mintSessionId?: () => string
  /** 每腿上限(缺省 10s;进程内腿为 ms 级 —— 防挂死,非 ≤3s UX 预算)。 */
  readonly channelTimeoutMs?: number
}

/** 装配产物(单发 + 批量;rpc 壳直载)。 */
export interface DispatchLaunchCore {
  launch(request: DispatchLaunchRequest): Promise<DispatchLaunchOutcome>
  /** N 次独立 create(G3 并行):逐请求独立 launch,零共享上下文、互不串扰。 */
  launchBatch(requests: readonly DispatchLaunchRequest[]): Promise<readonly DispatchLaunchOutcome[]>
}

/** 标记一条超出上限的腿(归类为 launch 失败,原因可读)。 */
class ChannelLegTimeout extends Error {
  constructor(stage: 'create' | 'prompt', timeoutMs: number) {
    super(`session channel ${stage} did not answer within ${String(timeoutMs)}ms`)
    this.name = 'ChannelLegTimeout'
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

export function createDispatchLaunchCore(deps: DispatchLaunchDeps): DispatchLaunchCore {
  const mintSessionId = deps.mintSessionId ?? ((): string => `session-${randomUUID()}`)
  const channelTimeoutMs = deps.channelTimeoutMs ?? SESSION_CHANNEL_TIMEOUT_MS

  const contractFail = (request: DispatchLaunchRequest, detail: string): DispatchLaunchOutcome => ({
    ok: false,
    code: 'ERR_SYSTEM_PROMPT_CONTRACT',
    error: `dispatch ${request.dispatchId} (${request.taskKey}) failed the injection contract check: ${detail}`,
  })

  const launchFail = (request: DispatchLaunchRequest, stage: string, detail: string): DispatchLaunchOutcome => ({
    ok: false,
    code: 'ERR_DISPATCH_LAUNCH_FAILED',
    error: `subagent launch for dispatch ${request.dispatchId} (${request.taskKey}) failed at ${stage}: ${detail}`,
  })

  /** 单腿上限竞速(计时器不钉住进程;session-launch withCeiling 同款)。 */
  const withCeiling = async <T>(stage: 'create' | 'prompt', run: () => Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const ceiling = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new ChannelLegTimeout(stage, channelTimeoutMs)) }, channelTimeoutMs)
      ;(timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.()
    })
    try {
      return await Promise.race([run(), ceiling])
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async launch(request: DispatchLaunchRequest): Promise<DispatchLaunchOutcome> {
      // —— 契约三查(spike-3 §5.4;①查为 host 侧专属,②③为内核侧复验)——
      const channel = deps.getSessionChannel()
      if (channel === undefined) {
        return contractFail(request, 'the session channel is not resolvable (no sessionController face in the host context)')
      }
      if (request.prompt === '') {
        return contractFail(request, 'the presynthesized injection content is empty')
      }
      if (request.promptHash === '') {
        return contractFail(request, 'prompt_hash is not finalized on the dispatch payload')
      }
      if (request.cwd.trim() === '') {
        return contractFail(request, 'the launch carries no cwd (registered project codeRoot)')
      }

      // —— create:caller-minted 幂等 adopt(预铸 sessionId 直用,重派发同 id)——
      const sessionId = request.sessionId !== null && request.sessionId !== '' ? request.sessionId : mintSessionId()
      let created: string
      try {
        const value = await withCeiling('create', () => channel.create({ sessionId, cwd: request.cwd }))
        created = value.sessionId
      } catch (error) {
        return launchFail(request, 'create', describeError(error))
      }

      // —— prompt:组合首条消息逐字符交付(queue = 持久化 user 消息;零改写)——
      try {
        await withCeiling('prompt', () => channel.prompt({
          requestId: deriveLaunchRequestId(created, request.prompt),
          sessionId: created,
          mode: 'queue',
          content: [{ type: 'text', text: request.prompt }],
        }))
      } catch (error) {
        return launchFail(request, 'prompt', describeError(error))
      }

      return { ok: true, sessionId: created }
    },

    launchBatch(requests: readonly DispatchLaunchRequest[]): Promise<readonly DispatchLaunchOutcome[]> {
      // G3 并行 = N 次独立 create:逐请求独立 launch(独立 sessionId/通道解析/
      // 失败隔离),无任何跨请求共享态 —— 同批互不串扰。
      return Promise.all(requests.map(request => this.launch(request)))
    },
  }
}
