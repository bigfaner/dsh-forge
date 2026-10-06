// forge:features/* 四通道注册（3.1 注册行；定位：基础——通道面装配，域语义归 core feature 域）。
// 通道名仅出自 @dsh-forge/contracts FEATURES_CHANNELS（三处一体：contracts → web/rpc →
// core feature 域；Interface 2 服务面 ↔ Interface 7 通道族一一对应）；服务经参数注入
//（结构类型——host 禁 import core 源码）。Interface 7 裁决：register/transition/upsertDoc/
// list 四法 = UI 直调面（写动词不上 RPC 的禁令只及 agent 派发动词 add/claim/submit/
// createProposal/transitionProposal——feature 域三写法为人类表单动作，tool 封装 = M3）。
import {
  FEATURES_CHANNELS,
  type ForgeFeaturesService,
  type ListFeaturesQuery,
  type RegisterFeatureInput,
  type TransitionFeatureInput,
  type UpsertFeatureDocInput,
} from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/** 四通道全集注册（负载映射 = contracts FeaturesChannelRequests/Responses，键键对应） */
export function registerFeaturesChannels(ipc: ForgeIpc, service: ForgeFeaturesService): void {
  ipc.register(
    FEATURES_CHANNELS.register,
    rpcEnvelope((input: RegisterFeatureInput) => service.registerFeature(input)),
  )
  ipc.register(
    FEATURES_CHANNELS.transition,
    rpcEnvelope((input: TransitionFeatureInput) => service.transitionFeature(input)),
  )
  ipc.register(
    FEATURES_CHANNELS.upsertDoc,
    rpcEnvelope((input: UpsertFeatureDocInput) => service.upsertFeatureDoc(input)),
  )
  ipc.register(FEATURES_CHANNELS.list, rpcEnvelope((q: ListFeaturesQuery) => service.listFeatures(q)))
}
