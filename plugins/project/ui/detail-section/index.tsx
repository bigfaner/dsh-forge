// detail-section —— worktree 管理面（1.32）：经 plugins.detail.section（list 槽，官方
// 已声明 client.js:3749）注册于插件管理器 project 详情页——与 settings-section 双缝
// 同槽共页（配置节 + worktree 管理面两行，互不重叠）。呈现：
//   · 列表：分支 / 树名 / 状态（主树·detached·正常）/ ahead-behind（懒加载内联短串）/
//     封存态（present:false 盘上缺席行——「已封存」标记，删除与新建入口对该行禁用）；
//   · 创建：复用 ui/worktree-picker create-dialog 纯模型与校验（isCreateReady /
//     createConflicts / joinWorktreePath / sortBaseBranchOptions）——提交经缝 port.create；
//   · 删除：fail-closed checks 三清单（未提交变更 / 未 push / 挂靠会话——DeleteWorktreeDialog
//     既有拦截语义，checks 缺席 = 保守拦截）——确认经缝 port.delete。
// 数据源分治：列表/创建/删除/封存态经 WorktreeServicePort 的 forge.worktrees 缝
// （seam-face.ts，劣形三形态退无面板）；分支下拉 / checks / ahead-behind 读面 = 页内
// RPC 窄面（ui/rpc.ts，hero picker 同径——缝契约未覆盖的只读通道零复制零新造）。
// 不依赖 configForms：apply 期直接注册 detail.section（槽缺席/劣形 fail-soft 退无面板）。
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorktreeServicePort } from '@dsh-forge/lib-api'
import type { WorktreeEntryDto, WorktreeListResult } from '@dsh-forge/contracts'
import { DETAIL_SECTION_SLOT, PROJECT_PKG } from '../settings-section/index.js'
import { registerKeyedSection, type SectionSlotsFace } from '../keyed-section.js'
import { worktreePortOf, type WorktreeSeamCtx } from './seam-face.js'

export { WORKTREE_SEAM_KEY } from './seam-face.js'
import { CreateWorktreeDialog, type CreateWorktreeRequest } from '../worktree-picker/create-dialog.js'
import { DeleteWorktreeDialog } from '../worktree-picker/delete-dialog.js'
import {
  aheadBehindInline,
  joinWorktreePath,
  type DeleteChecks,
} from '../worktree-picker/model.js'
import { preloadRpcClientFactory, type WorktreeFacesRpc } from '../rpc.js'

/** 本插件详情页 worktree 管理面 list 登记 id（list slot 判同键；e2e/排障锚）。 */
export const WORKTREE_DETAIL_SECTION_ID = 'project-worktree-management'

/** ahead-behind 行内联计数（dto aheadBehind counts 快照） */
type AheadBehindCounts = { readonly ahead: number; readonly behind: number } | null

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

/**
 * worktree 管理面本体（detail.section list 缝消费组件）：subject 门控（仅本包 bundle
 * 详情页渲染——settings-section ProjectDetailSection 同型）；port/projectRoot 缺席 =
 * render null（无面板 fail-soft）；缝劣形③（首调抛错）= 恒无面板。
 */
export function ProjectWorktreesSection(props: {
  readonly subject?: { kind?: unknown; pkg?: { name?: unknown } };
  readonly port?: WorktreeServicePort;
  readonly projectRoot?: string;
  readonly makeRpc?: () => WorktreeFacesRpc;
}): ReactNode {
  const { subject, port, projectRoot, makeRpc } = props;
  const subjectOk = subject !== undefined && subject.kind === 'bundle' && subject.pkg?.name === PROJECT_PKG;
  if (!subjectOk || port === undefined || projectRoot === undefined || projectRoot === '') return null;

  const rpcOf = (): WorktreeFacesRpc | undefined => {
    try {
      return (makeRpc ?? preloadRpcClientFactory)();
    } catch {
      return undefined // preload 桥缺席（非 Electron 载体）——读面降级，缝面不受影响
    }
  };

  const [phase, setPhase] = useState<ListPhase>({ state: 'loading' });
  const [dead, setDead] = useState(false);
  const [ahead, setAhead] = useState<Record<string, AheadBehindCounts>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [branchState, setBranchState] = useState<{ branches: readonly string[]; defaultBranch?: string }>({ branches: [] });
  const [deleteRow, setDeleteRow] = useState<WorktreeEntryDto | undefined>(undefined);
  const [deleteChecks, setDeleteChecks] = useState<DeleteChecks | null>(null);

  const loadAheadBehind = useCallback(async (result: WorktreeListResult) => {
    const rpc = rpcOf();
    if (rpc === undefined) return;
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
  }, [port, projectRoot]);

  const reload = useCallback(async () => {
    setPhase((prev) => ({ ...prev, state: 'loading' }));
    try {
      const result = await port.list({ projectRoot });
      setPhase({ state: 'ready', result, root: projectRoot });
      await loadAheadBehind(result);
    } catch (cause) {
      // 劣形③首调抛错 → 缝降级终态 = 恒无面板（warn 留痕不静默——AGENTS §7 同径）
      console.warn('[dsh-forge/project] forge.worktrees seam degraded; worktree panel unmounted', cause);
      setDead(true);
    }
  }, [port, projectRoot, loadAheadBehind]);

  useEffect(() => {
    void reload();
  }, [reload]);
  if (dead) return null;

  const entries = phase.state === 'ready' && phase.root === projectRoot ? phase.result?.entries ?? [] : [];
  const worktreeDir = phase.result?.worktreeDir ?? port.getWorktreeDir(projectRoot);
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
    void port
      .create({ projectRoot, branch: request.branch, base: request.baseBranch, path })
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
    void port
      .delete({ projectRoot, path: deleteRow.path })
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
          {phase.state === 'loading' ? '正在读取 worktree 清单…' : 'worktree 清单读取失败——缝服务降级中。'}
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
 * forge.worktrees 缝劣形①②（注册值非函数含缺席 / 实例化抛错非对象）= 不注册 fail-soft
 * （warn 留痕，返回 undefined——无面板）；slots 劣形同径（registerKeyedSection 内收口）。
 */
export function registerWorktreeDetailSection(
  ctx: WorktreeSeamCtx,
  slots: SectionSlotsFace,
): (() => void) | undefined {
  const port = worktreePortOf(ctx);
  if (port === undefined) {
    console.warn('[dsh-forge/project] forge.worktrees seam absent/degraded; worktree detail section not mounted');
    return undefined;
  }
  return registerKeyedSection(slots, {
    slot: DETAIL_SECTION_SLOT,
    id: WORKTREE_DETAIL_SECTION_ID,
    label: 'Worktrees',
    inject: () => ({ port }),
    component: ProjectWorktreesSection,
  });
}
