// worker 容器上下文段（worker-lean-execution 追加轮——worker 系统面 WORKSPACE/容器目录块）。
// 定位：业务（forge/workspace/ 共享基建——discovery 同族 FS 读侧）。经 TasksVerbDeps 注入
// claim（核心动词零 IO 纪律），claim 合成 persona 后追加——persona 通道 worker 独享，
// 主会话零感知。fail-soft：容器目录缺席/读失败 → 空串（claim 跳过追加，形态兼容）。
//
// 块形态（键名随 source.kind；feature 任务附带同名 proposal 目录——远征血统，盘上命中才出）：
//   WORKSPACE: <wsPath>
//   proposal_dir: <forgeDir>/docs/proposals/<slug>/   （feature 任务且目录在盘）
//   feature_dir:  <forgeDir>/docs/features/<slug>/    （feature 任务）
//   <目录树：深 3 层、条目上限 60、跳 `.` 开头项；目录子项在前、同名码序>
import { readdirSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import type { ContainerRef } from '@dsh-forge/contracts'

/** 目录树深度上限（相对容器根；超过截断） */
const TREE_DEPTH_LIMIT = 3
/** 目录树条目上限（全块合计；超出以 … 行截断——提示词体量守卫） */
const TREE_ENTRY_CAP = 60

/** 段标题 + 目录树渲染（目录缺席/读失败 → undefined——整段省略） */
function renderDirBlock(label: string, abs: string): string | undefined {
  try {
    readdirSync(abs)
  } catch {
    return undefined
  }
  const lines: string[] = [`${label}: ${abs}/`]
  scanLines(abs, '', 1, lines)
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
 * worker 容器上下文块（fail-soft 纯读）：主容器缺席 → 空串；仅 proposal 附带段缺席 →
 * 省该段（feature 主段仍出）。
 */
export function renderWorkerContext(input: { wsPath: string; forgeDir: string; source: ContainerRef }): string {
  const { wsPath, forgeDir, source } = input
  const kindDir = source.kind === 'feature' ? 'features' : 'proposals'
  const mainLabel = source.kind === 'feature' ? 'feature_dir' : 'proposal_dir'
  const main = renderDirBlock(mainLabel, join(forgeDir, 'docs', kindDir, source.slug))
  if (main === undefined) return ''
  const blocks = [`WORKSPACE: ${wsPath}`]
  if (source.kind === 'feature') {
    const proposal = renderDirBlock('proposal_dir', join(forgeDir, 'docs', 'proposals', source.slug))
    if (proposal !== undefined) blocks.push(proposal)
  }
  blocks.push(main)
  return blocks.join('\n\n')
}
