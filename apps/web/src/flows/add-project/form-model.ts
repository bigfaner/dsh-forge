// 注册表单纯模型（定位：业务——UF-3 段二派生/联动/校验纯函数面，渲染件消费）。
// AC 映射：回填与默认值（AC1 initialFormState / derive* / folderNameOf）、仓内外推导
// （AC3 isForgeDirExternal——forge 目录是否位于工作区内，段边界敏感 + 大小写不敏感，
// 修正原型裸前缀 slice 口径）、换选联动（AC4 relinkWorkspace——未手改随新工作区重构、
// 手改或浏览选定过的保留，判据 = touched 标记）、非法路径表单态拦截（AC5 validateFormValues）。
// 采集目标形状 = contracts RegisterProjectInput（toRegisterInput——提交执行链归 2.10）。
// 4.3：任务清单派生（flattenWorkspacePath/deriveTaskStoreDir 前端自算）废除——Hard Rule
// 派生行单源 = core deriveTaskStoreDir（RPC forge:projects/deriveTaskStoreDir 下发，
// derive-source 装配；本模块零路径派生残留）。
import type { RegisterProjectInput } from '@dsh-forge/contracts'
import type { BrowserSelection } from './browser-model.js'

/** 表单字段值（采集面 = RegisterProjectInput 四字段；workspaceDir 只读回填） */
export interface FormValues {
  /** 工作区目录（浏览器选定 canonical path——对账 join key；表单内只读） */
  readonly workspaceDir: string
  /** 项目名（自动取文件夹名，可改） */
  readonly name: string
  /** 文档位置 = forge 目录（默认 `<工作区>/.forge`，可直输/浏览改选；分隔符随平台风格） */
  readonly forgeDir: string
  /** 知识库目录（默认 `<工作区>/.knowledge`，可直输/浏览改选；分隔符随平台风格） */
  readonly knowledgeDir: string
  /**
   * worktree 存放目录（1.6 AC3：可空 = 缺省——占位提示默认 `.forge/worktrees/`，空值提交
   * 由 core 注册链落默认 `<工作区>/.forge/worktrees/` 绝对路径；非空须绝对路径）
   */
  readonly worktreeDir: string
}

/** 可编辑字段（workspaceDir 只读不参与；联动判据维度） */
export type EditableField = 'name' | 'forgeDir' | 'knowledgeDir' | 'worktreeDir'

/** 浏览改选目标（「重新选择」= 工作区；「浏览…」= 三目录——DirectoryBrowser 参数化依据） */
export type BrowseTarget = 'workspace' | 'forgeDir' | 'knowledgeDir' | 'worktreeDir'

/** 手改/浏览选定标记（AC4 联动规则判据：true = 换选工作区时保留） */
export interface TouchedFields {
  readonly name: boolean
  readonly forgeDir: boolean
  readonly knowledgeDir: boolean
  readonly worktreeDir: boolean
}

/** 表单状态（值 + 手改标记——联动 diff 的完整输入） */
export interface FormState {
  readonly values: FormValues
  readonly touched: TouchedFields
}

/** Windows 风格路径判定（盘符或 UNC 前缀；POSIX `/` 起首恒 false） */
export function isWindowsStylePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/**
 * 路径归一（内部口径，平台独立）：Windows 风格（盘符/UNC）→ `/` → `\` + 去尾分隔符
 * （盘符根 `Z:\` → `Z:`）；POSIX（`/` 起首）→ 保持 `/` 分隔仅去尾 `/`（POSIX 文件名可含
 * `\`，不重写）。工作区路径来自 host canonical 化，此处仅消解用户态输入的记法差异；
 * 后续拼接/比较的分隔符随路径自身风格（见 dirSeparatorOf）。
 */
export function normalizeDirPath(path: string): string {
  if (isWindowsStylePath(path)) {
    return path.replaceAll('/', '\\').replace(/\\+$/, '')
  }
  return path.replace(/\/+$/, '')
}

