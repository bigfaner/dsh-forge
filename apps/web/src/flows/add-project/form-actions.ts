// 注册表单动作装配（定位：业务——UF-3 段二交互转移面：依赖注入纯函数，renderToStaticMarkup
// 面测不了的状态转移在此单测——browser-actions / sidebar-actions 同形制）。
// 语义锚：直输改 = 值更新 + touched 置位（AC4 手改判据）；浏览改选落值同径（浏览选定 =
// touched 置位 → 换选工作区时保留）；工作区改选（内「重新选择」/ 外部段一重选）统一走
// relinkWorkspace 联动 diff；浏览取消零副作用（取消点在 dsh create 之前）。
// fix-14：桥在场时「浏览…」/「重新选择」三 target 同桥复用（系统 OS 目录对话框直选，
// BrowsePanel 回退面不变）——nativeBrowseAction 承载（同步在途守卫防双击双开对话框）。
import type { DirSource } from './dir-source.js'
import type { NativePickSource } from './dir-picker.js'
import {
  editFieldValue,
  relinkWorkspace,
  type BrowseTarget,
  type EditableField,
  type FormState,
} from './form-model.js'

/** 动作依赖（React setState 同形注入——测试替身直落内存） */
export interface FormActionsDeps {
  /** 表单态写（函数式更新） */
  readonly setForm: (updater: (prev: FormState) => FormState) => void
  /** 浏览改选相位写（null = 表单相位） */
  readonly setBrowsing: (target: BrowseTarget | null) => void
}

/** 表单动作集（RegisterForm 装配壳消费；View 回调同形） */
export interface FormActions {
  /** 直输改字段（值更新 + touched 置位——手改联动判据） */
  edit(field: EditableField, value: string): void
  /** 「重新选择」重开浏览器换工作区（浏览相位 = workspace） */
  repick(): void
  /** 「浏览…」改选两目录（浏览相位 = 目标字段） */
  browse(target: BrowseTarget): void
  /** 浏览面板返回（零值变更——取消点安全） */
  cancelBrowse(): void
  /** 浏览确认落值：workspace → 联动 relink；目录 → 回填 + touched（AC4 两分支） */
  applyPick(target: BrowseTarget, dirPath: string): void
  /** 外部换选（2.10 返回上一步重选）：路径变更才 relink（同路径 no-op） */
  relinkExternal(workspaceDir: string): void
}

export function formActions(deps: FormActionsDeps): FormActions {
  return {
    edit: (field, value) => {
      deps.setForm((prev) => editFieldValue(prev, field, value))
    },
    repick: () => {
      deps.setBrowsing('workspace')
    },
    browse: (target) => {
      deps.setBrowsing(target)
    },
    cancelBrowse: () => {
      deps.setBrowsing(null)
    },
    applyPick: (target, dirPath) => {
      deps.setBrowsing(null)
      deps.setForm((prev) =>
        target === 'workspace'
          ? relinkWorkspace(prev, dirPath)
          : editFieldValue(prev, target, dirPath),
      )
    },
    relinkExternal: (workspaceDir) => {
      deps.setForm((prev) =>
        prev.values.workspaceDir === workspaceDir ? prev : relinkWorkspace(prev, workspaceDir),
      )
    },
  }
}

/** 原生浏览改选动作依赖（fix-14 桥在场相位——BrowsePanel 之外的系统对话框直选路径） */
export interface NativeBrowseDeps {
  /** 原生选取源（桥真身/测试桩——取消 null / 选中路径 / reject 错误面） */
  readonly pick: NativePickSource
  /** 目录数据源（canonical 对账——applyListing 同口径经 listDir 对账） */
  readonly dirSource: DirSource
  /** 落值面（BrowsePanel 确认同径：workspace → relink；目录 → 回填 + touched） */
  readonly applyPick: (target: BrowseTarget, dirPath: string) => void
  /** 在途相位回写（true = 对话框打开中——三改选钮禁用防双开；收场恒回 false） */
  readonly onBusy?: (busy: boolean) => void
  /** 错误面回写（pick/对账失败文案；每次起步清零，成功/取消不动旧值语义归零） */
  readonly onError?: (message: string | null) => void
}

/**
 * 原生浏览改选动作（「浏览…」/「重新选择」三 target 同桥复用）：取消零副作用（值不变）；
 * 选中经 dirSource canonical 对账后落值（与 BrowsePanel 确认同径——applyPick 唯一落值口）；
 * 失败回落表单 + 错误文案（不改值）。同步在途守卫 = 双击第二击 no-op（防双开系统对话框）。
 */
export function nativeBrowseAction(deps: NativeBrowseDeps): (target: BrowseTarget) => void {
  let inFlight = false // 同步守卫（setState 异步批处理不可靠——双击竞态在 ref 语义前拦截）
  return (target) => {
    if (inFlight) return
    inFlight = true
    deps.onError?.(null)
    deps.onBusy?.(true)
    void (async () => {
      try {
        const picked = await deps.pick()
        if (picked !== null) {
          const listing = await deps.dirSource(picked) // canonical 对账（不可达 = 失败错误面）
          deps.applyPick(target, listing.path)
        }
      } catch (error) {
        deps.onError?.(error instanceof Error ? error.message : String(error))
      } finally {
        inFlight = false
        deps.onBusy?.(false)
      }
    })()
  }
}
