// forge 域 projects 服务（tech-design §Interface 1 全五法 + §交互一/§交互三；定位：业务）。
// registerProject 四步补偿链（2.2）——fix-27：① 前另有重注册自愈防御（既有行在场 →
// 幂等成功/悬空引用自愈，绝不撞 UNIQUE(ws_path)；见 attachExistingRow）：
// ① registry.list() 预检（命中=挂接既有，attachedToExisting=true，不登记补偿）
// ② registry.create(wsPath)（dsh 幂等）→ ③ 事务写 projects 行
// ④ ③失败且属本次新建 → registry.delete(workspaceId) 补偿（保目录保日志，幂等）；
//    挂接既有时后任一步失败均不删既有工作区（ownership 保护）。
// fix-30 路径归一：①/自愈查询原为 BINARY 精确匹配——拼写变体（盘符大小写/尾分隔符/
// symlink/8.3 短名）可穿透预检致 dsh 返回既有实体而误判「本次新建」，③ 撞 UNIQUE(ws_path)
// 后 ④ 把流程前就存在的健康工作区补偿删除（身份 churn）。收口三件：
//   · 入口归一（canonicalizeDir）：注册输入可达则 realpath（磁盘真值拼写），fail-soft
//     回退原拼写；比对口径 = normalizeFsPath（@dsh-forge/path-key 单一来源，knowledge
//     绑定表同源消费——消口径分裂）；
//   · 「本次新建」改结构判据：create 前后 registry.list() id 快照差集（免疫拼写变体——
//     dsh 按 canonical 返回既有实体时 id 已在快照中，attachedToExisting 恒真值）；
//   · ③ 撞 UNIQUE(ws_path) 时重入一次 attachExistingRow（自愈径）而非直接进补偿。
// 补偿链语义零变化：真新建失败 → registry.delete 补偿；挂接/既有实体绝不被补偿删除。
// fix-35 拆分：主链降纯编排（writeProjectRow / compensateFailedWrite / isRefHealthy /
// reconcileRowDegrade 单项处理器），errMessage 收编 ../util.js 单源。
// fix-39 目录自愈：② 前插「目录确保」步（ensureRegistrationDirs）——新建径 workspaceDir/
// forgeDir/knowledgeDir 三目录缺则递归建（幂等），消除「目录不存在」面用户可避错误
// （ERR_WORKSPACE_CREATE 的「选定后被删」竞态 + 知识面迟到的 ERR_INVALID_KNOWLEDGE_DIR）；
// 自愈径（attachExistingRow 命中）与挂接径（① 预检命中）零建目录——挂接语义零盘副作用不变。
// M2（1.4，Interface 5——P1 五法不动）：deps 可选注入 tasksHome（派生根）+ onRegistered
// （新建径注册协作者——3.4 装配建库 v1 + 发现面扫描闭包）；注册闭包碰撞复检（ERR_SUSPECTED_MOVE
// 于中央行落库之前，拒绝注册零副作用——分类器/派生单源在 ./workspace/derive-dir.ts）+
// deriveTaskStoreDir 第六动词（表单预检位，纯读）。两注入缺席 = P1 行为零变化。
// 查询面 + 启动对账（2.3）：listProjects（archived 态随行=过滤口径）/ getProject / updateProject
// （patch 仅 name/archived）/ reconcileAtStartup（失配找回、找不回幂等重建、孤儿只提示不删；
// 全程异常降级 app_key_logs 永不抛断启动）。SQLite 写仅经 db/ 句柄（单写路径）；
// registry 调用只依赖 dsh 官方 ctx.workspaceRegistry 面。
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import type Database from 'better-sqlite3'
import type {
  DeriveTaskStoreDirRequest,
  DeriveTaskStoreDirResult,
  Project,
  ProjectPatch,
  ProjectServiceM2,
  ProjectSummary,
  ReconcileRepair,
  ReconcileReport,
  RegisterProjectInput,
  RegisterResult,
} from '@dsh-forge/contracts'
import { normalizeFsPath } from '@dsh-forge/path-key'
import { errMessage } from '../util.js'
import { ensureDirReadable } from '../fs-ensure.js'
import { CompensationError, ProjectWriteError, WorkspaceCreateError } from './errors.js'
import { recordKeyLog } from './key-logs.js'
import type { WorkspaceLike, WorkspaceRegistryPort, WorkspaceRenamePort } from './registry.js'
import { classifyRegistrationCollision, deriveTaskStoreDir as deriveStoreDir, type RegistrationCollision } from './workspace/derive-dir.js'
import { selectMainWorktree, sameAnchor, type GitIdentityPort, type MainWorktreeCandidate } from './workspace/identity-anchor.js'
import { SuspectedMoveError } from './workspace/errors.js'

/**
 * onRegistered 协作者入参（1.4 挂点；3.4 装配「store.ensureOpen 建库 v1 + 发现面只读扫描」
 * 同构闭包消费——tech-design 交互三）。
 */
export interface RegisteredProject {
  /** 中央 projects.id（工作区库 store 键 + 发现面扫描 projectId） */
  readonly projectId: string
  readonly workspaceId: string
  /** 落库口径 ws_path（registry canonical——派生目录/发现面同基准） */
  readonly wsPath: string
  /** 发现面扫描根（docs/features 与 docs/proposals 所在地） */
  readonly forgeDir: string
  readonly name: string
}

