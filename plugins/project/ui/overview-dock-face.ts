// 概览 dock tab 注册面（host-integration-fixes 裁决 1——project = dswf-overview 拥有者）：
// 两段注册（官方口径「adding a type is a registration, never an edit」）：
//   第一段 = sidebarRightTabs.register 页型（guide 入口卡 order 0——官方
//     files/terminal/browser = 10/20/30 排最前；拾取 = 官方 GuideBody
//     tab.actions.openTab(kind, { replaceTab: true }) 原位替换，产品零代码）；
//   第二段 = `sidebar.right.pane.tab` keyed body priority 0（拥有者席位——keyed 升序
//     排序最低者渲染，-10 遮蔽方向只能用于单装兜底）+ children 声明表
//     （OVERVIEW_SECTIONS_CHILDREN——knowledge-dir / AC 进度两子槽宿主单点声明，
//     ForgeOverviewSectionHost 经 renderSlot 消费 roster）。
// 类型注册冲突裁决：官方 registry 同 id 二次注册抛错——task-loop 单装形态会先注册同
// id 页型（其后到 project 时即让位）。先到撞车 = 本面 fail-soft 记挫后经**撞车同表**的
// 官方失效通知缝补判落座：SidebarRightTabRegistry.subscribe（ui-sidebar-right
// lib/client.js:8836-8841——register enter :8711 / dispose leave :8715 均经 refresh() →
// notifySubscribers :8842-8850 同步通知；类型面 types/client/tab-registry.d.ts:215）。
// task-loop 集成切换 dispose 页型 → 同表同步通知 → 重试落座，通知与撞车源同表零代理
// 零时序赌；未落座前通知每次重试（撞车未清重挫不自灭），落座即退订，全走官方
// subscribe + register 正缝，零轮询零缓存。（r4 前版曾代理 slots 槽变更通知——间接缝
// 与单发烧毁，真机实证补判未生效，bug c375d7c3。）
// 数据通道：组件族缺省真身自洽（overviewRpcClientFactory 本地 forgeBugs 读缝 +
// Typert 回落；锚自解析 = anchorProjectResolver 模块单例——桥缺席宿主水化门）。
// 逐面 try/catch fail-soft（单面异常只降本面，console.warn 留痕不炸装配）。
import { PRIORITY_PROJECT_OVERVIEW_OWNER } from '@dsh-forge/lib-ui'
import { DSWF_OVERVIEW_TAB_KIND, ForgeOverviewSectionHost, OVERVIEW_SECTIONS_CHILDREN } from './dock-tabs/dock-tabs.js'
import { registerKeyedSection, type SectionSlotsFace } from './keyed-section.js'
import { SIDEBAR_RIGHT_PANE_TAB_SLOT, type OfficialSeamCtx } from './official-seams.js'

/** 概览页型标题（guide 入口卡与 tab chip 同词——壳侧退役词条同源字面） */
const OVERVIEW_TAB_TITLE = '项目概览'
const OVERVIEW_GUIDE_DESC = '项目与任务总览'

/** 官方右栏 tab 类型注册表窄面（ui-sidebar-right SidebarRightTabRegistry 消费切片） */
interface SidebarRightTabsMirror {
  register(definition: {
    readonly id: string
    readonly kind: string
    readonly title: (address: string) => string
    readonly guide?: readonly {
      readonly id: string
      readonly order: number
      readonly title: () => string
      readonly description?: () => string
    }[]
  }): () => void
}

/** 官方 tab 注册表失效订阅窄面（SidebarRightTabRegistry.subscribe——同步失效回调） */
type SidebarRightTabsSubscribeFace = SidebarRightTabsMirror & {
  subscribe?(listener: () => void): (() => void) | undefined
}

/** 注册面诊断（registered = 实际落座面——e2e/排障锚） */
export interface OverviewDockFaceDiagnostics {
  readonly registered: string[]
}

/**
 * 概览 dock tab 族注册（裁决 1——project 恒 priority 0 拥有并渲染概览主体）：页型类型
 * 定义 + keyed body 两段，逐面 fail-soft。类型撞车（task-loop 单装先注册）= 记挫 +
 * 撞车同表失效订阅补判落座；body 撞车（同 key 同 priority）不吞——越权哨兵直抛外溢。
 */
