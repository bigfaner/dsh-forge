// host/dirs · core 项目服务 → 锚解析缝（基本信息区 2026-11-13 裁决——forgeDirs Typert
// facts 的运行时事实来源）。派生链镜像 plugin-forge faces.createForgePathsAnchors 语义
// （forgeDir = getProject().forgeDir 单源、taskHome = deriveTaskStoreDir 派生、projectHome
// = env DSH_FORGE_TASKS_HOME > dirname(taskHome)）：project 包不依赖 plugin-forge
// （插件可移植性，AGENTS §1.3），本缝以同链同语义实现承接宿主集成态锚解析。
// 纯解析零 IO（IO 归消费方传入的 paths face）；解析失败 fail-loud plain Error
//（装配缺口不静默——DirFactsPort.listAnchors 调用方按行 fail-soft 收口）。
import { dirname } from "node:path";

/** core forgeProjects 服务收窄面（锚解析消费两法——ProjectService 同名两法结构切片） */
export interface CoreProjectPathsFace {
  getProject(id: string): Promise<{ wsPath: string; forgeDir?: string | null } | null>;
  deriveTaskStoreDir(input: { readonly workspaceDir: string }): Promise<{ readonly dir: string }>;
}

/** 锚解析产物（docsRoot 缺席——DIR_KEY_REGISTRY forge.docs_root 解析器自 forgeDir 派生） */
export interface CoreAnchors {
  readonly projectHome: string;
  readonly taskHome: string;
  readonly forgeDir: string;
}

/**
 * 建锚解析缝（projectId → 锚三键）：项目未注册 / forgeDir 缺席 / 派生空 = plain Error
 * fail-loud（镜像 faces.createForgePathsAnchors 同径——缺 silently 空锚会让注册表解析器
 * 抛出误导性「anchor prerequisite missing」，此处在源头点名真实缺口）。
 */
export function createCoreAnchorsOf(
  paths: CoreProjectPathsFace,
  env: { readonly DSH_FORGE_TASKS_HOME?: string } = process.env,
): (projectId: string) => Promise<CoreAnchors> {
  return async (projectId) => {
    const project = await paths.getProject(projectId);
    if (project === null || typeof project.forgeDir !== "string" || project.forgeDir.trim() === "") {
      throw new Error(`core-anchors: project anchors unavailable (projectId=${projectId}——未注册或 forgeDir 缺席)`);
    }
    const derived = await paths.deriveTaskStoreDir({ workspaceDir: project.wsPath });
    if (derived.dir === "") {
      throw new Error(`core-anchors: taskHome derivation empty (projectId=${projectId}——tasksHome 未注入 core 装配)`);
    }
    const taskHome = derived.dir;
    const projectHome =
      env.DSH_FORGE_TASKS_HOME !== undefined && env.DSH_FORGE_TASKS_HOME !== ""
        ? env.DSH_FORGE_TASKS_HOME
        : dirname(taskHome);
    return { projectHome, taskHome, forgeDir: project.forgeDir };
  };
}
