// forge:proxy/file-list 数据面（feature：移动端 composer @ 文件 mention——
// 工作区相对路径清单，供手机补全候选；轻量 walk：忽略重/机械目录 + 条目上限）。
// 纯 handler（fake fs 可测走真实 tmpdir）——装配归 proxy-channels。
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** 忽略目录名（机械/重目录——依赖树、版本库元数据、构建产物不进候选）。 */
const IGNORED_DIRS: ReadonlySet<string> = new Set([
  '.git', '.forge', '.dev-tmp', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.turbo', '.venv',
])

/** 条目上限（手机候选面有界——超出截断 + truncated 旗标，诚实降级）。 */
export const FILE_LIST_CAP = 2000

export interface FileListEntry {
  readonly path: string
  readonly dir: boolean
}

export interface FileListResult {
  readonly root: string
  readonly entries: readonly FileListEntry[]
  readonly truncated: boolean
}

/** 工作区文件清单（相对路径 / 归一；目录 + 文件混合，字典序；walk 迭代式防深栈）。 */
export function listWorkspaceFiles(projectRoot: string): FileListResult {
  const root = projectRoot.replaceAll('\\', '/').replace(/\/+$/, '')
  // 根目录可读性外提（缺席/非目录 = 抛——通道层 fail-soft 错误信封，非空清单）
  readdirSync(root)
  const entries: FileListEntry[] = []
  let truncated = false
  const stack: string[] = ['']
  while (stack.length > 0) {
    const rel = stack.pop()!
    const abs = rel === '' ? root : join(root, rel)
    let dirents
    try {
      dirents = readdirSync(abs, { withFileTypes: true })
    } catch {
      continue // 不可读子目录跳过（权限/符号链接悬挂——候选面不阻）
    }
    const rows: FileListEntry[] = []
    for (const dirent of dirents) {
      const childRel = rel === '' ? dirent.name : `${rel}/${dirent.name}`
      if (dirent.isDirectory()) {
        if (IGNORED_DIRS.has(dirent.name)) continue
        rows.push({ path: childRel, dir: true })
        stack.push(childRel)
      } else if (dirent.isFile()) {
        rows.push({ path: childRel, dir: false })
      }
    }
    rows.sort((a, b) => a.path.localeCompare(b.path))
    for (const row of rows) {
      if (entries.length >= FILE_LIST_CAP) {
        truncated = true
        return { root, entries, truncated }
      }
      entries.push(row)
    }
  }
  return { root, entries, truncated }
}
