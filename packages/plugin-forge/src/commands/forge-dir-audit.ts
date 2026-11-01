// commands · /forge-dir-audit 指令 handler（workspace-artifact-governance §2.5）：
// 主职责 = 目录结构审计——command plane 机械扫描现实目录树（深度上限 3 层禁无限递归；
// 跳过 node_modules 等已知重目录；符号链接/junction 条目在场但不深入），与产物存储地图
// （§2.1.1——STORAGE_MAP_DIRS 单源复用 forge-dir-init）逐分区比对产出差异载荷三类：
// 缺失分区 / 越位目录 / 游离散件。次职责 = 产物归位核对（过程文档是否落在地图分区、
// 临时文件是否散落——散件/临时后缀文件归类即核对产物）。差异载荷经 followup 同径
// （/run-dag-tasks commitDispatchLine 先例）提交敲指令会话 agent 恰一个分析回合，agent
// 按公约只出建议清单（纯消息文本）呈报用户——audit 自身只读不写（零删除/零创建）、
// 不建任何派发面；清理建议统一出口归 forge-artifact-lifecycle（提案 §2.4）。
import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { forgeCommandLineMessage, emitForgeDiag } from '../faces.js'
import type { ForgeCommandInvocation, ForgeCommandResult, ForgeDiagEmitFace } from '../faces.js'
import { STORAGE_MAP_DIRS } from './forge-dir-init.js'

/** 地图分区单源再导出（单测/消费面同一入口——避免 init/audit 双 import 键漂移） */
export { STORAGE_MAP_DIRS }

/** 指令名（无 input 描述符——无参指令，composer 不展示占位） */
export const FORGE_DIR_AUDIT_NAME = 'forge-dir-audit'

/** 扫描深度上限（提案 §2.5 硬约束——禁无限递归；深度 = 相对根的路径段数） */
export const AUDIT_MAX_DEPTH = 3

/**
 * 已知重目录跳过集（目录名级——node_modules 依赖树 / 构建产物 / 缓存类）；
 * .forge/worktrees（派发工作树，重）按完整相对路径另跳。
 */
const SKIP_DIR_NAMES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'release',
  '.venv',
  '__pycache__',
  '.e2e-tmp',
])

/** 游离散件的临时文件后缀判据（次职责「临时文件是否散落」机械面——根目录散落即命中） */
const TEMP_FILE_EXTENSIONS: ReadonlySet<string> = new Set(['.log', '.tmp', '.bak', '.dump', '.swp'])

/** 地图分区允许集（.forge 前缀相对路径——含分区前缀目录 docs 与 legacy 备份命名空间（提案 §2.2）） */
const MAP_ALLOWED_DIRS: ReadonlySet<string> = new Set([
  '.forge',
  '.forge/docs',
  '.forge/docs/legacy',
  ...STORAGE_MAP_DIRS.map((dir) => `.forge/${dir}`),
])

/** 扫描条目（rel = '/' 分隔的根相对路径；kind = dir|file|symlink） */
export interface ScanEntry {
  readonly rel: string
  readonly kind: 'dir' | 'file' | 'symlink'
}

/**
 * 机械扫描现实目录树（只读）：深度上限 AUDIT_MAX_DEPTH（禁无限递归）；SKIP_DIR_NAMES
 * 命中目录不深入；符号链接/junction（lstat 判定）条目在场但不深入——junction 目标子树
 * 不触达。readdirSync 逐层、零递归库依赖。
 */
export function scanDirTree(root: string): readonly ScanEntry[] {
  const entries: ScanEntry[] = []
  const walk = (absDir: string, relDir: string): void => {
    let names: string[]
    try {
      names = readdirSync(absDir)
    } catch {
      return // 不可读目录（权限/竞态删除）——fail-soft 跳过，扫描不炸
    }
    for (const name of names) {
      const rel = relDir === '' ? name : `${relDir}/${name}`
      const depth = rel.split('/').length
      if (depth > AUDIT_MAX_DEPTH) continue
      let kind: ScanEntry['kind']
      try {
        const stat = lstatSync(join(absDir, name))
        kind = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'dir' : 'file'
      } catch {
        continue // 竞态消失——跳过
      }
      entries.push({ rel, kind })
      if (kind === 'dir' && !SKIP_DIR_NAMES.has(name)) walk(join(absDir, name), rel)
    }
  }
  walk(root, '')
  return entries
}

