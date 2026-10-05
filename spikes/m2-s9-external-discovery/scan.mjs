// S9① spike：发现面目录约定对仓外项目的发现率（M2 db-schema §7-14 排程，PRD 前）。
//
// 问题：M2 发现面扫描按目录约定发现 feature / proposal 文档（db-schema §2.1 骨架：
//   docs/features/<slug>/{prd|design|ui|tasks|…}/… + docs/proposals/<slug>/proposal.md）。
//   对**仓外项目**（非本产品约定建设的真实仓），该约定的发现率如何？
//   → SC4 仓外 e2e 的数据来源是否可依赖「真实发现」支撑。
//
// 扫描器语义（对每仓只读）：
//   1. docs/features/ 下 <slug> 目录：计数 + 每 slug 的子结构（prd/design/ui/tasks/
//      records/specs/testing/reports/spikes/manifest.md 命中面）
//   2. docs/proposals/ 下 <slug>/proposal.md：计数 + frontmatter status/title 抽样
//   3. 文档资产总体形态（对照组）：README/docs 目录/.forge（旧线）/.claude/CLAUDE.md
//   4. 对照组：本仓（dsh-forge redesign worktree）——约定原生仓，应满发现
// 用法：node scan.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const M2_DOC_KINDS = ['prd', 'design', 'ui', 'tasks', 'records', 'specs', 'testing', 'reports', 'spikes']
const FEATURE_FILES = ['manifest.md']

const roots = [
  ['对照·本仓（约定原生）', process.cwd()],
  ['仓外·旧线 forge（Z:\\project\\ai\\forge）', 'Z:\\project\\ai\\forge'],
  ['仓外·agent-task-center', 'Z:\\project\\ai\\agent-task-center'],
  ['仓外·coding-harness', 'Z:\\project\\ai\\coding-harness'],
  ['仓外·everything-claude-code', 'Z:\\project\\ai\\everything-claude-code'],
  ['仓外·learn-claude-code', 'Z:\\project\\ai\\learn-claude-code'],
  ['仓外·code-rudder', 'Z:\\project\\ai\\code-rudder'],
  ['仓外·pm-work-tracker', 'Z:\\project\\ai\\pm-work-tracker'],
  ['仓外·train-recorder-kotlin', 'Z:\\project\\train-recorder-kotlin'],
  ['仓外·pro-essentials-workshop', 'Z:\\project\\pro-essentials-workshop'],
]

const isDir = (p) => { try { return readdirSync(p).length >= 0 && existsSync(p) } catch { return false } }
const listDir = (p) => { try { return readdirSync(p, { withFileTypes: true }) } catch { return [] } }

function frontmatterOf(file) {
  try {
    const t = readFileSync(file, 'utf8')
    const m = t.match(/^---\n([\s\S]*?)\n---/)
    if (!m) return null
    const status = m[1].match(/^status:\s*"?(.+?)"?\s*$/m)?.[1]
    const title = m[1].match(/^title:\s*"?(.+?)"?\s*$/m)?.[1]
    return { status, title }
  } catch { return null }
}

for (const [label, root] of roots) {
  console.log(`── ${label}${label.startsWith('对照') ? '' : ''} ──`)
  if (!existsSync(root)) { console.log('  （目录不存在，skip）\n'); continue }

  // 1. docs/features/<slug>
  const featsRoot = join(root, 'docs', 'features')
  const featSlugs = existsSync(featsRoot) ? listDir(featsRoot).filter((d) => d.isDirectory()).map((d) => d.name) : []
  console.log(`  docs/features/<slug> ：${featSlugs.length ? `${featSlugs.length} 个 → ${featSlugs.join(', ')}` : '0（未发现）'}`)
  for (const slug of featSlugs.slice(0, 3)) {
    const hits = [...M2_DOC_KINDS.filter((k) => isDir(join(featsRoot, slug, k))), ...FEATURE_FILES.filter((f) => existsSync(join(featsRoot, slug, f)))]
    console.log(`    · ${slug}：${hits.join('/') || '（无约定子结构）'}`)
  }

  // 2. docs/proposals/<slug>/proposal.md
  const propsRoot = join(root, 'docs', 'proposals')
  const propSlugs = existsSync(propsRoot)
    ? listDir(propsRoot).filter((d) => d.isDirectory() && existsSync(join(propsRoot, d.name, 'proposal.md'))).map((d) => d.name)
    : []
  console.log(`  docs/proposals/<slug>/proposal.md ：${propSlugs.length ? `${propSlugs.length} 个 → ${propSlugs.join(', ')}` : '0（未发现）'}`)

  // 3. 文档资产总体形态（对照组）
  const surface = [
    existsSync(join(root, 'README.md')) && 'README.md',
    existsSync(join(root, 'docs')) && 'docs/',
    existsSync(join(root, '.forge')) && '.forge/（旧线）',
    existsSync(join(root, '.claude')) && '.claude/',
    existsSync(join(root, 'CLAUDE.md')) && 'CLAUDE.md',
    existsSync(join(root, '.knowledge')) && '.knowledge/',
  ].filter(Boolean)
  console.log(`  文档资产形态：${surface.join(' · ') || '（无可识别文档面）'}`)

  const found = featSlugs.length + propSlugs.length
  console.log(`  ⇒ 发现面命中 = ${found} 个结构化实体${found === 0 && surface.length > 0 ? '（有文档面但零命中——约定外形态）' : ''}\n`)
}