export interface ProjectServiceDeps {
  /** SQLite 句柄（db/ 唯一产出；一切 SQL prepared） */
  db: Database.Database
  /** dsh 官方面（ctx.workspaceRegistry；G1 pin 4 幂等/get 语义见 ./registry.ts） */
  registry: WorkspaceRegistryPort
  /** dsh 官方面（ctx.workspaceController——workspace/rename 命令；fix-24 ② 标题对齐） */
  rename: WorkspaceRenamePort
  /**
   * M2 派生根 {dsh-forge-home}（Interface 5——3.4 经 core config 注入：env
   * DSH_FORGE_TASKS_HOME > {userData}/forge-workspaces）。缺席 = M2 面（注册碰撞复检 +
   * deriveTaskStoreDir 动词）降级缺席，P1 五法行为零变化。
   */
  tasksHome?: string
  /**
   * 注册协作者（1.4 挂点；可选注入——ProjectService 契约面零改动）：新建径（中央新行落定，
   * 含 ① 挂接既有 dsh 工作区）注册成功后触发；attachExisting 幂等径（中央行在场）不触发——
   * 库在场确认/缺席补建归 store 惰性首开（与存量首开同构）。失败 fail-soft 永不抛断注册
   * （AC4：建库/扫描失败与开库失败同语义——记账隔离态归闭包自身）。
   */
  onRegistered?: (project: RegisteredProject) => void
  /**
   * 1.5 身份归并锚端口（可选注入——M2 tasksHome 同型降级：缺席 = 归并层缺席，注册
   * 行为零变化）。注入后：注册输入为同锚 worktree 路径（common dir realpath 锚）时
   * 解析到主项目既有行——attachExistingRow 之前（其按 ws_path 比对不会命中 worktree
   * 路径）；含存量双行仲裁归档与主 worktree 缺失降级。任何失败 fail-soft 降级现行链。
   */
  gitIdentity?: GitIdentityPort
}

/**
 * worktree 存放目录默认派生（1.6——提案「取值恒非空」裁决）：`<wsPath>/.forge/worktrees/`
 * 绝对路径（node:path join——与 ws_path canonical 同口径；与中央迁移 v2 回填 SQL 同语义，
 * 分隔符随平台 join）。单一来源 = 本函数（注册链未输入即落此默认）。
 */
export function defaultWorktreeDir(wsPath: string): string {
  return join(wsPath, '.forge', 'worktrees')
}

/** Interface 5 服务面（P1 五法不动 + deriveTaskStoreDir 第六动词——ctx.forgeProjects M2 形状） */
export function createProjectService(deps: ProjectServiceDeps): ProjectServiceM2 {
  return {
    async registerProject(input: RegisterProjectInput): Promise<RegisterResult> {
      return registerProject(deps, input)
    },
    async listProjects(): Promise<ProjectSummary[]> {
      return listProjects(deps)
    },
    async getProject(id: string): Promise<Project | null> {
      return getProject(deps, id)
    },
    async updateProject(id: string, patch: ProjectPatch): Promise<Project> {
      return updateProject(deps, id, patch)
    },
    async reconcileAtStartup(): Promise<ReconcileReport> {
      return reconcileAtStartup(deps)
    },
    async deriveTaskStoreDir(q: DeriveTaskStoreDirRequest): Promise<DeriveTaskStoreDirResult> {
      return deriveTaskStoreDirVerb(deps, q)
    },
  }
}

/**
 * 中央在册项目 → 任务库目录集（中央 ws_path 列单行只读；ws_path 落库恒 canonical——
 * deriveStoreDir 同基准单源映射）。消费方 = 疑似移动消歧：同扁平化主体异 hash8 目录若恰为
 * 某在册项目的任务库，则它是另一条在册工作区（Step2b 同主体异路径各自成库），非孤儿——
 * 不构成「疑似移动」；孤儿（中央行缺席，Step3 构造）仍拒绝。
 */
function registeredStoreDirs(deps: ProjectServiceDeps, tasksHome: string): Set<string> {
  const rows = deps.db.prepare<unknown[], { ws_path: string }>(`SELECT ws_path FROM projects`).all()
  return new Set(rows.map((r) => deriveStoreDir(tasksHome, r.ws_path)))
}

/** 疑似移动拒绝判定（预检动词消费——existingDir 为在册项目任务库 = 放行） */
function isSuspectedMoveBlocked(deps: ProjectServiceDeps, tasksHome: string, collision: RegistrationCollision): boolean {
  return collision.state === 'suspected-move' && !registeredStoreDirs(deps, tasksHome).has(collision.data.existingDir)
}

/**
 * M2 注册碰撞复检（1.4；Interface 5 注册闭包侧——表单预检位（deriveTaskStoreDir 动词）的
 * 复检位）。三态机械面归 workspace/derive-dir.ts 分类器单源；本位收口两拒绝态：
 *   · 同扁平化主体异 hash8 → ERR_SUSPECTED_MOVE（疑似移动拒绝——data 带手工指引；
 *     在册项目任务库消歧除外——registeredStoreDirs）；
 *   · 目标目录在场（hash 一致）= present 态——中央 ws_path 精确确认归本闭包（fix：present
 *     不再无条件兜底拒绝）：dsh registry 命中（normalizeFsPath 同源键）= 既有工作区挂接径
 *     （① 预检承接——e2e idem-a 回归收口：应用侧行活删后复注册曾在此误抛「中央无对应注册」，
 *     挂接分支被碰撞复检截断）；registry 未命中 = §6-33 兜底拒绝（hash 自身碰撞/中央库重置
 *     遗留孤儿库——同 typed 面，existingDir=derivedDir）。
 * Hard Rule：拒绝态于中央行落库之前抛出——调用位在 ① 预检/目录确保/② create 之前，拒绝注册零副作用。
 */
function assertNoRegistrationCollision(deps: ProjectServiceDeps, tasksHome: string, workspaceDir: string): void {
  const collision = classifyRegistrationCollision(tasksHome, workspaceDir)
  if (
    (collision.state === 'suspected-move' && !registeredStoreDirs(deps, tasksHome).has(collision.data.existingDir)) ||
    collision.state === 'present'
  ) {
    // present 态中央确认：dsh registry 持同路径实体 = 挂接径放行（① 预检承接，零抛）
    if (collision.state === 'present') {
      const key = normalizeFsPath(workspaceDir)
      if (deps.registry.list().some((ws) => normalizeFsPath(ws.path) === key)) return
    }
    throw new SuspectedMoveError(collision.data)
  }
}

