// worktree 六卡挂载面（worktree-branch-management fix-2——装配缺口承接②web 侧）。
// 三组件（通用层组件本体 = @dsh-forge/git-worktree/client，本文件只做数据接线与挂载）：
//   · ForgeHeroWorktreeMount——hero 第二 chip（难点 A 落法③产品自增行：由 hero workspace
//     影子占用者 ForgeHeroWorkspacePicker 在其渲染面就地并列，取证见 walkthrough/
//     hero-second-chip-decision.md）——选择菜单 + 新建/删除两弹窗 + ahead/behind 懒加载；
//   · ForgeSessionWorktreeChip——conversation.session.header.actions 槽只读 chip（绑定展示
//     / 失效态）；非 git / 无绑定 = 零注入（能力位条件渲染）；
//   · ForgeWorktreeSealOverlay——封存提示通道（SealNotice + SealedComposerPlaceholder；
//     挂 conversation.input.overlay 槽——composer 区官方缝。「不可发送」硬保证在 host
//     发送拦截面，UI 均提示性视觉）。
// 数据面 = forge:worktree/* 九通道（contracts WORKTREE_CHANNELS 唯一源，rpc client 薄面）。
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  CreateWorktreeDialog,
  DeleteWorktreeDialog,
  HeroWorktreePicker,
  SealNotice,
  SealedComposerPlaceholder,
  SessionWorktreeChip,
  WorktreeRiskConfirmation,
  isCrossBranchRisk,
  joinWorktreePath,
  type CreateWorktreeRequest,
  type DeleteChecks,
} from '@dsh-forge/git-worktree/client'
import type { AheadBehind } from '@dsh-forge/git-worktree'
import type { SlugCandidate } from '@dsh-forge/git-worktree/client'
import { collectSlugCandidates } from '@dsh-forge/git-worktree/client'
import { EditableCombobox } from '../../components/index.js'
import { preloadRpcClientFactory, type ForgeRpcClient } from '../../rpc/client.js'
import {
  activeSessionRowOf,
  riskDialogNeeded,
  riskLatchConfirm,
  riskLatchFailureClear,
  riskLatchReselect,
  shouldArmSelectedRow,
  type HeroWorktreeFace,
  type RiskConfirmLatch,
} from './hero-picker-model.js'
// 弹窗卡面/下拉浮层宽度规则（.dswt-create-modal / .dswt-*-menu——session.css 1.12 段）
import './session.css'

/**
 * 分支组合框输入面样式（字体令牌 + mono——盒模型不在此处：宽度/内距/边框由
 * .dswt-field-control 共享规则承载在官方 Input 外层 .wrap 上，与基准分支触发器同源等宽）
 */
const branchInputStyle: React.CSSProperties = {
  font: 'var(--dsw-font-xs-13)',
  fontFamily: 'var(--ds-font-family-code, monospace)',
}

/** list 结果 → 行渲染模型（WorktreeRow 同形——DTO 即行源，零二次派生） */
const rowsOf = (result: Awaited<ReturnType<ForgeRpcClient['worktree']['list']>>) =>
  result.entries.map((entry) => ({
    path: entry.path,
    branch: entry.branch,
    worktreeName: entry.worktreeName,
    isMain: entry.isMain,
    present: entry.present,
  }))

/** forge:worktree/list 拉取相位（isGit 能力位 + 行集 + 所配目录——能力位条件渲染单源） */
interface WorktreeListPhase {
  readonly state: 'loading' | 'ready' | 'error'
  readonly isGit: boolean
  readonly rows: ReturnType<typeof rowsOf>
  readonly worktreeDir?: string
}

const emptyPhase: WorktreeListPhase = { state: 'loading', isGit: false, rows: [] }

/** worktree 路径归一键（1.21/1.24 口径——账本 cwd 与清单行 path 跨源比对；与 plugin.ts
 * worktreeCwdKey 同式，组件层本地单源避免装配层反向依赖） */
const cwdKey = (path: string): string => path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()

/**
 * 项目粒度选中记忆（1.26 起落 sessionStorage——bug 907225f2 确认即回填的载体升级）：
 * worktree 挂靠会话采纳会引发会话面整域重载（1.26 e2e 实证——挂靠 openSession 后 hero
 * 挂载树整域重挂、模块级记忆丢失），模块级 Map 载体使「记忆选中→编排默认」跨重载失效；
 * sessionStorage 同 tab 同源存活、重载不丢，读写全程 try/catch（隐私模式/SSR fail-soft
 * 退回无记忆现状）。写入口唯一（select 记忆/删除两式），键 = 归一 projectRoot。
 */
