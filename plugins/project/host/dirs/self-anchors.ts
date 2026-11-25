// host/dirs · self-anchors——三运行时事实（ForgeDirSources）自装配缝（forge-dirs-unification
// §2.4/§2.6）：forge 根由装配期 resolveForgeHome 单点解析（patch 下发 dshHomePath('forge') >
// tasksHome 派生 > 运行期现查官方 dshHomePath 服务 > 降级 ~/.dsh/forge + 「dshHomePath 缺席」
// warn 诊断——经装配期注入的诊断发射面，不直落 console）；workspaceRoot 经官方宿主工作区面
// （插件 project.db main 行 + workspaceRegistry 直探，wsPathOf 注入）；projectRoot 取 lib/path
// resolveProjectKey 归拢的项目主检出路径（规范化后——projectKey 大小写敏感，不规范化会让同一
// 项目分裂两个键）。注册表/forge_dirs/task-loop 落盘共用同一次解析（sourcesOf 单点）。
// 环境变量 DSH_FORGE_TASKS_HOME 与 {home}/forge-workspaces 分支已删（§2.9 清理）。
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveProjectKey, type ForgeDirSources, type ProjectKeyDeps } from "@dsh-forge/lib-path";

/** 非空字符串判读（trim 空 = 未注入） */
const nonEmpty = (v: string | undefined): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

/**
 * forge 根解析（§2.4 单点）：config.forgeHome（patch 下发 dshHomePath('forge')）>
 * config.tasksHome（patch 下发 {forge}/projects——dirname 即 forge 根）> 运行期现查官方
 * dshHomePath 服务 > 降级 ~/.dsh/forge（onDegraded 输出含「dshHomePath 缺席」字样的 warn）。
 */
export function resolveForgeHome(
  input: {
    /** patch 下发的 dshHomePath('forge') 结果 */
    readonly forgeHome?: string;
    /** patch 下发的项目运行时根（{forge}/projects——dirname 派生 forge 根） */
    readonly tasksHome?: string;
    /** 官方 dshHomePath 服务现查闭包（防御读取注入——缺席/非函数/抛 = undefined） */
    readonly dshHomePathOf?: () => string | undefined;
  },
  onDegraded?: (message: string) => void,
): string {
  const direct = nonEmpty(input.forgeHome);
  if (direct !== undefined) return direct;
  const tasks = nonEmpty(input.tasksHome);
  if (tasks !== undefined) return dirname(tasks);
  const viaService = nonEmpty(input.dshHomePathOf?.());
  if (viaService !== undefined) return viaService;
  const fallback = join(homedir(), ".dsh", "forge");
  onDegraded?.(`[project] dshHomePath 缺席——forge 根降级 ~/.dsh/forge（${fallback}）`);
  return fallback;
}

/** 自装配依赖缝（workspaceRoot 解析由装配方注入——官方宿主工作区面消费点） */
export interface SelfAnchorsDeps {
  /** projectId → 工作区根（null/空 = 未解析——fail-loud 由本缝点名） */
  readonly wsPathOf: (projectId: string) => Promise<string | null | undefined>;
  /** forge 根（resolveForgeHome 产物——装配期已解析，本缝零现查） */
  readonly forgeHome: string;
  /** resolveProjectKey 注册表查询缝（缺席 = git 现查归拢——lib/path 单源兜底） */
  readonly registryQuery?: ProjectKeyDeps["registryQuery"];
}

/** 三运行时事实解析缝（ForgeDirSources 单点——dirFacts/forge_dirs/task-loop 同源消费） */
export function createSelfAnchorsOf(
  deps: SelfAnchorsDeps,
): (projectId: string) => Promise<ForgeDirSources> {
  return async (projectId) => {
    const wsPath = await deps.wsPathOf(projectId);
    if (typeof wsPath !== "string" || wsPath.trim() === "") {
      throw new Error(`self-anchors: workspace root unavailable (projectId=${projectId}——未注册或工作区面缺席)`);
    }
    const resolution = resolveProjectKey(wsPath, { registryQuery: deps.registryQuery ?? (() => undefined) });
    const projectRoot = resolution.mainRoot ?? wsPath;
    return { dshHome: dirname(deps.forgeHome), projectRoot, workspaceRoot: wsPath };
  };
}
