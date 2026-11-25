// host/dirs · /forge-dir-init 指令 handler（workspace-artifact-governance §2.5）：
// 纯机械 command plane 直执行零模型消息（/stop-dag-tasks 先例形态）——按 ForgeDirs 键表
// 派生的工作区分区（workspacePartitionsOf——与 forge_dirs/dirFacts/audit 同一声明拉取与
// 解析单源，无独立目录清单常量）在工作区初始化分区目录（已存在跳过，幂等）；git 仓库则
// 把分区内「git 外分区」的忽略条目去重追加到 .gitignore（docs 文档树可提交，不设条目），
// 执行回执列出新建目录与追加条目。声明拉取/键解析缺席 = warn 诊断（注入缝，不直落 console）。
// 零模型消息、零任务循环改动（§2.6——gitignore 环境边界兜底，任务流程零感知）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FORGE_DIR_SEGMENT } from '@dsh-forge/contracts'
import {
  collectDeclaredDirKeys,
  mergeDeclarations,
  workspacePartitionsOf,
  type DirKeysPullDiagFace,
  type ReflectDeclarePullFace,
} from './anchors.js'

/** 指令调用入参（官方 CommandInvocation 消费子面——结构窄面：敲指令会话身份 + 指令名后原文） */
export interface DirCommandInvocation {
  /** 敲指令会话（官方 Agent 结构子面：session.header.cwd = 工作区根正读位） */
  readonly agent: {
    readonly session: {
      readonly id: string
      readonly header?: { readonly cwd?: string }
      /** 兼容位：Session 顶层 cwd（结构面允许双读） */
      readonly cwd?: string
    }
  }
  /** 指令名后原文 */
  readonly rawInput: string
  /** 派发 UI 请求的取消信号（缺席 = 无取消通道） */
  readonly signal?: AbortSignal
}

/** 指令执行回执（官方 CommandResult 消费子面：success 的 text 可选、error 恒带 text） */
export interface DirCommandResult {
  readonly kind: 'success' | 'error'
  readonly text?: string
}

/** 指令名（无 input 描述符——无参指令，composer 不展示占位） */
export const FORGE_DIR_INIT_NAME = 'forge-dir-init'

/** init/audit 共用声明缝（同一声明拉取——reflect 现查 + 降级 warn；缺席 = 仅本体键集） */
export interface ForgeDirsCommandDeps {
  /** reflect 现查取法（缺席 = 声明拉取缝零贡献——仅本体十条） */
  readonly reflectOf?: () => ReflectDeclarePullFace | undefined
  /** 降级诊断发射缝（声明拉取/键解析降级 warn——缺席零发射，不直落 console） */
  readonly onDiag?: DirKeysPullDiagFace
}

/** 声明集现查（init/audit/查询同一拉取——每次现算不缓存） */
export function declaredDeclarationsOf(deps: ForgeDirsCommandDeps): readonly import('@dsh-forge/lib-path').ForgeDirDeclaration[] {
  return mergeDeclarations(collectDeclaredDirKeys(deps.reflectOf?.(), deps.onDiag))
}

/** 分区内 git 外判定：docs 文档树可提交（.md 台账类按 AGENTS 5.2 属文档），其余分区 git 外 */
function isGitExternalPartition(partition: string): boolean {
  const rel = partition.slice(`${FORGE_DIR_SEGMENT}/`.length)
  return rel !== 'docs' && !rel.startsWith('docs/')
}

/** gitignore 忽略条目派生（键表分区单源——git 外分区才设条目） */
export function gitignoreEntriesOf(partitions: readonly string[]): readonly string[] {
  return partitions.filter(isGitExternalPartition).map((partition) => `${partition}/`)
}

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

/** handler（DirCommandDefinition.handler 形状——UI command plane 直执行，零模型消息） */
export function createForgeDirInitHandler(deps: ForgeDirsCommandDeps = {}): (invocation: DirCommandInvocation) => Promise<DirCommandResult> {
  return async (invocation: DirCommandInvocation): Promise<DirCommandResult> => {
    // 工作区根 = 敲指令会话的工作目录（header.cwd 正读位；顶层 cwd 兼容位——faces 同径）
    const root = invocation.agent.session.header?.cwd ?? invocation.agent.session.cwd
    if (root === undefined || root.trim() === '') {
      return { kind: 'error', text: '无法解析会话工作区根（header.cwd 缺席），目录初始化未执行' }
    }

    // ① 分区目录初始化（键表派生单源——已存在跳过，幂等）
    const partitions = workspacePartitionsOf(root, declaredDeclarationsOf(deps), deps.onDiag)
    const created: string[] = []
    for (const partition of partitions) {
      const target = join(root, ...partition.split('/'))
      if (!existsSync(target)) {
        mkdirSync(target, { recursive: true })
        created.push(`${partition}/`)
      }
    }

    // ② gitignore 去重追加（git 外分区派生条目；非 git 仓库跳过——地图条目无承载面）
    const gitignoreEntries = gitignoreEntriesOf(partitions)
    const appended: string[] = []
    const gitignorePath = join(root, '.gitignore')
    if (existsSync(join(root, '.git'))) {
      const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
      const missing = missingGitignoreEntries(existing, gitignoreEntries)
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
