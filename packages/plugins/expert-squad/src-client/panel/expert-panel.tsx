// panel/expert-panel —— 专家卡片网格主视图（ui-design F1 已批原型的产品实现）：
// 四态（骨架 loading / 空（零专家建档引导 & 无匹配）/ 错误 ErrorBar 重试 / 数据）、
// 头部（「专家团」标识 + 左置搜索即时过滤与状态筛选 select + 右置召唤入口——用户裁决
// 2026-10-25：状态筛选与召唤钮空间分离，筛选改 select 三态）、卡片字段集（状态灯/名称/
// 英文标识 chip/岗位/人设三行截断/技能与白名单 chips/更新时间页脚）、面板页脚计数。
// ExpertPanelApp = 装配壳：官方 main keyed 槽占用者（root 标准props useWorkspaces 递达
// ——workspace 参数来源 D4）+ ExpertListController 数据源订阅；/workspace 未就绪期 =
// 骨架态（中间态不落空态分支——DESIGN.md 稳定性裁决）。
// [召唤] = 经官方缝打开/切换 HR 预设官方会话（summon-session——零面板内对话面；
// 失败降级 = 头部引导条，不炸面板）。建档联动依赖既有 fs/observed + 5s 轮询通道
//（1.4/1.22）——零新增旁路。
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  filterExperts,
  footerText,
  personaSummary,
  updatedLabel,
  type ExpertView,
  type StatusFilter,
} from "./filter.js";
import { unionSkills } from "./detail-logic.js";
import { ExpertListController, type ListFetcher, type ListState } from "./list-source.js";
import {
  ExpertDetailController,
  type DetailMutations,
} from "./detail-source.js";
import { ExpertDetailDialog } from "./detail-dialog.js";
import {
  summonWorkspaceOf,
  type SummonOutcome,
  type SummonWorkspaceRow,
} from "./summon-session.js";
import { ensurePanelStyles } from "./styles.js";

/** 官方 workspace 归属快照选择钩子（root 标准props——结构窄面，缺席 = 降级）。 */
export type WorkspacesHook = (selector: (snapshot: unknown) => unknown) => unknown

/** workspace 归属快照 → 当前选中 WorkspaceView 行（D4 取值来源 = WorkspaceView.path；
 *  单库兜底取首行；workspaceId 随行递达——召唤绑定官方 openWorkspace 寻址面）。 */
export function workspaceRowOf(snapshot: unknown): SummonWorkspaceRow | undefined {
  return summonWorkspaceOf(snapshot)
}

/** workspace 路径锚子件（钩子形制：kit hook 缺席不挂载、在场则子件内无条件调用）。 */
function WorkspaceRowAnchor({
  hook,
  onRow,
}: {
  readonly hook: WorkspacesHook
  readonly onRow: (row: SummonWorkspaceRow | undefined) => void
}): ReactNode {
  const row = workspaceRowOf(hook((snapshot) => snapshot))
  useEffect(() => {
    onRow(row)
  }, [row, onRow])
  return null
}

/** /api/expert-squad/list 请求 URL（workspace 必填 + includeDisabled——禁用卡如实呈现）。 */
export function listUrl(workspace: string): string {
  return `/api/expert-squad/list?workspace=${encodeURIComponent(workspace)}&includeDisabled=true`
}

/** 默认取数缝（既有 /api 桥 fetch——官方 ConnectionFetchRoute 分发面）。 */
export function defaultListFetcher(workspace: string): ListFetcher {
  return {
    fetchList: async () => {
      const response = await fetch(listUrl(workspace))
      if (!response.ok) throw new Error(`专家目录拉取失败（HTTP ${response.status}）`)
      const payload: unknown = await response.json()
      if (!Array.isArray(payload)) throw new Error("专家目录载荷形状漂移")
      return payload as ExpertView[]
    },
  }
}

/** 详情变更 fetch 路由前缀（routes.ts 精确路由族；client 侧零服务端代码引入）。 */
const DETAIL_UPDATE_URL = "/api/expert-squad/update";
const DETAIL_ENABLE_URL = "/api/expert-squad/enable";
const DETAIL_DISABLE_URL = "/api/expert-squad/disable";

