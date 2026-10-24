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
// W3 arm 退役（session-binding-guarantee）：armDefault 效应链（首条消息时点编排 + 草稿搬运
// + 失败/取消抑制集 + 账本/草稿订阅）退役——会话创建唯一时机 = 官方 create 调用点（wrap
// 改道预铸，create 失败走官方 createFailed toast）；点选 = 纯选中态 + 点选时点跨分支确认
// （1.19 语义回归），1.34 闩锁与「不再提示」语义平移。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BranchDriftNotice,
  CreateWorktreeDialog,
  DeleteWorktreeDialog,
  HeroWorktreePicker,
  SealNotice,
  SealedComposerPlaceholder,
  SessionWorktreeChip,
  StaleSelectionNotice,
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
  riskDialogNeeded,
  riskLatchConfirm,
  riskLatchReselect,
  staleSelectionResetOf,
  type RiskConfirmLatch,
} from './hero-picker-model.js'
// 弹窗卡面/下拉浮层宽度规则（.dswt-create-modal / .dswt-*-menu——session.css 1.12 段）
import './session.css'

/**
 * 点选即换绑编排缝（方案 A——bug ff324cad 体验收口）：hero worktree chip 点选非主树且
 * 活跃会话为主树占位 blank 时，预铸选中树会话 + 官方 openSession 切换 + 占位归档清场
 * （官方切工作区同构语义：切换 = 让目标 workspace 诞生/复用它自己的会话，弃置空占位
 * 归档）。结构窄面——plugin.ts heroRebindFaceOf 同形镜像（bundle 自含零 import）；
 * 任一成员缺席 = 零编排（退回纯选中态，发送时必绑重路由兜底）。
 */
export interface HeroRebindFace {
  activeSessionId(): string | undefined
  isBlank(sessionId: string): boolean
  openSession(sessionId: string): void
  archiveSession(sessionId: string): Promise<void>
  /** 账本变更订阅（官方 sessions.list store subscribe——归档前置确认的事件推送源；缺席 = 确认面降级） */
  subscribeSessionLedger(listener: () => void): () => void
}

/** 点选即换绑编排依赖（纯函数注入面——face×seal 判读合成在调用方，本面只管次序） */
export interface RebindOrchestrationDeps {
  /** 可换绑 blank 会话 id（活跃 × blank × 绑定 ≠ 新选树 合成）；undefined = 零编排 */
  readonly rebindableBlankId: () => Promise<string | undefined>
  /** 预铸新选树会话（forge:worktree/session-create——显式树请求不被选中记忆劫持） */
  readonly sessionCreate: (path: string) => Promise<{ readonly sessionId: string }>
  /**
   * 切换到产物会话（方案 A2——优先官方 onPick(树 workspaceId)：官方 selectWorkspace 全链
   * 含草稿/附件搬运 + openWorkspace 复用刚预铸的树 blank；树 workspaceId 不可得 = fallback
   * openSession 现状径，草稿不搬）
   */
  readonly switchToProduct: (path: string, productSessionId: string) => void
  /** 官方归档（后清场——弃置 blank 入 durable 归档集，可恢复、回收径复用） */
  readonly archiveSession: (sessionId: string) => Promise<void>
  /**
   * 切换落定确认（方案 A3 事件驱动）：resolve(true) = 官方 mainView 已在留产物会话
   * （账本事件推送通知，零轮询）；resolve(false) = 确认面上界超时/缺席（本轮跳过归档）
   */
  readonly awaitSwitchSettled: (productSessionId: string) => Promise<boolean>
}

/**
 * 点选即换绑编排（同步编排——用户裁决 2026-10-24「点选即换绑改成同步编排」）：活跃会话为
 * 可换绑 blank（任意绑定——主树占位→树 / 树A→树B / 树A→主行同构）→ 预铸新选树会话 →
 * switchToProduct 切换，**关键段到此为止**——本函数 resolve 即切换已落调用；落定确认
 * （事件驱动等 mainView 在留）与旧 blank 归档转后台分离（fire-and-forget，不阻塞选中
 * 返回——归档前置确认只影响清场时机，不影响所见即所得）。无可换绑 blank = 零编排
 * （纯选中态）；失败原样上抛（调用方 fail-soft 退现状）。
 */
