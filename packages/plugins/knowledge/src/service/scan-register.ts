// stage② 1.6 存量收编服务面（提案 §2.5/§2.6）：scan 只读体检 + register 幂等注册。
// scan = 零写入体检——违规清单（frontmatter 契约/ id 缺席或非法/域超层）与重复清单
// （title_norm 归一重复 + 全文 content_hash 重复）逐文件指名，供存量收编前置盘点。
// register = 注册收编正门：wsPath realpath canonical 化；知识目录落系统目录（Windows/
// Program Files/ProgramData/$Recycle.Bin/盘符根等）拒收；知识目录自身为 reparse 点
//（符号链接/junction）拒收——scan.ts 扫描层只拒「目录内条目」的 reparse，本面拒目录
// 本身；通过后 upsert 注册行（幂等重入同值）+ rebuild 入库，status 缺省 unconfirmed
//（parser/rebuild 归一面：三态外一律 unconfirmed——§2.4 纯新条目口径）。
import { existsSync, lstatSync, mkdirSync, readFileSync, type Stats } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import type Database from 'better-sqlite3'
import { canonicalWsPath, createKnowledgeRegistry } from '../storage/registry.js'
import { scanKnowledgeDir } from '../storage/scan.js'
import { parseKnowledgeFile } from '../storage/parser.js'
import { rebuildKnowledgeIndex, normalizeTitleNorm } from '../storage/rebuild.js'
import {
  KNOWLEDGE_REGISTER_EVENT,
  emitStorageDiag,
  storageDiag,
  type DiagEmitter,
} from '../storage/diag.js'
import { isValidSlugId } from './write.js'
import type {
  KnowledgeScanReport,
  RegisterKnowledgeOutcome,
  RegisterKnowledgeQuery,
  ScanDuplicateGroup,
  ScanViolation,
} from './types.js'

/** 系统目录段（Windows 系统面——注册键落入即拒收；大小写不敏感） */
const SYSTEM_DIR_SEGMENTS = new Set([
  'windows',
  'program files',
  'program files (x86)',
  'program files (x64)',
  'programdata',
  '$recycle.bin',
  'system volume information',
  'perflogs',
  'winnt',
  'config.msi',
])

/** 知识目录系统面判定：盘符/POSIX 根目录本体，或任一路径段命中系统目录集 */
export function isSystemDir(dir: string): boolean {
  const normalized = dir.replace(/[\\/]+$/, '')
  if (/^[A-Za-z]:$/.test(normalized) || normalized === '') return true // 盘符根
  const segments = normalized.split(/[\\/]+/).filter((s) => s !== '')
  return segments.some((s) => SYSTEM_DIR_SEGMENTS.has(s.toLowerCase()))
}

