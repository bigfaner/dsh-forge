// host/dirs · self-anchors——core 缺席锚解析自装配缝（fix-1 用户裁定 2026-11-13①②③）：
// workspaceRoot 经官方宿主工作区面（插件自有 project.db main 行 + workspaceRegistry 直探），
// forgeDir/docsRoot = workspaceRoot 插件内 joinDirSegment 派生，taskHome = env
// DSH_FORGE_TASKS_HOME > 宿主 home 约定（{home}/forge-workspaces）+ deriveDirName 单源派生
// （{flatten}@{hash8} 布局——与 core deriveTaskStoreDir 同链同语义）。anchors.ts 解析器族
// 保留插件内单源，resolve ctx 全部由本缝自给——概览基本信息数据面零 core 服务消费。
// 纯派生零额外 IO（IO 归消费方注入的 wsPathOf）；解析失败 fail-loud plain Error
//（DirFactsPort.listAnchors 调用方按行 fail-soft 收口——core-anchors 同径）。
import { join } from "node:path";
import { deriveDirName } from "@dsh-forge/lib-path";
import { forgeDirOfWorkspace, workspaceDocsRoot, type ForgePathsResolveContext } from "./anchors.js";

/** 自装配依赖缝（workspaceRoot 解析由装配方注入——官方宿主工作区面消费点） */
export interface SelfAnchorsDeps {
  /** projectId → 工作区根（null/空 = 未解析——fail-loud 由本缝点名） */
  readonly wsPathOf: (projectId: string) => Promise<string | null | undefined>;
  /** 宿主 home（userData 约定派生根 {home}/forge-workspaces——缺席走 env 或 fail-loud） */
  readonly home?: string;
  /** env 注入缝（缺省 process.env——单测注入收敛） */
  readonly env?: { readonly DSH_FORGE_TASKS_HOME?: string };
}

/** 锚四键解析缝（DirFactsAnchorsFace 同形——dirFacts provider 消费） */
export function createSelfAnchorsOf(
  deps: SelfAnchorsDeps,
): (projectId: string) => Promise<Pick<ForgePathsResolveContext, "projectHome" | "taskHome" | "forgeDir" | "docsRoot">> {
  return async (projectId) => {
    const wsPath = await deps.wsPathOf(projectId);
    if (typeof wsPath !== "string" || wsPath.trim() === "") {
      throw new Error(`self-anchors: workspace root unavailable (projectId=${projectId}——未注册或工作区面缺席)`);
    }
    const env = deps.env ?? process.env;
    const envRoot = env.DSH_FORGE_TASKS_HOME;
    const tasksRoot =
      envRoot !== undefined && envRoot.trim() !== ""
        ? envRoot
        : typeof deps.home === "string" && deps.home.trim() !== ""
          ? join(deps.home, "forge-workspaces")
          : undefined;
    if (tasksRoot === undefined) {
      throw new Error(`self-anchors: tasks root unavailable (projectId=${projectId}——DSH_FORGE_TASKS_HOME 与宿主 home 双缺)`);
    }
    const taskHome = join(tasksRoot, deriveDirName(wsPath));
    return { projectHome: tasksRoot, taskHome, forgeDir: forgeDirOfWorkspace(wsPath), docsRoot: workspaceDocsRoot(wsPath) };
  };
}
