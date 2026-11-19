// detail-section —— worktree 管理面（1.32 复测·Typert 正典化——数据通路自 forge.worktrees
// host 缝迁 ui/rpc.ts Typert remote face（1.38 正典——官方宿主 browser ctx 无 host 缝，
// Typert remote 为唯一官方通路））：经 plugins.detail.section（list 槽，官方已声明
// client.js:3749）注册于插件管理器 project 详情页——与 settings-section 双缝同槽共页
// （配置节 + worktree 管理面两行，互不重叠）。呈现：
//   · 列表：分支 / 树名 / 状态（主树·detached·正常）/ ahead-behind（懒加载内联短串）/
//     封存态（present:false 盘上缺席行——「已封存」标记，删除与新建入口对该行禁用）；
//   · 创建：复用 ui/worktree-picker create-dialog 纯模型与校验（isCreateReady /
//     createConflicts / joinWorktreePath / sortBaseBranchOptions）——提交经 rpc.worktree.create；
//   · 删除：fail-closed checks 三清单（未提交变更 / 未 push / 挂靠会话——DeleteWorktreeDialog
//     既有拦截语义，checks 缺席 = 保守拦截）——确认经 rpc.worktree.delete。
// 数据源单门：全部走 ForgeRpcClient（Typert remote face——apply 期 installForgeRemoteFace
// 安装解析缝，逐调用现查不缓存）。projectRoot 来源 = Typert projects.list 行自带 wsPath
// （唯一非 archived 项目；零/多项目 = 无锚不猜——official-seams bugProjectIdOf 同判据），
// ownerProps {subject} 官方契约不改。锚/list 缺席或劣形 fail-soft 退无面板。
// 不依赖 configForms：apply 期直接注册 detail.section（槽缺席/劣形 fail-soft 退无面板）。
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorktreeEntryDto, WorktreeListResult } from '@dsh-forge/contracts'
import { DETAIL_SECTION_SLOT, PROJECT_PKG } from '../settings-section/index.js'
import { registerKeyedSection, type SectionSlotsFace } from '../keyed-section.js'
import { CreateWorktreeDialog, type CreateWorktreeRequest } from '../worktree-picker/create-dialog.js'
import { DeleteWorktreeDialog } from '../worktree-picker/delete-dialog.js'
import {
  aheadBehindInline,
  joinWorktreePath,
  type DeleteChecks,
} from '../worktree-picker/model.js'
import { preloadRpcClientFactory, type WorktreeFacesRpc } from '../rpc.js'
import { AddProjectFlow, openAddProjectFlow } from '../add-project/index.js'

/** 本插件详情页 worktree 管理面 list 登记 id（list slot 判同键；e2e/排障锚）。 */
export const WORKTREE_DETAIL_SECTION_ID = 'project-worktree-management'

/** ahead-behind 行内联计数（dto aheadBehind counts 快照） */
type AheadBehindCounts = { readonly ahead: number; readonly behind: number } | null

/** 项目锚相位（Typert projects.list 行自带 wsPath——唯一非 archived 项目充锚；
 *  1.8 D 类兜底：零项目 = empty 相位——空态 + 添加项目入口呈现，不再静默无面板） */
interface RootPhase {
  readonly state: 'loading' | 'ready' | 'empty' | 'error'
  readonly root?: string
}

/** 清单相位（root 锚定——projectRoot 变更与往返异步竞态不消费错配帧，picker 同判据） */
interface ListPhase {
  readonly state: 'loading' | 'ready' | 'error'
  readonly result?: WorktreeListResult
  readonly root?: string
}

const mono = { fontFamily: 'var(--ds-font-family-code, monospace)' } as React.CSSProperties
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  fontSize: 13,
}
const badgeStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--dsw-alias-label-tertiary)',
  border: '0.5px solid var(--dsw-alias-border-l2)',
  borderRadius: 6,
  padding: '1px 6px',
}
const sealedBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  color: 'var(--dsw-alias-state-warn-label)',
  borderColor: 'var(--dsw-alias-state-warn-primary)',
}

