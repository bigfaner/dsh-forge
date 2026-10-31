// forge:settings/* 通道注册（M3 3.8 注册行；定位：基础——通道面装配，域语义归 core 设置域）。
// 通道名仅出自 @dsh-forge/contracts SETTINGS_CHANNELS（三处一体：contracts → web/rpc →
// core 设置域）；服务经参数注入（结构类型——host 禁 import core 源码）。
// 单门读写（tech-design 图 11）：UI 消费 = remoteApproval 开关（ForgeRemoteEntry）分节
// 覆写；worker 段机械读取径已随 expert-squad-default-routing AC4 退役（旧值残留仅作
// 透传存储）——get 每调实时读零缓存（未配置返回 {}），set 整体覆写后即生效无重启；
// 存储 = boot overlay 注 core 行 config.settingsFile。
import { SETTINGS_CHANNELS, type ForgeSettingsService, type SetForgeSettingsInput } from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/** 注入服务面 = 全量两法（设置域无 tool 面——读写恒经 RPC 单门） */
export type SettingsChannelService = ForgeSettingsService

/** 两通道全集注册（get 无参负载；负载映射 = contracts SettingsChannelRequests/Responses） */
export function registerSettingsChannels(ipc: ForgeIpc, service: SettingsChannelService): void {
  ipc.register(SETTINGS_CHANNELS.get, rpcEnvelope(() => service.get()))
  ipc.register(SETTINGS_CHANNELS.set, rpcEnvelope((input: SetForgeSettingsInput) => service.set(input)))
}
