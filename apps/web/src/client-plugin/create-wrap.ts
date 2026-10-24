// installSessionCreateWrap——W3 体验层主径（提案 session-binding-guarantee §W3）：
// 装配期对官方 sessions 服务对象做 create 属性替换（host interceptRequiredBinding 同配方，
// dispose 恢复）。资格门 = 全新创建（无 sessionId）∧ workspaceId/cwd 命中注册项目行；
// 改道 = forge:worktree/sessionCreate 预铸采纳（git 与否的实质判定在 host doSessionCreate
// 逐次现跑——判非 git 抛错 → fail-open 回官方原流）；响应契约保真 = 返回预铸 Y（官方前端
// retain/open/草稿/回执原生对位，chip 出生即挂）。
//
// 三条铁律：
//   ① 内部零触碰——wrap 只有整调用改道与原样透传两种动作，不读/不改官方 createOrAdopt 分支；
//   ② 判定逐次独立——每次创建现查项目行，零缓存（git 项目可变非 git、行可增删）；
//   ③ fail-open 透传——caller 原参形态的 original 永不落改道 try 域：官方自身错误原样
//      上抛（不吞不重调），改道链任何瞬态异常（项目行现查失败 / host 判非 git / RPC 失败）
//      = 官方原流（guard 兜底）；唯一例外 = W2 typed 拒绝码 ERR_WORKTREE_CAPABILITY_ABSENT
//      （fail-closed 确定性拒绝——单独放行上抛呈现，不降级回主树，用户裁决 2026-10-18）。
//      bug 2bc90d64 增补：预铸成功后以 {sessionId, cwd} 形态调 original 一次 = 官方 adopt
//      正门补客户端账本（消费面调用，非改官方内部）；该腿异常 fail-soft 直返预铸 id。
//
// bundle 自含纪律（client-plugin 经典 script 形状）：本文件零运行时 import——官方/contracts
// 面以结构同型镜像窄接口承载（open-session.ts / plugin.ts 先例）。

/** 官方 sessions.create 调用参窄面（UiWorkspaceService 三触点消费切片镜像） */
export interface SessionCreateCallOpts {
  readonly workspaceId?: string
  readonly cwd?: string
  /** 在场 = adopt 径（官方 reuseBlank 复用采纳）——wrap 直通零改道 */
  readonly sessionId?: string
}

/** 官方 create 方法窄面（属性替换的对象属性——调用期属性查找全命中） */
export type SessionCreateMethod = (opts?: SessionCreateCallOpts) => Promise<string>

/** forge:worktree/session-create 通道字面量（contracts WORKTREE_CHANNELS.sessionCreate 同源镜像） */
export const SESSION_CREATE_CHANNEL = 'forge:worktree/session-create'

/** 项目行窄形状（contracts ProjectSummary 消费切片：workspaceId + wsPath + archived） */
export interface ForgeProjectRowSlice {
  readonly workspaceId?: unknown
  readonly wsPath?: unknown
  readonly archived?: unknown
}

/** 项目行现查返回（forge:projects/list 行集——形状漂移容忍，由本模块正规化剔除） */
export type ProjectRowsSnapshot = readonly unknown[]

/** 预铸产品（forge:worktree/session-create 产物消费切片——bug 2bc90d64：cwd 必带） */
export interface SessionPrecastProduct {
  readonly sessionId: string
  /** 产物头 cwd（host realpath 归一回带；缺席 = 旧 host 形态，跳过 adopt 补账本） */
  readonly cwd?: string
}