export async function rebindOnSelect(path: string, deps: RebindOrchestrationDeps): Promise<void> {
  const staleBlankId = await deps.rebindableBlankId()
  if (staleBlankId === undefined) return
  const product = await deps.sessionCreate(path)
  deps.switchToProduct(path, product.sessionId)
  void deps
    .awaitSwitchSettled(product.sessionId)
    .then((settled) => (settled ? deps.archiveSession(staleBlankId) : undefined))
    .catch((cause: unknown) => {
      // 落定确认/归档失败留痕（不静默）——旧 blank 残留交由 recycle 清理
      console.warn(`[dswf-worktree] 点选即换绑后置段失败（blank=${staleBlankId}）：${String(cause)}`)
    })
}

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

/** worktree 路径归一键（1.21/1.24 口径——项目根选中记忆键归一；与 wrap/create-wrap 归一同式） */
const cwdKey = (path: string): string => path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()

/** 换绑归档前置确认上界（官方投影/导航延迟 1~3s 实测刻度 ×2 余量——超时跳过本轮归档） */
const SWITCH_CONFIRM_TIMEOUT_MS = 6000

/**
 * hero 默认回填锚定链（纯函数单源）：主行（isMain）当前检出分支
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
 * 创建成功跟进次序（bug 6593d708 纯编排单源）：清单刷新先于选中态落定。
 * 选中态落定触发陈旧选中自愈效应——若行集尚未含新树（创建前旧快照），新树被误判
 * 「盘上失配」：失效 toast + 三层选中态清回主树（含 host 选中记忆，首条消息必绑
 * 重路由随之回落项目根）。次序契约 = refresh 完成后 onSelectConfirmed。
 */
export interface CreateFollowupDeps {
  readonly refresh: () => Promise<void>
  readonly onSelectConfirmed: (path: string) => void
}

export async function createFollowup(createdPath: string, deps: CreateFollowupDeps): Promise<void> {
  await deps.refresh()
  deps.onSelectConfirmed(createdPath)
}

/**
 * hero 第二 chip 挂载（新建/删除弹窗由本面持有——通用层组件零弹窗自持，装配层挂）。
 * projectRoot 缺席（无选中项目）= 零注入退回现状；非 git = HeroWorktreePicker 内部
 * 返回 null（能力位条件渲染——UI 只消费 isGit）。
 * 选中态在本面闭环（bug 907225f2）：点选 = 纯选中态（chip 回填 + 项目粒度记忆写入 +
 * pushSelection——host 首条消息必绑重路由单源），零会话副作用。跨分支风险确认在点选时点
 * （1.19 语义回归——1.31 确认闩锁 + 「不再提示」语义平移，见下）；确认前选中态不变。
 * 会话创建唯一时机 = 官方 create 调用点（wrap 改道预铸；host sessionCreate 消费选中记忆
 * ——选中树在场即创建时点直接预铸选中树会话【bug ff324cad 创建即绑选中树，零主树占位】，
 * 缺席回落项目根由首条消息必绑重路由兜底）——本面零编排。
 */