/** 审计差异载荷（提案 §2.5 三类——地图比对产物，纯读派生零副作用） */
export interface DirAuditDiff {
  /** 缺失分区：地图分区目录不在场（.forge 相对路径） */
  readonly missingPartitions: readonly string[]
  /** 越位目录：.forge 域内不在地图允许集的目录（含 .forge/docs 下非地图子目录） */
  readonly misplacedDirs: readonly string[]
  /** 游离散件：.forge 直下散落文件 + 根目录临时后缀文件（临时文件散落核对产物） */
  readonly strayFiles: readonly string[]
}

/**
 * 目录树与存储地图比对（纯函数形态——输入扫描条目 + 根存在性探针，零副作用）：
 * ①缺失分区 = 地图分区 rel 不在扫描 dir 集；②越位目录 = '.forge/' 前缀 dir 条目中
 * 不在 MAP_ALLOWED_DIRS 者（过程文档归位核对——docs 下非地图子目录即越位）；
 * ③游离散件 = '.forge' 直下 file 条目 + 根级临时后缀 file 条目。
 */
export function auditFromScan(entries: readonly ScanEntry[]): DirAuditDiff {
  const dirSet = new Set(entries.filter((entry) => entry.kind === 'dir').map((entry) => entry.rel))
  const missingPartitions = STORAGE_MAP_DIRS.filter((dir) => !dirSet.has(`.forge/${dir}`)).map((dir) => dir)
  const misplacedDirs = entries
    .filter((entry) => entry.kind === 'dir' && entry.rel.startsWith('.forge/') && !MAP_ALLOWED_DIRS.has(entry.rel))
    .map((entry) => entry.rel)
  const strayFiles = entries
    .filter((entry) => {
      if (entry.kind !== 'file' && entry.kind !== 'symlink') return false
      if (entry.rel.startsWith('.forge/') && !entry.rel.slice('.forge/'.length).includes('/')) return true
      return !entry.rel.includes('/') && TEMP_FILE_EXTENSIONS.has(entry.rel.slice(entry.rel.lastIndexOf('.')))
    })
    .map((entry) => entry.rel)
  return { missingPartitions, misplacedDirs, strayFiles }
}

/** 便捷组合：扫描 + 比对（handler 消费） */
export function auditDirTree(root: string): DirAuditDiff {
  return auditFromScan(scanDirTree(root))
}

/** 差异是否为空（零差异 = 不提交 agent 分析回合——无内容可分析） */
export function isDiffEmpty(diff: DirAuditDiff): boolean {
  return diff.missingPartitions.length === 0 && diff.misplacedDirs.length === 0 && diff.strayFiles.length === 0
}

/** 差异载荷文本（agent 分析回合输入——三类差异逐行列出 + 只建议不执行约束内嵌） */
export function formatAuditPayload(diff: DirAuditDiff): string {
  const lines: string[] = [
    '[forge-dir-audit] 工作区目录结构审计差异载荷（机械扫描，深度上限 3 层）如下。',
    '请按产物存储地图公约分析，只输出目录处理建议清单（纯文本消息呈报用户）——只建议不执行：不删除、不创建、不移动任何文件，不创建任何任务或派发。',
  ]
  if (diff.missingPartitions.length > 0) {
    lines.push(`缺失分区（应在 .forge 下而缺席）：${diff.missingPartitions.map((dir) => `.forge/${dir}`).join('、')}`)
  }
  if (diff.misplacedDirs.length > 0) {
    lines.push(`越位目录（.forge 域内不在地图允许集）：${diff.misplacedDirs.join('、')}`)
  }
  if (diff.strayFiles.length > 0) {
    lines.push(`游离散件（.forge 直下散落文件 / 根目录临时文件）：${diff.strayFiles.join('、')}`)
  }
  return lines.join('\n')
}

