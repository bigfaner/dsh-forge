// 概览 dock tab body（1.13 任务域接管版——ui-slots.md §②：摘提案/feature 两子块[退役]、
// Bug 台账不随[归 project]；主指标 = **AC 核销进度**——TaskCardDto.acProgress 批水化
// [host 半 GROUP BY 最新结算行，零 N+1]，spec 投影缺席降级「无任务数据」不报错）。
// 分层：OverviewFrame = 纯呈现帧（结构静态可测）；OverviewTab = 状态 + 装载胶水
// （follow 流 hub 订阅 + 降级重取 nonce）。状态机边界（Hard Rule 锚）：本面零 completed
// 转移 affordance——拖拽/按钮直达 completed 一概不呈现，completed 必经 submitTask 结算门
// （契约测试锚 = tests/ui/overview.test.tsx 零转移控件断言 + host transition 面无
// completed 快捷方法机检）。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createForgeTasksClient, type ForgeTasksRpc, type TaskBoardDtoView, type TaskCardView } from "../tasks-rpc.js";
import { createTasksBoardHub, TASKS_HUB_MERGE_MS, type TasksBoardHub } from "../tasks-hub.js";
import "./overview.css";

/** 八态 chips 消费序（TASK_STATUSES 行序镜像——计数呈现单源） */
const STATUS_ORDER = ["pending", "in_progress", "completed", "blocked", "suspended", "interrupted", "skipped", "rejected"] as const;

export type OverviewStatus = (typeof STATUS_ORDER)[number];

/** AC 核销进度聚合（概览主指标——sum(done)/sum(total)，零进度卡不参与分母） */
export interface AcSummary {
  readonly done: number;
  readonly total: number;
  /** cards 带 acProgress 的张数（零 = 「无核销数据」呈现） */
  readonly cards: number;
}

export function acSummaryOf(cards: readonly TaskCardView[]): AcSummary {
  let done = 0;
  let total = 0;
  let withProgress = 0;
  for (const card of cards) {
    const p = card.acProgress;
    if (p === undefined) continue;
    withProgress += 1;
    done += p.done;
    total += p.total;
  }
  return { done, total, cards: withProgress };
}

/** 状态计数投影（stats.byStatus 窄读——缺态补 0，行序 = STATUS_ORDER） */
export function statusCountsOf(board: TaskBoardDtoView | undefined): Record<OverviewStatus, number> {
  const out = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, interrupted: 0, skipped: 0, rejected: 0 } as Record<OverviewStatus, number>;
  for (const status of STATUS_ORDER) out[status] = board?.stats.byStatus[status] ?? 0;
  return out;
}

/** 行过滤投影（激活 chips 集合——空集 = 全部） */
export function visibleCardsOf(cards: readonly TaskCardView[], active: ReadonlySet<string>): readonly TaskCardView[] {
  if (active.size === 0) return cards;
  return cards.filter((card) => active.has(card.taskStatus));
}

export interface OverviewFrameProps {
  /** 项目身份（官方语境 projectId——head 呈现锚；缺席 = 「无任务数据」降级） */
  readonly projectId: string | undefined;
  /** 任务板快照（undefined = 首装在途/降级在途） */
  readonly board: TaskBoardDtoView | undefined;
  readonly phase: "loading" | "ready" | "error";
  readonly error?: string;
  readonly activeStatuses: ReadonlySet<OverviewStatus>;
  readonly onToggleStatus: (status: OverviewStatus) => void;
  readonly onClearStatuses: () => void;
  readonly onRetry: () => void;
}

