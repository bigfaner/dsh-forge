// bug 工具族注册缝（plugin-project bug 工具面挂载——官方 ctx.tools.register 正门，
// task-loop registerToolFamily 同配方）：cwd → projectId 解析器装配 + 四员逐枚注册 +
// unmount 全撤回。缝缺席/劣形 = 工具面零注册 + warn 留痕（降级诚实不阻载——bug 写径
// 对本宿主不可达的根因即缝缺席，非静默失联）。
import { normalizeFsPath, resolveProjectKey } from "@dsh-forge/lib-path";
import { spawnGitWorktreePorcelain, type GitPorcelainRunner } from "@dsh-forge/lib-path/project-root";
import type { BugsServicePort, ProjectsServicePort } from "@dsh-forge/lib-api/ports";
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
 * ① own project.db 归拢键派生（lib-path resolveProjectKey 单源——worktree marker cwd
 *    经 porcelain 现查归拢主检出根再派生——审计 M6 修口，worktree 会话不再
 *    miss；git 失败/非本仓清单 = fail-soft 回退 cwd 键 + diag 留痕）；
 * ② own db main 行路径直配（normalizeFsPath 归一比较——主检出行 cwd 直配径）；
 * ③ core forgeProjects 行退路（宿主集成态注册真源在 core 库——listProjects wsPath 匹配）；
 * 全链 miss = undefined（工具面 typed ERR_WORKSPACE_NOT_REGISTERED 自解释拒）。
 */
export function createBugProjectIdResolver(deps: {
  readonly db: DomainDb | undefined;
  readonly coreProjects?: () => ProjectsServicePort | undefined;
  readonly gitPorcelain?: GitPorcelainRunner;
  readonly diag?: (line: string, level?: "info" | "warn" | "error") => void;
}): BugProjectIdResolver {
  return async (cwd: string): Promise<string | undefined> => {
    const norm = normalizeFsPath(cwd);
    const db = deps.db;
    if (db !== undefined) {
      const resolved = resolveProjectKey(cwd, {
        registryQuery: () => undefined,
        gitRunner: deps.gitPorcelain ?? spawnGitWorktreePorcelain,
      });
      const key = resolved.key;
      if (resolved.mainRoot !== undefined) {
        deps.diag?.(`[project] bug 工具面 cwd 归拢主根键：cwd=${cwd} mainRoot=${resolved.mainRoot} key=${key}`, "info");
      } else if (resolved.fallbackReason !== undefined) {
        deps.diag?.(
          `[project] bug 工具面归拢 fail-soft 回退 cwd 键：${resolved.fallbackReason}（cwd=${cwd}）`,
          "warn",
        );
      }
      const byKey = db.repos.projects.getByKey(key);
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
  const toolDeps: BugToolsDeps = {
    bugs: deps.bugs,
    resolveProjectId: createBugProjectIdResolver({ db: deps.db, coreProjects: deps.coreProjects, diag }),
  };
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
