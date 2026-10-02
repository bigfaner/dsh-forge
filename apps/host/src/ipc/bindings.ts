// knowledge 绑定表维护（4.2；定位：基础——装配面数据缝，域语义归 core/knowledge 包）。
// 缝的由来（3.4 设计 + tech-design Interface 3）：knowledge 插件 tool 的会话上下文
// 解析 = cwd → projectId 绑定表（插件 config，DF003 设计期定缝项）。projectId 为
// 运行期注册产物（randomUUID）——静态 config 无法承载，故绑定数据经
// bindingsFile（boot overlay 注入路径）落地、装配方（host）维护：
//   · boot 后一次全量刷新（listProjects → 文件）
//   · 每次 registerProject 成功后增量刷新（service 包装面）
// 插件侧 exec 点惰性读取（packages/knowledge tools/session.ts）——无 watch/无投影
// （SC2 纪律域 = UI 状态副本；本文件是装配配置数据，逐写逐读）。
// 失败口径：绑定表写失败只降级记日志，永不抛断注册/启动流程（对齐 Error Handling
// 传播策略「关键异常永不抛断用户流程」；后果 = 会话 tool 解析失败回落常规检索，
// 知识插件 unbound 失败信息自述）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ProjectService, ProjectSummary } from '@dsh-forge/contracts'

/** 绑定表文件形状（版本化——消费方 = knowledge 插件 tools/session.ts 惰性读取） */
export interface KnowledgeBindingsFile {
  readonly version: 1
  readonly projects: readonly { readonly wsPath: string; readonly projectId: string }[]
}

/** 项目摘要 → 绑定表（纯函数：全量行映射，wsPath = projects.ws_path 同口径 canonical path） */
export function bindingsOf(projects: readonly ProjectSummary[]): KnowledgeBindingsFile {
  return {
    version: 1,
    projects: projects.map((p) => ({ wsPath: p.wsPath, projectId: p.id })),
  }
}

/** 绑定表序列化（稳定形状——单测逐字节锚定） */
export function serializeBindings(file: KnowledgeBindingsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

/** 全量写入绑定表文件（fail-soft：失败记日志返回 false，不抛） */
export function writeKnowledgeBindings(
  target: string,
  projects: readonly ProjectSummary[],
  log: (message: string) => void = console.warn,
): boolean {
  try {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, serializeBindings(bindingsOf(projects)), 'utf8')
    return true
  } catch (cause) {
    log(`[host] knowledge 绑定表写入失败（会话召回将按未绑定降级）：${String(cause)}`)
    return false
  }
}

/** 拉取项目全量并刷新绑定表（boot 后一次性；fail-soft 同上） */
export async function refreshKnowledgeBindings(
  projects: Pick<ProjectService, 'listProjects'>,
  target: string,
  log?: (message: string) => void,
): Promise<boolean> {
  try {
    return writeKnowledgeBindings(target, await projects.listProjects(), log)
  } catch (cause) {
    ;(log ?? console.warn)(`[host] knowledge 绑定表刷新失败（listProjects 异常）：${String(cause)}`)
    return false
  }
}

/**
 * projects 服务包装面：registerProject 成功后刷新绑定表（增量锚——boot 全量之外
 * 的唯一变更源；updateProject 不动 ws_path/id 故无需锚）。其余四法原样透传，
 * 类型面 = contracts ProjectService（通道注册零改动）。
 */
export function withKnowledgeBindingsRefresh(
  service: ProjectService,
  target: string,
  log: (message: string) => void = console.warn,
): ProjectService {
  return {
    ...service,
    async registerProject(input: Parameters<ProjectService['registerProject']>[0]) {
      const result = await service.registerProject(input)
      writeKnowledgeBindings(target, await service.listProjects().catch(() => []), log)
      return result
    },
  }
}