/** 系统盘外卷根（UNC 根/网络卷）与不可达路径的注册键不拒 unreachable——建面语义承载 */
export function createScanRegister(deps: { db: Database.Database; emit?: DiagEmitter }) {
  const { db, emit } = deps
  const registry = createKnowledgeRegistry(db)

  /**
   * scan 只读体检（零写入）：违规清单（frontmatter 契约逐项 + id 缺席/非法）+ 重复清单
   * （title_norm / content_hash 分组，≥2 成组逐文件指名）。目录不可达 fail-loud
   * （InvalidKnowledgeDirError 自 storage/scan 透传）。
   */
  function scanKnowledge(knowledgeDir: string): KnowledgeScanReport {
    const files = scanKnowledgeDir(knowledgeDir)
    const violations = new Map<string, string[]>()
    const addViolation = (relPath: string, reason: string): void => {
      const list = violations.get(relPath) ?? []
      list.push(reason)
      violations.set(relPath, list)
    }
    const titleGroups = new Map<string, string[]>()
    const contentGroups = new Map<string, string[]>()

    for (const f of files) {
      let content: string
      try {
        content = readFileSync(f.absPath, 'utf8')
      } catch {
        addViolation(f.relPath, 'unreadable')
        continue
      }
      const outcome = parseKnowledgeFile({
        relPath: f.relPath,
        domainPath: f.domainPath,
        domainDepth: f.domainDepth,
        content,
        mtime: new Date(f.mtimeMs),
      })
      if (!outcome.ok) {
        addViolation(f.relPath, outcome.reason)
        continue
      }
      const { frontmatter: fm, meta } = outcome.entry
      if (meta.id === undefined) addViolation(f.relPath, 'id-missing')
      else if (!isValidSlugId(meta.id)) addViolation(f.relPath, 'id-invalid')
      // 重复清单（已过契约面才计入——违规文件先治违规）；content 重复按正文 hash
      //（frontmatter 元数据差异不算——「同正文双处维护」语义；空正文摘要型存根无重复信号）
      const tn = normalizeTitleNorm(fm.title)
      const tList = titleGroups.get(tn) ?? []
      tList.push(f.relPath)
      titleGroups.set(tn, tList)
      const body = matter(content).content
      if (body.trim() !== '') {
        const bodyDigest = createHash('sha256').update(body, 'utf8').digest('hex')
        const cList = contentGroups.get(bodyDigest) ?? []
        cList.push(f.relPath)
        contentGroups.set(bodyDigest, cList)
      }
    }

    const duplicates: ScanDuplicateGroup[] = []
    for (const group of titleGroups.values()) {
      if (group.length >= 2) duplicates.push({ basis: 'title', relPaths: [...group].sort() })
    }
    for (const group of contentGroups.values()) {
      if (group.length >= 2) duplicates.push({ basis: 'content', relPaths: [...group].sort() })
    }

    const violationList: ScanViolation[] = [...violations.entries()]
      .map(([relPath, reasons]) => ({ relPath, reasons: [...new Set(reasons)] }))
      .sort((a, b) => (a.relPath < b.relPath ? -1 : 1))
    return {
      knowledgeDir,
      fileCount: files.length,
      violations: violationList,
      duplicates: duplicates.sort((a, b) => (a.relPaths[0]! < b.relPaths[0]! ? -1 : 1)),
    }
  }

  /**
   * register 幂等注册（收编正门）：canonical 化 → 系统目录/reparse/不可达三拒收 →
   * 注册行 upsert（幂等）→ rebuild 入库（status 缺省 unconfirmed）。拒绝逐例
   * knowledge-register 埋点（warn——与失败注册行同面）。
   */
  async function registerKnowledge(q: RegisterKnowledgeQuery): Promise<RegisterKnowledgeOutcome> {
    // reparse 检查在 canonical 化之前（realpath 会展开符号链接/junction——先验原拼写）
    const rawKnowledgeDir = q.knowledgeDir !== undefined && q.knowledgeDir !== ''
      ? q.knowledgeDir
      : join(canonicalWsPath(q.wsPath), '.knowledge')
    const wsPath = canonicalWsPath(q.wsPath)
    const knowledgeDir = q.knowledgeDir !== undefined && q.knowledgeDir !== ''
      ? canonicalWsPath(q.knowledgeDir)
      : join(wsPath, '.knowledge')
    const reject = (reason: 'system-dir' | 'reparse-point' | 'unreachable', detail: string): RegisterKnowledgeOutcome => {
      emitStorageDiag(
        emit,
        storageDiag('warn', KNOWLEDGE_REGISTER_EVENT, `注册拒收（${reason}）：${detail}`, {
          cwd: wsPath,
          projectId: q.projectId,
        }),
      )
      return { outcome: 'rejected', reason, detail }
    }

    if (isSystemDir(knowledgeDir) || isSystemDir(wsPath)) {
      return reject('system-dir', `知识目录/工作区落系统目录：${knowledgeDir}`)
    }
    if (existsSync(rawKnowledgeDir)) {
      let rawStat: Stats
      try {
        rawStat = lstatSync(rawKnowledgeDir)
      } catch (cause) {
        return reject('unreachable', `知识目录不可达：${rawKnowledgeDir}（${String(cause)}）`)
      }
      if (!rawStat.isDirectory() && !rawStat.isSymbolicLink()) {
        return reject('unreachable', `路径存在但非目录：${rawKnowledgeDir}`)
      }
      if (rawStat.isSymbolicLink()) {
        return reject('reparse-point', `知识目录为 reparse 点（符号链接/junction）拒收：${rawKnowledgeDir}`)
      }
    } else {
      try {
        mkdirSync(knowledgeDir, { recursive: true })
      } catch (cause) {
        return reject('unreachable', `知识目录不可建：${knowledgeDir}（${String(cause)}）`)
      }
    }

    const row = registry.upsert(wsPath, knowledgeDir, q.projectId)
    emitStorageDiag(
      emit,
      storageDiag('info', KNOWLEDGE_REGISTER_EVENT, `注册收编：${row.wsPath} → ${row.knowledgeDir}`, {
        cwd: row.wsPath,
        projectId: row.projectId ?? q.projectId,
      }),
    )
    let indexed = 0
    let skipped = 0
    try {
      const report = rebuildKnowledgeIndex(db, { emit })
      indexed = report.indexed
      skipped = report.skipped
    } catch (cause) {
      emitStorageDiag(
        emit,
        storageDiag('error', KNOWLEDGE_REGISTER_EVENT, `注册后入库重建失败：${row.wsPath}（${String(cause)}）`, {
          cwd: row.wsPath,
          stack: cause instanceof Error ? cause.stack : undefined,
        }),
      )
      throw cause
    }
    return { outcome: 'registered', wsPath: row.wsPath, knowledgeDir: row.knowledgeDir, indexed, skipped }
  }

  return { scanKnowledge, registerKnowledge }
}