/** handler 依赖（followup 目标解析三段——激活活根 / registry / ctx.parent fallback，/run-dag-tasks 同径装配） */
export interface ForgeDirAuditDeps {
  /** agentsRegistry 活根解析（缺席 = 退回 ctx.parent fallback） */
  readonly resolveAgent?: (ownerSessionId: string) => unknown
  /** 未进入会话激活面（host sessionController.resolveAgent——缺席 = 跳过激活步） */
  readonly enterAgent?: (ownerSessionId: string) => Promise<unknown>
  /** 诊断发射缝（diag-face-consolidation——提交 fail-soft 告警；缺席 = console 兜底） */
  readonly diag?: ForgeDiagEmitFace
}

/** handler（ForgeCommandDefinition.handler 形状——扫描只读 + followup 提交，零文件系统变更） */
export function createForgeDirAuditHandler(
  deps: ForgeDirAuditDeps = {},
): (invocation: ForgeCommandInvocation) => Promise<ForgeCommandResult> {
  return async ({ agent }: ForgeCommandInvocation): Promise<ForgeCommandResult> => {
    const root = agent.session.header?.cwd ?? agent.session.cwd
    if (root === undefined || root.trim() === '') {
      return { kind: 'error', text: '无法解析会话工作区根（header.cwd 缺席），目录审计未执行' }
    }

    // ① 机械扫描 + 地图比对（纯读——零写入面）
    const diff = auditDirTree(root)
    if (isDiffEmpty(diff)) {
      return { kind: 'success', text: '目录结构审计完成：与产物存储地图零差异，无需分析回合' }
    }

    // ② 差异载荷提交会话 agent 恰一个分析回合（followup 同径——先激活再提交，绑定调用）
    const sessionId = agent.session.id
    let target: unknown = agent
    try {
      const activated = deps.enterAgent !== undefined ? await deps.enterAgent(sessionId) : undefined
      if (activated !== undefined) target = activated
      else {
        const registryAgent = deps.resolveAgent?.(sessionId)
        if (registryAgent !== undefined) target = registryAgent
      }
    } catch (cause) {
      emitForgeDiag(deps.diag, {
        level: 'warn',
        event: 'forge-dir-audit',
        message: `audit 分析回合目标解析失败（${sessionId}）：${cause instanceof Error ? cause.message : String(cause)}`,
        sessionId,
      })
    }
    const followup = (target as { followup?: (message: unknown) => void } | undefined)?.followup
    if (typeof followup !== 'function') {
      return {
        kind: 'error',
        text: `目录审计发现差异但 followup 面缺席，分析回合未提交。缺失分区 ${diff.missingPartitions.length}、越位目录 ${diff.misplacedDirs.length}、游离散件 ${diff.strayFiles.length}——请在该会话发送任意消息后重试 /${FORGE_DIR_AUDIT_NAME}`,
      }
    }
    try {
      followup(
        forgeCommandLineMessage(formatAuditPayload(diff), {
          task: '',
          state: 'dir-audit',
        }),
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      emitForgeDiag(deps.diag, {
        level: 'warn',
        event: 'forge-dir-audit',
        message: `audit 分析回合提交失败（${sessionId}）：${message}`,
        sessionId,
      })
      return { kind: 'error', text: `目录审计差异载荷提交失败（${message}）——扫描只读零变更，可重试 /${FORGE_DIR_AUDIT_NAME}` }
    }

    // ③ 回执（摘要计数——载荷全文走分析回合消息）
    return {
      kind: 'success',
      text: `目录结构审计完成：缺失分区 ${diff.missingPartitions.length}、越位目录 ${diff.misplacedDirs.length}、游离散件 ${diff.strayFiles.length}——差异已提交本会话分析（只出建议清单，清理须走批准时序；审计过程零文件系统变更）`,
    }
  }
}
