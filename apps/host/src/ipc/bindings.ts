// knowledge 注册行维护（4.2 转正 + 1.15 进表径）：knowledge 插件自持注册表
// （wsPath canonical 键 → `.knowledge` 目录）的产品写径——host 只 wiring，知识域
// 语义（目录建面/幂等 upsert/埋点）归插件服务。
//   · withKnowledgeRegistryRow：registerProject 成功后落注册行（main IPC 包装面）
//   · backfillKnowledgeRegistryRows：boot 期存量项目逐个幂等 upsert（bug 5e5592dc）
// 失败口径：落表失败只降级记日志，永不抛断注册/启动流程（对齐 Error Handling
// 传播策略「关键异常永不抛断用户流程」；后果 = 该项目知识面无注册行降级）。
import type { ProjectService, ProjectSummary } from '@dsh-forge/contracts'
import type { KnowledgeRegistryWriter } from '@dsh-forge/knowledge'

/**
 * projects 服务包装面（1.15 注册链进表径）：registerProject 成功后向 knowledge 插件
 * 自持注册表落注册行（wsPath canonical 键 → 缺省 `<wsPath>/.knowledge`，目录缺则建——
 * projects.knowledge_dir 列退役后注册行唯一产品写径）。fail-soft：knowledge 服务缺席
 * （插件未装载）= 原样透传（知识面整体缺席，boot 处已有一次性 warn）；落表失败 = 记
 * 日志不抛断注册（后果 = 该项目知识面无注册行降级，browse 空 projectName 面）。
 * 知识域语义（目录建面/幂等 upsert/埋点）归插件服务（host 只 wiring）。
 */
export function withKnowledgeRegistryRow(
  service: ProjectService,
  knowledge: Pick<KnowledgeRegistryWriter, 'registerProject'> | undefined,
  log: (message: string) => void = console.warn,
): ProjectService {
  if (knowledge === undefined) return service
  return {
    ...service,
    async registerProject(input: Parameters<ProjectService['registerProject']>[0]) {
      const result = await service.registerProject(input)
      try {
        const project = await service.getProject(result.projectId)
        // fix-2 一级解析动态化：projectId 落注册行 project_id 列（注册后知识通道立即可用）
        if (project !== null) await knowledge.registerProject({ wsPath: project.wsPath, projectId: result.projectId })
      } catch (cause) {
        log(`[host] knowledge 注册行落表失败（该项目知识面降级至无注册行）：${String(cause)}`)
      }
      return result
    },
  }
}

/**
 * boot 回填径（bug 5e5592dc）：注册行唯一产品写径 = registerProject 时点（1.15），
 * 转正前注册/自持库丢行的存量项目两级解析全落空——knowledge 通道恒「项目不存在」。
 * boot 期对活跃项目逐个幂等 upsert 注册行（服务面 registerProject 幂等，目录缺则建）。
 * fail-soft：单项目失败记日志继续，listProjects 异常整体静默——永不抛断启动。
 */
export async function backfillKnowledgeRegistryRows(
  projects: Pick<ProjectService, 'listProjects'>,
  knowledge: Pick<KnowledgeRegistryWriter, 'registerProject'> | undefined,
  log: (message: string) => void = console.warn,
): Promise<void> {
  if (knowledge === undefined) return
  let rows: readonly ProjectSummary[]
  try {
    rows = await projects.listProjects()
  } catch (cause) {
    log(`[host] knowledge 注册行回填跳过（listProjects 异常）：${String(cause)}`)
    return
  }
  for (const project of rows.filter((p) => !p.archived)) {
    try {
      await knowledge.registerProject({ wsPath: project.wsPath, projectId: project.id })
    } catch (cause) {
      log(`[host] knowledge 注册行回填失败（${project.id} 知识面降级）：${String(cause)}`)
    }
  }
}