/** POST 路由公共请求面（非 2xx → 抛业务错消息）。 */
async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

/** 默认详情变更缝（POST update / enable / disable；返回换新后的档案）。 */
export function defaultDetailMutations(workspace: string): DetailMutations {
  return {
    update: async (name, draft) =>
      (await postJson(DETAIL_UPDATE_URL, { workspace, name, ...draft })) as ExpertView,
    setEnabled: async (name, enabled) =>
      (await postJson(enabled ? DETAIL_ENABLE_URL : DETAIL_DISABLE_URL, {
        workspace,
        key: name,
      })) as ExpertView,
  };
}

const LOADING_SNAPSHOT: ListState = { phase: { kind: "loading" }, entries: [] }

/** [召唤] 官方会话缝（装配壳 inject face 递达；测试/装配注入）。 */
export type SummonOpener = (workspace: SummonWorkspaceRow) => Promise<SummonOutcome>

/** ExpertPanelApp 入参（官方 main keyed 槽占用者组合 props 的消费切片）。 */
export interface ExpertPanelAppProps {
  /** workspace 归属观察钩子（root 标准props 自动递达；缺席 = 骨架降级）。 */
  readonly useWorkspaces?: WorkspacesHook
  /** 取数缝（测试/装配注入；缺省 = /api 桥 fetch）。 */
  readonly fetchList?: ListFetcher
  /** 详情变更缝（测试/装配注入；缺省 = update/enable/disable POST fetch）。 */
  readonly mutations?: DetailMutations
  /** [召唤] 官方会话缝（装配壳 inject face；缺席 = 召唤钮不呈现）。 */
  readonly summon?: SummonOpener
}

/**
 * 面板装配壳（main keyed 'expert-squad' 占用者）：workspace 就绪 → 建控制器（即时拉 +
 * 5s 轻轮询）→ 订阅渲染；workspace 缺席（非壳载体/快照未到）= 骨架态。
 */
