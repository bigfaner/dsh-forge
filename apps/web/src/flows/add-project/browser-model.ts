// 文件浏览器纯模型（定位：业务——UF-3 段一导航/选中/标记态的纯函数面，渲染件消费）。
// AC 映射：导航与面包屑（AC1）/ 单击选中唯一 + 未选中禁用（AC3）/ ws_path 集合匹配与
// 挂接语义预演（AC2）。拦截语义（AC4）：列举失败时导航态保持原状（组件层只补错误条，
// 不切出浏览器态）——无独立转移函数，见 DirectoryBrowser 装配注释。
import type { DirListing, ProjectSummary } from '@dsh-forge/contracts'

/** 浏览器导航态（cwd = 当前目录；selected = 单击选中项，null = 未选） */
export interface BrowserState {
  /** 当前目录（null = 首拉主目录——startDir 缺省口径） */
  readonly cwd: string | null
  /** 单击选中（唯一；导航即清零） */
  readonly selected: string | null
}

/** 初始态（startDir 缺省 = null → source 缺省请求 = 用户主目录） */
export function initialBrowserState(startDir?: string): BrowserState {
  return { cwd: startDir ?? null, selected: null }
}

/** 导航（双击进入 / 面包屑跳转 / 上一级共用）：cwd 即时切换 + 选中清零（新目录重选） */
export function navigateTo(state: BrowserState, dirPath?: string): BrowserState {
  return { cwd: dirPath ?? null, selected: null }
}

/** 列举成功落位：cwd 对账 host canonical path（listing.path，不信输入原样）+ 选中清零 */
export function applyListing(state: BrowserState, listing: DirListing): BrowserState {
  return { cwd: listing.path, selected: null }
}

/** 单击选中（唯一——后选替换先选） */
export function selectEntry(state: BrowserState, dirPath: string): BrowserState {
  return { ...state, selected: dirPath }
}

/** 确认可用判据（未选中时「下一步」禁用） */
export function canConfirm(state: BrowserState): boolean {
  return state.selected !== null
}

/** 面包屑段（name = 段名；path = 跳转目标） */
export interface CrumbSegment {
  readonly name: string
  readonly path: string
}

/**
 * 路径 → 面包屑段（Windows 盘符路径主口径；`/` 与 `\` 均可切——canonical 对账前的
 * 用户态输入同型；UNC 首段 = 服务器名；POSIX 绝对路径兜底）。
 * 跳转目标 = 逐级前缀（盘符根带尾分隔符，与 host path.resolve 口径一致）。
 */
export function crumbSegments(path: string): CrumbSegment[] {
  if (path === '') return []
  const norm = path.replaceAll('/', '\\')
  const parts = norm.split('\\').filter((part) => part !== '')
  if (parts.length === 0) return []
  const [first, ...rest] = parts as [string, ...string[]]

  if (first.endsWith(':')) {
    // 盘符路径：Z:\project\dsh → [Z: → Z:\, project → Z:\project, dsh → …]
    const segments: CrumbSegment[] = [{ name: first, path: `${first}\\` }]
    let acc = `${first}\\`
    for (const part of rest) {
      acc += part
      segments.push({ name: part, path: acc })
      acc += '\\'
    }
    return segments
  }
  if (norm.startsWith('\\\\')) {
    // UNC：\\server\share\… → server 段目标 \\server（server 根聚合由列举层兜底）
    const segments: CrumbSegment[] = [{ name: first, path: `\\\\${first}` }]
    let acc = `\\\\${first}`
    for (const part of rest) {
      acc += `\\${part}`
      segments.push({ name: part, path: acc })
    }
    return segments
  }
  // POSIX 绝对路径兜底：/home/user → [home → /home, user → /home/user]
  const segments: CrumbSegment[] = [{ name: first, path: `/${first}` }]
  let acc = `/${first}`
  for (const part of rest) {
    acc += `/${part}`
    segments.push({ name: part, path: acc })
  }
  return segments
}

/**
 * 已注册路径集合（ownership 预检可视化数据源 = forge:projects/list 的 ws_path 全集）。
 * 含 archived：core ① 预检 = registry.list() 按 canonical path 匹配（无 archived 维），
 * 归档项目的目录再次注册同样走挂接——标记语义与实际执行链一致。
 */
export function registeredPathsOf(projects: readonly ProjectSummary[]): ReadonlySet<string> {
  return new Set(projects.map((project) => project.wsPath))
}

/** 确认载荷（「下一步」/「选择此文件夹」产出） */
export interface BrowserSelection {
  /** 选定目录（canonical 化后 = 对账 join key） */
  readonly path: string
  /** 已注册命中（挂接语义预演：后续 registerProject 走 attachedToExisting，不登记补偿） */
  readonly registered: boolean
}

/** 选中目录 + 标记命中 → 确认载荷 */
export function selectionOf(dirPath: string, registeredPaths: ReadonlySet<string>): BrowserSelection {
  return { path: dirPath, registered: registeredPaths.has(dirPath) }
}
