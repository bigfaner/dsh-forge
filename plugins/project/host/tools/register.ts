// bug 工具族注册缝（plugin-project bug 工具面挂载——官方 ctx.tools.register 正门，
// task-loop registerToolFamily 同配方）：cwd → projectId 解析器装配 + 四员逐枚注册 +
// unmount 全撤回。缝缺席/劣形 = 工具面零注册 + warn 留痕（降级诚实不阻载——bug 写径
// 对本宿主不可达的根因即缝缺席，非静默失联）。
import { normalizeFsPath } from "@dsh-forge/lib-path";
import type { BugsServicePort, ProjectsServicePort } from "@dsh-forge/lib-api";
import type { DomainDb } from "../db/connection.js";
import { createBugTools, type BugToolDefinition, type BugToolsDeps } from "./bug-tools.js";
import type { BugProjectIdResolver } from "./session.js";

/** 官方 tools 缝防御读取（cordis inject 门：属性访问未被 inject 声明即抛——try/catch
 *  fail-soft 归 undefined；inject 名单由 index.ts 显式声明 "tools" 承担门内可达） */
function toolsFaceOf(ctx: unknown): { register?(definition: unknown): () => void } | undefined {
  try {
    const face = (ctx as { tools?: unknown }).tools;
    return face !== null && typeof face === "object" ? (face as { register?(d: unknown): () => void }) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * cwd → projectId 解析器（bug 工具面路由单源）：
 * ① own project.db 归属键派生（projects.projectKeyOf 同函数口径）；
 * ② own db main 行路径直配（normalizeFsPath 归一比较——worktree cwd 命中成员行）；
 * ③ core forgeProjects 行退路（宿主集成态注册真源在 core 库——listProjects wsPath 匹配）；
 * 全链 miss = undefined（工具面 typed ERR_WORKSPACE_NOT_REGISTERED 自解释拒）。
 */
export function createBugProjectIdResolver(deps: {
  readonly db: DomainDb | undefined;
  readonly coreProjects?: () => ProjectsServicePort | undefined;
}): BugProjectIdResolver {
  return async (cwd: string): Promise<string | undefined> => {
    const norm = normalizeFsPath(cwd);
    const db = deps.db;
    if (db !== undefined) {
      const byKey = db.repos.projects.getByKey(db.repos.projects.projectKeyOf(cwd));
      if (byKey !== undefined) return byKey.id;
      for (const p of db.repos.projects.list()) {
        const main = db.repos.workspaces.getMain(p.id)?.wsPath;
        if (typeof main === "string" && normalizeFsPath(main) === norm) return p.id;
      }
    }
    try {
      const core = deps.coreProjects?.();
      const projects = await core?.listProjects();
      const hit = projects?.find((p) => typeof p.wsPath === "string" && normalizeFsPath(p.wsPath) === norm);
      return hit?.id;
    } catch {
      return undefined;
    }
  };
}

/**
 * bug 工具族注册（官方 tools 缝——apply 期注册、unmount 撤回）。
 * 返回 disposer（零注册降级 = no-op disposer——调用方零分支）。
 */
export function registerBugTools(
  ctx: unknown,
  deps: { readonly db: DomainDb | undefined; readonly bugs: () => BugsServicePort | undefined; readonly coreProjects?: () => ProjectsServicePort | undefined },
  diag: (line: string, level?: "info" | "warn" | "error") => void,
): { dispose: () => void } {
  const toolsFace = toolsFaceOf(ctx);
  const register = typeof toolsFace?.register === "function" ? toolsFace.register.bind(toolsFace) : undefined;
  if (register === undefined) {
    diag("[project] ctx.tools.register 缺席（官方 tools 缝缺失）——bug 工具面零注册（fix-bug 写径对本宿主不可达，降级不阻载）", "warn");
    return { dispose: () => {} };
  }
  const toolDeps: BugToolsDeps = { bugs: deps.bugs, resolveProjectId: createBugProjectIdResolver(deps) };
  const tools: readonly BugToolDefinition[] = createBugTools(toolDeps);
  const disposers: (() => void)[] = [];
  for (const definition of tools) {
    try {
      disposers.push(register(definition));
    } catch (cause) {
      diag(`[project] bug tool register failed (${definition.name}): ${cause instanceof Error ? cause.message : String(cause)}`, "error");
    }
  }
  diag(`[project] bug 工具族注册完成：${String(tools.length)} 员经官方 ctx.tools.register（unmount 全撤回）`, "info");
  return {
    dispose: () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          // 宿主注销面异常隔离——卸载收口不外抛
        }
      }
    },
  };
}