const memoryKey = (projectRoot: string): string => `dswt.lastWorktree.${cwdKey(projectRoot)}`

function readSelectedMemory(projectRoot: string): string | undefined {
  try {
    return window.sessionStorage.getItem(memoryKey(projectRoot)) ?? undefined
  } catch {
    return undefined
  }
}

function writeSelectedMemory(projectRoot: string, path: string | undefined): void {
  try {
    if (path === undefined) window.sessionStorage.removeItem(memoryKey(projectRoot))
    else window.sessionStorage.setItem(memoryKey(projectRoot), path)
  } catch {
    // 存储不可用（隐私模式）fail-soft：记忆丢失 = 退回锚定回填现状
  }
}

/**
 * arm 冷却窗（点选/编排成功后 8s 内不再自发 arm——账本 cwd 对挂靠树的收敛存在滞后，
 * 滞后窗口内 arm 会把「刚编排完」误判为「当前不在选中树」而弹确认框扰断 1.19 单页流；
 * 跨重挂存活故随 sessionStorage。冷却只是抑噪：其后 cwd 仍 ≠ 选中树时编排默认照常消费）。
 */
const ARM_COOLDOWN_MS = 8_000

function writeArmCooldown(): void {
  try {
    window.sessionStorage.setItem('dswt.armCooldownUntil', String(Date.now() + ARM_COOLDOWN_MS))
  } catch {
    // fail-soft：无冷却 = 抑噪退化，语义不受影响
  }
}

function readArmCooldownActive(): boolean {
  try {
    return Date.now() < (Number(window.sessionStorage.getItem('dswt.armCooldownUntil')) || 0)
  } catch {
    return false
  }
}

/**
 * hero 默认回填锚定链（1.17 refinement 裁决——纯函数单源）：主行（isMain）当前检出分支
 * → rows 中检出同分支的行（分支只检出于一个树，分支→worktree 映射唯一；不硬编码
 * main/主行——主行检出 feature 分支时默认即指向该分支所在树，含主行自身检出场景）。
 * 锚定失败（主行 branch null / 映射行缺失 / 非 git 不进本函数）= undefined 退回占位现状。
 */
export function anchorDefaultWorktreePath(
  rows: readonly { readonly path: string; readonly branch: string | null; readonly isMain: boolean }[],
): string | undefined {
  const mainBranch = rows.find((row) => row.isMain)?.branch
  if (mainBranch === null || mainBranch === undefined) return undefined
  return rows.find((row) => row.branch === mainBranch)?.path
}

/**
 * hero 第二 chip 挂载（新建/删除弹窗由本面持有——通用层组件零弹窗自持，装配层挂）。
 * projectRoot 缺席（无选中项目）= 零注入退回现状；非 git = HeroWorktreePicker 内部
 * 返回 null（能力位条件渲染——UI 只消费 isGit）。
 * 选中态在本面闭环（bug 907225f2）：点选 = 纯选中态（1.29 裁决——chip 回填 + 项目粒度
 * 记忆写入，零编排零确认框零会话副作用；1.14「点选即建会话」即时编排语义废除）。
 * 编排唯一消费点 = arm 效应（首条消息时点——composer 草稿非空驱动），见下。
 */
