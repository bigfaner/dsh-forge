// 注册表单纯模型（定位：业务——UF-3 段二派生/联动/校验纯函数面，渲染件消费）。
// AC 映射：回填与默认值（AC1 initialFormState / derive* / folderNameOf）、任务清单扁平化派生
// （AC2 flattenWorkspacePath——`/`、`\` → `-`、盘符冒号去除，原型 deriveTaskStore 同口径）、
// 仓内外推导（AC3 isForgeDirExternal——forge 目录是否位于工作区内，段边界敏感 + 大小写不敏感，
// 修正原型裸前缀 slice 口径）、换选联动（AC4 relinkWorkspace——未手改随新工作区重构、
// 手改或浏览选定过的保留，判据 = touched 标记）、非法路径表单态拦截（AC5 validateFormValues）。
// 采集目标形状 = contracts RegisterProjectInput（toRegisterInput——提交执行链归 2.10）。
import type { RegisterProjectInput } from '@dsh-forge/contracts'
import type { BrowserSelection } from './browser-model.js'

/**
 * 任务清单前缀缺省（展示口径 home 相对记法——真实 {dsh-forge-home} 由 2.10 组装/配置面
 * 注入覆盖；M1 仅展示不消费，任务域 M2）。
 */
export const DEFAULT_DSH_FORGE_HOME = '~/.dsh-forge'

/** 表单字段值（采集面 = RegisterProjectInput 四字段；workspaceDir 只读回填） */
export interface FormValues {
  /** 工作区目录（浏览器选定 canonical path——对账 join key；表单内只读） */
  readonly workspaceDir: string
  /** 项目名（自动取文件夹名，可改） */
  readonly name: string
  /** 文档位置 = forge 目录（默认 `<工作区>\.forge`，可直输/浏览改选） */
  readonly forgeDir: string
  /** 知识库目录（默认 `<工作区>\.knowledge`，可直输/浏览改选） */
  readonly knowledgeDir: string
}

/** 可编辑字段（workspaceDir 只读不参与；联动判据维度） */
export type EditableField = 'name' | 'forgeDir' | 'knowledgeDir'

/** 浏览改选目标（「重新选择」= 工作区；「浏览…」= 两目录——DirectoryBrowser 参数化依据） */
export type BrowseTarget = 'workspace' | 'forgeDir' | 'knowledgeDir'

/** 手改/浏览选定标记（AC4 联动规则判据：true = 换选工作区时保留） */
export interface TouchedFields {
  readonly name: boolean
  readonly forgeDir: boolean
  readonly knowledgeDir: boolean
}

/** 表单状态（值 + 手改标记——联动 diff 的完整输入） */
export interface FormState {
  readonly values: FormValues
  readonly touched: TouchedFields
}

/**
 * 路径归一（内部口径）：`/` → `\` + 去尾分隔符（盘符根 `Z:\` → `Z:`，拼接/比较统一基准；
 * 工作区路径来自 host canonical 化，此处仅消解用户态输入的记法差异）。
 */
export function normalizeDirPath(path: string): string {
  return path.replaceAll('/', '\\').replace(/\\+$/, '')
}

/** 工作区目录 → 文件夹名（末段；盘符根 → `Z:`，UNC → 末 share 段，POSIX 兜底同型） */
export function folderNameOf(workspaceDir: string): string {
  const segments = normalizeDirPath(workspaceDir).split('\\').filter((part) => part !== '')
  return segments.at(-1) ?? ''
}

/** 工作区目录 → forge 目录默认值（`<工作区>\.forge`） */
export function deriveForgeDir(workspaceDir: string): string {
  return `${normalizeDirPath(workspaceDir)}\\.forge`
}

/** 工作区目录 → 知识库目录默认值（`<工作区>\.knowledge`） */
export function deriveKnowledgeDir(workspaceDir: string): string {
  return `${normalizeDirPath(workspaceDir)}\\.knowledge`
}

/**
 * canonical path 扁平化（AC2）：`/`、`\` → `-`、盘符冒号去除（`Z:\project\dsh` →
 * `Z-project-dsh`；UNC 双前导 → 双 `-`；POSIX 前导 → 前导 `-`——原型 deriveTaskStore 同口径）。
 */
export function flattenWorkspacePath(workspaceDir: string): string {
  const deColonized = normalizeDirPath(workspaceDir).replace(/^([A-Za-z]):/, '$1')
  return deColonized.replaceAll('\\', '-')
}

/**
 * 任务清单与记录派生（只读自动派生行）：`{dsh-forge-home}/{canonical-path 扁平化}`；
 * 连接符随 home 风格（反斜杠 home → `\`，其余 → `/`），home 尾分隔符剪除。
 */
export function deriveTaskStoreDir(dshForgeHome: string, workspaceDir: string): string {
  const home = dshForgeHome.replace(/[\\/]+$/, '')
  const sep = dshForgeHome.includes('\\') ? '\\' : '/'
  return `${home}${sep}${flattenWorkspacePath(workspaceDir)}`
}

/**
 * 仓内/仓外推导（AC3）：forge 目录是否位于工作区内（true = 仓外）。
 * 段边界敏感（`Z:\project\ds` 不是 `Z:\project\dsh\.forge` 的容器——修正原型裸前缀
 * slice 口径）+ 大小写不敏感（Windows）+ 尾分隔符不干扰；forge 目录 = 工作区根 → 仓内。
 */
export function isForgeDirExternal(workspaceDir: string, forgeDir: string): boolean {
  const ws = normalizeDirPath(workspaceDir).toLowerCase()
  const forge = normalizeDirPath(forgeDir).toLowerCase()
  if (ws === '' || forge === '') return true
  if (forge === ws) return false
  return !forge.startsWith(`${ws}\\`)
}

/** 段一选定 → 表单初始态（AC1：回填工作区 + 文件夹名 + 两目录默认值，全字段未手改） */
export function initialFormState(selection: BrowserSelection): FormState {
  const workspaceDir = selection.path
  return {
    values: {
      workspaceDir,
      name: folderNameOf(workspaceDir),
      forgeDir: deriveForgeDir(workspaceDir),
      knowledgeDir: deriveKnowledgeDir(workspaceDir),
    },
    touched: { name: false, forgeDir: false, knowledgeDir: false },
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
 * touched 标记跨换选保持。任务清单与记录不在状态内（恒随当前工作区派生）。
 */
export function relinkWorkspace(state: FormState, workspaceDir: string): FormState {
  const { values, touched } = state
  return {
    values: {
      workspaceDir,
      name: touched.name ? values.name : folderNameOf(workspaceDir),
      forgeDir: touched.forgeDir ? values.forgeDir : deriveForgeDir(workspaceDir),
      knowledgeDir: touched.knowledgeDir ? values.knowledgeDir : deriveKnowledgeDir(workspaceDir),
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
  return issues
}

/** 采集载荷（RegisterProjectInput 四字段，首尾空白剪除；消费 = 2.10 确认执行链） */
export function toRegisterInput(values: FormValues): RegisterProjectInput {
  return {
    workspaceDir: values.workspaceDir.trim(),
    name: values.name.trim(),
    forgeDir: values.forgeDir.trim(),
    knowledgeDir: values.knowledgeDir.trim(),
  }
}
