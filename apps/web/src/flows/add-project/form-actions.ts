// 注册表单动作装配（定位：业务——UF-3 段二交互转移面：依赖注入纯函数，renderToStaticMarkup
// 面测不了的状态转移在此单测——browser-actions / sidebar-actions 同形制）。
// 语义锚：直输改 = 值更新 + touched 置位（AC4 手改判据）；浏览改选落值同径（浏览选定 =
// touched 置位 → 换选工作区时保留）；工作区改选（内「重新选择」/ 外部段一重选）统一走
// relinkWorkspace 联动 diff；浏览取消零副作用（取消点在 dsh create 之前）。
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
