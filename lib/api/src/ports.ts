// 服务缝契约单源（lib/api 定位条目：服务缝契约 `*Port`，type-only 落 lib/api——
// lib-merge-plan「子包分工」）。本文件只声明契约类型：零逻辑零运行期依赖（定位铁律内；
// dto 类型经 type-only import 复用，不复制镜像）。
import type {
  BugCard,
  GetBugQuery,
  GetBugResponse,
  ListBugsQuery,
  RegisterBugInput,
  RegisterBugResult,
  ResolveBugInput,
} from './dto/bugs.js'
import type { BugErrorTypeAggregate } from './dto/forge.js'
import type { ProjectService } from './dto/project.js'
import type {
  WorktreeEnsureWorkspaceRequest,
  WorktreeEnsureWorkspaceResult,
  WorktreeListRequest,
  WorktreeListResult,
  WorktreeResolveRequest,
  WorktreeResolveResult,
  WorktreeSealRequest,
  WorktreeSealResult,
  WorktreeSelectRequest,
  WorktreeSelectResult,
} from './dto/worktree.js'

/**
 * projects 域服务缝契约（plugin-project 1.17 五缝合拢——proposal seam 表 `forge.projects`，
 * code-design §6）。常驻 provider = plugins/project host/projects ProjectsRegisterService +
 * ProjectsQueryService + reconcile（project.db 三 repositories 承载）；兜底 provider =
 * StubProjectsService（零库恒空清单——独立模式/隔离态降级）；覆写 provider = 宿主注入。
 * 六动词形状 = dto/project ProjectService 单源别名（零字段镜像）。
 */
export type ProjectsServicePort = ProjectService

/**
 * worktrees 域服务缝契约（plugin-project 1.17 五缝合拢——proposal seam 表 `forge.worktrees`，
 * code-design §6）。常驻 provider = plugins/project host/worktrees WorktreeRpcService 域本体；
 * 兜底 provider = 独立模式面（list 恒空、resolve 恒空集、seal 恒未封存——rpc-service 独立模式
 * 同语义）；覆写 provider = 宿主注入。消费面（task-loop/UI 通道）一律 ctx.inject 本契约。
 */
export interface WorktreeServicePort {
  list(request: WorktreeListRequest): Promise<WorktreeListResult>
  ensureWorkspace(request: WorktreeEnsureWorkspaceRequest): Promise<WorktreeEnsureWorkspaceResult>
  select(request: WorktreeSelectRequest): Promise<WorktreeSelectResult>
  seal(request: WorktreeSealRequest): Promise<WorktreeSealResult>
  resolve(request: WorktreeResolveRequest): Promise<WorktreeResolveResult>
  /** 项目 → worktree 存放目录（ProjectResolutionPort.getWorktreeDir 的快照投影） */
  getWorktreeDir(projectRoot: string): string
  /** 路径归属解析快照（ProjectResolutionPort.resolveProject 同语义） */
  resolveProject(cwd: string): Promise<ProjectResolution | null>
}

/** 路径归属解析结果（isGit 能力位由解析器结果派生，UI 只消费） */
export interface ProjectResolution {
  /** 归并目标项目的稳定标识（集成层锚定主项目行） */
  readonly projectId: string
  /** 项目根目录（主 worktree path，canonical 口径） */
  readonly projectRoot: string
  /** 能力位：cwd 是否处于 git 仓库 */
  readonly isGit: boolean
}

/**
 * worktree 归属解析服务缝（plugin-project 1.13——自 git-worktree extension-points 契约
 * seam 化升位）。双形态并列（code-design §6）：
 *   · 默认 provider：独立 worktree 模式（resolveProject 恒 null、目录 ‹root›/.forge/worktrees）；
 *   · host 注入 provider：集成层归并实现（读项目关系表）。
 * 注入在场即覆写、缺席退默认；劣形注入（provider 注册值非函数 / 实例化抛错 / 首调抛错）
 * 三形态 fail-soft 逐面退默认——守卫实现归消费侧（git-worktree extension-points seam）。
 */
export interface ProjectResolutionPort {
  /** 路径归属解析器：null = 独立 worktree 模式（默认 provider 语义） */
  resolveProject(cwd: string): Promise<ProjectResolution | null>
  /** worktree 存放目录提供者：默认 ‹projectRoot›/.forge/worktrees，调用方可设定 */
  getWorktreeDir(projectRoot: string): string
}

/**
 * bugs 域服务缝契约（plugin-project 1.11 归拢——code-design §5/§6）。常驻 provider =
 * project host/bugs BugsService（project.db BugsRepo 承载）；兜底 provider = 空实现
 * （register 拒 ErrUnavailable 语义）；消费方 = bug 五 tool（薄封装）/ bug UI 三件。
 * recordBug/resolveBug 写动词不上 RPC（channels.ts 面分治纪律）。
 */
export interface BugsServicePort {
  registerBug(input: RegisterBugInput): Promise<RegisterBugResult>
  resolveBug(input: ResolveBugInput): Promise<BugCard>
  listBugs(q: ListBugsQuery): Promise<BugCard[]>
  getBug(q: GetBugQuery): Promise<GetBugResponse>
  aggregateByErrorType(projectId: string): Promise<readonly BugErrorTypeAggregate[]>
}

/** 目录锚事实（forgeDirs 全量/单键查询投影——dirKey + 绝对目录 + 一句话语义三件套） */
export interface DirAnchorFact {
  readonly dirKey: string
  readonly dir: string
  readonly description: string
}

/**
 * 目录审计差异载荷（/forge-dir-audit 三类——地图比对产物，纯读派生零副作用；
 * plugin-project 1.12 目录事实面归拢 plugins/project host/dirs，契约视图单源落本包）。
 */
export interface DirAuditDiff {
  /** 缺失分区：地图分区目录不在场（.forge 相对路径） */
  readonly missingPartitions: readonly string[]
  /** 越位目录：.forge 域内不在地图允许集的目录（含 .forge/docs 下非地图子目录） */
  readonly misplacedDirs: readonly string[]
  /** 游离散件：.forge 直下散落文件 + 根目录临时后缀文件 */
  readonly strayFiles: readonly string[]
}

/**
 * 目录事实面服务缝契约（plugin-project 1.12 归拢——proposal seam 表 `forge.dirFacts`，
 * code-design §6）。常驻 provider = plugins/project host/dirs DirFactsPort 实现
 * （anchors 注册表 + declare merge 第三方键 + 机械审计 + doc-style 提示段）；
 * 兜底 provider = 仅内置 dirKeys 的最小 provider（minimalDirFactsPort）；消费方 =
 * dirKeys 查询 tool、各插件目录消费（注入在场即覆写、缺席退兜底）。
 */
export interface DirFactsPort {
  /** 目录锚查询：dirKey 给定查单键（未知键 = typed 拒绝），缺席 = 全量锚清单（锚随 projectId 解析） */
  listAnchors(projectId: string, dirKey?: string): Promise<readonly DirAnchorFact[]>
  /** 目的地解析（受控枚举 dest + slug/localId 按 requires——注册表锚绑定单点） */
  resolveDestination(projectId: string, dest: string, params: { readonly slug?: string; readonly localId?: string }): Promise<string>
  /** 工作区目录结构审计（机械扫描 + 存储地图比对——只读零副作用） */
  audit(root: string): DirAuditDiff
  /** forge:doc-style 提示段全文（含 ADR 文件约定条目） */
  docStyleSection(): string
}
