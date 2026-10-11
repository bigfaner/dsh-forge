// ForgeProgressNode —— 'forge/progress' 会话事件 Chat 节点（定位：业务——1.17 循环进度
// 流内交错；conversation.chat.node keyed 'forge-progress' 占用者，ui-workflow-run 同型）。
// 渲染 = 官方 DisclosureRow 同族折叠行（折叠 = 单行摘要；展开 = 事件详情——任务键/
// 计数/时间戳）；seq 时序天然交错（每枚事件独立节点，流内原位）。零机制词（#24 纪律
// ——文案全用户视角动词/状态词）；纯呈现面零 RPC 零状态落盘（展开态组件本地微观态）。
import { useState } from 'react'
import { DisclosureRow } from '@deepseek-ai/dsh-client-ui-primitives'
import { isForgeProgressNodeData, type ForgeProgressNodeData } from './forge-progress-data.js'
import './forge-progress-node.css'

/** 官方节点座 props 消费切片（workflow-run WorkflowRunPanel 同型——node.data 为整值） */
export interface ForgeProgressNodeProps {
  readonly node: {
    readonly kind?: unknown
    readonly data?: unknown
  }
}

/** 动词标签（用户视角动作词——无机制词） */
const VERB_LABELS: Record<string, string> = {
  claim: '领取',
  'claim-resume': '恢复领取',
  settle: '结算',
  stop: '停止',
}

/** 状态标签 */
const STATUS_LABELS: Record<string, string> = {
  running: '进行中',
  completed: '已完成',
  blocked: '阻塞',
  interrupted: '已中断',
}

/** 折叠单行摘要（`动词 · 任务键/任务源 · 状态`——段缺省回退源标识） */
export function forgeProgressSummary(d: { verb: string; status: string; taskKey?: string; sourceSlug: string }): string {
  const verb = VERB_LABELS[d.verb] ?? d.verb
  const status = STATUS_LABELS[d.status] ?? d.status
  const target = d.taskKey ?? d.sourceSlug
  return `${verb} · ${target} · ${status}`
}

/** 详情时间显示（HH:MM:SS 本地时——折叠位不重复展示） */
function timeLabelOf(at: number): string {
  try {
    return new Date(at).toLocaleTimeString()
  } catch {
    return String(at)
  }
}

/** 计数行（领取时点快照——`待执行 N · 执行中 N · 已完成 N`） */
export function forgeProgressCountsLabel(counts: { pending: number; running: number; done: number } | undefined): string | undefined {
  if (counts === undefined) return undefined
  return `待执行 ${counts.pending} · 执行中 ${counts.running} · 已完成 ${counts.done}`
}

/** 'forge/progress' 折叠行节点（形状漂移/他形 = null——官方流零残留） */
export function ForgeProgressNode({ node }: ForgeProgressNodeProps) {
  if (node?.kind !== 'forge-progress' || !isForgeProgressNodeData(node.data)) return null
  return <ForgeProgressRow data={node.data} />
}

function ForgeProgressRow({ data }: { data: ForgeProgressNodeData }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="dswf-progress-node" data-dswf-progress-status={data.status}>
      <DisclosureRow
        icon={
          <span className="dswf-progress-node-dot" data-status={data.status} aria-hidden="true" />
        }
        title={forgeProgressSummary(data)}
        open={open}
        expandable
        onToggle={() => setOpen((v) => !v)}
        expandOnRowClick
        rowClassName="dswf-progress-node-row"
        contentClassName="dswf-progress-node-content"
      >
        <ForgeProgressDetail data={data} />
      </DisclosureRow>
    </div>
  )
}

/** 展开详情（定义列表——任务源/任务/状态/进度/时间；导出 = 静态单测缝） */
export function ForgeProgressDetail({ data }: { data: ForgeProgressNodeData }) {
  const counts = forgeProgressCountsLabel(data.counts)
  return (
    <dl className="dswf-progress-node-detail">
      <div className="dswf-progress-node-detail-row">
        <dt>任务源</dt>
        <dd>{data.sourceSlug}</dd>
      </div>
      {data.taskKey !== undefined ? (
        <div className="dswf-progress-node-detail-row">
          <dt>任务</dt>
          <dd>{data.taskKey}</dd>
        </div>
      ) : null}
      <div className="dswf-progress-node-detail-row">
        <dt>状态</dt>
        <dd>{STATUS_LABELS[data.status] ?? data.status}</dd>
      </div>
      {counts !== undefined ? (
        <div className="dswf-progress-node-detail-row">
          <dt>进度</dt>
          <dd>{counts}</dd>
        </div>
      ) : null}
      <div className="dswf-progress-node-detail-row">
        <dt>时间</dt>
        <dd>{timeLabelOf(data.at)}</dd>
      </div>
    </dl>
  )
}