/** 概览纯呈现帧（结构静态可测——head 主指标 + chips + 行列表） */
export function OverviewFrame({
  projectId,
  board,
  phase,
  error,
  activeStatuses,
  onToggleStatus,
  onClearStatuses,
  onRetry,
}: OverviewFrameProps): ReactNode {
  const counts = statusCountsOf(board);
  const cards = board === undefined ? [] : visibleCardsOf(board.cards, activeStatuses);
  const ac = acSummaryOf(board?.cards ?? []);
  const acLabel =
    ac.cards === 0 ? "无核销数据" : ac.total === 0 ? "AC 核销 0/0" : `AC 核销 ${ac.done}/${ac.total}（${Math.round((ac.done / ac.total) * 100)}%）`;
  return (
    <div className="dswf-ov-wrap" data-dswf-ov-wrap="">
      <div className="dswf-ov-panel" data-dswf-ov-panel="">
        <div className="dswf-ov-head" data-dswf-ov-head="">
          <span className="dswf-ov-title" data-dswf-ov-title="">
            {projectId ?? "任务概览"}
          </span>
          <span className="dswf-ov-ac" data-dswf-ov-ac="">
            {acLabel}
          </span>
        </div>
        {phase === "loading" ? (
          <div className="dswf-ov-skeleton" data-dswf-ov-skeleton="" />
        ) : phase === "error" ? (
          <div className="dswf-ov-error" data-dswf-ov-error="">
            <span>概览装载失败：{error ?? ""}</span>
            <button className="dswf-ov-retry" data-dswf-ov-retry="" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : board === undefined || board.cards.length === 0 ? (
          <div className="dswf-ov-empty" data-dswf-ov-empty="">
            无任务数据
          </div>
        ) : (
          <>
            <div className="dswf-ov-chips" data-dswf-ov-chips="">
              {STATUS_ORDER.map((status) => (
                <button
                  key={status}
                  className={
                    "dswf-ov-chip" + (activeStatuses.has(status) ? " dswf-ov-chip-active" : "") + (counts[status] === 0 ? " dswf-ov-chip-zero" : "")
                  }
                  data-dswf-ov-chip={status}
                  onClick={() => (activeStatuses.has(status) ? onClearStatuses() : onToggleStatus(status))}
                >
                  {status} · {counts[status]}
                </button>
              ))}
            </div>
            <ul className="dswf-ov-rows" data-dswf-ov-rows="">
              {cards.map((card) => (
                <li key={card.taskId} className="dswf-ov-row" data-dswf-ov-row={card.taskStatus}>
                  <span className="dswf-ov-row-key">
                    {card.slug}/{card.localId}
                  </span>
                  <span className="dswf-ov-row-title">{card.title}</span>
                  <span className="dswf-ov-row-status">{card.taskStatus}</span>
                  <span className="dswf-ov-row-ac">{card.acProgress === undefined ? "—" : `${card.acProgress.done}/${card.acProgress.total}`}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export interface OverviewTabProps {
  /** 项目身份（官方语境 projectId——直投 forgeTasks 快照族，host 半解析归属键；
   * 缺席 = 「无任务数据」降级呈现，不报错。bug 9407ff29 修型：客户端零投影） */
  readonly projectId: string | undefined;
  /** RPC client（缺省 = forgeTasks Typert 真身；注入 = 测试面） */
  readonly makeClient?: () => ForgeTasksRpc;
  /** 容器限定（可选——缺省全项目板） */
  readonly slug?: string;
}

/** 概览 tab body（状态 + 装载胶水——follow hub 订阅单源 + 降级重取 nonce） */
export function OverviewTab({ projectId, makeClient, slug }: OverviewTabProps): ReactNode {
  const [board, setBoard] = useState<TaskBoardDtoView | undefined>(undefined);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);
  const [activeStatuses, setActiveStatuses] = useState<ReadonlySet<OverviewStatus>>(new Set());

  useEffect(() => {
    if (projectId === undefined || projectId === "") {
      // spec 投影缺席降级：不报错，「无任务数据」终态呈现（负缓存不锁存——projectId
      // 到场即重订阅，风险 8 对策）
      setPhase("ready");
      setBoard(undefined);
      return;
    }
    const client = (makeClient ?? defaultClientOf)();
    let hub: TasksBoardHub | undefined;
    let cancelled = false;
    try {
      hub = createTasksBoardHub({
        client,
        query: { projectId, ...(slug !== undefined ? { slug } : {}) },
        onSnapshot: (snapshot) => {
          if (cancelled) return;
          setBoard(snapshot);
          setPhase("ready");
          setError(undefined);
        },
        onDiag: (line) => console.warn(`[dsh-forge/task-loop] ${line}`),
        // follow 流不可达 = 一次性降级轮询；首次 list 落地即 ready，list 拒绝 = error 相位
      });
      hub.start();
      void client
        .list({ projectId, ...(slug !== undefined ? { slug } : {}) })
        .then((cards) => {
          if (cancelled) return;
          setBoard((prev) => prev ?? { projectKey: projectId, cards, stats: { total: cards.length, byStatus: {} } });
          setPhase((prev) => (prev === "loading" ? "ready" : prev));
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          setPhase((prev) => (prev === "ready" ? prev : "error"));
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    } catch (cause) {
      setPhase("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    return () => {
      cancelled = true;
      hub?.dispose();
    };
  }, [projectId, slug, nonce, makeClient]);

  const handleToggleStatus = useCallback((status: OverviewStatus) => {
    setActiveStatuses((prev) => new Set(prev).add(status));
  }, []);
  const handleClearStatuses = useCallback(() => setActiveStatuses(new Set()), []);
  const handleRetry = useCallback(() => {
    setPhase("loading");
    setError(undefined);
    setNonce((n) => n + 1);
  }, []);

  // chips 激活集引用稳定（useMemo——帧 props 身份稳定，重复渲染零抖动）
  const memoActive = useMemo(() => activeStatuses, [activeStatuses]);
  return (
    <OverviewFrame
      projectId={projectId}
      board={board}
      phase={phase}
      {...(error !== undefined ? { error } : {})}
      activeStatuses={memoActive}
      onToggleStatus={handleToggleStatus}
      onClearStatuses={handleClearStatuses}
      onRetry={handleRetry}
    />
  );
}

/** 缺省 client 真身（懒构造——face 缺席调用期诚实降级） */
function defaultClientOf(): ForgeTasksRpc {
  return createForgeTasksClient();
}

/** hub 合并窗常量 re-export（测试锚——壳侧 50ms 判例同值 pin） */
export { TASKS_HUB_MERGE_MS };
