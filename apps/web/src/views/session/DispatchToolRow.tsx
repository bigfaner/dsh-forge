// ForgeDispatchToolRow —— dispatchTask 对话工具行（定位：业务——tool.call.toolview
// keyed 'dispatchTask' 占用者，2026-10-09 用户实机报障收口）。
// 报障形态：官方 ui-tool 通用行（未注册工具名的 fallback）参数摘要取「参数对象首个
// 字符串值」——dispatchTask 参数序 source_kind 在前 → 对话工具行恒显
// 「工具调用 · dispatchTask · proposal/feature」（字面种类词，非容器标识，多容器
// 派发循环里各行不可分辨）。
// 本行 = 上游业务视图正径（keyed slot 按 wire 工具名注册——ui-skill/ask-question
// 同型先例；零平台 fork）：摘要段改取 source_slug（容器标识——`/run-tasks <容器标识>`
// 绑定语义同源值），缺席（全库 DAG 盲选）/形状漂移回退工具名单段（不猜不抛）；
// 结算后行尾追加领取任务键 slug/localId（用户裁决 2026-10-09——结算文本首行解析，
// 输入面无任务指定：就绪选择是工具内部行为，运行中不得而知）。
// 行语言 = 上游 ToolRow/SkillRow 同型（24px 行高 · 16px 图标位 · 2px 点隔符 ·
// 状态色语义 · ioCard 输入/输出双段展开卡）——官方令牌直用（lint-tokens 面），
// 上游裸值结构刻度以 css 内 dsw-raw 注记豁免。
// 数据纪律：三相块（preparing/start/result）= 官方 ToolCallOwnerProps 结构同型镜像
//（bundle 自含纪律禁 import 上游运行期包）；行身份/展开钩子/inspect 回调经 slot
// runtime 递达；本组件零 RPC 零状态落盘——纯呈现面。
import { type ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular,
  IconInspectOutlineRegular,
  IconSparkleRegular,
  TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import './dispatch-tool-row.css'

// ─────────────────── 官方块结构同型镜像（消费切片——禁 import 上游运行期包） ───────────────────

/** 官方 ToolResultNode.content 消费切片（text 块取文本，他形 JSON 化——SkillRow 同径） */
interface MirroredContentBlock {
  readonly type: string
  readonly text?: string
}

/** 官方 Tool 调用块消费切片（PreparingToolCall / StartedToolCall / ToolResultNode） */
export type DispatchToolBlock =
  | { readonly phase: 'preparing'; readonly kind?: undefined }
  | { readonly phase: 'start'; readonly argsRaw: string; readonly kind?: undefined }
  | {
      readonly kind: 'tool-result'
      readonly phase?: undefined
      readonly call: { readonly name: string; readonly argsRaw: string } | null
      readonly content: readonly MirroredContentBlock[]
      readonly isError: boolean
      readonly error?: { readonly name?: string; readonly code?: string }
    }

// ─────────────────── 纯模型面（静态可测） ───────────────────

/**
 * 参数原文 → 容器标识（source_slug——dispatchTask 容器限定认领对参的标识半）。
 * 非对象 / 解析失败 / source_slug 缺席或空串 = undefined（全库盲选或缺席容错——
 * 回退工具名单段，不猜不抛）。
 */
export function dispatchSourceSlugOf(argsRaw: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(argsRaw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const slug = (parsed as Record<string, unknown>)['source_slug']
  return typeof slug === 'string' && slug !== '' ? slug : undefined
}

/** 行摘要（用户裁决 2026-10-09：`工具调用 · dispatchTask · {slug}`——末段 = 容器标识非种类词） */
export function dispatchRowSummary(toolName: string, slug: string | undefined): string {
  return slug === undefined ? toolName : `${toolName} · ${slug}`
}

/** 首行截取（错误态行内摘要——上游 errorSummary 同径） */
function firstLine(text: string): string {
  const idx = text.indexOf('\n')
  return idx === -1 ? text : text.slice(0, idx)
}

/** 令牌 → 任务自然键形状校验（`slug/localId` 双段非空白——他形不猜） */
function taskKeyTokenOf(token: string | undefined): string | undefined {
  return token !== undefined && /^[^\s/]+\/[^\s/]+$/.test(token) ? token : undefined
}

/**
 * 结算文本 → 领取任务键（用户裁决 2026-10-09：结算后行内显示任务编号）。
 * 三首行形态（formatOk/formatErr 模板——契约测试 pin，稳定可解析）：
 *   `✓ <key> completed — …` / `⚑ <key> blocked — …` / `✗ ERR_SPAWN_FAILED — worker
 *   spawn failed for <key>: …`；no-task/halted 本就无领取 → undefined。
 */
export function dispatchTaskKeyOf(output: string | null): string | undefined {
  if (output === null) return undefined
  const head = firstLine(output)
  const settled = /^[✓⚑]\s+(\S+)\s+(?:completed|blocked)\b/.exec(head)
  if (settled !== null) return taskKeyTokenOf(settled[1])
  const spawnFailed = /worker spawn failed for ([^\s:]+):/.exec(head)
  if (spawnFailed !== null) return taskKeyTokenOf(spawnFailed[1])
  return undefined
}

/** 结算结果文本（content 块拼接；空且带 error 对象时回退 `name: code`——SkillRow 同径） */
export function dispatchResultTextOf(block: Extract<DispatchToolBlock, { kind: 'tool-result' }>): string | null {
  const parts: string[] = []
  for (const item of block.content) {
    parts.push(item.type === 'text' && typeof item.text === 'string' ? item.text : JSON.stringify(item, null, 2))
  }
  if (parts.length === 0 && block.error !== undefined) {
    parts.push(`${block.error.name ?? 'Error'}: ${block.error.code ?? ''}`)
  }
  return parts.join('\n') || null
}

/** 参数原文 → 展开卡输入段（pretty JSON；解析失败回退原文；空参 = null 不渲染段） */
function formatDispatchArgsBody(argsRaw: string): string | null {
  if (argsRaw === '') return null
  try {
    return JSON.stringify(JSON.parse(argsRaw), null, 2)
  } catch {
    return argsRaw
  }
}

/** 行模型（三相统一投影——纯函数） */
export interface DispatchToolRowModel {
  readonly state: 'preparing' | 'running' | 'ok' | 'error' | 'stopped'
  /** 折叠行摘要段（`dispatchTask` | `dispatchTask · {slug}`） */
  readonly summary: string
  /** 结算领取任务键（`slug/localId`——结算文本首行解析；在途/未领取 = null） */
  readonly taskKey: string | null
  /** 展开卡输入段（pretty 参数；缺席 = null） */
  readonly body: string | null
  /** 展开卡输出段（结算文本；在途 = null） */
  readonly output: string | null
  /** 错误态行内摘要（输出首行） */
  readonly errorSummary: string | null
}

/** 相块 → 行模型（preparing 单段不可展开；start/result 同段位——上游 ToolRow 状态口径） */
export function dispatchToolRowModel(toolName: string, block: DispatchToolBlock): DispatchToolRowModel {
  if (block.phase === 'preparing') {
    return { state: 'preparing', summary: toolName, taskKey: null, body: null, output: null, errorSummary: null }
  }
  if (block.phase === 'start') {
    return {
      state: 'running',
      summary: dispatchRowSummary(toolName, dispatchSourceSlugOf(block.argsRaw)),
      taskKey: null,
      body: formatDispatchArgsBody(block.argsRaw),
      output: null,
      errorSummary: null,
    }
  }
  const output = dispatchResultTextOf(block)
  const state = block.error?.code === 'interrupted' ? 'stopped' : block.isError ? 'error' : 'ok'
  const argsRaw = block.call?.argsRaw
  return {
    state,
    summary: dispatchRowSummary(toolName, argsRaw === undefined ? undefined : dispatchSourceSlugOf(argsRaw)),
    // 窗口截断兜底：call 头缺席（回放历史外）→ 无参可读，摘要回退工具名单段
    body: argsRaw === undefined ? null : formatDispatchArgsBody(argsRaw),
    taskKey: dispatchTaskKeyOf(output) ?? null,
    output,
    errorSummary: state === 'error' && output !== null ? firstLine(output) : null,
  }
}

// ─────────────────── 渲染体（官方 ToolRow/SkillRow 同型行语言） ───────────────────

/** 占用者 props（官方 ToolCallOwnerProps 消费切片 + slot runtime 递达面） */
export interface ForgeDispatchToolRowProps {
  /** 调用身份（三相稳定——上游 callId） */
  readonly callId: string
  /** wire 工具名（keyed 分发值 = 'dispatchTask'） */
  readonly toolName: string
  /** 当前阶段判别（owner 相位 props——block 同步判别，双轨一致） */
  readonly phase: 'preparing' | 'start' | 'result'
  /** 冻结相块（preparing/start/result 三相——结构同型镜像） */
  readonly block: DispatchToolBlock
  /** 稳定展开钩子（外层轮次收起即复位——上游 ToolRow 同消费） */
  readonly useDisclosure: () => { readonly expanded: boolean; readonly toggle: () => void }
  /** locale 座（注册行声明 FORGE_LOCALE_NS → runtime 绑定递达） */
  readonly t: (key: string) => string
  /** 轨迹视图检视回调（trajectory 视图在场时递达；缺席不渲染钮） */
  readonly inspect?: (() => void) | undefined
}

/** 状态无障碍文案（仅色示意的运行扫光/错误色补语——上游 stateStatus 同径） */
function stateStatusOf(state: DispatchToolRowModel['state'], t: (key: string) => string): string | null {
  switch (state) {
    case 'preparing':
      return t('tool.dispatchTask.preparing')
    case 'running':
      return t('tool.dispatchTask.running')
    case 'error':
      return t('tool.dispatchTask.failed')
    default:
      return null
  }
}

/** 图标位（静态图标；可展开行悬停/展开时换 Chevron——SkillRow 同形制） */
function leadingOf(open: boolean, expandable: boolean): ReactNode {
  if (open) return <IconChevronDownOutlineRegular className="dswf-dtr-chevron" />
  const icon = <IconSparkleRegular size={14} />
  if (!expandable) return icon
  return (
    <>
      <span className="dswf-dtr-iconidle">{icon}</span>
      <IconChevronDownOutlineRegular className="dswf-dtr-chevron dswf-dtr-chevronhover" />
    </>
  )
}

/** dispatchTask 工具行（注册进官方 ui-tool keyed 槽——通用行 fallback 的业务接管） */
export function ForgeDispatchToolRow(props: ForgeDispatchToolRowProps): ReactNode {
  const { expanded, toggle } = props.useDisclosure()
  const model = dispatchToolRowModel(props.toolName, props.block)
  const status = stateStatusOf(model.state, props.t)
  const expandable = model.state !== 'preparing' && (model.body !== null || model.output !== null)
  const open = expanded && expandable
  const running = model.state === 'running' || model.state === 'preparing'
  const summaryText = model.state === 'error' ? model.errorSummary ?? model.summary : model.summary
  const toggleFromKeyboard = (event: { readonly key: string; preventDefault(): void }): void => {
    if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    toggle()
  }
  return (
    <div className="dswf-dtr" data-dswf-dtr="" data-state={model.state}>
      <div
        className="dswf-dtr-row"
        {...(expandable ? { role: 'button', tabIndex: 0, 'aria-expanded': open, onClick: toggle, onKeyDown: toggleFromKeyboard } : {})}
        {...(expandable ? { 'data-expandable': '' } : {})}
      >
        <span className="dswf-dtr-leading">{leadingOf(open, expandable)}</span>
        {status !== null ? <span className="dswf-dtr-vh">{status}</span> : null}
        <TextShimmer active={running}>
          <span className="dswf-dtr-title">{props.t('tool.dispatchTask.title')}</span>
          {summaryText !== '' ? (
            <>
              <span className="dswf-dtr-sep" data-shimmer-decoration="" aria-hidden="true" />
              <span
                className={`dswf-dtr-summary${model.state === 'error' ? ' is-error' : ''}${model.state === 'stopped' ? ' is-stopped' : ''}`}
              >
                <TextShimmer>{summaryText}</TextShimmer>
              </span>
            </>
          ) : null}
          {model.taskKey !== null ? (
            <span className="dswf-dtr-suffix" data-dswf-dtr-taskkey="">
              <TextShimmer>{model.taskKey}</TextShimmer>
            </span>
          ) : null}
        </TextShimmer>
      </div>
      {open ? (
        <div className="dswf-dtr-body">
          {model.body !== null || model.output !== null ? (
            <div className="dswf-dtr-io">
              {model.body !== null ? (
                <div className="dswf-dtr-iosection">
                  <span className="dswf-dtr-iolabel">{props.t('tool.dispatchTask.input')}</span>
                  <pre className="dswf-dtr-iotext">{model.body}</pre>
                </div>
              ) : null}
              {model.body !== null && model.output !== null ? <div className="dswf-dtr-iodivider" /> : null}
              {model.output !== null ? (
                <div className="dswf-dtr-iosection">
                  <span className="dswf-dtr-iolabel">{props.t('tool.dispatchTask.output')}</span>
                  <pre className="dswf-dtr-iotext" {...(model.state === 'error' ? { 'data-error': '' } : {})}>
                    {model.output}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
          {props.inspect !== undefined ? (
            <button type="button" className="dswf-dtr-inspect" onClick={props.inspect}>
              <IconInspectOutlineRegular />
              {props.t('tool.dispatchTask.inspect')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
