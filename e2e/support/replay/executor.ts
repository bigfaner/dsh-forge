// 5.1 回放执行器（AC4——按夹具序列重放写入 → UI 断言可编程）。两通道：
//   · 主径 = 主侧测试钩子（createBridgeDriver——env DSH_FORGE_TEST_BRIDGE=1，经
//     host.services 桥代理直调写动词，最贴近真实 tool 路径；tech-design §录制-回放）；
//   · 备选 = forge.db 直插（db-insert.ts——@500 造数与受控初态，不经动词）。
//
// 即时判据本体（Hard Rule）：回放断言「写入返回后单次重取即见新值」——禁轮询等待
// 兜底。refetchOnce = 产品读面单发 invoke（forgeInvoke 单源），调用侧不得包裹
// waitForFunction/重试——轮询兜底即判据失效（即时性由直读保证，等待即掩盖回归）。
// 事件面：driver.events() 取主进程收讫记账（test-bridge onEvent 订阅——fix 链事件流
// 观测；≤500ms 断言基准 = 主侧时戳，渲染尾延迟不测——5.2 计时口径）。
import type { ElectronApplication, Page } from '@playwright/test'
import { forgeInvoke } from '../rpc.js'
import type { ReplayFixture, ReplayServiceName, ReplayWriteVerb } from './format.js'

/** 主侧钩子事件记账行（app.evaluate 序列化形状——host TestBridgeEventRecord 同构） */
export interface ReplayEventRecord {
  readonly at: number
  readonly channel: string
  readonly payload: { readonly projectId: string }
}

/** 写动词驱动面（主径实现 = 主侧测试钩子；单测注入替身） */
export interface ReplayWriteDriver {
  /** 写动词直调（service.verb ∈ 回放五写动词；args = 单参对象；结算面 unknown——消费侧按 DTO 收窄） */
  call(service: ReplayServiceName, verb: ReplayWriteVerb, args: unknown): Promise<unknown>
  /** 主进程事件记账快照（写推送事件观测——boot 起累计） */
  events(): Promise<readonly ReplayEventRecord[]>
}

/**
 * 主侧测试钩子驱动（Playwright electronApp.evaluate）。铁则：evaluate 返回值经序列化
 * （函数不保真）——不得取回桥面对象再调用（husk 面 call 缺席）；逐调用把调用本体注入
 * 主进程求值（钩子在主进程活体上被触达，结果 JSON 可序列化回传）。
 */
export function createBridgeDriver(app: ElectronApplication): ReplayWriteDriver {
  return {
    // electronApp.evaluate 形参序：第 1 参 = electron 模块本体（弃用名 _electron），第 2 参 = arg
    call: (service, verb, args) =>
      app.evaluate(async (_electron, { s, v, a }) => {
        const bridge = (globalThis as unknown as { __DSH_FORGE_TEST_BRIDGE__?: { call(service: string, verb: string, args: unknown): Promise<unknown> } }).__DSH_FORGE_TEST_BRIDGE__
        if (bridge === undefined) {
          throw new Error('DSH_FORGE_TEST_BRIDGE 钩子缺席——e2e 回放须以 env DSH_FORGE_TEST_BRIDGE=1 启动（5.1 门控口径：env 缺席 = 零注册零痕迹）')
        }
        return bridge.call(s, v, a)
      }, { s: service, v: verb, a: args }),
    events: () =>
      app.evaluate(() => {
        const bridge = (globalThis as unknown as {
          __DSH_FORGE_TEST_BRIDGE__?: { events(): ReadonlyArray<{ at: number; channel: string; payload: { projectId: string } }> }
        }).__DSH_FORGE_TEST_BRIDGE__
        if (bridge === undefined) {
          throw new Error('DSH_FORGE_TEST_BRIDGE 钩子缺席——e2e 回放须以 env DSH_FORGE_TEST_BRIDGE=1 启动（5.1 门控口径：env 缺席 = 零注册零痕迹）')
        }
        return bridge.events()
      }),
  }
}

/** 单次重取（Hard Rule 即时判据本体——产品读面单发 invoke，禁轮询/重试包裹） */
export async function refetchOnce<T>(page: Page, channel: string, payload?: unknown): Promise<T> {
  return forgeInvoke<T>(page, channel, payload)
}

/** verb 步骤结算面（回放结果——录制落账/Golden 对拍的原料） */
export interface ReplayStepOutcome {
  readonly seq: number
  readonly service: ReplayServiceName
  readonly verb: ReplayWriteVerb
  readonly result: unknown
}

/**
 * 按夹具序列重放写入（AC4）：verb 行依序直调（observed/event 行 = 录制观测，跳过不执行）。
 * fail-fast：任一动词失败即抛（错误面带 seq + service.verb + 原因）——夹具与产品面错配
 * 定位优先，无「部分回放」中间态。
 */
export async function replayWrites(
  driver: ReplayWriteDriver,
  fixture: ReplayFixture,
): Promise<readonly ReplayStepOutcome[]> {
  const outcomes: ReplayStepOutcome[] = []
  for (const step of fixture.steps) {
    if (step.kind !== 'verb') continue
    let result: unknown
    try {
      result = await driver.call(step.service, step.verb, step.args)
    } catch (cause) {
      const reason = String((cause as Error)?.message ?? cause)
      throw new Error(`[replay] 步骤 #${step.seq} ${step.service}.${step.verb} 失败：${reason}（回放 fail-fast——夹具/产品面错配定位）`)
    }
    outcomes.push({ seq: step.seq, service: step.service, verb: step.verb, result })
  }
  return outcomes
}