/** 目录分隔符（随路径风格：Windows `\` / POSIX `/`——拼接与段边界判定的统一基准；盘符根 `Z:`（归一去尾后）仍按 Windows） */
export function dirSeparatorOf(path: string): '\\' | '/' {
  const norm = normalizeDirPath(path)
  return isWindowsStylePath(path) || /^[A-Za-z]:$/.test(norm) ? '\\' : '/'
}

/**
 * 浏览改选起始目录（「浏览…」回退面——RegisterForm BrowsePanel 相位消费）：
 * 两目录目标 = 输入框值的父目录（落在容器平级浏览改选，而非目标目录内部）；
 * workspace 目标（重新选择）= 工作区自身（无输入框改选语境，口径不变）。
 * 值为空 → undefined = 浏览器缺省口径（用户主目录）；根级值开根目录
 * （`Z:\.forge` → `Z:\` 裸盘符回写分隔符；`/x` → `/` POSIX 根）。
 * Root cause: 旧实现把输入框当前值原样作 startDir——起始落在目标目录内部，
 * 改选需逐级向上导航；父目录推导缺席是根因诞生地（startDir 语义未显式决定）。
 */
export function browseStartDirOf(target: BrowseTarget, values: FormValues): string | undefined {
  if (target === 'workspace') return values.workspaceDir
  const raw = values[target].trim()
  if (raw === '') return undefined
  const sep = dirSeparatorOf(raw)
  const norm = normalizeDirPath(raw)
  const idx = norm.lastIndexOf(sep)
  if (idx < 0) return undefined
  if (idx === 0) return sep // POSIX 根（`/x` → `/`）
  const parent = norm.slice(0, idx)
  return /^[A-Za-z]:$/.test(parent) ? `${parent}${sep}` : parent
}

/** 工作区目录 → 文件夹名（末段；盘符根 → `Z:`，UNC → 末 share 段，POSIX → 末段） */
export function folderNameOf(workspaceDir: string): string {
  const norm = normalizeDirPath(workspaceDir)
  const segments = norm.split(dirSeparatorOf(workspaceDir)).filter((part) => part !== '')
  return segments.at(-1) ?? ''
}

/** 工作区目录 → forge 目录默认值（`<工作区>/.forge`——分隔符随工作区风格） */
export function deriveForgeDir(workspaceDir: string): string {
  return `${normalizeDirPath(workspaceDir)}${dirSeparatorOf(workspaceDir)}.forge`
}

/** 工作区目录 → 知识库目录默认值（`<工作区>/.knowledge`——分隔符随工作区风格） */
export function deriveKnowledgeDir(workspaceDir: string): string {
  return `${normalizeDirPath(workspaceDir)}${dirSeparatorOf(workspaceDir)}.knowledge`
}

/**
 * 仓内/仓外推导（AC3）：forge 目录是否位于工作区内（true = 仓外）。
 * 段边界敏感（`Z:\project\ds` 不是 `Z:\project\dsh\.forge` 的容器——修正原型裸前缀
 * slice 口径）+ 大小写不敏感（Windows）+ 尾分隔符不干扰；forge 目录 = 工作区根 → 仓内。
 * 分隔符随工作区风格（Windows `\` / POSIX `/`）——平台独立。
 */
export function isForgeDirExternal(workspaceDir: string, forgeDir: string): boolean {
  const ws = normalizeDirPath(workspaceDir).toLowerCase()
  const forge = normalizeDirPath(forgeDir).toLowerCase()
  if (ws === '' || forge === '') return true
  if (forge === ws) return false
  const sep = dirSeparatorOf(workspaceDir)
  return !forge.startsWith(`${ws}${sep}`)
}

/** 段一选定 → 表单初始态（AC1：回填工作区 + 文件夹名 + 两目录默认值，全字段未手改；worktree 目录留空 = 缺省） */
export function initialFormState(selection: BrowserSelection): FormState {
  const workspaceDir = selection.path
  return {
    values: {
      workspaceDir,
      name: folderNameOf(workspaceDir),
      forgeDir: deriveForgeDir(workspaceDir),
      knowledgeDir: deriveKnowledgeDir(workspaceDir),
      worktreeDir: '',
    },
    touched: { name: false, forgeDir: false, knowledgeDir: false, worktreeDir: false },
  }
}