/** wrap 依赖（注入面——生产 = 页内 RPC 传输镜像，测试 = spy） */
export interface SessionCreateWrapDeps {
  /** 预铸采纳单门（forge:worktree/session-create——信封拆装由装配面承担；拒绝/异常 = reject） */
  readonly sessionCreate: (worktreePath: string) => Promise<SessionPrecastProduct>
  /** 注册项目行现查（每次创建现拉零缓存——列表 RPC 逐次 fresh） */
  readonly projectRows: () => Promise<ProjectRowsSnapshot>
  /** 官方 workspace 行现查（bug ff324cad A2——workspaces.list 快照窄面镜像 {workspaceId, path}；
   *  缺席 = 树 workspaceId/cwd 判定面缺席（零改道，现状） */
  readonly workspaceRows?: () => Promise<readonly unknown[]>
  /** 树归属门（forge:worktree/resolve 窄面——path → 注册项目根；null = 未注册）。
   *  缺席 = workspaceRows 判定面同缺席 */
  readonly resolveRoot?: (path: string) => Promise<string | null>
  /** blank 绑定探测（forge:worktree/seal 窄面——sessionId → 绑定树；null = 未绑定。
   *  WYSIWYG 复用守卫：采纳前探测 blank 绑定，失配不复用。缺席 = 跳过守卫（现状采纳） */
  readonly sessionBinding?: (sessionId: string) => Promise<string | null>
  /** 失配呈现缝（WYSIWYG 哨兵——toast + 日志的消费面；缺席 = 零呈现） */
  readonly notifyMismatch?: (event: { sessionId: string; binding: string | null; displayed: string }) => void
  /** fail-open 诊断行（缺省 console.warn——e2e/诊断消费） */
  readonly warn?: (message: string) => void
}

/** 路径归一（跨源比较键：反斜杠→斜杠 + 小写 + 去尾斜杠——worktree 选中记忆键同判） */
function normPath(value: string): string {
  const slashed = value.replaceAll('\\', '/')
  const trimmed = slashed.length > 1 && slashed.endsWith('/') ? slashed.slice(0, -1) : slashed
  return trimmed.toLowerCase()
}