export function ForgeHeroWorktreeMount({
  projectRoot,
  rebindFace,
  pickWorkspace,
  workspaceRows,
  makeRpc = preloadRpcClientFactory,
}: {
  /** 项目根（ws_path——list/ops 执行 cwd；null = 零注入） */
  readonly projectRoot: string | null
  /** 点选即换绑编排缝（方案 A——plugin.ts hero slot inject 递达；缺席 = 零编排） */
  readonly rebindFace?: HeroRebindFace
  /** 官方 onPick(workspaceId) 递达（方案 A2——树 workspace 切换走官方 selectWorkspace 全链含草稿搬运；缺席 = fallback openSession） */
  readonly pickWorkspace?: (workspaceId: string) => void
  /** 官方 workspace 行（{workspaceId, path}——树 workspaceId 解析源；缺席 = fallback） */
  readonly workspaceRows?: readonly { readonly workspaceId?: unknown; readonly path?: unknown }[]
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
  // 选中态本地投影（bug 9eb9d6cb 后续收敛：host lastSelection 唯一事实源——本地态只是
  // host 态的 UI 镜像，挂载回填经 forge:worktree/selected 读 host，sessionStorage 记忆退役）
  const [localSelectedPath, setLocalSelectedPath] = useState<string | undefined>(undefined)
  // 1.30 选中树推送（forge:worktree/select——host 选中记忆单源：sessionCreate 创建时点
  // 消费【bug ff324cad 创建即绑选中树】+ 首条消息必绑重路由兜底。fire-and-forget，path
  // 缺席 = 清除 host 侧该项目选中记忆）。缺席通道（旧 host）fail-soft。
  const pushSelection = useCallback(
    (path: string | undefined): void => {
      if (projectRoot === null) return
      void makeRpc()
        .worktree.select({ projectRoot, ...(path !== undefined ? { path } : {}) })
        .catch((cause: unknown) => {
          // 选中推送失败留痕（不静默）——host 记忆缺席会使创建显示源裁决回落解析树
          console.warn(`[dswf-worktree] 选中推送失败（projectRoot=${projectRoot} path=${path}）：${String(cause)}`)
        })
    },
    [projectRoot, makeRpc],
  )

  // 跨分支确认「不再提示」（forge settings worktree.crossBranchRiskDismissed 持久化——
  // 用户级一票：装载读 + 勾选确认写；装载缺席/通道失败 = false 不抑制，fail-soft）
  const [riskDismissed, setRiskDismissed] = useState(false)
  const [riskDismissChecked, setRiskDismissChecked] = useState(false)
  useEffect(() => {
    let alive = true
    makeRpc()
      .settings.get()
      .then((settings) => {
        if (alive) setRiskDismissed(settings.worktree?.crossBranchRiskDismissed === true)
      })
      .catch((cause: unknown) => {
        console.warn(`[dswf-worktree] 跨分支确认记忆读失败（默认重问）：${String(cause)}`)
      })
    return () => {
      alive = false
    }
  }, [makeRpc])
  // 1.34 确认闩锁（bug ccfcc103）：确认后置位——同行重选零重弹；换目标重选清退
  // （riskLatchReselect，重新判定）。取消 = 本次改选未发生（选中态保持原样），不写抑制集
  // （抑制语义随 arm 效应链退役——再点选即重新判定）。
  const [riskConfirmedLatch, setRiskConfirmedLatch] = useState<RiskConfirmLatch>(null)
  // 点选时点跨分支确认待决（1.19 语义回归）：待决期间选中态不变（确认/取消前零改选）
  const [pendingRiskPath, setPendingRiskPath] = useState<string | null>(null)
  // 换绑在途闸（快速连点零并发编排——两次 sessionCreate 双 blank 竞态防线）
  const rebindInFlight = useRef(false)

  // 选中态落定（确认直通 / 确认框确认后的唯一写入口）：chip 回填 + host 选中记忆推送
  // （host 唯一事实源——sessionCreate 创建时点消费 + 必绑重路由兜底；本地态只是投影）。
  const applySelection = useCallback(
    (path: string): void => {
      // 确认闩锁：换目标重选清退（同行重选保留——确认后点 chip 不重弹）
      setRiskConfirmedLatch((prev) => riskLatchReselect(prev, path))
      pushSelection(path)
      setLocalSelectedPath(path)
    },
    [projectRoot, pushSelection],
  )

  // 点选 = 纯选中态：跨分支风险（选中行 branch ≠ 主行 branch）在点选时点确认（1.19）；
  // 同分支零风险直通。判定源 = 清单行 branch；闩锁/「不再提示」旁路弹框分支。
  // 点选即换绑（方案 A，applySelection 后 fire-and-forget）：face 在场 ∧ 非主行 ∧ 活跃
  // 会话为主树占位 blank（seal 绑定 ≡ 项目根 × 账本 blank）→ 预铸选中树会话 + 官方
  // openSession 切换 + 占位归档清场——抖动收敛到点选瞬间（用户尚未输入），输入/发送全程
  // 在最终会话，侧栏全程只见一个会话，发送时零重路由。任一环节失败 fail-soft 静默退回
  // 现状（发送时必绑重路由兜底）。
  const maybeRebind = useCallback(
    (path: string): Promise<void> => {
      if (rebindFace === undefined || projectRoot === null) return Promise.resolve()
      if (rebindInFlight.current) return Promise.resolve() // 在途闸：快速连点零并发编排（记忆已更新）
      rebindInFlight.current = true
      return rebindOnSelect(path, {
        rebindableBlankId: async () => {
          const activeId = rebindFace.activeSessionId()
          if (activeId === undefined) {
            console.warn('[dswf-worktree] 点选即换绑零编排：无 mainView 在留活跃会话')
            return undefined
          }
          const seal = await makeRpc().worktree.seal({ sessionId: activeId })
          if (!seal.isGit || seal.binding === null) return undefined // 无绑定（官方域）：零编排
          // blank 判读双源：seal.blank（host 事件判读——账本标志 host 重启恢复后失真，
          // bug c931aa28 同族实证）优先；缺席（旧 host）回退账本标志
          const blank = seal.blank ?? rebindFace.isBlank(activeId)
          if (!blank) return undefined // 非 blank：真会话零编排
          if (cwdKey(seal.binding.worktreePath) === cwdKey(path)) return undefined // 已绑目标树：零编排
          return activeId // 可换绑 blank（主树占位 / 他树 blank 同构——绑定 ≠ 新选树即换）
        },
        sessionCreate: async (target) => await makeRpc().worktree.sessionCreate({ worktreePath: target }),
        // 方案 A3 归档前置确认（事件驱动）：订阅官方账本变更，mainView 在留产物即落定；
        // 超时/订阅缝缺席 = false 本轮跳过归档（零轮询——等待由 store 写侧推送驱动）
        awaitSwitchSettled: (productSessionId) =>
          new Promise<boolean>((resolve) => {
            if (rebindFace.activeSessionId() === productSessionId) {
              resolve(true) // 已落定零订阅
              return
            }
            let settled = false
            const finish = (value: boolean): void => {
              if (settled) return
              settled = true
              unsubscribe()
              clearTimeout(timer)
              resolve(value)
            }
            const unsubscribe = rebindFace.subscribeSessionLedger(() => {
              if (rebindFace.activeSessionId() === productSessionId) finish(true)
            })
            const timer = setTimeout(() => finish(false), SWITCH_CONFIRM_TIMEOUT_MS)
          }),
        // 方案 A2：优先官方 onPick(树 workspaceId)——selectWorkspace 全链含草稿/附件搬运，
        // openWorkspace 复用刚预铸的树 blank（官方 reuseOrCreateBlank 判据天然命中）；
        // 树 workspaceId 不可得（未建/快照未刷新/形状漂移）→ fallback openSession 现状径
        switchToProduct: (target, productSessionId) => {
          const wsId = workspaceRows?.find(
            (row) =>
              typeof row.workspaceId === 'string' &&
              row.workspaceId !== '' &&
              typeof row.path === 'string' &&
              cwdKey(row.path) === cwdKey(target),
          )?.workspaceId
          if (pickWorkspace !== undefined && typeof wsId === 'string') {
            pickWorkspace(wsId)
            return
          }
          rebindFace.openSession(productSessionId)
        },
        archiveSession: async (sessionId) => {
          await rebindFace.archiveSession(sessionId)
        },
      })
        .catch((cause: unknown) => {
          // fail-soft：换绑失败 = 现状世界（旧 blank 仍在，发送哨兵提示兜底）——失败留痕不静默
          console.warn(`[dswf-worktree] 点选即换绑编排失败（目标=${path}）：${String(cause)}`)
        })
        .finally(() => {
          rebindInFlight.current = false
        })
    },
    [rebindFace, projectRoot, phase, makeRpc, pickWorkspace, workspaceRows],
  )
  const onSelectConfirmed = useCallback(
    (path: string): void => {
      const row = phase.state === 'ready' ? phase.rows.find((candidate) => candidate.path === path) : undefined
      const mainBranch = phase.state === 'ready' ? phase.rows.find((candidate) => candidate.isMain)?.branch ?? null : null
      if (
        row !== undefined &&
        isCrossBranchRisk(row.branch, mainBranch) &&
        !riskDismissed &&
        riskDialogNeeded(path, riskConfirmedLatch)
      ) {
        setRiskDismissChecked(false)
        setPendingRiskPath(path) // 确认框待决——确认/取消前选中态不变
        return
      }
      applySelection(path)
      // 同步编排（用户裁决 2026-10-24）：关键段 = 预铸显示树会话 + 切换——本调用链内联
      // 等待到切换发出；落定确认/归档在 rebindOnSelect 内部转后台。onSelect 消费面
      // （HeroWorktreePicker）忽略 promise，零签名漂移。
      void maybeRebind(path)
    },
    [phase, riskDismissed, riskConfirmedLatch, applySelection, maybeRebind],
  )

  // 1.17 默认回填（展示层回填，零会话副作用）：清单就绪且无用户记忆/显式回填时按
  // 「host 选中记忆（forge:worktree/selected 读镜像）→ 锚定链」回填。记忆经 RPC 响应式
  // 读（会话面整域重挂后 projectRoot 到位即补读，跨重挂恢复用户选中意图——host 唯一
  // 事实源，sessionStorage 记忆已退役）。回填零编排；会话创建在官方 create 调用点
  // （host sessionCreate 消费选中记忆——创建时点即绑选中树，缺席重路由兜底）。
  useEffect(() => {
    if (phase.state !== 'ready' || !phase.isGit || projectRoot === null) return
    let alive = true
    makeRpc()
      .worktree.selected({ projectRoot })
      .then((result) => {
        if (alive) setLocalSelectedPath((prev) => prev ?? result.path ?? anchorDefaultWorktreePath(phase.rows))
      })
      .catch(() => {
        if (alive) setLocalSelectedPath((prev) => prev ?? anchorDefaultWorktreePath(phase.rows))
      })
    return () => {
      alive = false
    }
  }, [phase, projectRoot, makeRpc])

  // 陈旧选中自愈（bug 4a30b193 UI 面）：清单就绪后发现选中行盘上缺席（present=false 或
  // 行已消失——外部强制删除）→ 两层选中态同清（本地投影 / host 推送清除）+ chip
  // 跳回主行 + 一次性 notice 告知。host 侧重路由活性探测为正确性兜底（双保险不同层）。
  const [staleNoticeName, setStaleNoticeName] = useState<string | null>(null)
  useEffect(() => {
    if (phase.state !== 'ready' || !phase.isGit || projectRoot === null) return
    const reset = staleSelectionResetOf(phase.rows, localSelectedPath)
    if (!reset.stale) return
    setStaleNoticeName(reset.worktreeName ?? null)
    if (reset.mainPath !== undefined) {
      applySelection(reset.mainPath) // 跳回主行：host 推送 + chip 回填（唯一写入口）
    } else {
      pushSelection(undefined)
      setLocalSelectedPath(undefined)
    }
  }, [phase, localSelectedPath, projectRoot, applySelection, pushSelection])

  const refresh = useCallback((): Promise<void> => {
    if (projectRoot === null) return Promise.resolve()
    return makeRpc()
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
    void refresh()
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
  // 创建在途闸：git worktree add 秒级耗时——按钮进 submitting（官方 StateDot ongoing
  // 旋转指示 + 禁用），防「以为没点上」的反复点击撞分支已存在。
  const [creating, setCreating] = useState(false)
  const onCreate = useCallback(
    (request: CreateWorktreeRequest): void => {
      if (projectRoot === null || creating) return
      setCreateError(undefined)
      setCreating(true)
      // 弹窗产物（baseBranch/branch/worktreeName/customPath）→ create 载荷：
      // path = 自定义路径优先，否则落所配 worktree 目录（弹窗 worktree 名拼尾段——同名默认；
      // joinWorktreePath 单点归一反斜杠系统口径——1.21 分隔符归一）
      const baseDir = phase.worktreeDir ?? ''
      const path = request.customPath !== undefined && request.customPath !== ''
        ? request.customPath
        : joinWorktreePath(baseDir, request.worktreeName)
      const settle = (): void => setCreating(false)
      makeRpc()
        .worktree.create({ projectRoot, branch: request.branch, base: request.baseBranch, path })
        .then(async (result) => {
          setCreateOpen(false)
          // 创建成功 hero 选中态自动切到新 worktree（项目粒度选中记忆写入 + 本地回填 +
          // host 选中记忆推送）；主树 HEAD 不动（worktree add 新树内检出新分支，零 checkout）。
          // 选中路径取 create 返回条目的清单正则（entry.path——与 list 行路径同源同格式，
          // 行匹配 path === selectedPath 用精确等值；本地拼串反斜杠 ≠ 清单正斜杠实证）
          const createdPath = result.entry?.path ?? path
          // bug 6593d708 Root cause: 选中态先落、清单后刷——陈旧选中自愈效应以创建前旧行集
          // 判定新树「盘上失配」，误弹失效 toast 并把三层选中态（含 host 选中记忆）清回主树，
          // 首条消息必绑重路由随之回落项目根（会话落 main）。跟进次序收口：清单刷新先于
          // 选中态落定（createFollowup 单源），自愈判定永远面对含新树的行集。
          await createFollowup(createdPath, { refresh, onSelectConfirmed })
        })
        .catch((error: unknown) => {
          // 失败不静默：表单保持打开（createOpen 不动）+ 错误呈现进弹窗错误行
          setCreateError(error instanceof Error && error.message !== '' ? `创建失败：${error.message}` : '创建失败：git worktree 创建未成功，请检查分支名与路径')
        })
        .finally(settle)
    },
    [projectRoot, phase.worktreeDir, makeRpc, refresh, onSelectConfirmed, creating],
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
      {staleNoticeName !== null && (
        <StaleSelectionNotice worktreeName={staleNoticeName} onClose={() => setStaleNoticeName(null)} />
      )}
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
        submitting={creating}
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
      {/* 1.19 点选时点跨分支风险确认框（官方 RiskConfirmation 同款）：点选命中跨分支
          且未闩锁/未「不再提示」时立现；确认前选中态不变（取消 = 本次改选未发生，
          选中态保持原样）。确认 = 闩锁置位 + 选中态落定（记忆写入 + host 推送）——
          会话创建不在此处（官方 create 调用点 wrap 改道预铸）。 */}
      {pendingRiskPath !== null && (
        <WorktreeRiskConfirmation
          open
          targetBranch={phase.rows.find((candidate) => candidate.path === pendingRiskPath)?.branch ?? null}
          currentBranch={phase.rows.find((candidate) => candidate.isMain)?.branch ?? null}
          dismissChecked={riskDismissChecked}
          onDismissChange={setRiskDismissChecked}
          onCancel={() => {
            setPendingRiskPath(null)
            setRiskDismissChecked(false)
          }}
          onConfirm={() => {
            const path = pendingRiskPath
            setPendingRiskPath(null)
            // 勾选「不再提示」→ forge settings 持久化（fire-and-forget，失败不阻断——
            // 本轮已直通；下轮装载失败 = false 重问，fail-soft）
            if (riskDismissChecked) {
              setRiskDismissed(true)
              void makeRpc()
                .settings.set({ worktree: { crossBranchRiskDismissed: true } })
                .catch(() => {})
            }
            setRiskDismissChecked(false)
            // 1.34 确认闩锁置位：同一次选中意图只弹一次——同行重选零重弹
            if (path !== null) {
              setRiskConfirmedLatch((prev) => riskLatchConfirm(prev, path))
              applySelection(path)
              maybeRebind(path)
            }
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
  /** branch 漂移（binding-derivation §2.2——实时 ≠ 留痕；null = 无漂移/不警示） */
  readonly branchDrift: { readonly bindBranch: string; readonly branch: string } | null
}

const sealEmpty: WorktreeSealPhase = {
  state: 'loading',
  isGit: false,
  sealed: false,
  branch: null,
  worktreeName: null,
  branchDrift: null,
}

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
          branchDrift: result.branchDrift ?? null,
        })
      })
      .catch(() => {
        if (alive) setPhase({ state: 'error', isGit: false, sealed: false, branch: null, worktreeName: null, branchDrift: null })
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
  const [info, setInfo] = useState<{ readonly worktreePath: string; readonly projectRoot: string } | undefined>(undefined)
  useEffect(() => {
    if (sessionId === undefined || phase.branch === null || phase.sealed) return
    makeRpc()
      .worktree.seal({ sessionId })
      .then((result) => {
        if (result.projectRoot !== undefined && result.binding !== null) {
          setInfo({ worktreePath: result.binding.worktreePath, projectRoot: result.projectRoot })
        }
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
      worktreePath={info?.worktreePath}
      projectRoot={info?.projectRoot}
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
  if (sessionId === undefined || !phase.isGit) return null
  const worktreeName = phase.worktreeName ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', rowGap: 'var(--dsw-radius-sm)' }}>
      {/* branch 漂移 warning banner（binding-derivation §2.2——非阻断，切回即消失：判定随
          seal 渲染现算；与封存通道并列但语义独立） */}
      {phase.branchDrift !== null && (
        <BranchDriftNotice bindBranch={phase.branchDrift.bindBranch} branch={phase.branchDrift.branch} />
      )}
      {phase.sealed && (
        <>
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
        </>
      )}
    </div>
  )
}