/** 行状态标记（主树 / detached / 封存由独立 chip 呈现） */
function rowBadge(entry: WorktreeEntryDto): string | null {
  if (entry.isMain) return '主树'
  if (entry.detached) return 'detached'
  return null
}

/** worktree 存放目录兜底（host 常驻装配缺省口径同字面——list result 缺 worktreeDir 时） */
function fallbackWorktreeDir(projectRoot: string): string {
  return `${projectRoot}/.forge/worktrees`
}

/**
 * worktree 管理面本体（detail.section list 缝消费组件）：subject 门控（仅本包 bundle
 * 详情页渲染——settings-section ProjectDetailSection 同型）；项目锚/清单缺席或劣形
 * （rpc 缺席 / projects.list 失败 / 锚歧义 / worktree.list 首调抛错）= render null
 * （无面板 fail-soft）。
 */
export function ProjectWorktreesSection(props: {
  readonly subject?: { kind?: unknown; pkg?: { name?: unknown } };
  readonly makeRpc?: () => WorktreeFacesRpc;
}): ReactNode {
  const { subject, makeRpc } = props;
  const subjectOk = subject !== undefined && subject.kind === 'bundle' && subject.pkg?.name === PROJECT_PKG;

  const rpcOf = useCallback((): WorktreeFacesRpc | undefined => {
    try {
      return (makeRpc ?? preloadRpcClientFactory)();
    } catch {
      return undefined // 传输构造失败（载体形状漂移）——面板降级
    }
  }, [makeRpc]);

  const [rootPhase, setRootPhase] = useState<RootPhase>({ state: 'loading' });
  const [phase, setPhase] = useState<ListPhase>({ state: 'loading' });
  const [dead, setDead] = useState(false);
  const [ahead, setAhead] = useState<Record<string, AheadBehindCounts>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [branchState, setBranchState] = useState<{ branches: readonly string[]; defaultBranch?: string }>({ branches: [] });
  const [deleteRow, setDeleteRow] = useState<WorktreeEntryDto | undefined>(undefined);
  const [deleteChecks, setDeleteChecks] = useState<DeleteChecks | null>(null);
  // 1.8 D 类兜底：锚重试 nonce（空态添加项目注册成功 → 重跑项目锚解析，面板就位）
  const [anchorNonce, setAnchorNonce] = useState(0);

  // 项目锚解析（Typert projects.list 行自带 wsPath）：唯一非 archived 项目充锚；
  // 零项目 = empty 相位（首用空态——添加项目兜底入口呈现，1.8 D 类）；多项目 =
  // 无锚不猜首个（warn 留痕退无面板）；remote face 装配在途 = 小步重试。
  useEffect(() => {
    if (!subjectOk) return;
    let cancelled = false;
    const attempt = async (): Promise<void> => {
      const rpc = rpcOf();
      if (rpc === undefined) {
        console.warn('[dsh-forge/project] forge rpc face unavailable; worktree detail section not mounted');
        setRootPhase({ state: 'error' });
        return;
      }
      const maxAttempts = 3;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const rows = await rpc.projects.list();
          if (cancelled) return;
          const live = rows.filter((row) => !row.archived);
          if (live.length === 1) {
            setRootPhase({ state: 'ready', root: live[0]!.wsPath });
          } else if (live.length === 0) {
            setRootPhase({ state: 'empty' });
          } else {
            console.warn(`[dsh-forge/project] project anchor ambiguous (count=${String(live.length)}); worktree detail section not mounted`);
            setRootPhase({ state: 'error' });
          }
          return;
        } catch (cause) {
          if (cancelled) return;
          if (i === maxAttempts - 1) {
            console.warn('[dsh-forge/project] projects.list failed; worktree detail section not mounted', cause);
            setRootPhase({ state: 'error' });
          } else {
            await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
          }
        }
      }
    };
    void attempt();
    return () => {
      cancelled = true;
    };
  }, [subjectOk, rpcOf, anchorNonce]);

  const projectRoot = rootPhase.state === 'ready' ? rootPhase.root : undefined;

  const loadAheadBehind = useCallback(async (result: WorktreeListResult) => {
    const rpc = rpcOf();
    if (rpc === undefined || projectRoot === undefined) return;
    for (const entry of result.entries) {
      if (!entry.present || entry.branch === null || entry.path in ahead) continue;
      try {
        const { counts } = await rpc.worktree.aheadBehind({ projectRoot, path: entry.path });
        setAhead((prev) => ({ ...prev, [entry.path]: counts }));
      } catch {
        setAhead((prev) => ({ ...prev, [entry.path]: null })); // 无 upstream / 拉取失败 = 空位省略
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ahead 缓存读面：命中不重拉
  }, [projectRoot, rpcOf]);

  const reload = useCallback(async () => {
    if (projectRoot === undefined) return;
    const rpc = rpcOf();
    if (rpc === undefined) {
      console.warn('[dsh-forge/project] forge rpc face unavailable; worktree panel unmounted');
      setDead(true);
      return;
    }
    setPhase((prev) => ({ ...prev, state: 'loading' }));
    try {
      const result = await rpc.worktree.list({ projectRoot });
      setPhase({ state: 'ready', result, root: projectRoot });
      await loadAheadBehind(result);
    } catch (cause) {
      // 劣形（typert face 缺席 / 首调抛错）→ 恒无面板（warn 留痕不静默——AGENTS §7 同径）
      console.warn('[dsh-forge/project] forgeWorktree.list degraded; worktree panel unmounted', cause);
      setDead(true);
    }
  }, [projectRoot, rpcOf, loadAheadBehind]);

  useEffect(() => {
    if (projectRoot !== undefined) void reload();
  }, [projectRoot, reload]);

  // 卫语句切分（1.8 D 类兜底）：error 相位先归 null（fail-soft 不变），empty 相位 =
  // 首用空态 + 添加项目入口（宿主 = 本面板内 AddProjectFlow 常驻挂载——页内缝由本面
  // 发布，入口直达；注册成功 → anchorNonce 重跑锚解析，管理面就位）。
  if (!subjectOk || dead || rootPhase.state === 'error') return null;
  if (rootPhase.state === 'empty') {
    return (
      <div className="dswf-wt-panel" data-dswf-wt-panel="" data-wt-state="empty">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)', margin: 0 }}>Worktrees</h2>
        </div>
        <p data-dswf-wt-empty style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 10 }}>
          尚无已注册项目——注册一个项目后即可管理其 worktree。
        </p>
        <Button
          variant="outline"
          data-dswf-wt-add-project=""
          onClick={() => {
            openAddProjectFlow();
          }}
        >
          添加项目…
        </Button>
        <AddProjectFlow onRegistered={() => setAnchorNonce((n) => n + 1)} />
      </div>
    );
  }
  if (projectRoot === undefined) return null;

  const entries = phase.state === 'ready' && phase.root === projectRoot ? phase.result?.entries ?? [] : [];
  const worktreeDir = phase.result?.worktreeDir ?? fallbackWorktreeDir(projectRoot);
  const mainBranch = entries.find((entry) => entry.isMain)?.branch ?? null;

  const openCreate = (): void => {
    setCreateError(undefined);
    setCreateOpen(true);
    const rpc = rpcOf();
    if (rpc === undefined) return;
    void rpc.worktree
      .branches({ projectRoot })
      .then((result) => setBranchState({ branches: result.branches, defaultBranch: result.defaultBranch }))
      .catch(() => undefined); // 分支清单失败 = 空候选（手写分支仍可用，不阻断）
  };

  const onCreate = (request: CreateWorktreeRequest): void => {
    const path = request.customPath ?? joinWorktreePath(worktreeDir, request.worktreeName);
    const rpc = rpcOf();
    if (rpc === undefined) return;
    void rpc
      .worktree.create({ projectRoot, branch: request.branch, base: request.baseBranch, path })
      .then(() => {
        setCreateOpen(false);
        void reload();
      })
      .catch((cause: unknown) => {
        setCreateError(cause instanceof Error ? cause.message : String(cause)); // 表单内错误呈现，不静默吞错
      });
  };

  const openDelete = (entry: WorktreeEntryDto): void => {
    setDeleteRow(entry);
    setDeleteChecks(null); // A11：checks 在途 = 保守拦截
    const rpc = rpcOf();
    if (rpc === undefined) return;
    void rpc.worktree
      .checks({ projectRoot, path: entry.path })
      .then((result) =>
        setDeleteChecks({ dirtyCount: result.dirtyCount, aheadCount: result.aheadCount, attachedSessions: result.attachedSessions }),
      )
      .catch(() => undefined); // 拉取失败保持 null = 确认钮禁用（fail-closed）
  };

  const confirmDelete = (): void => {
    if (deleteRow === undefined) return;
    const rpc = rpcOf();
    if (rpc === undefined) return;
    void rpc
      .worktree.delete({ projectRoot, path: deleteRow.path })
      .then(() => {
        setDeleteRow(undefined);
        void reload();
      })
      .catch((cause: unknown) => {
        console.warn('[dsh-forge/project] worktree delete failed', cause);
        setDeleteRow(undefined);
      });
  };

  return (
    <div className="dswf-wt-panel" data-dswf-wt-panel="" data-wt-state={phase.state}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)', margin: 0 }}>Worktrees</h2>
        {phase.state === 'ready' && (
          <Button variant="outline" data-dswf-wt-create="" onClick={openCreate}>
            新建 worktree…
          </Button>
        )}
      </div>
      {phase.state !== 'ready' ? (
        <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
          {phase.state === 'loading' ? '正在读取 worktree 清单…' : 'worktree 清单读取失败——数据通路降级中。'}
        </p>
      ) : !phase.result?.isGit ? (
        <p data-dswf-wt-non-git="" style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
          当前项目根不是 git 仓库——worktree 管理不可用。
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map((entry) => {
            const badge = rowBadge(entry);
            const inline = aheadBehindInline(ahead[entry.path] ?? { ahead: 0, behind: 0 });
            const sealed = !entry.present;
            return (
              <div key={entry.path} data-dswf-wt-row="" data-path={entry.path} data-wt-sealed={sealed || undefined} style={rowStyle}>
                <span style={{ ...mono, color: 'var(--dsw-alias-label-primary)' }}>{entry.branch ?? '(detached)'}</span>
                <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{entry.worktreeName}</span>
                {badge !== null && <span style={badgeStyle}>{badge}</span>}
                {sealed && <span data-dswf-wt-sealed="" style={sealedBadgeStyle}>已封存</span>}
                {inline !== null && (
                  <span data-dswf-wt-ahead-behind="" style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
                    {inline}
                  </span>
                )}
                {!entry.isMain && !sealed && (
                  <Button
                    variant="ghost"
                    data-dswf-wt-delete=""
                    style={{ marginLeft: 'auto' }}
                    onClick={() => openDelete(entry)}
                  >
                    删除
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <CreateWorktreeDialog
        open={createOpen}
        branches={branchState.branches}
        existingWorktreeNames={entries.map((entry) => entry.worktreeName)}
        defaultBranch={branchState.defaultBranch}
        mainBranch={mainBranch}
        worktreeDir={worktreeDir}
        error={createError}
        onClose={() => setCreateOpen(false)}
        onCreate={onCreate}
      />
      <DeleteWorktreeDialog
        open={deleteRow !== undefined}
        worktreeName={deleteRow?.worktreeName ?? ''}
        branch={deleteRow?.branch ?? null}
        path={deleteRow?.path ?? ''}
        checks={deleteChecks}
        onClose={() => setDeleteRow(undefined)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/**
 * 注册 worktree 管理面（apply 期直挂 plugins.detail.section list 缝——不依赖 configForms）。
 * slots 劣形 = 不注册 fail-soft（registerKeyedSection 内收口）；数据面劣形在组件消费期
 * fail-soft 退无面板（ProjectWorktreesSection 内收口）。
 */
export function registerWorktreeDetailSection(
  slots: SectionSlotsFace,
): (() => void) | undefined {
  return registerKeyedSection(slots, {
    slot: DETAIL_SECTION_SLOT,
    id: WORKTREE_DETAIL_SECTION_ID,
    label: 'Worktrees',
    component: ProjectWorktreesSection,
  });
}
