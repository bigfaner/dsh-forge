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
// 查询面 + 启动对账（2.3）：listProjects（archived 态随行=过滤口径）/ getProject / updateProject
// （patch 仅 name/archived）/ reconcileAtStartup（失配找回、找不回幂等重建、孤儿只提示不删；
// 全程异常降级 app_key_logs 永不抛断启动）。SQLite 写仅经 db/ 句柄（单写路径）；
// registry 调用只依赖 dsh 官方 ctx.workspaceRegistry 面。
import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import type Database from 'better-sqlite3'
import type {
  Project,
  ProjectPatch,
  ProjectService,
  ProjectSummary,
  ReconcileRepair,
  ReconcileReport,
  RegisterProjectInput,
  RegisterResult,
} from '@dsh-forge/contracts'
import { normalizeFsPath } from '@dsh-forge/path-key'
import { errMessage } from '../util.js'
import { CompensationError, ProjectWriteError, WorkspaceCreateError } from './errors.js'
import { recordKeyLog } from './key-logs.js'
import type { WorkspaceLike, WorkspaceRegistryPort, WorkspaceRenamePort } from './registry.js'

export interface ProjectServiceDeps {
  /** SQLite 句柄（db/ 唯一产出；一切 SQL prepared） */
  db: Database.Database
  /** dsh 官方面（ctx.workspaceRegistry；G1 pin 4 幂等/get 语义见 ./registry.ts） */
  registry: WorkspaceRegistryPort
  /** dsh 官方面（ctx.workspaceController——workspace/rename 命令；fix-24 ② 标题对齐） */
  rename: WorkspaceRenamePort
}

/** Interface 1 服务面（2.3 并齐 contracts ProjectService 全五法） */
export function createProjectService(deps: ProjectServiceDeps): ProjectService {
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

/** ③ 写 projects 行（ws_path 以 registry 返回的 canonical path 为准——非用户拼写原样；单语句原子） */
function writeProjectRow(
  db: Database.Database,
  o: { projectId: string; workspace: WorkspaceLike; input: RegisterProjectInput; now: string },
): void {
  db.prepare(
    `INSERT INTO projects (
       id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, archived, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    o.projectId,
    o.workspace.id,
    o.workspace.path,
    o.input.name,
    o.input.forgeDir,
    isForgeDirExternal(o.workspace.path, o.input.forgeDir) ? 1 : 0,
    o.input.knowledgeDir,
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

/** 注册主链（纯编排：归一 → 自愈预检 → ① 预检 → ② create → ③ 写行 → 标题对齐） */
async function registerProject(deps: ProjectServiceDeps, input: RegisterProjectInput): Promise<RegisterResult> {
  const { db, registry } = deps

  // fix-30 入口归一：注册输入（workspaceDir/forgeDir/knowledgeDir）可达则 realpath——拼写
  // 变体在进 ① 预检/自愈查询前收敛到磁盘真值拼写；比对口径 = normalizeFsPath 同源键
  const canonicalInput: RegisterProjectInput = {
    ...input,
    workspaceDir: await canonicalizeDir(input.workspaceDir),
    forgeDir: await canonicalizeDir(input.forgeDir),
    knowledgeDir: await canonicalizeDir(input.knowledgeDir),
  }

  // fix-27 自愈防御（① 前）：重注册（既有行在场）→ 幂等成功 / 悬空引用自愈，绝不撞
  // UNIQUE(ws_path)（详见 attachExistingRow 块注——预检只查 dsh 注册表，行在场时 INSERT 恒炸）
  const reattached = await attachExistingRow(deps, canonicalInput)
  if (reattached !== undefined) return reattached

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
  archived: number
  created_at: string
  updated_at: string
}

const SELECT_PROJECT = `SELECT id, workspace_id, ws_path, name, forge_dir, forge_dir_external, knowledge_dir, archived, created_at, updated_at FROM projects`

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    wsPath: row.ws_path,
    name: row.name,
    forgeDir: row.forge_dir,
    forgeDirExternal: row.forge_dir_external === 1,
    knowledgeDir: row.knowledge_dir,
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
  // patch 仅 name/archived（接口类型收窄 + 白名单建句双重执行；多余键忽略零写）
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
