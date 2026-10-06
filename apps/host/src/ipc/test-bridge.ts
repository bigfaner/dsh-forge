// 5.1 录制-回放 main 侧测试钩子（tech-design §录制-回放——用户裁决 2026-10-06）。
// 定位：基础（装配缝）——e2e 回放执行器的写动词传输面。写动词不上 RPC（SC7）→ 传输面
// 另设本钩子：env `DSH_FORGE_TEST_BRIDGE=1` 门控，经 host.services 桥代理直调动词
// （子进程 core 同服务真路径——与 tool 面同一 dispatchRpc 入口，最贴近真实 tool 路径；
// actor 由服务内通道推断恒 'plugin-tool'，与 tool 写同口径）。
//
// G1 pin 相容口径（Hard Rule：env 门控钩子不在产品面——发布构建缺席）：
//   · 零通道：不进 FORGE_CHANNEL_ALLOWLIST、不经 ForgeIpc 注册——renderer/preload 恒不可达
//     （preload invoke 守卫 + main 注册面双道 allowlist 均不知晓本钩子）；
//   · 零痕迹：env 缺席 = 零注册（globalThis 挂点不设），发布构建在场零暴露；
//   · 面封闭：可达动词恰五枚（回放主径写动词），禁作通用 RPC 旁路（transitionTask 等
//     RPC 面动词与读面一律拒绝——产品面分治不因测试钩子破口）。
//
// e2e 消费面 = Playwright electronApp.evaluate（主进程面读 globalThis 挂点——函数不可
// 序列化，消费侧逐调用 evaluate，见 e2e/support/replay/executor.ts）。本文件零 electron
// import（纯装配逻辑，单测注入替身）。
import { FORGE_EVENT_CHANNELS, type TasksChangedEvent } from '@dsh-forge/contracts'
import type { DshHostHandle } from '../boot/index.js'

/** env 门控开关名（e2e 回放启动 env——`DSH_FORGE_TEST_BRIDGE=1` 恰此一形开门） */
export const TEST_BRIDGE_ENV = 'DSH_FORGE_TEST_BRIDGE'

/** globalThis 挂点键（主进程面唯一暴露位——e2e evaluate 可达；非 IPC 非 preload） */
export const TEST_BRIDGE_GLOBAL = '__DSH_FORGE_TEST_BRIDGE__'

/** 钩子可达服务（回放主径两域——写动词所在） */
export type TestBridgeService = 'forgeTasks' | 'forgeProposals'

/** 钩子可达动词面（恰五写动词——恒非 RPC 面；扩面 = 契约面变更须回任务 5.1 裁决） */
export const TEST_BRIDGE_VERBS: Readonly<Record<TestBridgeService, readonly string[]>> = {
  forgeTasks: ['addTask', 'claimTask', 'submitTask'],
  forgeProposals: ['createProposal', 'transitionProposal'],
}

/** 事件记账行（fix 链事件流观测面——at = 主进程收讫时刻，e2e ≤500ms 断言基准） */
export interface TestBridgeEventRecord {
  readonly at: number
  readonly channel: string
  readonly payload: TasksChangedEvent
}

/** 钩子暴露面（globalThis 挂点形状——两成员；数据可序列化，函数由消费侧逐调用触达） */
export interface TestBridgeFace {
  /** 写动词直调（service.verb ∈ TEST_BRIDGE_VERBS；args = 单参数对象契约） */
  call(service: string, verb: string, args: unknown): Promise<unknown>
  /** 事件记账快照（只读副本——boot 起累计） */
  events(): readonly TestBridgeEventRecord[]
}

/** 门控判定（二值：'1' 开，缺席/其余值关） */
export function testBridgeEnabled(env: { readonly DSH_FORGE_TEST_BRIDGE?: string } = process.env): boolean {
  return env[TEST_BRIDGE_ENV] === '1'
}

/**
 * 注册测试钩子（env 门控；m2-wiring registerM2Channels 末段内聚调用——main.ts 零改动缝）。
 * env 缺席 → 返回 undefined 零注册零痕迹（发布构建在场恒此路径）。
 * env '1' → 设 globalThis 挂点 + 订阅 onEvent 记账（写推送事件观测面）；返回撤销器
 * （摘挂点 + 退订——进程生命周期即挂点生命周期，撤销器主要服务测试隔离）。
 */
export function registerTestBridge(
  host: Pick<DshHostHandle, 'services' | 'onEvent'>,
  env: { readonly DSH_FORGE_TEST_BRIDGE?: string } = process.env,
): (() => void) | undefined {
  if (!testBridgeEnabled(env)) return undefined
  const records: TestBridgeEventRecord[] = []
  const face: TestBridgeFace = {
    call(service, verb, args) {
      const allowed = (TEST_BRIDGE_VERBS as Readonly<Record<string, readonly string[]>>)[service]
      if (allowed === undefined) {
        throw new Error(
          `[test-bridge] 服务不在测试钩子可达面：${service}（可达 = ${Object.keys(TEST_BRIDGE_VERBS).join('/')}——本钩子只服务回放写动词，禁通用 RPC 旁路）`,
        )
      }
      if (!allowed.includes(verb)) {
        throw new Error(
          `[test-bridge] 动词不在测试钩子可达面：${service}.${verb}（可达面封闭于回放五写动词：${Object.values(TEST_BRIDGE_VERBS).flat().join('/')}；RPC 面动词与读面走产品通道）`,
        )
      }
      const target = host.services[service as TestBridgeService]
      if (target === undefined) {
        throw new Error(`[test-bridge] ${service} 服务缺席（M2 面降级——tasksHome 未配置/插件行未装载？）——写动词不可达`)
      }
      const method = (target as unknown as Record<string, (input: unknown) => Promise<unknown>>)[verb]
      if (typeof method !== 'function') {
        throw new Error(`[test-bridge] ${service}.${verb} 方法缺席（服务面漂移——桥白名单与 contracts 服务面失配）`)
      }
      return method.call(target, args)
    },
    events: () => records.slice(),
  }
  const unsubscribe = host.onEvent((payload) => {
    records.push({ at: Date.now(), channel: FORGE_EVENT_CHANNELS.tasksChanged, payload })
  })
  const store = globalThis as Record<string, unknown>
  store[TEST_BRIDGE_GLOBAL] = face
  return () => {
    unsubscribe()
    if (store[TEST_BRIDGE_GLOBAL] === face) delete store[TEST_BRIDGE_GLOBAL]
  }
}
