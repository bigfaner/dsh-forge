// commands · /forge-dir-init 指令 handler（workspace-artifact-governance §2.5）：
// 纯机械 command plane 直执行零模型消息（/stop-dag-tasks 先例形态）——按产物存储地图
// （§2.1.1）在工作区初始化分区目录（已存在跳过，幂等）；git 仓库则按地图把缺的忽略条目
// 去重追加到 .gitignore（已有条目零重复），执行回执列出新建目录与追加条目。
// 零模型消息、零任务循环改动（§2.6——gitignore 环境边界兜底，任务流程零感知）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FORGE_DIR_SEGMENT, FORGE_LOGS_DIR } from '@dsh-forge/contracts'
import { forgeDirOfWorkspace } from '../forge-paths.js'
import type { ForgeCommandInvocation, ForgeCommandResult } from '../faces.js'

/** 指令名（无 input 描述符——无参指令，composer 不展示占位） */
export const FORGE_DIR_INIT_NAME = 'forge-dir-init'

/** 存储地图分区目录（forgeDir 相对——提案 §2.1.1：docs 四类 + 三 git 外分区） */
export const STORAGE_MAP_DIRS = [
  'docs/proposals',
  'docs/probes',
  'docs/roundtables',
  'docs/features',
  'worktrees',
  'tmp',
  FORGE_LOGS_DIR,
] as const

/**
 * 存储地图 gitignore 忽略条目（提案 §2.6.1 gitignore 硬边界——git 外分区散落产物
 * 天然进不了 git）。docs 侧仅 probes/ 为「永不进 git」的过程域；proposals/features/roundtables
 * 的 `.md` 台账类按 AGENTS 5.2 属文档可提交，不设条目。
 */
export const GITIGNORE_ENTRIES = [`${FORGE_DIR_SEGMENT}/worktrees/`, `${FORGE_DIR_SEGMENT}/logs/`, `${FORGE_DIR_SEGMENT}/tmp/`, `${FORGE_DIR_SEGMENT}/docs/probes/`] as const

/** gitignore 追加段注释（标注来源——人工可辨归属） */
const GITIGNORE_SECTION_HEADER = '# forge storage map (/forge-dir-init)'

/** gitignore 生效条目判读：非空且非注释行（formal-verification §4.3 Q4——注释文本不算条目） */
function isEffectiveGitignoreLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed !== '' && !trimmed.startsWith('#')
}

/**
 * 条目归一化（判等键）：去两端空白、锚定前导 `/`、尾 `/`——`tmp/` 与 `/tmp` 同键。
 * 低风险假设（formal-verification Q4 开放项，提案未裁决）：判重 = 归一化字面判等，
 * 不做 glob 语义覆盖判重（如既有裸 `logs/` 是否覆盖 `.forge/logs/` 不判）——保守追加
 * 不误漏，重复风险由字面判等消除。
 */
function gitignoreKey(line: string): string {
  return line.trim().replace(/^\/+/, '').replace(/\/+$/, '')
}

/** 求缺失条目：仅与既有生效条目判重（注释行/空行不参与——注释里的路径不算已有） */
export function missingGitignoreEntries(existingContent: string, entries: readonly string[]): string[] {
  const present = new Set(
    existingContent
      .split(/\r?\n/)
      .filter(isEffectiveGitignoreLine)
      .map(gitignoreKey),
  )
  return entries.filter((entry) => !present.has(gitignoreKey(entry)))
}

/** handler（ForgeCommandDefinition.handler 形状——UI command plane 直执行，零模型消息） */
export function createForgeDirInitHandler(): (invocation: ForgeCommandInvocation) => Promise<ForgeCommandResult> {
  return async (invocation: ForgeCommandInvocation): Promise<ForgeCommandResult> => {
    // 工作区根 = 敲指令会话的工作目录（header.cwd 正读位；顶层 cwd 兼容位——faces 同径）
    const root = invocation.agent.session.header?.cwd ?? invocation.agent.session.cwd
    if (root === undefined || root.trim() === '') {
      return { kind: 'error', text: '无法解析会话工作区根（header.cwd 缺席），目录初始化未执行' }
    }
    const forgeDir = forgeDirOfWorkspace(root)

    // ① 分区目录初始化（已存在跳过，幂等；mkdirSync recursive 天然覆盖嵌套 docs 层）
    const created: string[] = []
    for (const dir of STORAGE_MAP_DIRS) {
      const target = join(forgeDir, ...dir.split('/'))
      if (!existsSync(target)) {
        mkdirSync(target, { recursive: true })
        created.push(`${dir}/`)
      }
    }

    // ② gitignore 去重追加（非 git 仓库跳过——地图条目无承载面）
    const appended: string[] = []
    const gitignorePath = join(root, '.gitignore')
    if (existsSync(join(root, '.git'))) {
      const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
      const missing = missingGitignoreEntries(existing, GITIGNORE_ENTRIES)
      if (missing.length > 0) {
        const section = ['', GITIGNORE_SECTION_HEADER, ...missing].join('\n')
        const next = existing.endsWith('\n') || existing === '' ? `${existing}${section}\n` : `${existing}\n${section}\n`
        writeFileSync(gitignorePath, next, 'utf8')
        appended.push(...missing)
      }
    }

    // ③ 回执（零变更 = 幂等 no-op 口径）
    if (created.length === 0 && appended.length === 0) {
      return { kind: 'success', text: '工作区产物目录已按存储地图就绪，零变更' }
    }
    const parts: string[] = []
    if (created.length > 0) parts.push(`新建目录 ${created.length} 个：${created.join(' ')}`)
    if (appended.length > 0) parts.push(`.gitignore 追加 ${appended.length} 条：${appended.join(' ')}`)
    return { kind: 'success', text: `forge 目录初始化完成——${parts.join('；')}` }
  }
}