/** 手改/浏览选定落值（同型转移：值更新 + 该字段 touched 置位——浏览改选同径） */
export function editFieldValue(state: FormState, field: EditableField, value: string): FormState {
  return {
    values: { ...state.values, [field]: value },
    touched: { ...state.touched, [field]: true },
  }
}

/**
 * 换选工作区联动（AC4）：未手改字段随新工作区重构、手改或浏览选定过的字段保留；
 * touched 标记跨换选保持。任务清单与记录不在状态内（4.3 起 = RPC 派生行，装配壳
 * 按 workspaceDir 预检驱动——本模型零涉及）。
 */
export function relinkWorkspace(state: FormState, workspaceDir: string): FormState {
  const { values, touched } = state
  return {
    values: {
      workspaceDir,
      name: touched.name ? values.name : folderNameOf(workspaceDir),
      forgeDir: touched.forgeDir ? values.forgeDir : deriveForgeDir(workspaceDir),
      knowledgeDir: touched.knowledgeDir ? values.knowledgeDir : deriveKnowledgeDir(workspaceDir),
      // worktree 目录缺省语义 = 空（不随工作区派生——默认绝对路径由 core 注册链落），手改/浏览选定保留
      worktreeDir: touched.worktreeDir ? values.worktreeDir : '',
    },
    touched,
  }
}

/** 字段归属（错误行定位） */
export type FormField = 'workspaceDir' | EditableField

/** 表单态校验问题（AC5：非法路径拦截于表单——不出表单不达提交点） */
export interface FormIssue {
  readonly field: FormField
  readonly message: string
}

/** 绝对路径判据：盘符（双分隔符）/ UNC / POSIX 根 */
export function isAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('/')
}

/** 表单态校验（纯函数——问题随当前值即时重算，默认值口径恒合法不闪错） */
export function validateFormValues(values: FormValues): FormIssue[] {
  const issues: FormIssue[] = []
  if (values.workspaceDir.trim() === '') {
    issues.push({ field: 'workspaceDir', message: '工作区目录不能为空' })
  }
  if (values.name.trim() === '') {
    issues.push({ field: 'name', message: '项目名不能为空' })
  }
  const forgeDir = values.forgeDir.trim()
  if (forgeDir === '') {
    issues.push({ field: 'forgeDir', message: '文档位置（forge 目录）不能为空' })
  } else if (!isAbsolutePath(forgeDir)) {
    issues.push({ field: 'forgeDir', message: '文档位置（forge 目录）需为绝对路径' })
  }
  const knowledgeDir = values.knowledgeDir.trim()
  if (knowledgeDir === '') {
    issues.push({ field: 'knowledgeDir', message: '知识库目录不能为空' })
  } else if (!isAbsolutePath(knowledgeDir)) {
    issues.push({ field: 'knowledgeDir', message: '知识库目录需为绝对路径' })
  }
  // worktree 目录（1.6 AC3）：空 = 缺省（合法——默认绝对路径由 core 注册链落）；非空须绝对路径
  const worktreeDir = values.worktreeDir.trim()
  if (worktreeDir !== '' && !isAbsolutePath(worktreeDir)) {
    issues.push({ field: 'worktreeDir', message: 'worktree 目录需为绝对路径（留空使用默认 .forge/worktrees/）' })
  }
  return issues
}

/** 采集载荷（RegisterProjectInput 字段，首尾空白剪除；消费 = 2.10 确认执行链） */
export function toRegisterInput(values: FormValues): RegisterProjectInput {
  return {
    workspaceDir: values.workspaceDir.trim(),
    name: values.name.trim(),
    forgeDir: values.forgeDir.trim(),
    knowledgeDir: values.knowledgeDir.trim(),
    // 空 = 缺省（字段省略——core 注册链落默认 `<工作区>/.forge/worktrees/` 绝对路径）
    worktreeDir: values.worktreeDir.trim() === '' ? undefined : values.worktreeDir.trim(),
  }
}
