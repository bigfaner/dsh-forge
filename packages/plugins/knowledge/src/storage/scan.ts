// 知识目录扫描（自持拷——core src/knowledge/scan.ts 同口径，零 core import：SC-2 铁律；
// core 域随三表退役整体移除，本件为 knowledge 插件域唯一扫描正本）。
// 安全口径：rel_path 规范化（'/' 分隔）+ 前缀校验（禁 `..` / 绝对路径 / 盘符 / 反斜杠 /
// 空段）+ 符号链接不跟随；dot 文件/目录不收；只读——索引缓存不落知识目录（Hard Rule 2）。
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 扫描产物：候选文件（解析层消费；mtime 供 updated 缺省） */
export interface ScannedKnowledgeFile {
  /** 绝对路径 */
  absPath: string
  /** 相对知识目录的规范化路径（'/' 分隔，含文件名；已过前缀校验） */
  relPath: string
  /** 域 = 目录段 '/' 连接（根文件 = ''） */
  domainPath: string
  /** 域层数（根文件 = 0） */
  domainDepth: number
  /** 文件 mtime（毫秒） */
  mtimeMs: number
}

/** rel_path 前缀校验：非空、非绝对（POSIX 根 / Windows 盘符 / UNC）、无反斜杠、段皆实体名（禁 `..`/`.`/空段） */
export function isSafeRelPath(relPath: string): boolean {
  if (relPath === '') return false
  if (relPath.startsWith('/')) return false // POSIX 绝对
  if (/^[A-Za-z]:/.test(relPath)) return false // Windows 盘符
  if (relPath.includes('\\')) return false // UNC 与反斜杠分隔
  const segments = relPath.split('/')
  return segments.every((s) => s !== '' && s !== '.' && s !== '..')
}

/** 域 = 目录路径派生（单一事实源；根文件 → 空域零层） */
export function deriveDomainPath(relPath: string): { domainPath: string; depth: number } {
  const segments = relPath.split('/')
  const dirSegments = segments.slice(0, -1)
  return { domainPath: dirSegments.join('/'), depth: dirSegments.length }
}

/** 知识目录非法/不可达（扫描唯一 typed 错——rebuild 消费面 fail-loud） */
export class InvalidKnowledgeDirError extends Error {
  constructor(
    readonly knowledgeDir: string,
    cause: unknown,
  ) {
    super(`知识目录不可达或非法：${knowledgeDir}（${String(cause)}）`)
    this.name = 'InvalidKnowledgeDirError'
  }
}

/**
 * 扫描知识目录：递归收集 .md 候选（大小写不敏感），dot 文件/目录与符号链接一律不收。
 * 结果按 relPath 排序（确定性插入序）。目录不可达/非目录 → InvalidKnowledgeDirError。
 */
export function scanKnowledgeDir(knowledgeDir: string): ScannedKnowledgeFile[] {
  let isDir: boolean
  try {
    isDir = statSync(knowledgeDir).isDirectory()
  } catch (cause) {
    throw new InvalidKnowledgeDirError(knowledgeDir, cause)
  }
  if (!isDir) {
    throw new InvalidKnowledgeDirError(knowledgeDir, new Error(`路径存在但非目录：${knowledgeDir}`))
  }

  const files: ScannedKnowledgeFile[] = []
  walk(knowledgeDir, [], files)
  files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
  return files
}

/** 深度优先收集（segments = 相对根的目录段栈） */
function walk(dir: string, segments: readonly string[], out: ScannedKnowledgeFile[]): void {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue // dot 文件/目录：脏文件不入候选
    if (ent.isSymbolicLink()) continue // 符号链接不跟随（逃逸防线；junction 同为 reparse 点）
    if (ent.isDirectory()) {
      walk(join(dir, ent.name), [...segments, ent.name], out)
      continue
    }
    if (!ent.isFile() || !/\.md$/i.test(ent.name)) continue // 仅 Markdown 候选
    const relPath = [...segments, ent.name].join('/')
    if (!isSafeRelPath(relPath)) continue // 防御纵深（walk 产出恒安全）
    const absPath = join(dir, ent.name)
    const { domainPath, depth } = deriveDomainPath(relPath)
    out.push({ absPath, relPath, domainPath, domainDepth: depth, mtimeMs: statSync(absPath).mtimeMs })
  }
}