export function registerOverviewDockFace(
  ctx: OfficialSeamCtx,
  slots: SectionSlotsFace,
): OverviewDockFaceDiagnostics {
  const registered: string[] = []
  const face = (name: string, registerFace: () => void): void => {
    try {
      registerFace()
      registered.push(name)
    } catch (error) {
      console.warn(`[dsh-forge/project] overview dock face '${name}' registration failed——降级不注册`, error)
    }
  }
  const tabs = ctx.get('sidebarRightTabs') as SidebarRightTabsMirror | undefined

  // 第一段：页型类型定义 + guide 入口卡 order 0。撞车（task-loop 单装先注册同 id）=
  // fail-soft 记挫 + 撞车同表失效订阅补判（task-loop 集成切换 dispose 页型 → 同表同步
  // 通知 → 重试落座即退订；subscribe 缺席宿主 = 无补判通道诚实降级不炸装配）。
  {
    if (tabs === undefined || typeof tabs.register !== 'function') {
      console.warn('[dsh-forge/project] ctx.sidebarRightTabs.register absent——概览页型不注册')
    } else {
      let disposeType: (() => void) | undefined
      const tryRegisterType = (): boolean => {
        if (disposeType !== undefined) return true
        try {
          const dispose = tabs.register({
            id: DSWF_OVERVIEW_TAB_KIND,
            kind: DSWF_OVERVIEW_TAB_KIND,
            title: () => OVERVIEW_TAB_TITLE,
            guide: [
              {
                id: 'overview',
                order: 0,
                title: () => OVERVIEW_TAB_TITLE,
                description: () => OVERVIEW_GUIDE_DESC,
              },
            ],
          })
          disposeType = typeof dispose === 'function' ? dispose : undefined
          return true
        } catch (error) {
          // 撞车记留痕（同表订阅补判，落座前每次通知重试；registry 面缺席同径）
          console.warn('[dsh-forge/project] overview tab type registration deferred——等待让位后补判', error)
          return false
        }
      }
      if (tryRegisterType()) registered.push(`${DSWF_OVERVIEW_TAB_KIND}: dock tab type`)
      const registry = tabs as SidebarRightTabsSubscribeFace
      if (disposeType === undefined && typeof registry.subscribe === 'function') {
        let unsubscribe: (() => void) | undefined
        unsubscribe = registry.subscribe(() => {
          if (disposeType !== undefined) return
          if (tryRegisterType()) {
            registered.push(`${DSWF_OVERVIEW_TAB_KIND}: dock tab type`)
            console.info('[dsh-forge/project] overview tab type retry registered——补判落座（e2e 锚）')
            unsubscribe?.()
          }
        })
        ctx.effect?.call?.(
          ctx as object,
          () => () => {
            unsubscribe?.()
          },
          'dswf-overview: 页型补判订阅',
        )
      }
      ctx.effect?.call?.(
        ctx as object,
        () => (typeof disposeType === 'function' ? disposeType : undefined),
        `${DSWF_OVERVIEW_TAB_KIND}: dock tab type`,
      )
    }
  }

  // 第二段：keyed body priority 0（拥有者席位）+ 子槽声明表（knowledge-dir / AC 进度
  // 宿主单点声明——ForgeOverviewSectionHost renderSlot 消费 roster）。同 key 同 priority
  // 撞车由官方 slots 抛错（越权哨兵），face 记挫不外溢炸装配。
  face(`${SIDEBAR_RIGHT_PANE_TAB_SLOT}:${DSWF_OVERVIEW_TAB_KIND}`, () => {
    const dispose = registerKeyedSection(slots, {
      slot: SIDEBAR_RIGHT_PANE_TAB_SLOT,
      key: DSWF_OVERVIEW_TAB_KIND,
      priority: PRIORITY_PROJECT_OVERVIEW_OWNER,
      children: OVERVIEW_SECTIONS_CHILDREN,
      component: ForgeOverviewSectionHost,
    })
    if (dispose === undefined) throw new Error('slots face unavailable')
    ctx.effect?.call?.(ctx as object, () => dispose, `${DSWF_OVERVIEW_TAB_KIND}: dock tab body`)
  })

  return { registered }
}