export function ForgeHeroWorktreeMount({
  projectRoot,
  worktree,
  makeRpc = preloadRpcClientFactory,
}: {
  /** 项目根（ws_path——list/ops 执行 cwd；null = 零注入） */
  readonly projectRoot: string | null
  /** hero worktree inject face（编排缝 + 账本源 + composer 草稿缝——HeroWorktreeFace
   * 单源；缺席 = arm 不消费，选中态照常闭环） */
  readonly worktree?: HeroWorktreeFace | undefined
  readonly makeRpc?: () => ForgeRpcClient
}): ReactNode {
  const [phase, setPhase] = useState<WorktreeListPhase>(emptyPhase)
  const [aheadBehind, setAheadBehind] = useState<ReadonlyMap<string, AheadBehind>>(new Map())
  const [createOpen, setCreateOpen] = useState(false)
  const [branches, setBranches] = useState<{ readonly defaultBranch: string; readonly names: readonly string[] }>({ defaultBranch: 'main', names: [] })
  // 分支下拉 slug 候选（提案/feature slug——proposals.list + features.list RPC；挂载面归一为 {slug, done}）
  const [slugCandidates, setSlugCandidates] = useState<readonly SlugCandidate[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ readonly path: string; readonly worktreeName: string; readonly branch: string | null } | null>(null)
  const [deleteChecks, setDeleteChecks] = useState<DeleteChecks | null>(null)
  // 选中态本地闭环（初值 = 选中记忆——1.29 点选纯选中态，无 owner 显式回填面）
  const [localSelectedPath, setLocalSelectedPath] = useState<string | undefined>(
    () => (projectRoot !== null ? readSelectedMemory(projectRoot) : undefined),
  )
  // 失败抑制集（arm 失败路径零重试——1.25 口径；1.31 A3 与取消抑制拆分）
  const [armSuppressed, setArmSuppressed] = useState<readonly string[]>([])
  // 取消抑制集（1.31 A3——确认框取消路径专用；显式重选同树即清除，语义 = 用户否决非失败循环）
  const [cancelSuppressed, setCancelSuppressed] = useState<readonly string[]>([])
  // 编排在途闸（arm 专用——async 编排窗口内 arm 效应零重入；结束后解锁，当前会话再落
  // 回他树时编排默认可重新消费——mount 为 root 作用域影子，跨会话常驻）
  const orchestrationInFlightRef = useRef(false)
  // 最近一次 arm 成功产物（armed 去重——产物即当前会话且选中路径未变时零重入，键入续字
  // 不抖；改选他行即重新消费）
  const armedRef = useRef<{ readonly path: string; readonly sessionId: string } | undefined>(undefined)
  // 1.30 选中树推送（forge:worktree/select——host 必绑拦截重路由目标单源；fire-and-forget，
  // path 缺席 = 清除 host 侧该项目选中记忆）。缺席通道（旧 host）fail-soft 不扰选中态。
  const pushSelection = useCallback(
    (path: string | undefined): void => {
      if (projectRoot === null) return
      void makeRpc()
        .worktree.select({ projectRoot, ...(path !== undefined ? { path } : {}) })
        .catch(() => {})
    },
    [projectRoot, makeRpc],
  )

  // 点选 = 纯选中态（1.29）：chip 回填 + 项目粒度记忆写入；零编排零确认框零会话副作用。
  // 冷却窗照写——若用户先键入后点选（草稿已非空），1.31 A1 判据下冷却不再挡发送意图的
  // arm（唯一编排时机保住）；「点选引发」（draft 空）的 arm 仍压 8s 短窗语义。
  // A3：显式重选 = 用户再次表达意图——清除该行的取消抑制（确认框可重弹）。
  const onSelectConfirmed = useCallback(
    (path: string): void => {
      writeArmCooldown()
      // 1.34 确认闩锁：换目标重选清退（同行重选保留——确认后点 chip 续字零重弹）
      setRiskConfirmedLatch((prev) => riskLatchReselect(prev, path))
      setCancelSuppressed((prev) => (prev.includes(path) ? prev.filter((row) => row !== path) : prev))
      if (projectRoot !== null) writeSelectedMemory(projectRoot, path)
      pushSelection(path)
      setLocalSelectedPath(path)
    },
    [projectRoot, pushSelection],
  )

  // 1.17 默认回填（展示层回填；1.26 起回填态升级为编排默认——arm 效应见下）：清单就绪
  // 且无用户记忆/显式回填时按「选中记忆 → 锚定链」回填。记忆在此响应式读（非仅 mount
  // 初值——挂靠采纳引发会话面整域重挂时首挂 projectRoot 为 null，记忆键不可得；就绪后
  // projectRoot 到位即补读，跨重挂恢复用户选中意图）。回填零编排；arm 编排由独立效应消费。
  useEffect(() => {
    if (phase.state !== 'ready' || !phase.isGit) return
    setLocalSelectedPath(
      (prev) =>
        prev ??
        (projectRoot !== null ? readSelectedMemory(projectRoot) : undefined) ??
        anchorDefaultWorktreePath(phase.rows),
    )
  }, [phase, projectRoot])

  // ── 1.29 编排默认（会话创建唯一时机 = 首条消息——所见即所得的唯一执行面）──
  // hero 阶段当前会话是 blank 会话（cwd 建会话时定死）：选中态指向某行时，首条消息按
  // 官方原流会落主树 cwd（显示与执行脱节）。arm 效应由 composer 首条消息意图驱动
  // （draft 空 → 非空）：复用 1.16 预铸配方编排缝（orchestrate = sessionCreate + attach
  // + openSession 一体），成功后把已键入草稿搬运到产物会话（carryDraft——确认前消息
  // 不发出，草稿始终留在 composer，不丢）。
  // 1.27 必绑收紧保留：主行同样进编排（选中主行 → worktreePath = 项目根的 isMain 绑定，
  // git 项目不存在无绑定新会话——官方原流口子堵死）。去重闸：cwd 去重（树内行已开）、
  // armed 去重（本轮编排产物即当前会话——键入续字零重入；官方新会话流另起新 id 自然
  // 失效）、armSuppressed（失败/取消路径零重试）、在途闸与冷却窗。draft 意图与全部
  // 判读经 shouldArmSelectedRow 纯函数单源。跨分支风险 = 1.19 确认框同款（判定源 = 主行
  // branch vs 选中树 branch；主行自绑定同分支零风险直通）——时机随编排后移至首条消息
  // 时点（1.29），点选不再弹框。既有无绑定历史会话不回填（本效应只在 hero/新会话阶段
  // 消费，历史会话打开不进 hero 面）。
  const [defaultRiskPath, setDefaultRiskPath] = useState<string | null>(null)
  // 1.34 确认闩锁（bug ccfcc103——每键重弹修复）：确认后置位，arm 效应每键重评估时弹框
  // 判定消费闩锁（已确认 = 零重弹，编排照常 carryDraft 完成）；生命周期 = 换目标重选清
  // （riskLatchReselect）+ 编排失败清退（riskLatchFailureClear）。取消路径不混用（A3
  // cancelSuppressed——取消时闩锁必为 null，显式重选由取消抑制清除后重问）。
  const [riskConfirmedLatch, setRiskConfirmedLatch] = useState<RiskConfirmLatch>(null)
  // 账本订阅（useSyncExternalStore 直读——闭包绑定 face：dsh 快照源 = 类方法，裸引用
  // 脱离 this 即崩，ForgeSidebarSlot 同口径）。当前主视图会话（id + cwd）是 arm 去重/
  // 重消费与草稿源寻址的活源：官方新会话流落回他树 → 变化 → 效应重跑 → 编排默认重新消费。
  const subscribeLedger = useCallback(
    (onChange: () => void): (() => void) => {
      const store = worktree?.sessionsList as { subscribe?: (cb: () => void) => () => void } | undefined
      try {
        return store?.subscribe?.(onChange) ?? (() => {})
      } catch {
        return () => {}
      }
    },
    [worktree],
  )
  const readLedger = useCallback((): unknown => {
    const store = worktree?.sessionsList as { getSnapshot?: () => unknown } | undefined
    try {
      return store?.getSnapshot?.()
    } catch {
      return undefined
    }
  }, [worktree])
  const ledgerSnapshot = useSyncExternalStore(subscribeLedger, readLedger, readLedger)
  const activeRow = useMemo(
    () => (ledgerSnapshot !== undefined ? activeSessionRowOf({ getSnapshot: () => ledgerSnapshot }) : undefined),
    [ledgerSnapshot],
  )
  const currentCwd = activeRow?.cwd
  const currentSessionId = activeRow?.id
  // composer 草稿源（首条消息意图——官方 InputState 快照 store，经 sourceOf 会话寻址；
  // 缺席/形状漂移 = fail-soft 空串，arm 不消费）
  const draftStore = useMemo(
    () => (currentSessionId !== undefined ? worktree?.composerDraft?.sourceOf?.(currentSessionId) ?? undefined : undefined),
    [currentSessionId, worktree],
  )
  const subscribeDraft = useCallback(
    (onChange: () => void): (() => void) => {
      try {
        return draftStore?.subscribe?.(onChange) ?? (() => {})
      } catch {
        return () => {}
      }
    },
    [draftStore],
  )
  const readDraft = useCallback((): string => {
    try {
      const draft = (draftStore?.getSnapshot?.() as { draft?: unknown } | null | undefined)?.draft
      return typeof draft === 'string' ? draft : ''
    } catch {
      return ''
    }
  }, [draftStore])
  const draftText = useSyncExternalStore(subscribeDraft, readDraft, readDraft)
  const armDefault = useCallback(
    (path: string, draftAtTrigger: string, previousSessionId: string | undefined): void => {
      // 编排默认径（1.29——唯一编排消费点，自带一次延迟重试）：arm 常与官方导航并发
      // （官方新会话流落主树的窗口内）——openSession 撞导航瞬态抛错属可重试失败，一次
      // 重试后仍失败才落 1.25 口径（Toast 已由编排缝呈现 + 选中态清退不落假象）。
      orchestrationInFlightRef.current = true
      writeArmCooldown()
      if (projectRoot !== null) writeSelectedMemory(projectRoot, path)
      pushSelection(path)
      setLocalSelectedPath(path)
      const attempt = (left: number): void => {
        void Promise.resolve(worktree?.orchestrate?.(path) ?? null)
          .then((sessionId) => {
            if ((sessionId === null || sessionId === undefined) && left > 0) {
              setTimeout(() => attempt(left - 1), 1_500)
              return
            }
            if (sessionId === null || sessionId === undefined) {
              if (projectRoot !== null) writeSelectedMemory(projectRoot, undefined)
              pushSelection(undefined) // host 选中记忆同清（重路由目标不落假象）
              setLocalSelectedPath(undefined)
              setArmSuppressed((prev) => (prev.includes(path) ? prev : [...prev, path]))
              // 1.34 确认闩锁清退：编排失败 → Toast（1.25）已呈现，允许重试重问
              setRiskConfirmedLatch((prev) => riskLatchFailureClear(prev, path))
              return
            }
            // 成功：armed 去重登记 + 已键入首条消息搬运到产物会话（best-effort——失败
            // = 草稿留在原会话不丢）
            armedRef.current = { path, sessionId }
            const draft = draftAtTrigger.trim()
            if (draft !== '') void worktree?.composerDraft?.carryDraft?.(sessionId, draft, previousSessionId)
          })
          .catch(() => {})
          .finally(() => {
            orchestrationInFlightRef.current = false
          })
      }
      attempt(1)
    },
    [projectRoot, worktree, pushSelection],
  )
  useEffect(() => {
    if (phase.state !== 'ready' || !phase.isGit) return
    const path = localSelectedPath
    if (path === undefined || orchestrationInFlightRef.current || armSuppressed.includes(path)) return
    const row = phase.rows.find((candidate) => candidate.path === path)
    if (row === undefined) return
    // 1.29 首条消息意图闸：draft 空 = 无会话创建时机（点选/回填零副作用）——主行
    // （1.27 必绑）同样只在该时点进编排
    const draftIntent = draftText.trim() !== ''
    // 1.27 必绑收紧：主行同样编排；cwd/armed 去重 + A3 取消抑制 + A4 确认框闸 + A1
    // 冷却窗 draftIntent 维度判读（纯函数 shouldArmSelectedRow 单源）
    if (
      !shouldArmSelectedRow({
        phaseReadyGit: true,
        path,
        suppressed: armSuppressed,
        cancelSuppressed,
        riskConfirmationOpen: defaultRiskPath !== null,
        cooldownActive: readArmCooldownActive(),
        rowPresent: row.present,
        isMain: row.isMain,
        currentCwd,
        draftIntent,
        currentSessionId,
        armedSessionId: armedRef.current?.sessionId,
        armedPath: armedRef.current?.path,
      })
    ) {
      return
    }
    const mainBranch = phase.rows.find((candidate) => candidate.isMain)?.branch ?? null
    // 1.34 确认闩锁消费：已确认（闩锁命中）→ 跨分支也直通编排（续字/再发零重弹）
    if (isCrossBranchRisk(row.branch, mainBranch) && riskDialogNeeded(path, riskConfirmedLatch)) {
      setDefaultRiskPath((prev) => prev ?? path) // 确认框待决——确认/取消前零编排（消息未发出）
      return
    }
    armDefault(path, draftText, currentSessionId)
    // draftText/currentCwd/currentSessionId 入 deps：首条消息意图出现、官方新会话流落回
    // 他树后（当前会话变化），编排默认（重新）消费
  }, [phase, localSelectedPath, armSuppressed, cancelSuppressed, defaultRiskPath, riskConfirmedLatch, draftText, currentCwd, currentSessionId, armDefault])

  const refresh = useCallback((): void => {
    if (projectRoot === null) return
    makeRpc()
      .worktree.list({ projectRoot })
      .then((result) => {
        setPhase({
          state: 'ready',
          isGit: result.isGit,
          rows: rowsOf(result),
          worktreeDir: result.worktreeDir,
        })
      })
      .catch(() => {
        setPhase({ state: 'error', isGit: false, rows: [] })
      })
  }, [projectRoot, makeRpc])

  // 挂载期一次 + 弹窗关闭后刷新（新建/删除后清单即新——提案「创建后立即出现在选择列表」）
  useEffect(() => {
    refresh()
  }, [refresh, createOpen, deleteTarget])
  useEffect(() => {
    if (!createOpen || projectRoot === null) return
    makeRpc()
      .worktree.branches({ projectRoot })
      // 弹窗打开即拉取；数据不变时保持旧引用（弹窗 reset effect 以 branches 身份为 dep——
      // 新对象会在用户输入中途清空表单，1.19 e2e 实证竞态）
      .then((result) =>
        setBranches((prev) =>
          prev.defaultBranch === result.defaultBranch && prev.names.join('\u0000') === result.branches.join('\u0000')
            ? prev
            : { defaultBranch: result.defaultBranch, names: result.branches },
        ),
      )
      .catch(() => {})
    // slug 候选拉取：projects.list 解析 ws_path → projectId（归一比对），proposals/features 并读——
    // 终态归一（提案 rejected/superseded、feature completed/archived = done）
    const key = (path: string): string => path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
    makeRpc()
      .projects.list()
      .then((projects) => {
        const project = projects.find((summary) => key(summary.wsPath) === key(projectRoot))
        if (project === undefined) return []
        const isDoneProposal = (status: string): boolean => status === 'rejected' || status === 'superseded'
        const isDoneFeature = (status: string): boolean => status === 'completed' || status === 'archived'
        return Promise.all([
          makeRpc().proposals.list({ projectId: project.id }),
          makeRpc().features.list({ projectId: project.id }),
        ]).then(([proposalCards, featureCards]) =>
          collectSlugCandidates(
            proposalCards.map((card) => ({ slug: card.slug, done: isDoneProposal(card.proposalStatus) })),
            featureCards.map((card) => ({ slug: card.slug, done: isDoneFeature(card.featureStatus) })),
          ),
        )
      })
      .then((candidates) => setSlugCandidates(candidates))
      .catch(() => setSlugCandidates([]))
  }, [createOpen, projectRoot, makeRpc])

  // ahead/behind 懒加载器（组件展开才拉 + 本面缓存共享）
  const loadAheadBehind = useCallback(
    (path: string): Promise<AheadBehind> => {
      if (projectRoot === null) return Promise.resolve({ ahead: 0, behind: 0 })
      return makeRpc()
        .worktree.aheadBehind({ projectRoot, path })
        .then((result) => {
          const counts = result.counts ?? { ahead: 0, behind: 0 }
          setAheadBehind((prev) => new Map(prev).set(path, counts))
          return counts
        })
    },
    [projectRoot, makeRpc],
  )

  // 新建（封闭写集①）与删除（封闭写集②——确认门 = isDeleteBlocked 由弹窗内部消费 checks）
  const [createError, setCreateError] = useState<string | undefined>(undefined)
  const onCreate = useCallback(
    (request: CreateWorktreeRequest): void => {
      if (projectRoot === null) return
      setCreateError(undefined)
      // 弹窗产物（baseBranch/branch/worktreeName/customPath）→ create 载荷：
      // path = 自定义路径优先，否则落所配 worktree 目录（弹窗 worktree 名拼尾段——同名默认；
      // joinWorktreePath 单点归一反斜杠系统口径——1.21 分隔符归一）
      const baseDir = phase.worktreeDir ?? ''
      const path = request.customPath !== undefined && request.customPath !== ''
        ? request.customPath
        : joinWorktreePath(baseDir, request.worktreeName)
      makeRpc()
        .worktree.create({ projectRoot, branch: request.branch, base: request.baseBranch, path })
        .then((result) => {
          setCreateOpen(false)
          // 1.19 钉死口径「自动跟进」：创建成功 hero 选中态自动切到新 worktree
          // （onSelectConfirmed = 项目粒度选中记忆写入 + 本地回填——1.29 纯选中态，
          // 挂靠编排留给首条消息时点的 arm 消费）；主树 HEAD 不动（worktree add 新树内
          // 检出新分支，零 checkout）。
          // 选中路径取 create 返回条目的清单正则（entry.path——与 list 行路径同源同格式，
          // 行匹配 path === selectedPath 用精确等值；1.24 实证本地拼串反斜杠 ≠ 清单正斜杠）
          const createdPath = result.entry?.path ?? path
          onSelectConfirmed(createdPath)
          refresh()
        })
        .catch((error: unknown) => {
          // 1.24 失败不静默：表单保持打开（createOpen 不动）+ 错误呈现进弹窗错误行
          setCreateError(error instanceof Error && error.message !== '' ? `创建失败：${error.message}` : '创建失败：git worktree 创建未成功，请检查分支名与路径')
        })
    },
    [projectRoot, phase.worktreeDir, makeRpc, refresh, onSelectConfirmed],
  )
  const openDelete = useCallback(
    (path: string): void => {
      if (projectRoot === null) return
      const row = phase.rows.find((candidate) => candidate.path === path)
      setDeleteTarget({ path, worktreeName: row?.worktreeName ?? path, branch: row?.branch ?? null })
      setDeleteChecks(null)
      makeRpc()
        .worktree.checks({ projectRoot, path })
        .then((result) =>
          setDeleteChecks({
            dirtyCount: result.dirtyCount,
            aheadCount: result.aheadCount,
            attachedSessions: result.attachedSessions,
          }),
        )
        .catch(() => {})
    },
    [projectRoot, phase.rows, makeRpc],
  )
  const onConfirmDelete = useCallback((): void => {
    if (projectRoot === null || deleteTarget === null) return
    makeRpc()
      .worktree.delete({ projectRoot, path: deleteTarget.path })
      .then(() => {
        setDeleteTarget(null)
        refresh()
      })
      .catch(() => {})
  }, [projectRoot, deleteTarget, makeRpc, refresh])

  if (projectRoot === null) return null // 无选中项目：hero 区零注入（退回现状）
  return (
    <>
      <HeroWorktreePicker
        isGit={phase.isGit}
        rows={phase.rows}
        worktreeDir={phase.worktreeDir}
        selectedPath={localSelectedPath}
        onSelect={onSelectConfirmed}
        onCreate={() => {
          setCreateError(undefined) // 重新打开即清上一轮错误（1.24 失败呈现只在当场留场）
          setCreateOpen(true)
        }}
        onDelete={openDelete}
        loadAheadBehind={loadAheadBehind}
        aheadBehind={aheadBehind}
      />
      <CreateWorktreeDialog
        open={createOpen}
        branches={branches.names}
        existingWorktreeNames={phase.rows.map((row) => row.worktreeName)}
        slugCandidates={slugCandidates}
        defaultBranch={branches.defaultBranch}
        mainBranch={phase.rows.find((row) => row.isMain)?.branch ?? null}
        worktreeDir={phase.worktreeDir ?? ''}
        error={createError}
        onClose={() => {
          setCreateError(undefined)
          setCreateOpen(false)
        }}
        onCreate={onCreate}
        // 分支行合并形态：通用 EditableCombobox 经 slot 注入（输入即过滤 slug 候选；
        // 走查锚 data-dswt-branch-input 与等宽基准在本面装配）
        BranchCombobox={(props) => (
          <EditableCombobox
            {...props}
            inputData={{ 'data-dswt-branch-input': '' }}
            inputStyle={branchInputStyle}
            inputWrapClassName="dswt-field-control"
            listClassName="dswt-branch-slug-menu"
          />
        )}
      />
      <DeleteWorktreeDialog
        open={deleteTarget !== null}
        worktreeName={deleteTarget?.worktreeName ?? ''}
        branch={deleteTarget?.branch ?? null}
        path={deleteTarget?.path ?? ''}
        // A11 破坏性操作 fail-closed：checks 拉取失败/进行中（null）→ 弹窗 block 行 + 确认钮禁用；
        // 拉到数据才按三清单判定放行（不再全零兜底放行）
        checks={deleteChecks}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onConfirmDelete}
      />
      {/* 1.29 首条消息时点跨分支风险确认框（1.19 官方 RiskConfirmation 同款——选中态
          指向非主行树且跨分支、且首条消息意图出现时确认才编排；点选不再弹框。确认前
          消息不发出：草稿留在 composer，arm 未完成无发送面。取消 = 选中态退回占位走
          官方原流） */}
      {defaultRiskPath !== null && (
        <WorktreeRiskConfirmation
          open
          targetBranch={phase.rows.find((candidate) => candidate.path === defaultRiskPath)?.branch ?? null}
          currentBranch={phase.rows.find((candidate) => candidate.isMain)?.branch ?? null}
          onCancel={() => {
            const path = defaultRiskPath
            setDefaultRiskPath(null)
            // A3：取消写取消抑制（非失败抑制集）——显式重选同树即清除，确认框可重弹
            setCancelSuppressed((prev) => (prev.includes(path) ? prev : [...prev, path]))
            // 取消编排默认 = 不落假象：回填态与选中记忆同清（chip 退回占位），消息走官方原流
            if (projectRoot !== null) writeSelectedMemory(projectRoot, undefined)
            pushSelection(undefined)
            setLocalSelectedPath(undefined)
          }}
          onConfirm={() => {
            const path = defaultRiskPath
            setDefaultRiskPath(null)
            // 1.34 确认闩锁置位：同一次选中意图只弹一次——续字/再发零重弹，编排照常完成
            if (path !== null) setRiskConfirmedLatch((prev) => riskLatchConfirm(prev, path))
            if (path !== null) armDefault(path, draftText, currentSessionId)
          }}
        />
      )}
    </>
  )
}

