// worker 任务目录锚点节（worker-lean-execution 追加轮——worker 系统面「## 任务目录锚点」）。
// 定位：业务（forge/workspace/ 共享基建——discovery 同族 FS 读侧）。经 TasksVerbDeps 注入
// claim（核心动词零 IO 纪律），claim 合成 persona 后追加——persona 通道 worker 独享，
// 主会话零感知。fail-soft：容器目录缺席/读失败 → 省该锚点段（WORKSPACE 与 logs 双锚恒出）。
//
// 节形态（每锚点三段：介绍行 `名——职责：细节。`（顶格）→ 路径行（2 空格缩进）→ 目录树
// （与路径同缩进，仅目录在盘时）；锚点间空行分组）：
//   ## 任务目录锚点
//   本任务领取的目录锚点（首行职责介绍；缩进行为绝对路径与目录内容）：
//
//   WORKSPACE——工作区仓库根：…
//     <wsPath>
//   proposal_dir——提案文档目录：…（feature 任务且目录在盘）
//     <forgeDir>{sep}docs{sep}proposals{sep}<slug>{sep} + 树
//   feature_dir——特性文档目录：…（feature 任务）/ proposal 任务则 proposal_dir 为主锚
//     <forgeDir>{sep}docs{sep}features{sep}<slug>{sep} + 树
//   forge.project_logs_dir——forge 运行日志目录：任务日志存放的根目录（仓库外，不进 git）。
//     <任务库>{sep}logs
//   forge.task_logs_dir——任务日志目录：{…} = {forge.project_logs_dir}/{slug}/{local_id}；…
//     <任务库>{sep}logs{sep}<slug>{sep}<localId>{sep} + 树（首跑未建 → 仅介绍行 + 路径行）
//
// （{sep} = node:path sep——路径行/树目录后缀随平台分隔符；join 拼接本身恒平台原生。）
//
// 目录树：深 3 层、条目上限 60、跳 `.` 开头项；目录子项在前、同名码序。
import { readdirSync, type Dirent } from 'node:fs'
import { join, sep } from 'node:path'
import type { ContainerRef } from '@dsh-forge/contracts'

/** 目录树深度上限（相对锚点根；超过截断） */
const TREE_DEPTH_LIMIT = 3
/** 目录树条目上限（单锚点合计；超出以 … 行截断——提示词体量守卫） */
const TREE_ENTRY_CAP = 60

/** 锚点介绍行文本（`名——` 后的职责与细节；forge 项目/应用项目概念不入文案） */
const DIR_ROLE_NOTES: Readonly<Record<string, string>> = {
  WORKSPACE: '工作区仓库根：代码、测试与配置所在；检索与改动均在此树内。',
  proposal_dir: '提案文档目录：本任务的提案出处（proposal.md 及配套）。',
  feature_dir: '特性文档目录：prd/（需求与用户故事）、design/（技术设计）、test/（测试规划）。',
  'forge.project_logs_dir': 'forge 运行日志目录：任务日志存放的根目录（位于工作区仓库之外，属 dsh-forge 运行数据——不进 git）。',
}

/** 锚点段（目录缺席/读失败 → undefined——该段省略；介绍行顶格 + 路径行缩进 + 树） */
function renderDirBlock(label: string, abs: string, note: string): string | undefined {
  try {
    readdirSync(abs)
  } catch {
    return undefined
  }
  const lines: string[] = [`${label}——${note}`, `  ${abs}${sep}`]
  scanLines(abs, '  ', 1, lines)
  return lines.join('\n')
}

/** logs 根锚点段：恒出（目录未建也不依赖在盘性——根路径由装配解析给出） */
function renderLogsRootBlock(abs: string): string {
  return [`forge.project_logs_dir——${DIR_ROLE_NOTES['forge.project_logs_dir']}`, `  ${abs}${sep}`].join('\n')
}

/** 任务日志锚点段：恒出；树仅任务目录在盘时追加（首跑未建 → 介绍行 + 路径行） */
function renderTaskLogsBlock(abs: string): string {
  const note =
    '任务日志目录：{forge.task_logs_dir} = {forge.project_logs_dir}/{slug}/{local_id}；本轮任务的证据子文件夹与 resume.md 进度文件存储在此。'
  const lines: string[] = [`forge.task_logs_dir——${note}`, `  ${abs}${sep}`]
  scanLines(abs, '  ', 1, lines)
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
    lines.push(`${prefix}${last ? '└─ ' : '├─ '}${e.name}${e.isDirectory() ? sep : ''}`)
    if (e.isDirectory()) scanLines(join(abs, e.name), prefix + (last ? '   ' : '│  '), depth + 1, lines)
  })
}

/**
 * worker 任务目录锚点节（fail-soft 纯读）：WORKSPACE 与 logs 双锚恒出；容器锚点
 * （proposal/feature）目录在盘才出；feature 任务附带同名 proposal 段（远征血统）。
 * logsRoot = <任务库>/logs（项目级根）；任务日志目录 = logsRoot/<slug>/<localId>。
 */
export function renderWorkerContext(input: {
  wsPath: string
  forgeDir: string
  logsRoot: string
  localId: string
  source: ContainerRef
}): string {
  const { wsPath, forgeDir, logsRoot, localId, source } = input
  const blocks = [`WORKSPACE——${DIR_ROLE_NOTES.WORKSPACE}\n  ${wsPath}`]
  const taskLogsDir = join(logsRoot, source.slug, localId)
  if (source.kind === 'feature') {
    const proposal = renderDirBlock('proposal_dir', join(forgeDir, 'docs', 'proposals', source.slug), DIR_ROLE_NOTES.proposal_dir!)
    if (proposal !== undefined) blocks.push(proposal)
  }
  const mainLabel = source.kind === 'feature' ? 'feature_dir' : 'proposal_dir'
  const mainKindDir = source.kind === 'feature' ? 'features' : 'proposals'
  const main = renderDirBlock(mainLabel, join(forgeDir, 'docs', mainKindDir, source.slug), DIR_ROLE_NOTES[mainLabel]!)
  if (main !== undefined) blocks.push(main)
  blocks.push(renderLogsRootBlock(logsRoot), renderTaskLogsBlock(taskLogsDir))
  return [
    '## 任务目录锚点',
    '本任务领取的目录锚点（首行职责介绍；缩进行为绝对路径与目录内容）：',
    '',
    blocks.join('\n\n'),
  ].join('\n')
}