/**
 * M2 表单预检动词（Interface 5）：`{tasksHome}/{flatten}@{hash8}` 单源纯读。与注册闭包同基准
 * ——输入可达则 realpath（S10：hash8 输入 = canonical 串本机原样，拼写变体先收敛保单源一致）；
 * 疑似移动布局提前拦截（ERR_SUSPECTED_MOVE——UI 错误条 + 手工指引留场）；正常/幂等复用候选
 * 两态返回 dir（幂等的中央 ws_path 精确确认归注册闭包）。
 */
async function deriveTaskStoreDirVerb(
  deps: ProjectServiceDeps,
  q: DeriveTaskStoreDirRequest,
): Promise<DeriveTaskStoreDirResult> {
  if (deps.tasksHome === undefined) {
    // 配置缺口非用户态错误——fail-loud 普通错误（3.4 前装配面缺席；不扩六码 typed 面）
    throw new Error('deriveTaskStoreDir 不可用：tasksHome 未注入（core config tasksHome 字段——3.4 装配）')
  }
  const workspaceDir = await canonicalizeDir(q.workspaceDir)
  const collision = classifyRegistrationCollision(deps.tasksHome, workspaceDir)
  // fix：present（推导目录在场且 hash 一致——推导==既有逐字同）= 幂等复用候选 → 放行返回 dir。
  // 中央 ws_path 精确确认归注册闭包（§6-33）——预检纯读位不再误抛 ERR_SUSPECTED_MOVE
  // （注册协作者建库后 / 复用库在场时派生行预检恒绿）。
  if (collision.state === 'normal' || collision.state === 'present') {
    return { dir: deriveStoreDir(deps.tasksHome, workspaceDir) }
  }
  if (!isSuspectedMoveBlocked(deps, deps.tasksHome, collision)) {
    return { dir: deriveStoreDir(deps.tasksHome, workspaceDir) }
  }
  throw new SuspectedMoveError(collision.data)
}

/**
 * M2 注册协作者执行（fail-soft：建库/扫描失败与开库失败同语义——记账隔离态归闭包自身
 * （store throwIsolated/发现面逐项容错），不阻断注册整体；中央 app_key_logs scope CHECK
 * 四值不含注册域 → child 控制台降级（alignWorkspaceTitle 同径，stdio 继承回流宿主））。
 */
function runRegistered(deps: ProjectServiceDeps, project: RegisteredProject): void {
  if (deps.onRegistered === undefined) return
  try {
    deps.onRegistered(project)
  } catch (cause) {
    console.warn(
      `注册协作者失败（fail-soft——注册已成功，任务库惰性首开兜底）：${project.wsPath}（${project.projectId}）：${errMessage(cause)}`,
    )
  }
}