/** 行正规化（非对象/缺键/空串剔除；archived 排除） */
function normalizeRow(row: unknown): { workspaceId: string; wsPath: string } | null {
  if (row === null || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  const workspaceId = record['workspaceId']
  const wsPath = record['wsPath']
  if (record['archived'] === true) return null
  if (typeof workspaceId !== 'string' || workspaceId === '') return null
  if (typeof wsPath !== 'string' || wsPath === '') return null
  return { workspaceId, wsPath }
}

/** 官方 workspace 行正规化（非对象/缺键/空串剔除——workspaces.list.items 窄镜像） */
function normalizeWorkspaceRow(row: unknown): { workspaceId: string; path: string } | null {
  if (row === null || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  const workspaceId = record['workspaceId']
  const path = record['path']
  if (typeof workspaceId !== 'string' || workspaceId === '') return null
  if (typeof path !== 'string' || path === '') return null
  return { workspaceId, path }
}

/**
 * 树归属门（bug ff324cad A2）：workspace 行 path 解析注册项目根——命中且 path ≠ 根
 * = forge 管理的树（改道预铸带绑定）；主行/未注册 = null（官方原流/现状，零扩张）。
 */
async function gatedTreePath(
  path: string,
  resolveRoot: (path: string) => Promise<string | null>,
): Promise<string | null> {
  let projectRoot: string | null
  try {
    projectRoot = await resolveRoot(path)
  } catch {
    return null
  }
  if (projectRoot === null || projectRoot === '') return null
  if (normPath(path) === normPath(projectRoot)) return null
  return path
}

/**
 * 目标树逐次判定（零缓存核心段，纯函数）：workspaceId/cwd → 注册项目 ws_path（现状）；
 * 项目行不命中 → 官方 workspace 行命中（bug ff324cad A2——树 workspace 切换径）经树归属
 * 门（resolve 现查：命中注册项目且 ≠ 项目根）改道预铸，官方切树工作区诞生/复用的会话
 * 即带绑定台账（零重路由二建）。未注册 workspace = null = 官方原流，零行为差异。
 * git 与否不在客户端预判——host doSessionCreate 逐次现跑实质判定。
 */
export async function treeOf(
  opts: SessionCreateCallOpts | undefined,
  rows: ProjectRowsSnapshot,
  workspaces?: readonly unknown[],
  resolveRoot?: (path: string) => Promise<string | null>,
): Promise<string | null> {
  if (opts === undefined) return null
  if (opts.sessionId !== undefined && opts.sessionId !== '') return null
  const normalized = rows.map(normalizeRow)
  const workspaceRows = (workspaces ?? []).map(normalizeWorkspaceRow)
  const gated = resolveRoot !== undefined ? (path: string): Promise<string | null> => gatedTreePath(path, resolveRoot) : undefined
  const workspaceId = typeof opts.workspaceId === 'string' && opts.workspaceId !== '' ? opts.workspaceId : undefined
  if (workspaceId !== undefined) {
    const project = normalized.find((row) => row !== null && row.workspaceId === workspaceId)?.wsPath
    if (project !== undefined) return project
    if (gated !== undefined) {
      const row = workspaceRows.find((row) => row !== null && row.workspaceId === workspaceId)
      if (row !== null && row !== undefined) return gated(row.path)
    }
    return null
  }
  const cwd = typeof opts.cwd === 'string' && opts.cwd !== '' ? opts.cwd : undefined
  if (cwd !== undefined) {
    const key = normPath(cwd)
    if (normalized.some((row) => row !== null && normPath(row.wsPath) === key)) return cwd
    if (gated !== undefined) {
      const row = workspaceRows.find((row) => row !== null && normPath(row.path) === key)
      if (row !== null && row !== undefined) return gated(cwd)
    }
    return null
  }
  return null
}

/** W2 typed 拒绝码字面量（contracts ERROR_CODES 同源镜像——bundle 自含零 import） */
export const ERR_WORKTREE_CAPABILITY_ABSENT = 'ERR_WORKTREE_CAPABILITY_ABSENT'

/** typed 拒绝判定（结构镜像——RpcClientError.code；不依赖 instanceof，跨 bundle 形状容错） */
function isCapabilityAbsentTyped(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === ERR_WORKTREE_CAPABILITY_ABSENT
  )
}

/** 会话绑定探测记忆（会话级——blank 绑定出生即定，会话期一探测零重复 RPC） */
const bindingMemo = new Map<string, string | null>()

/**
 * WYSIWYG 复用守卫（采纳前探测）：目标 workspace 的树解析 + blank 绑定探测——绑定树 ≠
 * 目标树（含未绑定）→ 失配呈现 + 预铸/复用目标树新会话；判定面缺席/探测失败 →
 * undefined = 官方原样采纳（现状）。bound 调用不落本函数（官方错误必须单次上抛，
 * 禁 fail-open 重调——三铁律①）。
 */
async function adoptMismatchDetour(
  opts: SessionCreateCallOpts & { sessionId: string },
  deps: SessionCreateWrapDeps,
  warn: (message: string) => void,
): Promise<{ sessionId: string; cwd?: string } | undefined> {
  try {
    // 判定面缺席 = 现状采纳（fail-open——探测是体验守卫，非正确性依赖）
    if (deps.sessionBinding === undefined || deps.workspaceRows === undefined) return undefined
    const workspaceId = typeof opts.workspaceId === 'string' ? opts.workspaceId : undefined
    if (workspaceId === undefined || workspaceId === '') return undefined
    const wsRow = (await deps.workspaceRows().catch(() => []))
      .map(normalizeWorkspaceRow)
      .find((row) => row !== null && row.workspaceId === workspaceId)
    if (wsRow === null || wsRow === undefined) return undefined
    let binding: string | null | undefined = bindingMemo.get(opts.sessionId)
    if (binding === undefined) {
      binding = await deps.sessionBinding(opts.sessionId)
      bindingMemo.set(opts.sessionId, binding)
    }
    // 绑定 ≡ 目标树 → 现状采纳（复用即所见）
    if (binding !== null && normPath(binding) === normPath(wsRow.path)) return undefined
    // 失配（含未绑定）：不复用——toast + 日志呈现，改在目标树开新会话（G3 复用该树
    // blank / 预铸该树；调用方经官方 adopt 正门补账本——bug 2bc90d64 同配方）
    warn(`[dswf-client] blank 复用守卫：会话 ${opts.sessionId} 绑定 ${binding ?? '(未绑定)'} ≠ 目标树 ${wsRow.path}——不复用，改开目标树新会话`)
    deps.notifyMismatch?.({ sessionId: opts.sessionId, binding, displayed: wsRow.path })
    const product = await deps.sessionCreate(wsRow.path)
    return { sessionId: product.sessionId, ...(product.cwd !== undefined ? { cwd: product.cwd } : {}) }
  } catch (cause) {
    warn(`[dswf-client] blank 复用守卫探测失败（fail-open 现状采纳）：${String(cause)}`)
    return undefined
  }
}

/**
 * 装配期安装（插件 apply() 内 sessions 到手后恰一次）：留底官方原方法 → 影子替换 →
 * 返回 dispose（恢复原方法，host interceptRequiredBinding 同配方；幂等）。
 * create 面缺席（上游面漂移）= 零安装零抛（no-op dispose——fail-soft，其余登记行不受累）。
 */
export function installSessionCreateWrap(
  sessions: { create?: SessionCreateMethod },
  deps: SessionCreateWrapDeps,
): () => void {
  const original = (sessions as unknown as Record<string, unknown>)['create']
  if (typeof original !== 'function') return () => {}
  const bound = (original as SessionCreateMethod).bind(sessions)
  const warn = deps.warn ?? ((message: string): void => console.warn(message))
  const wrapped = async (opts?: SessionCreateCallOpts): Promise<string> => {
    // ① adopt 径（复用采纳）+ WYSIWYG 复用守卫：blank 绑定 ≠ 目标 workspace 树 → 不复用，
    //    改在该树开新会话（失配 blank 留给哨兵提示）。探测失败 = 现状采纳（fail-open）。
    if (opts?.sessionId !== undefined && opts.sessionId !== '') {
      const detour = await adoptMismatchDetour({ ...opts, sessionId: opts.sessionId }, deps, warn)
      if (detour !== undefined) {
        // 官方 adopt 正门（补账本）——官方错误原样上抛，单次调用（铁律①禁 fail-open 重调）
        return await bound({ cwd: detour.cwd, sessionId: detour.sessionId })
      }
      return await bound(opts)
    }
    // ② 目标树逐次独立判定（零缓存）：现查项目行 + 官方 workspace 行（树归属门）；
    //    异常/不命中 = null = 官方原流
    let tree: string | null = null
    try {
      tree = await treeOf(
        opts,
        await deps.projectRows(),
        deps.workspaceRows === undefined ? undefined : await deps.workspaceRows().catch(() => []),
        deps.resolveRoot,
      )
    } catch {
      tree = null
    }
    if (tree === null) return bound(opts)
    // ③ 改道预铸（try 域只罩改道链——caller 原参形态的 original 永不落入）：git 判定与
    //    模式随档在 host doSessionCreate 逐次现跑；G3 互斥与 guard/arm 共享同树 blank
    //    产物，零双建
    try {
      const product = await deps.sessionCreate(tree)
      if (typeof product?.sessionId !== 'string' || product.sessionId === '') {
        throw new Error('sessionCreate 产物缺 sessionId（形状漂移）')
      }
      // Root cause (bug 2bc90d64): 整调用改道绕过了官方 create 的 placeholder 即时记账，
      // 调用方随后的 retain 只能赌 api-session/added 广播（官方 gateway 事件通道）赶在
      // retain 之前落地——预铸响应走 forge IPC，跨通道竞速无序 → 偶发 unknown session。
      // 修复 = 预铸后经官方 adopt 正门补账本：bound({sessionId, cwd}) 走官方 create 契约
      // （"on success merge into summaries immediately"——为「拿 id 即 retain」设计），host
      // 面幂等（ensureSession 对活/持久会话回同 id）。cwd = 产物头 cwd（≠ 请求树：创建即绑
      // 选中树改写），非 caller 原参。adopt 异常 fail-soft 直返预铸 id（产物已可用）。
      if (typeof product.cwd !== 'string' || product.cwd === '') return product.sessionId
      try {
        return await bound({ cwd: product.cwd, sessionId: product.sessionId })
      } catch (cause) {
        warn(`[dswf-client] sessions.create 改道产物 adopt 补账本失败（fail-soft 直返预铸 id）：${String(cause)}`)
        return product.sessionId
      }
    } catch (cause) {
      // ④a W2 fail-closed 单独放行（用户裁决 2026-10-18）：typed 拒绝码 ERR_WORKTREE_CAPABILITY_ABSENT
      //    = host 确定性拒绝（能力缺席），不是瞬态降级——原样上抛呈现（官方 createFailed toast /
      //    RpcClientError Toast 链，依 1.1 核销 #5 文案语义映射），不 fail-open 回主树
      if (isCapabilityAbsentTyped(cause)) throw cause
      // ④b fail-open：改道链其余瞬态异常（host 判非 git / RPC 失败 / 产物漂移）= 官方原流
      //    （降级态 = 现状世界，host guard 首条消息兜底）
      warn(`[dswf-client] sessions.create 改道预铸失败（fail-open 官方原流）：${String(cause)}`)
      return bound(opts)
    }
  }
  ;(sessions as unknown as Record<string, unknown>)['create'] = wrapped
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    ;(sessions as unknown as Record<string, unknown>)['create'] = original
    bindingMemo.clear()
  }
}
