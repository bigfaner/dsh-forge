// @dsh-forge/project client UI —— sidebar 族出口（1.6 B 类顶替①自 apps/web 壳侧
// views/sidebar 平移本包，fix-13 模式：装配缝归插件域）。壳侧消费面（workbench
// anchored-projects / ShellHost / DispatchEventsPanel 类型与 hook）经
// exports['./client-ui/sidebar'] 窄子路径直供（event-tap/session-actions 先例）。
export * from './sidebar-model.js'
export * from './sidebar-actions.js'
export { ForgeSidebarSlot, type ForgeSidebarSlotProps } from './ForgeSidebarSlot.js'
export {
  ForgeWorkspacePanel,
  SidebarProjectsZone,
  SidebarRail,
  phaseBody,
  type ForgeWorkspacePanelProps,
  type SidebarZonePhaseInput,
} from './ForgeWorkspacePanel.js'
export {
  useForgeProjects,
  fetchProjectsPhase,
  type ProjectsPhase,
} from './use-forge-projects.js'
export {
  useWorkspaceProjectMap,
  resolveWorkspaceProjectMap,
  type WorktreeResolveClientFactory,
} from '../knowledge/anchored-projects.js'
export { preloadRpcClientFactory, type RpcClientFactory } from '../rpc.js'
