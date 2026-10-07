// M2 通道族接线收口（3.1；M3 3.8 扩池 settings 族与 proposals 三新通道；定位：基础——
// 装配聚合，main.ts ~100 行纪律的单行编排位；域注册行在 {tasks,features,proposals,docs,
// settings}-rpc.ts，此处仅聚合 + 事件广播）。
// 三职责：
//   · M2 通道族注册：forge:projects/deriveTaskStoreDir + forge:{tasks,features,proposals,
//     docs}/* 四族 + M3 3.8 forge:settings/*（服务缺席 = 对应面降级——fail-soft 记 warn
//     不注册对应族，壳面不受损；projects 扩族缺席仅记 derive 单通道）；
//   · 写推送事件广播（交互二事件链末段）：DshHostHandle.onEvent → webContents.send
//     ('forge:events/tasks-changed', { projectId })——主→渲染单向，载荷只读（Hard Rule）；
//   · 5.1 env 门控测试钩子注册（DSH_FORGE_TEST_BRIDGE=1——写动词回放传输面；内聚于此
//     使 main.ts 零改动保持 ~100 行纪律；缺席 = 零注册零痕迹，见 test-bridge.ts 头注）。
import { FORGE_EVENT_CHANNELS } from '@dsh-forge/contracts'
import type { DshHostHandle } from '../boot/index.js'
import type { ForgeIpc } from './forge-channels.js'
import { registerDocsChannels } from './docs-rpc.js'
import { registerFeaturesChannels } from './features-rpc.js'
import { registerProjectsM2Channels } from './projects-rpc.js'
import { registerProposalsChannels } from './proposals-rpc.js'
import { registerSettingsChannels } from './settings-rpc.js'
import { registerTasksChannels } from './tasks-rpc.js'
import { registerTestBridge } from './test-bridge.js'

/** 广播目标面（Electron WebContents 结构子集——BrowserWindowLike.webContents 同形；缺席 = 窗口未建/已毁静默跳过） */
export type EventTargetFace = { send?(channel: string, ...args: unknown[]): unknown } | undefined

/**
 * M2 接线（注册 + 广播一体——main.ts 单行编排）。deriveTaskStoreDir 需 shell 无关的
 * core 派生服务，docs.openExternal 的 openPath 由装配层注入（真身 = electron shell.openPath）。
 */
export function registerM2Channels(
  ipc: ForgeIpc,
  host: Pick<DshHostHandle, 'services' | 'onEvent'>,
  getEventTarget: () => EventTargetFace,
  openPath: (target: string) => Promise<string>,
  warn: (message: string) => void = console.warn,
  testEnv: { readonly DSH_FORGE_TEST_BRIDGE?: string } = process.env,
): void {
  const { services } = host
  if (services.forgeProjects !== undefined) registerProjectsM2Channels(ipc, services.forgeProjects)
  else warn('forgeProjects 服务缺席（core 插件行未装载）——forge:projects/deriveTaskStoreDir 通道未注册')
  if (services.forgeTasks !== undefined) registerTasksChannels(ipc, services.forgeTasks)
  else warn('forgeTasks 服务缺席（tasksHome 未配置/插件行未装载）——forge:tasks/* 通道未注册')
  if (services.forgeFeatures !== undefined) registerFeaturesChannels(ipc, services.forgeFeatures)
  else warn('forgeFeatures 服务缺席（tasksHome 未配置/插件行未装载）——forge:features/* 通道未注册')
  if (services.forgeProposals !== undefined) registerProposalsChannels(ipc, services.forgeProposals)
  else warn('forgeProposals 服务缺席（tasksHome 未配置/插件行未装载）——forge:proposals/* 通道未注册')
  if (services.forgeDocs !== undefined) registerDocsChannels(ipc, { docs: services.forgeDocs, openPath })
  else warn('forgeDocs 服务缺席（tasksHome 未配置/插件行未装载）——forge:docs/* 通道未注册')
  if (services.forgeSettings !== undefined) registerSettingsChannels(ipc, services.forgeSettings)
  else warn('forgeSettings 服务缺席（settingsFile 未配置/插件行未装载）——forge:settings/* 通道未注册')
  host.onEvent((payload) => getEventTarget()?.send?.(FORGE_EVENT_CHANNELS.tasksChanged, payload))
  registerTestBridge(host, testEnv) // 5.1：env 门控测试钩子（缺席 = 零注册零痕迹）
}