/** 封存判定快照拉取相位（chip / overlay 两通道共享单源形状） */
export interface WorktreeSealPhase {
  readonly state: 'loading' | 'ready' | 'error'
  readonly isGit: boolean
  readonly sealed: boolean
  readonly branch: string | null
  readonly worktreeName: string | null
}

const sealEmpty: WorktreeSealPhase = { state: 'loading', isGit: false, sealed: false, branch: null, worktreeName: null }

/** 封存快照拉取（seal 通道单源——chip 失效态与 notice/占位两提示通道共读） */
function useWorktreeSeal(sessionId: string | undefined, makeRpc: () => ForgeRpcClient): WorktreeSealPhase {
  const [phase, setPhase] = useState<WorktreeSealPhase>(sealEmpty)
  useEffect(() => {
    if (sessionId === undefined || sessionId === '') return
    let alive = true
    makeRpc()
      .worktree.seal({ sessionId })
      .then((result) => {
        if (!alive) return
        setPhase({
          state: 'ready',
          isGit: result.isGit,
          sealed: result.sealed,
          branch: result.binding?.branch ?? null,
          worktreeName: result.worktreeName ?? null,
        })
      })
      .catch(() => {
        if (alive) setPhase({ state: 'error', isGit: false, sealed: false, branch: null, worktreeName: null })
      })
    return () => {
      alive = false
    }
  }, [sessionId, makeRpc])
  return phase
}

