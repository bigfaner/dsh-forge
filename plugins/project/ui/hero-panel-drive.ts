// hero 空态自判定驱动面（定位：装配——bug 295223da）：hero 面板选中驱动原只存在于壳侧
// ShellHost（heroPanelDrive——boot 期零项目 → layout.selectPanel('dswf-hero')），无壳官方
// 宿主上零驱动 → 面板零呈现（HeroEmpty CTA 不可达）。本面把「空态自判定」收进插件域：
// 无壳官方宿主（壳驱动缝缺席）+ forge.projects 零项目 + 官方面板缺省态 → 插件自选 hero
// 面板一次（官方合法缝 layout.selectPanel，不发明平行机制）。壳宿主（缝在场）不参与——
// ShellHost 单驱动语义不变；让位（首项目落地回会话面板）仍归壳侧边沿驱动，官方宿主上
// 首项目落地后经官方 openSession（selectPanel(null) 同径）自然离开 hero。
// fail-soft：layout 缺席/查询失败/selectPanel 抛错只留诊断痕，不炸装配。
import { HERO_PANEL_KEY } from './hero-panel-face.js'

/** 官方布局服务窄面（ui-layout LayoutController 消费切片——结构同型镜像） */
export interface HeroLayoutFace {
  /** 选中全局 main 面板或回官方会话面板（null；未注册 id 抛错——调用面守卫） */
  selectPanel(panelId: string | null): void
  /** 中央面板选择快照源（activePanelId——空态自判定守卫源；缺席 = 形状降级） */
  readonly panelInfo?: {
    getSnapshot(): { readonly activePanelId?: string | null }
  }
}

/** 诊断行前缀（e2e/排障锚——fail-soft 分支统一携带） */
export const HERO_EMPTY_DRIVE_DIAG_PREFIX = '[dsh-forge/project] hero empty self-drive'

/** 壳驱动页内缝键（bootShell 于就绪门放行前发布——apply 期同步可读，knowledge-face 同源） */
type ShellSeamGlobal = { __DSH_FORGE_HOST_PLUGINS__?: unknown }

/**
 * 壳驱动在场探测（apply/驱动期同步读页内缝）：缝在场 = 壳宿主（ShellHost 自驱动 hero，
 * 插件不参与——单驱动语义）；缺席 = 无壳官方宿主（自判定生效前提）。
 */
export function shellDriverPresentOf(globalObject: ShellSeamGlobal = globalThis as never): boolean {
  return globalObject.__DSH_FORGE_HOST_PLUGINS__ !== undefined
}

/**
 * 空态自判定纯推导（镜像壳侧 heroPanelDrive hero 分支语义）：
 * 官方会话面板缺省（activePanelId null；快照形状漂移 undefined 按缺省口径）且未驱动过
 * → 驱动；已在任意面板（含 hero）或已驱动过 → 不动（不与用户导航争用）。
 */
export function heroEmptySelfDriveOf(activePanelId: string | null | undefined, driven: boolean): boolean {
  return (activePanelId ?? null) === null && !driven
}

/** 驱动依赖面（注入式——测试替身同型；宿主消费点逐项现查不缓存） */
export interface HeroEmptyDriveDeps {
  /** 官方布局服务解析（每调用现查；缺席 = undefined 诚实降级） */
  readonly layoutOf: () => HeroLayoutFace | undefined
  /** 项目数读取（forge.projects Typert 正典通路——非空 = 非空态不驱动） */
  readonly projectsCount: () => Promise<number>
  /** 壳驱动在场探测（缺省 = shellDriverPresentOf 页内缝读；测试面可覆写） */
  readonly shellDriven?: () => boolean
  /** 诊断发射（缺席 = console 兜底，client 束豁免面） */
  readonly diag?: (line: string) => void
}

/**
 * hero 空态自判定（一次性）：无壳官方宿主 + 零项目 + 官方缺省面板 → selectPanel('dswf-hero')。
 * 返回是否实际驱动（诊断/e2e 面）。任一前提不满足或中途异常 = false（fail-soft 留痕）。
 */
export async function startHeroEmptySelfDrive(deps: HeroEmptyDriveDeps): Promise<boolean> {
  const diag = deps.diag ?? ((line: string) => console.warn(line))
  if ((deps.shellDriven ?? shellDriverPresentOf)() === true) return false
  try {
    const count = await deps.projectsCount()
    if (count !== 0) return false
    const layout = deps.layoutOf()
    if (layout === undefined || typeof layout.selectPanel !== 'function') {
      diag(`${HERO_EMPTY_DRIVE_DIAG_PREFIX}: 官方 layout 面缺席——自判定降级不驱动`)
      return false
    }
    const activePanelId = layout.panelInfo?.getSnapshot()?.activePanelId ?? null
    if (!heroEmptySelfDriveOf(activePanelId, false)) return false
    layout.selectPanel(HERO_PANEL_KEY)
    return true
  } catch (error) {
    diag(`${HERO_EMPTY_DRIVE_DIAG_PREFIX}: fail-soft——${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}
