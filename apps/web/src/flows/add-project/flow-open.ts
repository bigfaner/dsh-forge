// 添加项目流程打开缝（定位：业务——UF-3 组装 2.10 入口接线点）。
// 动机：流程宿主（AddProjectFlow——模态覆盖中区）与入口（项目树「＋」sidebar 槽位件 /
// hero CTA（UF-2，2.12 装配））分属两个求值单元（client 插件槽位 vs 壳 bundle 工作台装配），
// 唯一通信缝 = 页内全局 __DSH_FORGE_ADD_PROJECT_FLOW__——与 __DSH_FORGE_VIEWS__ /
// __DSH_FORGE_WORKBENCH__（workbench/workbench-bridge，fix-36 更正归属——曾误标
// sidebar-actions）同族。宿主 mount 期发布 / unmount 撤销；入口经 openAddProjectFlow()
// 触发——宿主缺席（2.12 装配未就位）= fail-soft warn（同工作台桥口径），不炸调用方。

/** 流程宿主句柄（open = 打开流程并复位态机到段一） */
export interface AddProjectFlowHandle {
  readonly open: () => void
}

/** 缝的全局挂点形状（页内缝——装配 ↔ 插件两单元） */
interface DshForgeAddProjectFlowGlobal {
  __DSH_FORGE_ADD_PROJECT_FLOW__?: AddProjectFlowHandle
}

/** 读流程宿主句柄（缺席 = undefined——fail-soft 判据） */
export function addProjectFlowHandle(): AddProjectFlowHandle | undefined {
  return (globalThis as DshForgeAddProjectFlowGlobal).__DSH_FORGE_ADD_PROJECT_FLOW__
}

/** 发布/撤销流程宿主句柄（宿主 mount/unmount 期调用；undefined = 撤销） */
export function publishAddProjectFlow(handle: AddProjectFlowHandle | undefined): void {
  ;(globalThis as DshForgeAddProjectFlowGlobal).__DSH_FORGE_ADD_PROJECT_FLOW__ = handle
}

/**
 * 入口触发（项目树「＋」/ hero CTA → 打开添加项目流程）。
 * @param handle - 宿主句柄（缺省读全局缝；显式注入 = 测试/装配面）
 * @returns true = 已触发；false = 宿主缺席（fail-soft warn，装配未就位期入口 no-op）
 */
export function openAddProjectFlow(
  handle: AddProjectFlowHandle | undefined = addProjectFlowHandle(),
): boolean {
  if (handle === undefined) {
    console.warn('dsh-forge web: 添加项目流程宿主缺席（2.12 装配未就位）——入口 no-op')
    return false
  }
  handle.open()
  return true
}
