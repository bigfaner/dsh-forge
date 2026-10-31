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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  entryIdOf,
  filterGroups,
  footerText,
  originBadgeLabel,
  originLabel,
  personaSummary,
  projectNameOf,
  updatedLabel,
  type ExpertGroup,
  type ExpertView,
  type OriginFilter,
  type StatusFilter,
} from "./filter.js";
import { ExpertIcon } from "./expert-icon.js";
import { skillCandidatesOf, toolCandidatesOf } from "./detail-logic.js";
import { ExpertListController, type ListFetcher, type ListState } from "./list-source.js";
import {
  ExpertDetailController,
  type DetailMutations,
} from "./detail-source.js";
import { ExpertDetailDialog } from "./detail-dialog.js";
import { FilterSelect } from "./filter-select.js";
import {
  summonWorkspaceOf,
  type SummonOutcome,
  type SummonWorkspaceRow,
} from "./summon-session.js";
import type { ModelCatalogEntry, ModelCatalogLoader } from "./model-catalog.js";
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
      if (!response.ok) {
        // 诊断面（bug 44e70a5f）：400 响应体即路由侧真实错误文本，丢弃 = 面板只见
        // 「HTTP 400」不知成因——原样并入错误消息。
        const detail = await response.text().catch(() => "")
        throw new Error(`专家目录拉取失败（HTTP ${response.status}${detail ? `：${detail}` : ""}）`)
      }
      const payload: unknown = await response.json()
      if (!Array.isArray(payload)) throw new Error("专家目录载荷形状漂移")
      return payload as ExpertView[]
    },
  }
}

/** delegate 装配状态（run-state 读口 delegate 字段的结构切片——registered / degraded+原因）。 */
export interface DelegateAssemblySnapshot {
  readonly status: "registered" | "degraded"
  readonly reason?: string
}

/** /api/expert-squad/run-state 请求 URL（delegate 装配状态随应答透出）。 */
export function runStateUrl(): string {
  return "/api/expert-squad/run-state";
}

/** 候选目录快照（candidates 读口容缺切片——字段缺席 = 对应官方目录缺席）。 */
export interface CandidateCatalogSnapshot {
  readonly tools?: readonly string[]
  readonly skills?: readonly string[]
}

/** /api/expert-squad/candidates 请求 URL（宿主 ToolRuntime/skill 目录候选读口）。 */
export function candidatesUrl(): string {
  return "/api/expert-squad/candidates"
}

/** 默认候选目录探针（GET candidates 读口；失败/载荷漂移 = 容缺 undefined——旧宿主兼容）。 */
export function defaultCatalogProbe(): Promise<CandidateCatalogSnapshot | undefined> {
  return (async () => {
    const response = await fetch(candidatesUrl())
    if (!response.ok) return undefined
    const payload = (await response.json()) as { tools?: unknown; skills?: unknown }
    const strArr = (value: unknown): readonly string[] | undefined =>
      Array.isArray(value) && value.every((item) => typeof item === "string")
        ? (value as readonly string[])
        : undefined
    const tools = strArr(payload?.tools)
    const skills = strArr(payload?.skills)
    if (tools === undefined && skills === undefined) return undefined
    return { ...(tools !== undefined ? { tools } : {}), ...(skills !== undefined ? { skills } : {}) }
  })()
}