export function ExpertPanelApp(props: ExpertPanelAppProps): ReactNode {
  ensurePanelStyles()
  const [workspaceRow, setWorkspaceRow] = useState<SummonWorkspaceRow | undefined>(undefined)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const workspacePath = workspaceRow?.path
  const [summonBusy, setSummonBusy] = useState(false)
  const [summonNotice, setSummonNotice] = useState<string | undefined>(undefined)

  // 控制器随 workspace 建立与换代（旧实例随 effect 清理 stop——轮询零泄漏）
  const controller = useMemo(() => {
    if (workspacePath === undefined) return undefined
    const instance = new ExpertListController(props.fetchList ?? defaultListFetcher(workspacePath))
    instance.start()
    return instance
  }, [workspacePath, props.fetchList])
  useEffect(() => () => controller?.stop(), [controller])

  // 详情 Dialog 控制器：变更成功回写列表控制器（卡片即时同步，不待轮询）
  const detailController = useMemo(() => {
    const base = props.mutations ?? (workspacePath === undefined ? undefined : defaultDetailMutations(workspacePath))
    if (base === undefined) return undefined
    return new ExpertDetailController({
      update: async (name, draft) => {
        const updated = await base.update(name, draft)
        controller?.patchEntry(updated)
        return updated
      },
      setEnabled: async (name, enabled) => {
        const updated = await base.setEnabled(name, enabled)
        controller?.patchEntry(updated)
        return updated
      },
    })
  }, [props.mutations, workspacePath, controller])
  const detailSubscribe = useCallback(
    (onChange: () => void): (() => void) =>
      detailController?.subscribe(onChange) ?? (() => undefined),
    [detailController],
  )
  const detailGetSnapshot = useCallback(
    () => detailController?.getSnapshot() ?? undefined,
    [detailController],
  )
  const detailState = useSyncExternalStore(detailSubscribe, detailGetSnapshot, detailGetSnapshot)

  const onCardActivate = useCallback(
    (key: string) => {
      const expert = controller?.getSnapshot().entries.find((entry) => entry.name === key)
      if (expert !== undefined) detailController?.open(expert)
    },
    [controller, detailController],
  )

  // [召唤]：经官方缝打开 HR 预设会话（绑定当前工作区——workspace 锚同参同源 D4）。
  // 失败降级 = 引导条（不弹选择器、不空绑定、不炸面板）；成功 = 官方 chat-view 呈现，
  // 面板零对话面；建档联动靠既有 fs/observed + 5s 轮询（list-source 既有通道）。
  const summon = props.summon
  // 卸载防护：召唤 promise 链在组件卸载后不得 setState（React 告警 + 泄漏面）。
  const summonAlive = useRef(false)
  useEffect(() => {
    summonAlive.current = true
    return () => {
      summonAlive.current = false
    }
  }, [])
  const onSummon = useCallback(() => {
    if (summon === undefined || summonBusy) return
    setSummonNotice(undefined)
    setSummonBusy(true)
    summon(workspaceRow ?? {})
      .then((outcome) => {
        if (summonAlive.current && !outcome.ok) setSummonNotice(outcome.message)
      })
      .catch((error: unknown) => {
        if (summonAlive.current) setSummonNotice(`召唤失败：${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => {
        if (summonAlive.current) setSummonBusy(false)
      })
  }, [summon, summonBusy, workspaceRow])

  const subscribe = useCallback(
    (onChange: () => void): (() => void) => controller?.subscribe(onChange) ?? (() => undefined),
    [controller],
  )
  const getSnapshot = useCallback(
    (): ListState => controller?.getSnapshot() ?? LOADING_SNAPSHOT,
    [controller],
  )
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const phase = state.phase.kind === "error" ? "error" : state.phase.kind
  const onRetry = useCallback(() => controller?.retry(), [controller])

  return (
    <div className="dswf-expert-panel" data-dswf-expert-panel="">
      {props.useWorkspaces === undefined ? null : (
        <WorkspaceRowAnchor hook={props.useWorkspaces} onRow={setWorkspaceRow} />
      )}
      <ExpertPanel
        phase={phase}
        entries={state.entries}
        {...(state.phase.kind === "error" ? { errorMessage: state.phase.message } : {})}
        query={query}
        status={status}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        {...(controller !== undefined ? { onRetry } : {})}
        {...(summon !== undefined ? { onSummon, summonBusy } : {})}
        {...(summonNotice !== undefined ? { summonNotice } : {})}
        {...(detailController !== undefined ? { onCardActivate } : {})}
      />
      {detailState === undefined || detailController === undefined || !detailState.open ? null : (
        <ExpertDetailDialog
          controller={detailController}
          allSkills={unionSkills(state.entries)}
        />
      )}
    </div>
  )
}

/** ExpertPanel 呈递件入参（四态渲染决策面——单测直接消费）。 */
export interface ExpertPanelProps {
  readonly phase: "loading" | "error" | "ready"
  readonly entries: readonly ExpertView[]
  readonly errorMessage?: string
  readonly query: string
  readonly status: StatusFilter
  readonly onQueryChange: (query: string) => void
  readonly onStatusChange: (status: StatusFilter) => void
  readonly onRetry?: () => void
  readonly onCardActivate?: (key: string) => void
  readonly onSummon?: () => void
  /** 召唤在途（防重——钮禁用态）。 */
  readonly summonBusy?: boolean
  /** 召唤降级引导条（HR 预设被拒/会话打开失败/工作区锚缺席）。 */
  readonly summonNotice?: string
}

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
  { value: "all", label: "全部" },
  { value: "enabled", label: "启用" },
  { value: "disabled", label: "禁用" },
]

function Card({ expert, onActivate }: { readonly expert: ExpertView; readonly onActivate?: (key: string) => void }): ReactNode {
  const updated = updatedLabel(expert.updatedAt)
  return (
    <article
      className={`dswf-xcard${expert.enabled ? "" : " off"}`}
      data-expert-key={expert.name}
      role="button"
      tabIndex={0}
      onClick={() => onActivate?.(expert.name)}
    >
      <div className="xc-head">
        <span className={`dot ${expert.enabled ? "on" : "off"}`} />
        <b className="xc-name">{expert.name}</b>
        <span className="chip tool">{expert.name}</span>
      </div>
      <div className="xc-title">
        {expert.title}
        {expert.enabled ? "" : " · 已禁用"}
      </div>
      <div className="xc-creed">{personaSummary(expert.personaMd)}</div>
      <div>
        <div className="xc-seg">技能标签</div>
        <div className="xc-tags">
          {expert.skills.map((skill) => (
            <span key={skill} className="chip">
              {skill}
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="xc-seg">工具白名单（子会话强制）</div>
        <div className="xc-tags">
          {expert.tools.map((tool) => (
            <span key={tool} className="chip tool">
              {tool}
            </span>
          ))}
        </div>
      </div>
      <div className="xc-foot">{updated === undefined ? "" : <span>更新于 {updated}</span>}</div>
    </article>
  )
}

/**
 * 卡片网格主视图（四态分流 + 头部 + 页脚；F1 组件树逐位）。
 * 空态两分支：零专家 = 建档引导；有专家但过滤清零 = 无匹配引导。
 */
export function ExpertPanel(props: ExpertPanelProps): ReactNode {
  const { phase, entries, query, status } = props
  const filtered = filterExperts(entries, query, status)

  let gridBody: ReactNode
  if (phase === "loading") {
    gridBody = Array.from({ length: 6 }, (_, index) => (
      <div key={index} className="dswf-skeleton-card" />
    ))
  } else if (phase === "error") {
    gridBody = (
      <div className="dswf-errorbar" role="alert">
        <span>专家目录扫描失败（{props.errorMessage ?? "未知错误"}）</span>
        {props.onRetry === undefined ? null : (
          <button
            type="button"
            className="dswf-btn dswf-btn-ghost"
            onClick={props.onRetry}
          >
            重试
          </button>
        )}
      </div>
    )
  } else if (entries.length === 0) {
    gridBody = (
      <div className="dswf-empty">
        <b>还没有专家</b>
        在会话里对 HR 说「招募一个专家」即可建档
      </div>
    )
  } else if (filtered.length === 0) {
    gridBody = (
      <div className="dswf-empty">
        <b>无匹配专家</b>
        换个关键词或过滤条件试试
      </div>
    )
  } else {
    gridBody = filtered.map((expert) => (
      <Card key={expert.name} expert={expert} {...(props.onCardActivate !== undefined ? { onActivate: props.onCardActivate } : {})} />
    ))
  }

  const countText =
    phase === "loading"
      ? "扫描专家目录…"
      : phase === "error"
        ? ""
        : footerText(entries.length, filtered.length)

  return (
    <>
      <header className="dswf-panel-header">
        <h1 className="dswf-panel-title">专家团</h1>
        <input
          className="dswf-search"
          type="text"
          placeholder="搜索名称 / 标识 / 技能"
          aria-label="搜索专家"
          value={query}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
        <select
          className="dswf-status-select"
          aria-label="状态筛选"
          data-status={status}
          value={status}
          onChange={(event) => props.onStatusChange(event.target.value as StatusFilter)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {props.onSummon === undefined ? null : (
          <button
            type="button"
            className="dswf-btn dswf-btn-primary dswf-summon-btn"
            aria-label="召唤 HR 预设会话"
            disabled={props.summonBusy === true}
            onClick={props.onSummon}
          >
            召唤
          </button>
        )}
      </header>
      {props.summonNotice === undefined ? null : (
        <div className="dswf-summon-notice" role="status" data-dswf-summon-notice="">
          {props.summonNotice}
        </div>
      )}
      <div className="dswf-card-grid">{gridBody}</div>
      <footer className="dswf-panel-footer">{countText}</footer>
    </>
  )
}