/**
 * 会话头 actions 槽只读 chip（绑定展示 `feat/a · wt-a` 一体形态；封存 = 失效变体；
 * 非 git / 无绑定（branch 缺席）= 零注入）。ahead/behind 次级小字：sealed 恒不展示
 * （失配无意义），live 态低频拉取由 chip 挂载期一次消费（懒加载/缓存纪律）。
 */
export function ForgeSessionWorktreeChip({
  sessionId,
  makeRpc = preloadRpcClientFactory,
}: {
  readonly sessionId?: string | undefined
  readonly makeRpc?: () => ForgeRpcClient
}): ReactNode {
  const phase = useWorktreeSeal(sessionId, makeRpc)
  const [aheadBehind, setAheadBehind] = useState<AheadBehind | undefined>(undefined)
  useEffect(() => {
    if (sessionId === undefined || phase.branch === null || phase.sealed) return
    makeRpc()
      .worktree.seal({ sessionId })
      .then((result) => {
        if (result.projectRoot === undefined || result.binding === null) return
        return makeRpc()
          .worktree.aheadBehind({ projectRoot: result.projectRoot, path: result.binding.worktreePath })
          .then((counts) => setAheadBehind(counts.counts ?? undefined))
      })
      .catch(() => {})
  }, [sessionId, phase.branch, phase.sealed, makeRpc])
  if (sessionId === undefined || !phase.isGit || phase.branch === null || phase.worktreeName === null) return null
  return (
    <SessionWorktreeChip
      isGit
      branch={phase.branch}
      worktreeName={phase.worktreeName}
      aheadBehind={aheadBehind}
      sealed={phase.sealed}
    />
  )
}