/** 默认 delegate 装配探针（GET run-state 读口；载荷形状漂移/缺字段 = 容缺返回 undefined——旧宿主兼容）。 */
export function defaultDelegateProbe(): Promise<DelegateAssemblySnapshot | undefined> {
  return (async () => {
    const response = await fetch(runStateUrl())
    if (!response.ok) return undefined
    const payload = (await response.json()) as { delegate?: unknown }
    const delegate = payload?.delegate
    if (typeof delegate !== "object" || delegate === null) return undefined
    const { status, reason } = delegate as { status?: unknown; reason?: unknown }
    if (status !== "registered" && status !== "degraded") return undefined
    return {
      status,
      ...(typeof reason === "string" ? { reason } : {}),
    }
  })()
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
  /** delegate 装配探针（测试注入；缺省 = GET run-state 读口 fetch）。 */
  readonly delegateProbe?: () => Promise<DelegateAssemblySnapshot | undefined>
  /** 候选目录探针（测试注入；缺省 = GET candidates 读口 fetch）。 */
  readonly catalogProbe?: () => Promise<CandidateCatalogSnapshot | undefined>
  /** 「设置>模型」目录装载器（provider/model 下拉选项源——remote.session.modelCatalog 惰性
   *  反射；缺席 = Dialog 两字段仅回落继承空选项）。 */
  readonly modelCatalogLoader?: ModelCatalogLoader
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
  const [origin, setOrigin] = useState<OriginFilter>("all")
  const workspacePath = workspaceRow?.path
  const [summonBusy, setSummonBusy] = useState(false)
  const [summonNotice, setSummonNotice] = useState<string | undefined>(undefined)
  // delegate 装配状态（观测面加固）：run-state 读口一次性探针——降级时面板可见提示。
  // 拉取失败/载荷漂移 = 容缺零提示（不干扰面板主态）。
  const [delegateNotice, setDelegateNotice] = useState<string | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const probe = props.delegateProbe ?? defaultDelegateProbe
    probe()
      .then((state) => {
        if (!alive) return
        if (state?.status === "degraded") {
          setDelegateNotice(state.reason ?? "degraded")
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [props.delegateProbe])

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

  // 候选目录（1.78）：candidates 读口探针——Dialog 工具/技能下拉主候选源；失败/载荷
  // 漂移 = 容缺（undefined → 兜底清单/并集语义）。取数时机 = 详情 Dialog 打开（懒取
  // 快照）——宿主 ToolRuntime 目录为注册期渐增视图（核心工具晚于面板挂载注册），
  // 面板挂载期一次性快照会缺新注册工具。
  const [catalog, setCatalog] = useState<CandidateCatalogSnapshot | undefined>(undefined)
  const dialogOpen = detailState?.open === true
  useEffect(() => {
    if (!dialogOpen) return
    let alive = true
    const probe = props.catalogProbe ?? defaultCatalogProbe
    probe()
      .then((snapshot) => {
        if (alive) setCatalog(snapshot)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [dialogOpen, props.catalogProbe])

  // 「设置>模型」目录（provider/model 下拉选项源）：Dialog 打开期一次性装载（目录缺席/
  // 调用拒绝 = undefined 容缺——Dialog 两字段仅回落继承空选项，不炸 Dialog）。
  const [modelCatalog, setModelCatalog] = useState<readonly ModelCatalogEntry[] | undefined>(undefined)
  useEffect(() => {
    if (!dialogOpen) return
    let alive = true
    const loader = props.modelCatalogLoader
    if (loader === undefined) return
    loader()
      .then((entries) => {
        if (alive) setModelCatalog(entries)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [dialogOpen, props.modelCatalogLoader])

  const onCardActivate = useCallback(
    (key: string, origin?: string) => {
      const entries = controller?.getSnapshot().entries ?? []
      // 来源保持展示：shadow 展示态点卡 = 开其所在层档案（缺席回落生效层）
      const expert =
        (origin !== undefined
          ? entries.find((entry) => entry.name === key && entry.origin === origin)
          : undefined) ?? entries.find((entry) => entry.name === key)
      if (expert !== undefined) detailController?.open(expert)
    },
    [controller, detailController],
  )

  // 差异承载面（2026-10-26 裁决 + sourcePath 身份修正）：点对比钮 → 打开详情 Dialog
  // 并直入对比态。靶解析按 sourcePath（同 origin 多份内置注册下 origin find 会命中
  // 生效层自身 → startCompare 后 shadows 滤空 → 自动退场成详情——缺陷根源）。
  const onCompare = useCallback(
    (key: string, sourceId: string) => {
      if (detailController === undefined) return
      const entries = controller?.getSnapshot().entries ?? []
      const effective = entries.find((entry) => entry.name === key && entry.effective !== false)
      const shadow = entries.find(
        (entry) => entry.name === key && (entry.sourcePath ?? `${entry.origin}:${entry.name}`) === sourceId,
      )
      if (effective === undefined || shadow === undefined) return
      detailController.open(effective)
      detailController.startCompare(shadow)
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
        origin={origin}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        onOriginChange={setOrigin}
        {...(workspacePath !== undefined ? { projectName: projectNameOf(workspacePath) } : {})}
        {...(controller !== undefined ? { onRetry } : {})}
        {...(summon !== undefined ? { onSummon, summonBusy } : {})}
        {...(summonNotice !== undefined ? { summonNotice } : {})}
        {...(delegateNotice !== undefined ? { delegateNotice } : {})}
        {...(detailController !== undefined ? { onCardActivate } : {})}
        {...(detailController !== undefined && controller !== undefined ? { onCompare } : {})}
      />
      {detailState === undefined || detailController === undefined || !detailState.open ? null : (
        <ExpertDetailDialog
          controller={detailController}
          toolCandidates={toolCandidatesOf(catalog?.tools)}
          allSkills={skillCandidatesOf(catalog?.skills, state.entries)}
          modelCatalog={modelCatalog}
          sameKeyEntries={state.entries.filter((entry) => entry.name === detailState.expert.name)}
          {...(workspacePath !== undefined ? { projectName: projectNameOf(workspacePath) } : {})}
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
  /** 来源筛选（1.61 裁决②：与搜索、状态 AND 叠加；缺省 all——1.60 调用面零改动）。 */
  readonly origin?: OriginFilter
  readonly onQueryChange: (query: string) => void
  readonly onStatusChange: (status: StatusFilter) => void
  readonly onOriginChange: (origin: OriginFilter) => void
  /** 项目具名（④：workspace 路径 basename——来源选项/角标具名「项目 · <名>」）。 */
  readonly projectName?: string
  readonly onRetry?: () => void
  /** 点卡片 = 请求打开详情 Dialog（key + 当前展示来源——shadow 展示态开其所在层档案）。 */
  readonly onCardActivate?: (key: string, origin?: string) => void
  readonly onSummon?: () => void
  /** 召唤在途（防重——钮禁用态）。 */
  readonly summonBusy?: boolean
  /** 召唤降级引导条（HR 预设被拒/会话打开失败/工作区锚缺席）。 */
  readonly summonNotice?: string
  /** delegate 装配降级提示（run-state 读口 degraded——委派不可用的可见提示；registered/缺席 = 零提示）。 */
  readonly delegateNotice?: string
  /** 筛选下拉初始展开态（SSR 测试/调试面；缺省收起——msel 语义同径）。 */
  readonly filtersOpen?: boolean
  /** 点对比钮 = 请求打开详情 Dialog 对比态（key + 靶条目 sourceId——sourcePath 身份）。 */
  readonly onCompare?: (key: string, sourceId: string) => void
}

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
  { value: "all", label: "全部" },
  { value: "enabled", label: "启用" },
  { value: "disabled", label: "禁用" },
]

/** 来源筛选四态（②：全部来源/项目/用户/内置；project 选项具名）。 */
function originOptions(projectName: string | undefined): readonly { readonly value: OriginFilter; readonly label: string }[] {
  return [
    { value: "all", label: "全部来源" },
    { value: "project", label: originLabel("project", projectName) },
    { value: "user", label: originLabel("user") },
    { value: "plugin", label: originLabel("plugin") },
  ]
}

/** 来源条目身份键（sourcePath——同键同 origin 可有多份内置注册，origin 不足以区分）。 */
// （entryIdOf 移居 filter.ts——Dialog 对比态同用 sourcePath 身份）
/**
 * 来源下拉菜单（chip 原地向下展开）：不做上下翻转——chip 靠近视口底部时菜单可能
 * 溢出视口下缘（判例 2026-10-31：不可见伪「无反应」），以 scrollIntoView nearest
 * 最小滚动把菜单带进视口（完全可见时零滚动，不打扰布局）。
 */
function OriginMenu({ entries, expert, projectName, onSelectOrigin, onToggleMenu }: {
  readonly entries: readonly ExpertView[];
  readonly expert: ExpertView;
  readonly projectName?: string;
  readonly onSelectOrigin?: (sourceId: string | undefined) => void;
  readonly onToggleMenu?: () => void;
}): ReactNode {
  const menuRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    // 展开后最小滚动入视口（block:nearest——已可见时零滚动；溢出时仅滚必要的量）
    menuRef.current?.scrollIntoView({ block: "nearest" });
  });
  return (
    <div
      ref={menuRef}
      className="xc-origin-menu"
      data-xc-origin-menu=""
      onClick={(event) => event.stopPropagation()}
    >
      {entries.map((entry) => (
        <button
          key={entryIdOf(entry)}
          type="button"
          className={`xc-origin-opt${entryIdOf(entry) === entryIdOf(expert) ? " sel" : ""}`}
          data-xc-origin-option={entryIdOf(entry)}
          onClick={(event) => {
            event.stopPropagation();
            onSelectOrigin?.(entry.effective === false ? entryIdOf(entry) : undefined);
            onToggleMenu?.();
          }}
        >
          <span className={`origin-badge origin-${entry.origin}`}>{originBadgeLabel(entry, projectName)}</span>
          <span className="xc-origin-opt-title">{entry.title}</span>
          <span className="xc-origin-opt-date">{updatedLabel(entry.updatedAt) ?? ""}</span>
        </button>
      ))}
    </div>
  );
}

function Card({ expert, allEntries, projectName, onActivate, onCompare, multi, menuOpen, onToggleMenu, onSelectOrigin }: {
  /** 当前展示条目（selectedId 对应层；缺省 = 生效层）。 */
  readonly expert: ExpertView;
  /** 同键全来源条目（生效 + 被遮蔽——来源下拉选项）。 */
  readonly allEntries: readonly ExpertView[];
  readonly projectName?: string;
  readonly onActivate?: (key: string, origin?: string) => void;
  readonly onCompare?: () => void;
  /** 多来源（对比钮 + 来源 chip 可点击下拉的呈现开关）。 */
  readonly multi?: boolean;
  readonly menuOpen?: boolean;
  readonly onToggleMenu?: () => void;
  readonly onSelectOrigin?: (origin: string | undefined) => void;
}): ReactNode {
  const updated = updatedLabel(expert.updatedAt)
  return (
    <article
      className={`dswf-xcard${expert.enabled ? "" : " off"}`}
      data-expert-key={expert.name}
      data-xc-origin={expert.origin}
      data-effective={expert.effective === false ? "false" : "true"}
      role="button"
      tabIndex={0}
      onClick={() => onActivate?.(expert.name, expert.origin)}
    >
      <div className="xc-head">
        <ExpertIcon size={16} />
        <span className={`dot ${expert.enabled ? "on" : "off"}`} />
        <b className="xc-name">{expert.name}</b>
        {/* 右侧组贴紧统一靠右：对比钮（多来源）紧挨来源 chip（多来源 = 可点击下拉切来源展示） */}
        <span className="xc-head-right" data-xc-origin-root={multi ? "" : undefined}>
          {multi && onCompare !== undefined ? (
            <button
              type="button"
              className="dswf-btn dswf-btn-ghost xc-cmp-btn"
              aria-label={`对比 ${expert.name} 其它来源`}
              onClick={(event) => {
                event.stopPropagation(); // 卡片点击 = 开详情——对比钮不冒泡
                onCompare();
              }}
            >
              对比
            </button>
          ) : null}
          <button
            type="button"
            className={`origin-badge origin-${expert.origin}${multi ? " xc-origin-switch" : ""}`}
            data-xc-origin-switch={multi ? "" : undefined}
            aria-label={`来源 ${originBadgeLabel(expert, projectName)}`}
            aria-expanded={multi ? menuOpen === true : undefined}
            // 切换挂 mousedown（先于 click 捕获相位——外点收起 capture 监听在同一 click
            // 事件派发中抢先注册的时序竞态下，mousedown 阶段监听必不在位，天然免疫）；
            // click 仅 stopPropagation 防卡片详情误开
            onMouseDown={(event) => {
              if (!multi) return; // 单来源 chip 纯展示
              event.stopPropagation();
              onToggleMenu?.();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {originBadgeLabel(expert, projectName)}
            {multi ? <span className="xc-origin-caret" aria-hidden="true">▾</span> : null}
          </button>
          {/* 来源下拉（多来源：chip 原地向下展开，列全部来源，选中即卡内切换展示该来源
              专家）。chip 靠近视口底部时菜单可能溢出视口下缘（不可见伪「无反应」，
              判例 2026-10-31）——展开即 scrollIntoView nearest 最小滚动带入视口 */}
          {multi && menuOpen ? (
            <OriginMenu
              entries={allEntries}
              expert={expert}
              projectName={projectName}
              onSelectOrigin={onSelectOrigin}
              onToggleMenu={onToggleMenu}
            />
          ) : null}
        </span>
      </div>
      {/* 第二行：中文名称（岗位）居左 + 派发路由合并 chip 靠右（provider·model 单 chip；
          缺省 = 「model : 继承父Agent」弱化 chip——与详情 Dialog 同语义） */}
      <div className="xc-title-row">
        <div className="xc-title">
          {expert.title}
          {expert.enabled ? "" : " · 已禁用"}
        </div>
        <span
          className={`chip${expert.provider !== undefined && expert.model !== undefined ? " tool" : " dswf-chip-muted"}`}
          data-xc-route=""
        >
          {expert.provider !== undefined && expert.model !== undefined
            ? `${expert.provider} · ${expert.model}`
            : "model : 继承父Agent"}
        </span>
      </div>
      <div className="xc-creed">{personaSummary(expert.personaMd)}</div>
      <div>
        <div className="xc-seg">技能</div>
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
 * 聚组容器（1.60 用户裁决；差异承载面 2026-10-26 + 来源切换裁决 2026-10-31）：组头
 * （键 + 来源数 + 隐藏数）→ 单卡承载（多来源 = 卡头「对比」钮紧挨来源 chip，来源 chip
 * 点击向下扩展全来源菜单，选中即卡内切换展示该来源专家——不再渲染被遮蔽摘要行）。
 */
export function ExpertGroupView(
  { group, onActivate, onCompare, hiddenShadows, projectName }: { readonly group: ExpertGroup; readonly onActivate?: (key: string, origin?: string) => void; readonly onCompare?: (key: string, sourceId: string) => void; readonly hiddenShadows?: number; readonly projectName?: string }): ReactNode {
  const multi = group.shadows.length > 0
  // 来源切换展示态（undefined = 生效层；身份键 = sourcePath）；被遮蔽条目只读展示
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)
  // 切换去抖（250ms）：用户环境存在点击事件双发（判例 2026-10-31——单事件翻转被第二组
  // mousedown 立即抵消，菜单「展开即收」表现为无反应）；窗口期内重复切换忽略
  const lastToggleRef = useRef(0)
  const toggleMenu = (): void => {
    const now = Date.now()
    if (now - lastToggleRef.current < 250) return
    lastToggleRef.current = now
    setMenuOpen((open) => !open)
  }
  // 外点收起（capture 阶段——msel 同径）；菜单/开关内部点击不收起（capture 先于
  // React root 委托，若不豁免会在 option onClick 前重渲染摘除节点、点击丢失）
  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (event: Event): void => {
      const target = event.target as Element | null
      if (target?.closest?.("[data-xc-origin-root], [data-xc-origin-menu]")) return
      setMenuOpen(false)
    }
    document.addEventListener("click", onDocClick, true)
    return () => document.removeEventListener("click", onDocClick, true)
  }, [menuOpen])
  const shown =
    selectedId === undefined
      ? group.effective
      : ([group.effective, ...group.shadows].find((entry) => entryIdOf(entry) === selectedId) ??
        group.effective)
  const allEntries = useMemo(() => [group.effective, ...group.shadows], [group])
  // 对比 = 生效卡 vs 当前展示的被遮蔽层（展示生效层时取首个被遮蔽层）；靶以
  // sourcePath 身份传递（同 origin 多份内置注册下 origin 不足以定位）
  const compareSourceId =
    shown.effective === false ? entryIdOf(shown) : group.shadows[0] !== undefined ? entryIdOf(group.shadows[0]) : undefined
  return (
    // 「multi」为测试锚（单测 panel-view / e2e expert-squad-compare-mode GROUP_MULTI 选择器），
    // 无样式消费面（.multi 无 CSS 规则）——删类需同步两处选择器
    <section className={`dswf-xgroup${multi ? " multi" : ""}`} data-expert-key={group.key}>
      <header className="xg-head">
        <b className="xg-name">{group.key}</b>
        {/* bug f4020406 ⑦：计数注记——来源筛选/搜索命中不足 N 时差额行被隐藏，计数恒为全层条数 */}
        <span className="xg-cnt dswf-tip" data-tip="计数含被搜索/筛选隐藏的来源行">{group.shadows.length + 1} 个来源</span>
        {hiddenShadows === undefined || hiddenShadows === 0 ? null : (
          <span className="xg-hidden">隐藏 {hiddenShadows} 条未命中</span>
        )}
      </header>
      <Card
        expert={shown}
        allEntries={allEntries}
        projectName={projectName}
        {...(onActivate !== undefined ? { onActivate } : {})}
        {...(multi && onCompare !== undefined && compareSourceId !== undefined
          ? { onCompare: () => onCompare(group.key, compareSourceId) }
          : {})}
        {...(multi
          ? {
              multi,
              menuOpen,
              onToggleMenu: toggleMenu,
              onSelectOrigin: setSelectedId,
            }
          : {})}
      />
    </section>
  )
}

/**
 * 卡片网格主视图（四态分流 + 头部 + 页脚；F1 组件树逐位）。
 * 空态两分支：零专家 = 建档引导；有专家但过滤清零 = 无匹配引导。
 */
export function ExpertPanel(props: ExpertPanelProps): ReactNode {
  const { phase, entries, query, status } = props
  const origin = props.origin ?? "all"
  const filteredGroups = filterGroups(entries, query, status, origin)

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
  } else if (filteredGroups.length === 0) {
    gridBody = (
      <div className="dswf-empty">
        <b>无匹配专家</b>
        换个关键词或过滤条件试试
      </div>
    )
  } else {
    // 同键聚组（1.60）+ 组级来源筛选（1.61 裁决②）：网格按键分组渲染；页脚计数按专家键数
    gridBody = filteredGroups.map(({ group, hiddenShadows }) => (
      <ExpertGroupView
        key={group.key}
        group={group}
        hiddenShadows={hiddenShadows}
        {...(props.projectName !== undefined ? { projectName: props.projectName } : {})}
        {...(props.onCardActivate !== undefined ? { onActivate: props.onCardActivate } : {})}
        {...(props.onCompare !== undefined ? { onCompare: props.onCompare } : {})}
      />
    ))
  }

  const keyCount = new Set(entries.map((entry) => entry.name)).size
  // bug f4020406 ①：原「ready && 非空 ? A : A」死三元移除——两分支同值，恒 filteredGroups.length
  const shownCount = filteredGroups.length
  const countText =
    phase === "loading"
      ? "扫描专家目录…"
      : phase === "error"
        ? ""
        : footerText(keyCount, shownCount)

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
        {/* 1.68 裁决④：筛选下拉左侧 label「状态」「来源」（id 绑定对应下拉 box）；
            自绘 FilterSelect（官方 select 组件不在插件 classic-script 外置表——面板内
            msel 视觉词汇统一承载，风格统一裁决 2026-10-26） */}
        <label className="dswf-filter-label" htmlFor="dswf-status-select">状态</label>
        <FilterSelect
          id="dswf-status-select"
          ariaLabel="状态筛选"
          value={status}
          options={STATUS_OPTIONS}
          filtersOpen={props.filtersOpen}
          onChange={(value) => props.onStatusChange(value as StatusFilter)}
        />
        <label className="dswf-filter-label" htmlFor="dswf-origin-select">来源</label>
        <FilterSelect
          id="dswf-origin-select"
          ariaLabel="来源筛选"
          value={origin}
          options={originOptions(props.projectName)}
          filtersOpen={props.filtersOpen}
          onChange={(value) => props.onOriginChange(value as OriginFilter)}
        />
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
      {props.delegateNotice === undefined ? null : (
        <div className="dswf-delegate-notice" role="status" data-dswf-delegate-notice="">
          委派工具未装配（{props.delegateNotice}）——delegate_expert 不可用，管理面照常
        </div>
      )}
      <div className="dswf-card-grid">{gridBody}</div>
      <footer className="dswf-panel-footer">{countText}</footer>
    </>
  )
}
