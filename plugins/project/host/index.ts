// @dsh-forge/project —— host 装配入口（plugin-project 1.17 五缝合拢）。
// 定位（AC「host/index.ts 只装配零域逻辑」）：本文件只做五缝 provider 注册
// （forge.projects / forge.worktrees / forge.projectResolution / forge.bugs / forge.dirFacts
// ——常驻 + 兜底 + 覆写位装配期择优，code-design §6）；域逻辑零内联——全部归属
// host/{projects,worktrees,bugs,dirs} 域本体与 assembly/ 组装面。
//   ① loader 装载面：default 导出 Plugin.Function（cordis loader 只认 default 导出函数，
//     组合层 cordis.patch.yml 单行 insert 挂载）；
//   ② bundle 管线验证锚：消费 @dsh-forge/lib-* devDependencies（scripts/bundle-host.mjs
//     构建期内联进 dist——产物自含），self-containment 测试据此外置/内联两侧断言。
import { errMessage } from "@dsh-forge/lib-util";
import type {
  BugsServicePort,
  DirFactsPort,
  ProjectResolutionPort,
  ProjectsServicePort,
  WorktreeServicePort,
} from "@dsh-forge/lib-api";
import type { OfficialRegistryFace } from "./projects/registry-adapter.js";
import {
  registerProjectSeams,
  type ProjectSeamRegistration,
  type SeamCtxFace,
  type SeamDiag,
} from "./assembly/seams.js";
import { createProjectsServicePort, openProjectsDomainDb } from "./assembly/projects-port.js";
import { createBugsService } from "./bugs/service.js";
import { minimalDirFactsPort } from "./dirs/dir-facts.js";
// 1.17 批二「卸旧装新」：本包单行装载 = 五缝注册 + worktree 域插件（gitWorktree 能力
// 服务 provide）——旧 @dsh-forge/git-worktree 行退役后，overlay 注行门只挂本包，
// 能力面在此组合保持外部行为不变（git 缺席 fail-soft 不生效语义归插件启动检测）。
import worktreePlugin from "./worktrees/index.js";
import {
  assembleProjectHostSide,
  type KnowledgeBindingsRefresher,
  type ProjectHostSideAssembly,
  type ProjectHostSideDeps,
} from "./assembly/host-side.js";
import {
  registerWorktreeChannels,
  type WorktreeChannelRegistrar,
  type WorktreeRpcEnvelope,
} from "./assembly/channels.js";
import { WORKTREE_RPC_METHODS, invalidateResolveCaches, type WorktreeRpcService } from "./worktrees/rpc-service.js";

/** cordis 插件装载形态（loader 只认 default 导出函数）。 */
interface ProjectPlugin {
  (ctx: unknown, config?: ProjectHostConfig): () => void;
  inject: readonly string[];
}

/** bugs 常驻 provider 依赖缝（归属键派生 + git cwd——装配期由宿主/组合器注入） */
export interface BugsResidentDeps {
  readonly resolveProjectKey: (projectId: string) => string | null;
  readonly resolveMainPath: (projectId: string) => string;
}

/** host 装配 config（全部可选——缺席面 = 对应缝退兜底，fail-soft 不阻载） */
export interface ProjectHostConfig {
  /** DSH home（project.db 落点 = {home}/forge/db/project/project.db；缺席 = projects/bugs 退兜底） */
  readonly home?: string;
  /** tasksHome（注册三态分类器消费目录） */
  readonly tasksHome?: string;
  /** 官方 workspaceRegistry face（registry-adapter 适配缝） */
  readonly registry?: OfficialRegistryFace;
  /** bugs 常驻依赖（缺席 = bugs 退兜底空实现） */
  readonly bugsDeps?: BugsResidentDeps;
  /** dirFacts 常驻工厂（缺省 = host/dirs minimalDirFactsPort 仅内置键集——设计 §6 兜底即常驻缺省） */
  readonly dirFacts?: () => DirFactsPort;
  /** 覆写位（宿主/组合器注入——在场即覆写常驻） */
  readonly overrides?: {
    readonly projects?: ProjectsServicePort;
    readonly worktrees?: WorktreeServicePort;
    readonly projectResolution?: ProjectResolutionPort;
    readonly bugs?: BugsServicePort;
    readonly dirFacts?: DirFactsPort;
  };
  /** 诊断缝（缺省 console 兜底——diag-emit 纪律 console 豁免面同插件先例） */
  readonly diag?: SeamDiag;
}

