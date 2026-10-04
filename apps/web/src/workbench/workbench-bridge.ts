// 工作台桥（定位：装配——页面全局 __DSH_FORGE_WORKBENCH__ 的本体，fix-25 重排）。
// 动机：产品 client 插件（持有官方 layout/sidebarRight 服务）与壳 bundle 组件（React 面）
// 分属两个求值单元，跨单元缝 = 页内全局——与 __DSH_FORGE_VIEWS__（组件源发布）/
// __DSH_FORGE_ADD_PROJECT_FLOW__（流程打开缝）同族。
// fix-25 形态：中区互换 = 官方 layout.selectPanel（视图态机退役）——桥 = 官方面板的
// 导航窄面 + 知识抽屉目标缝（召回视图跳转 → 知识面板抽屉打开——两棵独立槽位树的
// 唯一通道）+ e2e 载体（bridgeDispatch 面历史兼容：showSession/showKnowledge 直达）。
// 桥由插件 apply 期经发布面工厂创建（createWorkbenchBridge——nav 闭包绑定官方
// layout.selectPanel）；缺席期（插件未激活）导航/跳转 fail-soft no-op。
import { KNOWLEDGE_PANEL_KEY } from './panel-model.js'

/** 官方面板导航窄面（插件侧绑定 layout.selectPanel——null = 回官方会话面板） */
export interface ForgeCenterNav {
  /** 进知识面板（官方 layout.selectPanel('dswf-knowledge')） */
  showKnowledge(): void
  /** 回会话面板（官方 layout.selectPanel(null)——官方 openSession 同径收口） */
  showSession(): void
}

/** 桥快照（知识抽屉目标——召回视图跳转与知识面板消费的唯一共享态） */
export interface ForgeWorkbenchSnapshot {
  /** 知识详情抽屉打开条目（null = 关闭） */
  readonly drawerEntryId: number | null
}

/** 工作台桥（导航 + 抽屉缝；快照源形状 = useSyncExternalStore 可直订） */
export interface WorkbenchBridge extends ForgeCenterNav {
  /** 召回行跳转：打开知识面板 + 抽屉定位条目（UF-4→UF-5 跨树转移面） */
  openKnowledgeEntry(entryId: number): void
  /** 快照订阅（知识面板消费——抽屉目标变更驱动） */
  subscribe(listener: () => void): () => void
    /** 当前快照（身份稳定——未变更恒同引用） */
  getSnapshot(): ForgeWorkbenchSnapshot
  /** 抽屉态写回（知识面板卡片点击/✕ 关闭——装配单向回流） */
  setDrawerEntry(entryId: number | null): void
}

/** 桥的全局挂点（与 __DSH_FORGE_VIEWS__ 同族：装配 ↔ 插件两单元的页内缝） */
export interface DshForgeWorkbenchGlobal {
  __DSH_FORGE_WORKBENCH__?: WorkbenchBridge
}

/** 读工作台桥（缺席 = undefined——fail-soft 判据；e2e/排障面） */
export function workbenchBridge(): WorkbenchBridge | undefined {
  return (globalThis as DshForgeWorkbenchGlobal).__DSH_FORGE_WORKBENCH__
}

/**
 * 创建并发布工作台桥（插件 apply 期调用——nav 闭包绑定官方 layout.selectPanel）。
 * 快照源为最小 store（身份稳定；订阅同步通知）。发布与创建一体：桥的本体即页内全局。
 */
export function createWorkbenchBridge(nav: ForgeCenterNav): WorkbenchBridge {
  let snapshot: ForgeWorkbenchSnapshot = { drawerEntryId: null }
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  const bridge: WorkbenchBridge = {
    showKnowledge: nav.showKnowledge,
    showSession: nav.showSession,
    openKnowledgeEntry: (entryId: number): void => {
      snapshot = { drawerEntryId: entryId }
      nav.showKnowledge()
      notify()
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: (): ForgeWorkbenchSnapshot => snapshot,
    setDrawerEntry: (entryId: number | null): void => {
      if (snapshot.drawerEntryId === entryId) return
      snapshot = { drawerEntryId: entryId }
      notify()
    },
  }
  ;(globalThis as DshForgeWorkbenchGlobal).__DSH_FORGE_WORKBENCH__ = bridge
  return bridge
}

/**
 * 撤销/发布工作台桥（undefined = 撤销；幂等）。调用面口径（fix-36 标注）：生产撤销不走
 * 本函数——plugin.ts（classic script 自含纪律，禁 import 本模块）在 overlay 洞 dispose 与
 * apply catch 两径直写全局（fix-33 ⑥ 双径注记）；本函数的撤销消费面 = 测试隔离
 * （workbench-bridge.test 逐例清全局）。
 */
export function publishWorkbenchBridge(bridge: WorkbenchBridge | undefined): void {
  ;(globalThis as DshForgeWorkbenchGlobal).__DSH_FORGE_WORKBENCH__ = bridge
}

/** 知识面板 key 再导出（桥消费方 nav 绑定的同源常量） */
export { KNOWLEDGE_PANEL_KEY }
