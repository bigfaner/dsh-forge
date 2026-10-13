// worker 任务目录锚点节（worker-lean-execution 追加轮——worker 系统面「## 任务目录锚点」）。
// 定位：业务（forge/workspace/ 共享基建——discovery 同族 FS 读侧）。经 TasksVerbDeps 注入
// claim（核心动词零 IO 纪律），claim 合成 persona 后追加——persona 通道 worker 独享，
// 主会话零感知。fail-soft：容器目录缺席/读失败 → 省该锚点行；主容器与 logs 均缺席 → 空串
// （claim 跳过追加，形态兼容）。
//
// 节形态（键名随 source.kind；feature 任务附带同名 proposal 目录——远征血统，盘上命中才出）：
//   ## 任务目录锚点
//   本任务领取的目录锚点（绝对路径即取用值；行下注释为该目录职责）：
//
//   WORKSPACE: <wsPath>
//     工作区仓库根——代码、测试与配置所在；检索与改动均在此树内。
//   proposal_dir: <forgeDir>/docs/proposals/<slug>/   （feature 任务且目录在盘）
//     提案文档目录——本任务的提案出处（proposal.md 及配套）。+ 目录树
//   feature_dir: <forgeDir>/docs/features/<slug>/    （feature 任务）
//     特性文档目录——prd/（需求与用户故事）、design/（技术设计）、test/（测试规划）。+ 目录树
//   forge.project_logs_dir: <任务库>/logs/<slug>/<localId>/
//     任务运行产物根——按编号命名的各轮证据子文件夹与 resume.md 进度文件所在。
//
// 目录树：深 3 层、条目上限 60、跳 `.` 开头项；目录子项在前、同名码序。
import { readdirSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import type { ContainerRef } from '@dsh-forge/contracts'

/** 目录树深度上限（相对锚点根；超过截断） */
const TREE_DEPTH_LIMIT = 3
/** 目录树条目上限（单锚点合计；超出以 … 行截断——提示词体量守卫） */
const TREE_ENTRY_CAP = 60

/** 锚点目录职责注释（行下挂——agent 知悉各目录作用后按需取用） */
const DIR_ROLE_NOTES: Readonly<Record<string, string>> = {
  WORKSPACE: '工作区仓库根——代码、测试与配置所在；检索与改动均在此树内。',
  proposal_dir: '提案文档目录——本任务的提案出处（proposal.md 及配套）。',
  feature_dir: '特性文档目录——prd/（需求与用户故事）、design/（技术设计）、test/（测试规划）。',
  'forge.project_logs_dir': '任务运行产物根——按编号命名的各轮证据子文件夹与 resume.md 进度文件所在。',
}

/** 锚点段（目录缺席/读失败 → undefined——该段省略） */
function renderDirBlock(label: string, abs: string): string | undefined {
  try {
    readdirSync(abs)
  } catch {
    return undefined
  }
  const lines: string[] = [`${label}: ${abs}/`, `  ${DIR_ROLE_NOTES[label] ?? ''}`.trimEnd()]
  scanLines(abs, '  ', 1, lines)
  return lines.join('\n')
}

/** logs 锚点段：首跑目录尚未创建也恒出（worker 需按路径创建）——树仅目录在盘时追加 */
function renderLogsBlock(logsDir: string): string {
  const lines: string[] = [
    `forge.project_logs_dir: ${logsDir}/`,
    `  ${DIR_ROLE_NOTES['forge.project_logs_dir'] ?? ''}`,
  ]
  scanLines(logsDir, '  ', 1, lines)
  return lines.join('\n')
}

/** 递归目录树行（目录优先、名称码序；深度/条目双上限；隐藏项跳过） */
function scanLines(abs: string, prefix: string, depth: number, lines: string[]): void {
  if (depth > TREE_DEPTH_LIMIT || lines.length >= TREE_ENTRY_CAP) return
  let entries: Dirent[]
  try {
    entries = readdirSync(abs, { withFileTypes: true })
  } catch {
    return
  }
  const visible = entries
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
  visible.forEach((e, i) => {
    if (lines.length >= TREE_ENTRY_CAP) {
      lines.push(`${prefix}…`)
      return
    }
    const last = i === visible.length - 1
    lines.push(`${prefix}${last ? '└─ ' : '├─ '}${e.name}${e.isDirectory() ? '/' : ''}`)
    if (e.isDirectory()) scanLines(join(abs, e.name), prefix + (last ? '   ' : '│  '), depth + 1, lines)
  })
}

/**
 * worker 任务目录锚点节（fail-soft 纯读）：主容器与 logs 锚点均缺席 → 空串；仅 proposal
 * 附带段缺席 → 省该段（feature 主段仍出）。logs 锚点恒出（首跑目录未建也给出路径——
 * worker 按路径创建）；logsDir = <任务库>/logs/<slug>/<localId>。
 */
export function renderWorkerContext(input: {
  wsPath: string
  forgeDir: string
  logsDir: string
  source: ContainerRef
}): string {
  const { wsPath, forgeDir, logsDir, source } = input
  const blocks = [`WORKSPACE: ${wsPath}`, `  ${DIR_ROLE_NOTES.WORKSPACE}`]
  if (source.kind === 'feature') {
    const proposal = renderDirBlock('proposal_dir', join(forgeDir, 'docs', 'proposals', source.slug))
    if (proposal !== undefined) blocks.push(proposal)
  }
  const mainLabel = source.kind === 'feature' ? 'feature_dir' : 'proposal_dir'
  const mainKindDir = source.kind === 'feature' ? 'features' : 'proposals'
  const main = renderDirBlock(mainLabel, join(forgeDir, 'docs', mainKindDir, source.slug))
  if (main === undefined && logsDir.trim() === '') return ''
  if (main !== undefined) blocks.push(main)
  blocks.push(renderLogsBlock(logsDir))
  return [
    '## 任务目录锚点',
    '本任务领取的目录锚点（绝对路径即取用值；行下注释为该目录职责）：',
    '',
    blocks.join('\n'),
  ].join('\n')
}