/** forge 目录是否位于工作区外（ER PROJECTS：仓外=1/true，由路径关系自动推导——模块私有，落库行内消费） */
function isForgeDirExternal(wsPath: string, forgeDir: string): boolean {
  const rel = relative(wsPath, forgeDir)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

/**
 * fix-30 入口归一：可达则 realpath（磁盘真值拼写——盘符大小写/8.3 短名/symlink 全展开，
 * 与 dsh registry.create 的 canonical 化同基准），失败回退原拼写（fail-soft：网络盘等
 * 不可达场景零变化）。归一只统一比对与输入基准，不产生落库形态——ws_path 落库恒以
 * ② registry 返回的 canonical 为准。
 */
async function canonicalizeDir(p: string): Promise<string> {
  try {
    return await realpath(p)
  } catch {
    return p
  }
}

/**
 * fix-39 目录自愈（② 前置步，仅新建径调用）：三目录缺则递归 mkdir（幂等——在场 no-op）。
 * · workspaceDir：官方 create 的 canonicalize 门要求目录已存在且为目录（G1 pin ④）——
 *   「选定后被删」竞态在此自愈（原 ERR_WORKSPACE_CREATE 面中用户可避的部分）；
 * · forgeDir/knowledgeDir：迟到爆炸面前置消解——原注册成功后知识面才报
 *   ERR_INVALID_KNOWLEDGE_DIR（scan 前置门），现注册成功即两目录落盘。
 * 建失败沿现行六码 typed 面上抛（裁决：不扩码——六码面稳定，扩码须 contracts/web/host
 * 三处一体）：workspaceDir → WorkspaceCreateError（create 前置失败同面：注册中止、无补偿
 * 需要——dsh 侧零副作用）；forge/knowledge → ProjectWriteError（注册输入无法落盘 = 写入
 * 面前置失败）。时序：全部在 ② 之前完成——任何建失败时 dsh 侧零变更，补偿链零涉入。
 * 创建后 canonicalizeDir 语义不变：归一在流程头部（目录未建 → fail-soft 回退原拼写），
 * 新建目录的 canonical 化仍归 ② 官方面——ws_path 落库口径零变化。
 */
function ensureRegistrationDirs(input: RegisterProjectInput): void {
  try {
    mkdirSync(input.workspaceDir, { recursive: true })
  } catch (cause) {
    throw new WorkspaceCreateError(input.workspaceDir, cause)
  }
  try {
    // ensureDirReadable：显式 chmod 0o755——umask 0077 环境下裸 mkdir 落 700，事后非属主
    // 读取（validateMermaid 等）被拒（macOS 现场）。workspaceDir 不动（用户自有目录，非本产品落盘面）。
    ensureDirReadable(input.forgeDir)
    ensureDirReadable(input.knowledgeDir)
  } catch (cause) {
    throw new ProjectWriteError({ wsPath: input.workspaceDir }, cause)
  }
}

/** ③ 写 projects 行（ws_path 以 registry 返回的 canonical path 为准——非用户拼写原样；单语句原子）。
 * worktree_dir 取值恒非空（1.6）：输入在场存输入（canonical 口径），未输入即落
 * defaultWorktreeDir(canonical ws_path)——默认值演进时存量行不漂移（提案裁决）。 */
function writeProjectRow(
  db: Database.Database,
  o: { projectId: string; workspace: WorkspaceLike; input: RegisterProjectInput; now: string },
): void {
  db.prepare(
    `INSERT INTO projects (
       id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, worktree_dir, archived, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    o.projectId,
    o.workspace.id,
    o.workspace.path,
    o.input.name,
    o.input.forgeDir,
    isForgeDirExternal(o.workspace.path, o.input.forgeDir) ? 1 : 0,
    o.input.knowledgeDir,
    o.input.worktreeDir ?? defaultWorktreeDir(o.workspace.path),
    o.now,
    o.now,
  )
}

/**
 * ③ 写入失败收口面（fix-35 自主链抽离，语义逐字保留）：fix-30 兜底① UNIQUE(ws_path)
 * 自愈重入 → 挂接保护（非本次新建不补偿）→ ④ 补偿删除（失败记账 + ERR_COMPENSATION）。
 */
async function compensateFailedWrite(
  deps: ProjectServiceDeps,
  input: RegisterProjectInput,
  o: { workspace: WorkspaceLike; createdNow: boolean; projectId: string; writeCause: unknown },
): Promise<RegisterResult> {
  const { db, registry } = deps
  const { workspace, createdNow, projectId, writeCause } = o

  // fix-30 兜底①：UNIQUE(ws_path) 撞既有行 = 变体径穿透预检的残余面（入口归一不可达回退
  // 时，dsh canonical 仍可能命中既有实体/既有行）→ 按撞键的 ws_path（= workspace.path）
  // 重入一次自愈；命中即幂等成功——绝不把既有实体按「本次新建」补偿删除。
  if (isUniqueWsPathViolation(writeCause)) {
    const selfHealed = await attachExistingRow(deps, { ...input, workspaceDir: workspace.path })
    if (selfHealed !== undefined) return selfHealed
  }
  // ④ 补偿——仅「本次新建」（② 结构判据：id 快照差集）才登记；流程窗口内取消同径（见 §交互一）
  if (!createdNow) {
    throw new ProjectWriteError({ workspaceId: workspace.id, wsPath: workspace.path }, writeCause)
  }
  try {
    // 幂等：未知 id 返回 false（工作区已被清理）亦视为补偿完成——dsh 侧零孤儿达成
    await registry.delete(workspace.id)
  } catch (deleteCause) {
    // 补偿失败：app_key_logs 单事件单条记账（scope=compensation，处置结果并入 data_json）
    // + 抛 typed ERR_COMPENSATION——孤儿交启动对账提示，不自动删（SC12）
    recordKeyLog(db, {
      level: 'error',
      scope: 'compensation',
      message: `registry.delete 补偿失败：工作区 ${workspace.path}（${workspace.id}）留存为孤儿——启动对账将提示，不自动删`,
      data: {
        workspaceId: workspace.id,
        wsPath: workspace.path,
        projectId,
        writeError: errMessage(writeCause),
        deleteError: errMessage(deleteCause),
        disposition: '补偿失败——孤儿工作区交由启动对账提示（不自动删）',
      },
    })
    throw new CompensationError({ workspaceId: workspace.id, wsPath: workspace.path, projectId }, writeCause, deleteCause)
  }
  throw new ProjectWriteError(
    {
      workspaceId: workspace.id,
      wsPath: workspace.path,
      compensated: { workspaceId: workspace.id, reason: '③ 应用库写入失败（registry.delete 补偿已执行）' },
    },
    writeCause,
  )
}

/** 注册主链（纯编排：归一 → 自愈预检 → ① 预检 → 目录确保（fix-39，仅新建径）→ ② create → ③ 写行 → 标题对齐） */
async function registerProject(deps: ProjectServiceDeps, input: RegisterProjectInput): Promise<RegisterResult> {
  const { db, registry } = deps

  // fix-30 入口归一：注册输入（workspaceDir/forgeDir/knowledgeDir）可达则 realpath——拼写
  // 变体在进 ① 预检/自愈查询前收敛到磁盘真值拼写；比对口径 = normalizeFsPath 同源键
  const canonicalInput: RegisterProjectInput = {
    ...input,
    workspaceDir: await canonicalizeDir(input.workspaceDir),
    forgeDir: await canonicalizeDir(input.forgeDir),
    knowledgeDir: await canonicalizeDir(input.knowledgeDir),
    // 1.6：worktree 目录配置透传（可达则 realpath 同归一口径）；未输入 = undefined——
    // 默认值落库归 ③（以 ② registry canonical ws_path 派生，杜绝默认值演进漂移）。
    worktreeDir: input.worktreeDir === undefined ? undefined : await canonicalizeDir(input.worktreeDir),
  }

  // 1.5 身份归并层（attachExistingRow 之前——其按 ws_path 比对不会命中 worktree 路径）：
  // 同锚 worktree 路径 → 主项目既有行；非 git / 首注册（无同锚行）/ 主 worktree 缺失降级
  // → undefined 走现行链。gitIdentity 缺席 = 归并层缺席，注册行为零变化。
  if (deps.gitIdentity !== undefined) {
    const merged = await mergeSameAnchorProject(deps, canonicalInput)
    if (merged !== undefined) return merged
  }

  // fix-27 自愈防御（① 前）：重注册（既有行在场）→ 幂等成功 / 悬空引用自愈，绝不撞
  // UNIQUE(ws_path)（详见 attachExistingRow 块注——预检只查 dsh 注册表，行在场时 INSERT 恒炸）
  const reattached = await attachExistingRow(deps, canonicalInput)
  if (reattached !== undefined) return reattached

  // M2 注册碰撞复检（1.4；Interface 5 注册闭包侧）：新建径专属——上方 attachExisting 幂等返回
  // = 三态之「幂等复用：中央 ws_path 精确确认」。同主体异 hash8 / 目标目录在场而中央行缺席 →
  // ERR_SUSPECTED_MOVE（Hard Rule：于中央行落库之前抛出——本位在 ① 预检/目录确保/② create
  // 之前，拒绝注册零副作用：dsh 侧/盘面/中央行零变更）。tasksHome 未注入（3.4 前）= 复检
  // 降级缺席，P1 五法行为零变化。
  if (deps.tasksHome !== undefined) assertNoRegistrationCollision(deps, deps.tasksHome, canonicalInput.workspaceDir)

  // ① 预检：list() 按归一键匹配（fix-30：BINARY → normalizeFsPath——输入与 registry canonical
  // 的盘符大小写/正反斜杠/尾分隔符差异不再击穿；命中=挂接，不登记补偿）
  const inputKey = normalizeFsPath(canonicalInput.workspaceDir)
  const existing = registry.list().find((ws) => normalizeFsPath(ws.path) === inputKey)

  let workspace: WorkspaceLike
  let createdNow: boolean // fix-30 结构判据：② 返回实体是否本流程新建（create 前后 id 快照差集）
  if (existing) {
    workspace = existing
    createdNow = false
  } else {
    // fix-39 目录自愈前置步（仅新建径）：三目录缺则建（幂等）——必须在 ② 前（官方 create 的
    // realpath 门要求目录在场）；挂接径（existing 命中）/自愈径不经此步——零盘副作用（Hard Rule）
    ensureRegistrationDirs(canonicalInput)
    // ② registry.create（dsh 幂等：同 canonical path 返回既有实体）——失败即注册中止，无补偿需要。
    // create 收原始拼写（canonical 化属 dsh 官方面职责）；「本次新建」不看 ① 是否命中，看 id 差集
    // （免疫拼写变体：dsh 按 canonical 返回既有实体时其 id 已在快照中）
    const idsBeforeCreate = new Set(registry.list().map((ws) => ws.id))
    try {
      workspace = await registry.create(input.workspaceDir)
    } catch (cause) {
      throw new WorkspaceCreateError(input.workspaceDir, cause)
    }
    createdNow = !idsBeforeCreate.has(workspace.id)
  }

  // ③ 写 projects 行 → 失败径收口（兜底自愈 / 挂接保护 / ④ 补偿）
  const projectId = randomUUID()
  const now = new Date().toISOString()
  try {
    writeProjectRow(db, { projectId, workspace, input: canonicalInput, now })
  } catch (writeCause) {
    return compensateFailedWrite(deps, canonicalInput, { workspace, createdNow, projectId, writeCause })
  }

  // fix-24 ②：注册链末位 workspace 标题对齐项目名（新建与挂接既有两径同收口——见 alignWorkspaceTitle）
  await alignWorkspaceTitle(deps, workspace.id, input.name)

  // M2 协作者（1.4）：新建径（中央新行落定——含 ① 挂接既有 dsh 工作区）注册成功尾触发：
  // 建库 v1 + 发现面只读扫描（3.4 装配同构闭包）；attachExisting 幂等径不经此（AC3）。
  // fail-soft 永不抛断注册（AC4）——见 runRegistered。
  runRegistered(deps, {
    projectId,
    workspaceId: workspace.id,
    wsPath: workspace.path,
    forgeDir: canonicalInput.forgeDir,
    name: input.name,
  })

  return { projectId, workspaceId: workspace.id, attachedToExisting: !createdNow }
}

/**
 * fix-30 兜底①判据：③ INSERT 撞 UNIQUE(ws_path)（better-sqlite3 SqliteError——code
 * SQLITE_CONSTRAINT_UNIQUE 且 message 指名 projects.ws_path 列）。workspace_id 列冲突
 * （挂接径并发占位类）不属本判据——仍走 ④ 前的挂接保护分支。
 */
function isUniqueWsPathViolation(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    (cause as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    cause.message.includes('projects.ws_path')
  )
}

/**
 * 归并层读面投影（projects 全量最小列——同锚比对逐行做，行级小表 JS 侧比对同 attachExistingRow 口径）
 */
interface AnchorRow {
  id: string
  workspace_id: string
  ws_path: string
  archived: number
  created_at: string | null
  name: string
}

/**
 * 1.5 身份归并（提案流程一；注册链内插于 attachExistingRow 之前）：
 *   输入 P（已 canonical）→ common dir realpath 锚 → 与各行 ws_path 锚比对：
 *   · P 非 git（锚 null）→ undefined 退现行为（按 ws_path 独立项目）；
 *   · 无同锚行 → undefined（首注册——走既有 registerProject 链落库）；
 *   · 有同锚行 → 主 worktree 判定（selectMainWorktree 纯判定——短路唯一行 / origin/HEAD
 *     检出优先 / main > master / 首观察时间最早，判定只在本锚 worktree 集内做）：
 *       - 主行不在场（不在 git worktree list）→ 弹明确记账（「主 worktree 缺失」显式
 *         识别，不落泛化 reconcile error）+ undefined 降级独立项目现行为；
 *       - 主行在场 → 解析到主项目既有行：同锚其它活跃行提示并归档（updateProject 同径
 *         UPDATE archived=1——仲裁只决定归并目标行，不触发资产迁移），引用不健康则单项
 *         修复（reconcileProjectRef 复用），标题对齐后幂等返回（attachedToExisting=true，
 *         不经 runRegistered——挂接语义同 attachExistingRow 幂等径）。
 *   子模块 worktree：锚 = 子模块自身 common dir → 天然归并到子模块项目而非父项目。
 *   全程失败（读库/git 探针异常）→ warn 记账后 undefined 降级现行链（③ 写入失败面承接）。
 */
async function mergeSameAnchorProject(
  deps: ProjectServiceDeps,
  input: RegisterProjectInput,
): Promise<RegisterResult | undefined> {
  const git = deps.gitIdentity
  if (git === undefined) return undefined
  try {
    const anchor = await git.commonDirAnchor(input.workspaceDir)
    if (anchor === null) return undefined // 非 git / git 探测失败 → 现行为（能力位 false）
    const rows = deps.db
      .prepare<unknown[], AnchorRow>(
        `SELECT id, workspace_id, ws_path, archived, created_at, name FROM projects ORDER BY created_at, id`,
      )
      .all()
    const worktrees = await git.worktrees(input.workspaceDir)
    const live = new Map((worktrees ?? []).map((wt) => [normalizeFsPath(wt.path), wt]))
    const candidates: { row: AnchorRow; branch: string | null }[] = []
    for (const row of rows) {
      const rowAnchor = await git.commonDirAnchor(row.ws_path)
      if (rowAnchor === null || !sameAnchor(rowAnchor, anchor)) continue
      candidates.push({ row, branch: live.get(normalizeFsPath(row.ws_path))?.branch ?? null })
    }
    if (candidates.length === 0) return undefined // 首注册（无同锚行）→ 既有链
    const active = candidates.filter((c) => c.row.archived !== 1)
    if (active.length === 0) return undefined // 同锚行全 archived → 现行为（新路径新行）
    const probe: MainWorktreeCandidate[] = active.map((c) => ({
      id: c.row.id,
      branch: c.branch,
      createdAt: c.row.created_at,
    }))
    const now = new Date().toISOString()
    const mainId = selectMainWorktree(probe, {
      originDefaultBranch: await git.originDefaultBranch(input.workspaceDir),
      now,
    })
    const main = active.find((c) => c.row.id === mainId)
    if (main === undefined) return undefined // 不可达兜底（判定空/null）——降级现行链
    if (!live.has(normalizeFsPath(main.row.ws_path))) {
      // 主 worktree 缺失：显式识别降级径（不落泛化 error）——本次按独立项目现行为注册
      recordKeyLog(deps.db, {
        level: 'warn',
        scope: 'reconcile',
        message: `主 worktree 缺失（身份归并降级）：锚 ${anchor} 的主行 ${main.row.ws_path}（${main.row.id}）不在 git worktree list——本次按独立项目现行为注册`,
        data: {
          anchor,
          mainProjectId: main.row.id,
          mainWsPath: main.row.ws_path,
          disposition: '主 worktree 缺失 → 降级独立项目现行为（归并失效，交用户处置）',
        },
      })
      return undefined
    }
    // 存量同锚其它活跃行：提示并归档（仲裁只决定归并目标行，不触发资产迁移）
    for (const c of active) {
      if (c.row.id === main.row.id) continue
      deps.db.prepare(`UPDATE projects SET archived = 1, updated_at = ? WHERE id = ?`).run(now, c.row.id)
      recordKeyLog(deps.db, {
        level: 'warn',
        scope: 'reconcile',
        message: `存量双行归并归档：项目 ${c.row.id}（${c.row.ws_path}）未命中主 worktree 判定——归并入主项目 ${main.row.id}（${main.row.ws_path}），管线数据以主行为准`,
        data: {
          anchor,
          mainProjectId: main.row.id,
          archivedProjectId: c.row.id,
          archivedWsPath: c.row.ws_path,
          disposition: '未命中主判定行已归档（updateProject archived 同径）——不触发资产迁移',
        },
      })
    }
    // 引用健康保障复用（悬空 → relink/recreate 单向修引用），失败由外层 catch 降级
    const refRow = { id: main.row.id, workspace_id: main.row.workspace_id, ws_path: main.row.ws_path }
    if (!isRefHealthy(deps.registry, refRow)) {
      await reconcileProjectRef(deps, refRow, { repaired: [], orphans: [] })
    }
    const after = getRow(deps, main.row.id)
    if (after === undefined) return undefined // 不可达兜底（单写者无并发删除）
    await alignWorkspaceTitle(deps, after.workspace_id, after.name)
    return { projectId: after.id, workspaceId: after.workspace_id, attachedToExisting: true }
  } catch (cause) {
    try {
      recordKeyLog(deps.db, {
        level: 'warn',
        scope: 'reconcile',
        message: `身份归并层失败（已降级现行链）：${input.workspaceDir}——${errMessage(cause)}`,
        data: {
          wsPath: input.workspaceDir,
          error: errMessage(cause),
          disposition: '降级现行链——归并放弃，注册由既有链承接',
        },
      })
    } catch {
      // 库不可用时记账亦不可行：吞掉——降级语义零变化
    }
    return undefined
  }
}

/**
 * fix-27 重注册自愈/幂等（registerProject ① 前防御）：按 ws_path 查既有行——行在场时
 * UNIQUE(ws_path) 令 INSERT 恒炸，重注册永不走新 INSERT：
 *   · 健康引用（isRefHealthy：registry.get 命中且 path 一致）→ 幂等成功返回既有项目
 *     （projectId 复用——注册幂等语义；dsh 工作区健康而行已存在的正常重注册同径）；
 *   · 悬空引用（fix-18 home 翻转类遗留：行 workspace_id 在现行 registry 无实体）→ 复用
 *     对账单项修复 reconcileProjectRef（relink/recreate + UPDATE 单向修引用）后幂等返回
 *     ——不新 INSERT、不登记补偿（挂接保护恒成立）。
 * fix-30：行查找按归一键（normalizeFsPath 同源键）——BINARY 等值查询被拼写变体（盘符
 * 大小写/正反斜杠/尾分隔符）击穿面收口；projects 表为行级小表，全量行 JS 侧键比对。
 * 任何失败（读库/修复链异常）→ undefined 降级现行链：③ 写入失败面承接 typed error 映射，
 * 补偿语义零变化（库不可用等场景与现行行为逐字一致）。
 */
async function attachExistingRow(
  deps: ProjectServiceDeps,
  input: RegisterProjectInput,
): Promise<RegisterResult | undefined> {
  try {
    const key = normalizeFsPath(input.workspaceDir)
    const row = deps.db
      .prepare<unknown[], ProjectRefRow>(`SELECT id, workspace_id, ws_path FROM projects`)
      .all()
      .find((r) => normalizeFsPath(r.ws_path) === key)
    if (row === undefined) return undefined
    if (!isRefHealthy(deps.registry, row)) {
      await reconcileProjectRef(deps, row, { repaired: [], orphans: [] }) // 悬空引用 → 单项修复
    }
    const after = getRow(deps, row.id)
    if (after === undefined) return undefined // 不可达兜底（单写者无并发删除）——降级现行链
    // fix-24 ②：重注册幂等路径同对齐（既有行 name——input.name 对既有行不生效，title 跟行不跟输入；
    // fix-24 前落库的存量项目经任一次重注册即愈）。alignWorkspaceTitle 永不抛——本 try 语义零变化
    await alignWorkspaceTitle(deps, after.workspace_id, after.name)
    return { projectId: after.id, workspaceId: after.workspace_id, attachedToExisting: true }
  } catch (cause) {
    // fix-33 ⑫：自愈面失败先 best-effort 记账再降级（现场可追溯——原静默零记账，降级后
    // 「曾自愈失败」事件不可复现；scope 四值无注册域，自愈径语义属引用修复 → reconcile）。
    // 记账自身失败（库不可用）再吞——降级语义零变化，错误面仍由 ③ 承接。
    try {
      recordKeyLog(deps.db, {
        level: 'warn',
        scope: 'reconcile',
        message: `重注册自愈面失败（已降级现行链）：${input.workspaceDir}——${errMessage(cause)}`,
        data: {
          wsPath: input.workspaceDir,
          error: errMessage(cause),
          disposition: '降级现行链——自愈放弃，错误面由 ③ 写入失败径承接',
        },
      })
    } catch {
      // 库不可用时记账亦不可行：吞掉（与对账整体降级面同口径）
    }
    return undefined
  }
}

/**
 * fix-24 ② 注册时 workspace 标题对齐项目名（官方 workspace/rename 同径）：workspace
 * 创建/挂接与 projects 行双落定后调用——官方 hero chip（ConversationContent label =
 * workspace title）、dsh 账本 title、原生侧显示全部免费显示项目名（影子 chip 无缝可达，
 * fix-25 官方 ConversationRoot 回归后收益面全局化）。
 * 失败语义 = fail-soft 永不抛：对齐是展示面增益，不得拖垮注册主链——真实可达失败 =
 * 跨工作区重名（workspace/name-conflict：两项目同名时后者 chip 退回目录名，无害残留）；
 * 补偿链零 rename 回滚需要（排序免疫：rename 仅在 ③ 落定后执行，② 失败/③ 失败补偿
 * 一切失败径 rename 尚未发生）。后续耦合：项目改名（updateProject name patch）须联动
 * 同 rename——P1 注记不在本面。
 */
async function alignWorkspaceTitle(
  deps: ProjectServiceDeps,
  workspaceId: string,
  projectName: string,
): Promise<void> {
  try {
    await deps.rename.rename({ workspaceId, title: projectName })
  } catch (cause) {
    // app_key_logs scope CHECK 四值不含注册域——对齐降级走 child 控制台（stdio 继承回流宿主）
    console.warn(
      `workspace 标题对齐项目名失败（无害残留：chip/账本退回目录名，注册不受影响）——${projectName}（${workspaceId}）：${errMessage(cause)}`,
    )
  }
}

// ── 查询面（Interface 1：list/get/update——archived 过滤口径随行，patch 仅 name/archived） ──

/** projects 行（snake_case 存储形状 → DTO 映射唯一落点） */
interface ProjectRow {
  id: string
  workspace_id: string
  ws_path: string
  name: string
  forge_dir: string
  forge_dir_external: number
  knowledge_dir: string
  worktree_dir: string | null
  archived: number
  created_at: string
  updated_at: string
}

const SELECT_PROJECT = `SELECT id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, worktree_dir, archived, created_at, updated_at FROM projects`

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    wsPath: row.ws_path,
    name: row.name,
    forgeDir: row.forge_dir,
    forgeDirExternal: row.forge_dir_external === 1,
    knowledgeDir: row.knowledge_dir,
    worktreeDir: row.worktree_dir ?? undefined,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getRow(deps: ProjectServiceDeps, id: string): ProjectRow | undefined {
  return deps.db.prepare<unknown[], ProjectRow>(`${SELECT_PROJECT} WHERE id = ?`).get(id)
}

function listProjects(deps: ProjectServiceDeps): ProjectSummary[] {
  const rows = deps.db.prepare<unknown[], ProjectRow>(`${SELECT_PROJECT} ORDER BY created_at, id`).all()
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    wsPath: row.ws_path,
    archived: row.archived === 1, // 过滤口径：archived 态随摘要行供 UI 过滤
  }))
}

function getProject(deps: ProjectServiceDeps, id: string): Project | null {
  const row = getRow(deps, id)
  return row === undefined ? null : toProject(row)
}

function updateProject(deps: ProjectServiceDeps, id: string, patch: ProjectPatch): Project {
  const row = getRow(deps, id)
  if (row === undefined) {
    // 非六码 typed error（Error Handling 表无 project-not-found 行）：RPC 边界 fail-loud 原样上抛
    throw new Error(`项目不存在：updateProject(${id})——id 未命中 projects 行`)
  }
  // patch 仅 name/archived/worktreeDir（接口类型收窄 + 白名单建句双重执行；多余键忽略零写）
  const sets: string[] = []
  const params: unknown[] = []
  if (patch.name !== undefined) {
    sets.push('name = ?')
    params.push(patch.name)
  }
  if (patch.archived !== undefined) {
    sets.push('archived = ?')
    params.push(patch.archived ? 1 : 0)
  }
  if (patch.worktreeDir !== undefined) {
    // 1.6：worktree 目录配置更新（注册链同面透传——存绝对路径，归一口径同注册输入）
    sets.push('worktree_dir = ?')
    params.push(patch.worktreeDir)
  }
  if (sets.length > 0) {
    // 单语句 UPDATE 原子（fix-35 去单语句事务样板）
    deps.db.prepare(`UPDATE projects SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(
      ...params,
      new Date().toISOString(),
      id,
    )
  }
  const after = getRow(deps, id)
  if (after === undefined) throw new Error(`updateProject(${id})：更新后行消失（不可达——单写者无并发删除）`)
  // fix-33 ⑪ name patch 联动 workspace 标题对齐（fix-24 自认注记的后续耦合收口）：成功后
  // fire-and-forget（alignWorkspaceTitle 永不抛——对齐是展示面增益，不拖垮更新面；archived-only
  // patch 不触发；跨工作区重名等失败同注册径 fail-soft 无害残留）
  if (patch.name !== undefined) void alignWorkspaceTitle(deps, after.workspace_id, after.name)
  return toProject(after)
}

// ── 启动对账（tech-design §交互三：每次启动，永不抛断启动流程） ──

/** 对账逐项输入（读全部 projects 的最小列） */
interface ProjectRefRow {
  id: string
  workspace_id: string
  ws_path: string
}

/** 引用健康判定（纯，§交互三逐项口径）：registry.get 命中且 path 一致（attachExistingRow 健康短路同源） */
function isRefHealthy(registry: WorkspaceRegistryPort, row: ProjectRefRow): boolean {
  const current = registry.get(row.workspace_id)
  return current !== undefined && current.path === row.ws_path
}

async function reconcileAtStartup(deps: ProjectServiceDeps): Promise<ReconcileReport> {
  const report: ReconcileReport = { repaired: [], orphans: [] }
  // 三层防御：单项降级（reconcileRowDegrade）→ 孤儿面/整体降级 → 记账本身失败亦吞掉——绝不抛断启动（AC5）
  try {
    const rows = deps.db
      .prepare<unknown[], ProjectRefRow>(`SELECT id, workspace_id, ws_path FROM projects ORDER BY created_at, id`)
      .all()
    for (const row of rows) await reconcileRowDegrade(deps, row, report)
    detectOrphanWorkspaces(deps, report)
  } catch (cause) {
    try {
      recordKeyLog(deps.db, {
        level: 'error',
        scope: 'reconcile',
        message: `启动对账整体失败（已降级，不阻断启动）：${errMessage(cause)}`,
        data: { error: errMessage(cause), disposition: '整体降级——本次对账中止，启动流程继续' },
      })
    } catch {
      // 库不可用时记账亦不可行：吞掉——启动优先于记账（AC5）
    }
  }
  return Promise.resolve(report)
}

/** 对账单项处理器（fix-35 自三层 try 抽离）：单项失败 → error 记账后跳过（引用未修，下次启动重试）。
 * fix-33 ⑬ 记账防护：catch 内 recordKeyLog 套 try——记账抛错（库锁/表损坏等）原样上抛会被
 * 外层整体降级接住，但本轮剩余行不再对账（截断）；吞掉记账失败保住逐项循环。 */
async function reconcileRowDegrade(
  deps: ProjectServiceDeps,
  row: ProjectRefRow,
  report: ReconcileReport,
): Promise<void> {
  try {
    await reconcileProjectRef(deps, row, report)
  } catch (cause) {
    try {
      recordKeyLog(deps.db, {
        level: 'error',
        scope: 'reconcile',
        message: `对账单项失败：项目 ${row.id}（${row.ws_path}）——已跳过，不阻断启动`,
        data: {
          projectId: row.id,
          workspaceId: row.workspace_id,
          wsPath: row.ws_path,
          error: errMessage(cause),
          disposition: '单项降级跳过——引用未修，启动继续（下次启动重试对账）',
        },
      })
    } catch {
      // 记账亦失败——吞掉（对账优先于记账：剩余行继续，AC5 口径）
    }
  }
}

async function reconcileProjectRef(
  deps: ProjectServiceDeps,
  row: ProjectRefRow,
  report: ReconcileReport,
): Promise<void> {
  const { db, registry } = deps
  // 校验：get(workspace_id) 的 path 与 ws_path 一致即通过（§交互三逐项路径）
  if (isRefHealthy(registry, row)) return
  // 失配：list() 按 ws_path 找回（对账钥匙 = ws_path，idx_projects_ws_path）
  const found = registry.list().find((ws) => ws.path === row.ws_path)
  let target: WorkspaceLike
  let action: ReconcileRepair['action']
  if (found !== undefined) {
    target = found
    action = 'relinked'
  } else {
    // 找不回：create(ws_path) 幂等重建（dsh 侧补实体）→ 修引用
    target = await registry.create(row.ws_path)
    action = 'recreated'
  }
  // 单向修引用：只改应用侧 workspace_id，绝不反向改 dsh 侧（Implementation Notes）；
  // 单语句 UPDATE 原子（fix-35 去单语句事务样板）
  db.prepare(`UPDATE projects SET workspace_id = ?, updated_at = ? WHERE id = ?`).run(
    target.id,
    new Date().toISOString(),
    row.id,
  )
  if (action === 'relinked') {
    // 记账口径（§交互三 + ER 记名域②）：失配找回 warn 单条、old→new 与处置结果入 data_json；
    // 幂等重建成功不记（成功路径一律不记）
    recordKeyLog(db, {
      level: 'warn',
      scope: 'reconcile',
      message: `ws_path 失配找回：项目 ${row.id} 引用 ${row.workspace_id} → ${target.id}（${row.ws_path}）——已单向修正应用侧引用，dsh 侧不动`,
      data: {
        projectId: row.id,
        wsPath: row.ws_path,
        oldWorkspaceId: row.workspace_id,
        workspaceId: target.id,
        action: 'relinked',
        disposition: '已单向修正应用侧 workspace_id 引用（dsh 侧不动）',
      },
    })
  }
  report.repaired.push({ projectId: row.id, workspaceId: target.id, action })
}

function detectOrphanWorkspaces(deps: ProjectServiceDeps, report: ReconcileReport): void {
  const { db, registry } = deps
  // 反查（修引用后口径）：dsh 全量 ↔ projects 现行 workspace_id——不在引用集即孤儿
  const known = new Set(
    db.prepare<unknown[], { workspace_id: string }>(`SELECT workspace_id FROM projects`).all().map((r) => r.workspace_id),
  )
  for (const ws of registry.list()) {
    if (!known.has(ws.id)) report.orphans.push({ workspaceId: ws.id, wsPath: ws.path })
  }
  if (report.orphans.length === 0) return
  // 孤儿发现记账：单事件单条（全部孤儿并入同条 data_json）——只提示不自动删（SC12/§交互三）
  recordKeyLog(db, {
    level: 'warn',
    scope: 'reconcile',
    message: `发现 ${report.orphans.length} 个孤儿工作区（dsh 有、应用无）——仅提示，不自动删`,
    data: { orphans: report.orphans, disposition: '仅提示不自动删——处置交用户（UI 启动对账提示）' },
  })
}
