// 会话头挂接任务 pill（定位：业务——UF-3 会话头部挂接任务展示[SC6③ 挂接部分]，3.10）。
// 数据纪律（tech-design Interface 1 sessionLinks + Integration #2）：
//   - 双源分型不合并解释（§6-24④ 诚实审计）：link = task_session_links（派发会话——claim
//     upsert-ignore 唯一写源）/ record = task_records.session_id（执行会话）；同任务同会话
//     双源参与 → 两卡并存（SessionTaskLinkCard 字段驱动，source 判型）。
//   - Hard Rule：pill 查询天然单库——sessionId → 工作区解析归 4.2 集成侧，本组件零跨库
//     聚合假设：pills 全体同一 sessionId/projectId（props 单库喂入），无合并/全库扫描。
//   - 数据经 props（4.2 装配：sessionLinks RPC + onForgeTasksChanged 事件刷新；测试面 =
//     props 直喂 rpc mock 形）。featureSlug 富化归装配侧（SessionTaskLinkCard 无此字段——
//     装配自 feature 账本单库 enrich，导航载荷需要）。
//   - 空态 = 零挂接时槽不渲染组件（Body 输出空——4.2 装配同口径）。
// 组装分工沿 RecallTab 形制：纯模型（分型标签/切分/菜单行集/载荷映射）+
// SessionTaskPillsBody 纯渲染（renderToStaticMarkup 全相位可测）+ SessionTaskPills 装载壳
// （溢出菜单开合本地态——sessionId 变更即复位，无残留态）。
// 官方件复用（样式纪律第 2 条）：Pill 载体 + Menu 溢出弹层（门户面）+ StateDot 状态点；
// 状态点语义映射 = overview/status-chips 同口径本域副本（铁律③ 同级业务互禁，口径互指）。
import { useState, type ReactNode } from 'react'
import { TASK_STATUS_LABELS, type SessionTaskLinkCard } from '@dsh-forge/contracts'
import { Menu, Pill, StateDot, type MenuEntry, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import './session.css'

/** 并排席上限（UF-3：≤2 并排；余量入 +N 溢出菜单） */
export const SESSION_PILLS_INLINE_MAX = 2

/** 七态 → 官方 StateDot 语义（overview STATUS_DOT_STATE 同口径——铁律③ 本域副本，口径互指） */
export const SESSION_PILL_STATUS_DOT: Readonly<Record<SessionTaskLinkCard['taskStatus'], StateDotState>> = {
  pending: 'idle',
  in_progress: 'ongoing',
  completed: 'done',
  blocked: 'error',
  suspended: 'warning',
  skipped: 'idle',
  rejected: 'error',
}

/**
 * 单 pill 项（SessionTaskLinkCard + 导航富化）。featureSlug 为点击导航载荷所需
 * （概览任务子 tab feature 选中）——卡片 DTO 无此字段，装配侧（4.2）单库富化注入。
 */
export interface SessionTaskPillItem extends SessionTaskLinkCard {
  /** 所属 feature slug（导航载荷——装配侧自 feature 账本 enrich） */
  readonly featureSlug: string
}

/** pill 点击导航载荷（AC3：taskId + featureSlug——dock 开概览 + 任务子 tab + feature 选中 + 抽屉打开，4.2 接线） */
export interface SessionTaskPillNav {
  readonly taskId: string
  readonly featureSlug: string
}

// ─────────────────────────── 纯模型（分型/切分/菜单行集/载荷） ───────────────────────────

/** 分型标签（AC1）：link = 派发（挂接表）/ record = 执行（records.session_id） */
export function sessionPillSourceLabel(source: SessionTaskLinkCard['source']): string {
  return source === 'link' ? '派发' : '执行'
}

/** 自然键呈现（身份双轨口径：界面展示恒 'slug/localId'） */
export function sessionPillKeyLabel(item: Pick<SessionTaskLinkCard, 'slug' | 'localId'>): string {
  return `${item.slug}/${item.localId}`
}

/** 菜单行 id（taskId + source 复合键——同任务双源两卡并存不碰撞） */
export function sessionPillMenuId(item: SessionTaskPillItem): string {
  return `${item.taskId}:${item.source}`
}

/** pill 点击导航载荷（AC3：taskId + featureSlug 双字段） */
export function sessionPillNav(item: SessionTaskPillItem): SessionTaskPillNav {
  return { taskId: item.taskId, featureSlug: item.featureSlug }
}

/** 并排/溢出切分（AC2）：≤2 全并排；>2 = 前 2 并排 + 余量溢出（会话头宽度保护） */
export function splitSessionPills(
  pills: readonly SessionTaskPillItem[],
): { readonly visible: readonly SessionTaskPillItem[]; readonly overflow: readonly SessionTaskPillItem[] } {
  if (pills.length <= SESSION_PILLS_INLINE_MAX) return { visible: pills, overflow: [] }
  return { visible: pills.slice(0, SESSION_PILLS_INLINE_MAX), overflow: pills.slice(SESSION_PILLS_INLINE_MAX) }
}

/**
 * 溢出菜单行集（AC2：完整列表——含并排两席全量挂接，非仅溢出余量；每行分型标注 +
 * 自然键 + 标题 + 状态点）。行 id = sessionPillMenuId（onSelect 回映射载荷）。
 */
export function sessionPillMenuItems(pills: readonly SessionTaskPillItem[]): readonly MenuEntry[] {
  return pills.map((item) => ({
    id: sessionPillMenuId(item),
    icon: <StateDot state={SESSION_PILL_STATUS_DOT[item.taskStatus]} size={8} />,
    label: (
      <span className="dswf-stp-mrow" data-dswf-stp-mrow="">
        <span className="dswf-stp-msrc" data-dswf-stp-msrc={item.source}>{`${sessionPillSourceLabel(item.source)}⟞`}</span>
        <span className="dswf-stp-mkey">{sessionPillKeyLabel(item)}</span>
        <span className="dswf-stp-mtitle">{item.title}</span>
      </span>
    ),
  }))
}

/** 菜单行选中 → 导航载荷（id 回映射；未知 id = undefined——不派发） */
export function sessionPillMenuSelect(
  pills: readonly SessionTaskPillItem[],
  id: string,
): SessionTaskPillNav | undefined {
  const item = pills.find((entry) => sessionPillMenuId(entry) === id)
  return item === undefined ? undefined : sessionPillNav(item)
}

/**
 * 溢出菜单行选中动作（AC3 纯动作面——confirmTransitionDialog 形制）：闭菜单 + 载荷派发；
 * 未知 id 仅闭菜单不派发；onOpenTask 缺席容忍（降级面仅闭菜单）。
 */
export function sessionPillMenuActivated(
  input: { readonly pills: readonly SessionTaskPillItem[]; readonly id: string },
  onOpenTask: ((nav: SessionTaskPillNav) => void) | undefined,
  onMenuOpenChange: (open: boolean) => void,
): void {
  onMenuOpenChange(false)
  const nav = sessionPillMenuSelect(input.pills, input.id)
  if (nav !== undefined) onOpenTask?.(nav)
}

// ─────────────────────────── 纯渲染体（全相位静态可测） ───────────────────────────

/**
 * 单枚并排 pill（双载体——抽屉时间线 dswf-td-sess 会话 pill 同行语言：回调在场 = 可点
 * 按钮[is-link]；缺席 = 静态 span 非交互呈现。官方 Pill 原子的静态分支不透传 data/title
 * 锚，锚面承载要求双载体自持——chrome 与令牌同刻度，e2e 锚两形态恒在场）。
 */
function InlinePill({
  item,
  onOpenTask,
}: {
  readonly item: SessionTaskPillItem
  readonly onOpenTask: ((nav: SessionTaskPillNav) => void) | undefined
}): ReactNode {
  const key = sessionPillKeyLabel(item)
  const source = sessionPillSourceLabel(item.source)
  const inner = (
    <>
      <span className="dswf-stp-src" data-dswf-stp-src={item.source}>{`${source}⟞`}</span>
      <span className="dswf-stp-key">{key}</span>
      <span className="dswf-stp-sep" aria-hidden="true">·</span>
      <StateDot state={SESSION_PILL_STATUS_DOT[item.taskStatus]} size={8} />
      <span className="dswf-stp-status">{TASK_STATUS_LABELS[item.taskStatus].zh}</span>
    </>
  )
  if (onOpenTask === undefined) {
    return (
      <span className="dswf-stp-pill" data-dswf-stp-pill={item.taskId} data-dswf-stp-source={item.source} title={`${source}⟞ ${key} · ${item.title}`}>
        {inner}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="dswf-stp-pill is-link"
      data-dswf-stp-pill={item.taskId}
      data-dswf-stp-source={item.source}
      title={`查看任务：${key} · ${item.title}`}
      onClick={() => {
        onOpenTask(sessionPillNav(item))
      }}
    >
      {inner}
    </button>
  )
}

export interface SessionTaskPillsBodyProps {
  /** 挂接双源卡（装配侧单库喂入——零挂接 = 空输出） */
  readonly pills: readonly SessionTaskPillItem[]
  /** 溢出菜单开合（受控——装载壳持有；sessionId 变更复位） */
  readonly menuOpen: boolean
  readonly onMenuOpenChange: (open: boolean) => void
  /** pill/菜单行点击导航（AC3 载荷；缺席 = 非交互呈现） */
  readonly onOpenTask: ((nav: SessionTaskPillNav) => void) | undefined
}

/**
 * 挂接 pill 纯渲染（AC1/AC2）：零挂接 = 空输出（槽不渲染组件）；≤2 并排；
 * >2 = 2 并排 + "+N" 溢出触发（官方 Menu 门户面——完整列表 + 分型标注）。
 * 菜单门户面开态经 createPortal(document.body)——静态渲染不可达（HeroWorkspacePicker
 * 口径）：行集/选中映射经 sessionPillMenuItems/sessionPillMenuSelect 纯函数直测，开面归 4.2 e2e。
 */
export function SessionTaskPillsBody({ pills, menuOpen, onMenuOpenChange, onOpenTask }: SessionTaskPillsBodyProps): ReactNode {
  if (pills.length === 0) return null
  const { visible, overflow } = splitSessionPills(pills)
  return (
    <div className="dswf-stp" data-dswf-stp="">
      {visible.map((item) => (
        <InlinePill key={`${item.taskId}:${item.source}`} item={item} onOpenTask={onOpenTask} />
      ))}
      {overflow.length > 0 ? (
        <Menu
          open={menuOpen}
          portal
          side="bottom"
          items={sessionPillMenuItems(pills)}
          selectedId={undefined}
          selection="fill"
          listClassName="dswf-stp-menu"
          onClose={() => {
            onMenuOpenChange(false)
          }}
          onSelect={(id) => {
            sessionPillMenuActivated({ pills, id }, onOpenTask, onMenuOpenChange)
          }}
          anchor={
            <Pill
              className="dswf-stp-more"
              data-dswf-stp-more=""
              title={`还有 ${overflow.length} 个挂接任务`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => {
                onMenuOpenChange(true)
              }}
            >
              {`+${overflow.length}`}
            </Pill>
          }
        />
      ) : null}
    </div>
  )
}

// ─────────────────────────── 装载壳（菜单开合本地态——会话作用域派生） ───────────────────────────

/** 溢出菜单开合状态（携带所属会话——开合不跨会话残留） */
export interface SessionPillMenuState {
  readonly session: string
  readonly open: boolean
}

/** 初始菜单态（闭） */
export function initialSessionPillMenuState(sessionId: string): SessionPillMenuState {
  return { session: sessionId, open: false }
}

/**
 * 菜单开合派生（AC4 无残留判据）：菜单态携带所属会话——sessionId 变更后旧会话开态派生
 * 即 false（无需复位效应，props 即时反映）。
 */
export function sessionPillMenuOpen(state: SessionPillMenuState, sessionId: string): boolean {
  return state.session === sessionId && state.open
}

export interface SessionTaskPillsProps {
  /** 当前会话锚（菜单开合的会话作用域键；pill 查询单库语义归装配侧） */
  readonly sessionId: string
  /** 挂接双源卡（props 驱动重渲染——sessionId 变化经装配侧重取喂入，无本地副本无残留态） */
  readonly pills: readonly SessionTaskPillItem[]
  /** pill/菜单行点击导航（AC3 载荷——dock 开概览 + 任务子 tab + feature 选中 + 抽屉打开，4.2 接线） */
  readonly onOpenTask?: (nav: SessionTaskPillNav) => void
}

/** 挂接 pill 装载壳（AC4：props 单一来源——渲染完全随 props 即时反映；唯一本地态 = 溢出菜单开合，会话作用域派生无残留） */
export function SessionTaskPills({ sessionId, pills, onOpenTask }: SessionTaskPillsProps): ReactNode {
  const [menuState, setMenuState] = useState<SessionPillMenuState>(() => initialSessionPillMenuState(sessionId))
  return (
    <SessionTaskPillsBody
      pills={pills}
      menuOpen={sessionPillMenuOpen(menuState, sessionId)}
      onMenuOpenChange={(open) => {
        setMenuState({ session: sessionId, open })
      }}
      onOpenTask={onOpenTask}
    />
  )
}