const projectPlugin: ProjectPlugin = (ctx: unknown, config: ProjectHostConfig = {}): (() => void) => {
  const face = ctx as SeamCtxFace;
  const diag: SeamDiag =
    config.diag ??
    ((line: string) => {
      console.warn(line);
    });

  // project.db 打开（装配期一次；I4 拒开/文件异常 = fail-soft 退兜底——设计 §6 劣形②同径）
  let domainDb: ReturnType<typeof openProjectsDomainDb> | undefined;
  if (config.home !== undefined) {
    try {
      domainDb = openProjectsDomainDb(config.home);
    } catch (cause) {
      diag(`[project-seams] project.db 打开失败——projects/bugs 退兜底：${String(cause)}`);
    }
  }

  // 五缝注册（常驻 + 兜底 + 覆写位择优——零域逻辑，全部委托域本体/组装面）
  const deps = (() => {
    const db = domainDb;
    type DirFactsDeps = Parameters<typeof minimalDirFactsPort>[0];
    const absentAnchorsOf: DirFactsDeps["anchorsOf"] = async () =>
      ({ projectHome: "", taskHome: undefined, forgeDir: undefined, docsRoot: undefined }) as Awaited<
        ReturnType<DirFactsDeps["anchorsOf"]>
      >;
    const base = {
      ...(config.dirFacts !== undefined
        ? { dirFacts: config.dirFacts }
        : { dirFacts: () => minimalDirFactsPort({ anchorsOf: absentAnchorsOf }) }),
      ...(config.overrides !== undefined ? { overrides: config.overrides } : {}),
      onDiag: diag,
    };
    if (db === undefined) return base;
    return {
      ...base,
      projects: () =>
        createProjectsServicePort({
          domainDb: db,
          registry: config.registry,
          tasksHome: config.tasksHome,
          onDiag: undefined,
        }),
      ...(config.bugsDeps !== undefined
        ? {
            bugs: (() => {
              const bugsDeps = config.bugsDeps;
              return () =>
                createBugsService({
                  bugs: db.repos.bugs,
                  resolveProjectKey: bugsDeps.resolveProjectKey,
                  resolveMainPath: bugsDeps.resolveMainPath,
                }) as BugsServicePort;
            })(),
          }
        : {}),
    };
  })();
  const registration: ProjectSeamRegistration = registerProjectSeams(face, deps);
  diag(
    `[project-seams] 五缝注册完成：registered=[${registration.registered.join(", ")}] degraded=[${registration.degraded.join(", ")}]`,
  );
  // worktree 域插件组合装载（诊断缝透传——装配失败/能力缺席语义归插件自身 fail-soft 面）
  const disposeWorktrees = worktreePlugin(ctx, { diag: (line) => diag(line) });
  return () => {
    disposeWorktrees();
    // provider 生命周期归 scope（cordis provide 注销面由宿主管辖——本插件零自持资源）
  };
};

// 骨架期遗留零服务依赖；五缝经 reflect 缝注册，零 inject 声明。
projectPlugin.inject = [];

/**
 * 装配失败诊断投影（bundle 管线验证锚——lib-util errMessage 消费点）。
 */
export function describeSetupFailure(error: unknown): string {
  return errMessage(error);
}

// ── host 侧装配面出口（1.17 批二卸旧装新：apps/host 只留注册行，域装配符号自本包导入）──
export {
  assembleProjectHostSide,
  type KnowledgeBindingsRefresher,
  type ProjectHostSideAssembly,
  type ProjectHostSideDeps,
};
export {
  createWorktreeIdentity,
  type ForgeProjectsIdentityFace,
  type WorktreeIdentityAssembly,
  type WorktreeIdentityOverrides,
  type WorktreeProjectResolution,
} from "./assembly/worktree-identity.js";
export { registerWorktreeChannels, type WorktreeChannelRegistrar, type WorktreeRpcEnvelope };
export { WORKTREE_RPC_METHODS, invalidateResolveCaches, type WorktreeRpcService };

export default projectPlugin;
