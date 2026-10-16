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
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  CreateWorktreeDialog,
  DeleteWorktreeDialog,
  HeroWorktreePicker,
  SealNotice,
  SealedComposerPlaceholder,
  SessionWorktreeChip,
  type CreateWorktreeRequest,
  type DeleteChecks,
} from '@dsh-forge/git-worktree/client'
import type { AheadBehind } from '@dsh-forge/git-worktree'
import type { SlugCandidate } from '@dsh-forge/git-worktree/client'
import { collectSlugCandidates } from '@dsh-forge/git-worktree/client'
import { preloadRpcClientFactory, type ForgeRpcClient } from '../../rpc/client.js'

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

/**
 * hero 第二 chip 挂载（新建/删除弹窗由本面持有——通用层组件零弹窗自持，装配层挂）。
 * projectRoot 缺席（无选中项目）= 零注入退回现状；非 git = HeroWorktreePicker 内部
 * 返回 null（能力位条件渲染——UI 只消费 isGit）。
 */
export function ForgeHeroWorktreeMount({
  projectRoot,
  selectedPath,
  onSelect,
  makeRpc = preloadRpcClientFactory,
}: {
  /** 项目根（ws_path——list/ops 执行 cwd；null = 零注入） */
  readonly projectRoot: string | null
  readonly selectedPath?: string | undefined
  /** 挂靠确认动作（选择控件确认时——父面承接建会话/attach/openSession 编排） */
  readonly onSelect: (path: string) => void
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
      .then((result) => setBranches({ defaultBranch: result.defaultBranch, names: result.branches }))
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
  const onCreate = useCallback(
    (request: CreateWorktreeRequest): void => {
      if (projectRoot === null) return
      // 弹窗产物（baseBranch/branch/worktreeName/customPath）→ create 载荷：
      // path = 自定义路径优先，否则落所配 worktree 目录（deriveWorktreeName 派生名拼尾段）
      const baseDir = phase.worktreeDir ?? ''
      const path = request.customPath !== undefined && request.customPath !== ''
        ? request.customPath
        : `${baseDir.replaceAll('\\', '/').replace(/\/+$/, '')}/${request.worktreeName}`
      makeRpc()
        .worktree.create({ projectRoot, branch: request.branch, base: request.baseBranch, path })
        .then(() => {
          setCreateOpen(false)
          refresh()
        })
        .catch(() => {})
    },
    [projectRoot, phase.worktreeDir, makeRpc, refresh],
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
        selectedPath={selectedPath}
        onSelect={onSelect}
        onCreate={() => setCreateOpen(true)}
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
        worktreeDir={phase.worktreeDir ?? ''}
        onClose={() => setCreateOpen(false)}
        onCreate={onCreate}
      />
      <DeleteWorktreeDialog
        open={deleteTarget !== null}
        worktreeName={deleteTarget?.worktreeName ?? ''}
        branch={deleteTarget?.branch ?? null}
        path={deleteTarget?.path ?? ''}
        // checks 未拉到（拉取中/失败）= 全零保守面：不误拦（拦截语义只对确认数据生效）
        checks={deleteChecks ?? { dirtyCount: 0, aheadCount: 0, attachedSessions: 0 }}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onConfirmDelete}
      />
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