/** 一次性关闭记忆（会话粒度模块级集合——刷新即重置，官方一次性 notice 同刻度） */
const dismissedSealSessions = new Set<string>()

/**
 * 封存提示 overlay（conversation.input.overlay 槽——composer 区官方缝，双通道并列）：
 * ① SealNotice（一次性——关闭后本会话不再呈现）；② SealedComposerPlaceholder（占位文案）。
 * 均提示性视觉；「不可发送」硬保证 = host 发送拦截面（interceptSessionSends）。
 */
export function ForgeWorktreeSealOverlay({
  sessionId,
  makeRpc = preloadRpcClientFactory,
}: {
  readonly sessionId?: string | undefined
  readonly makeRpc?: () => ForgeRpcClient
}): ReactNode {
  const phase = useWorktreeSeal(sessionId, makeRpc)
  const [dismissed, setDismissed] = useState(false)
  if (sessionId === undefined || !phase.isGit || !phase.sealed) return null
  const worktreeName = phase.worktreeName ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', rowGap: 'var(--dsw-radius-sm)' }}>
      {!dismissed && !dismissedSealSessions.has(sessionId) && (
        <SealNotice
          worktreeName={worktreeName}
          onClose={() => {
            dismissedSealSessions.add(sessionId)
            setDismissed(true)
          }}
        />
      )}
      <SealedComposerPlaceholder />
    </div>
  )
}
