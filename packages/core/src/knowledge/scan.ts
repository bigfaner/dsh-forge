// 知识目录扫描（projects.knowledge_dir → 候选文件清单）。定位：业务（3.1）。
// 安全口径（tech-design §Security Mitigations）：rel_path 规范化（'/' 分隔）+ 前缀校验
// （禁 `..` / 绝对路径 / 盘符 / 反斜杠 / 空段）+ 符号链接不跟随（逃逸负样例自证见 scan.test.ts，
// P1 口径同 forge:fs 浏览面）。超 3 层目录仍扫描收录（容错计数需要条目在场），由解析器判超层。
// 只读：索引缓存不落知识目录（Hard Rule 2——缓存只在应用库）。
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { InvalidKnowledgeDirError } from './errors.js'

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

/**
 * 扫描知识目录：递归收集 .md 候选（大小写不敏感），dot 文件/目录与符号链接一律不收
 * （脏文件不进 IndexReport 分母；安全排除不计数）。结果按 relPath 排序（确定性插入序）。
 * 目录不可达/非目录 → InvalidKnowledgeDirError（ERR_INVALID_KNOWLEDGE_DIR）。
 */
export function scanKnowledgeDir(knowledgeDir: string): ScannedKnowledgeFile[] {
  let isDir: boolean
  try {
    isDir = statSync(knowledgeDir).isDirectory()
  } catch (cause) {
    throw new InvalidKnowledgeDirError({ knowledgeDir }, cause)
  }
  if (!isDir) {
    throw new InvalidKnowledgeDirError({ knowledgeDir }, new Error(`路径存在但非目录：${knowledgeDir}`))
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
    if (!isSafeRelPath(relPath)) continue // 防御纵深（walk 产出恒安全；防线自证见负样例）
    const absPath = join(dir, ent.name)
    const { domainPath, depth } = deriveDomainPath(relPath)
    out.push({ absPath, relPath, domainPath, domainDepth: depth, mtimeMs: statSync(absPath).mtimeMs })
  }
}
