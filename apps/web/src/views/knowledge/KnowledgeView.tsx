// 知识视图装配壳（定位：业务装配——UF-5 知识视图的 UF-6 浏览面挂载，3.8 自 M0 占位填入）。
// 组合 = KnowledgeBrowse（3.6 浏览主体）+ EntryDrawer（3.7 详情抽屉）；抽屉打开态
// （openEntryId）由工作台桥持有、KnowledgePanel（官方 main keyed 'dswf-knowledge'
// 占用者，fix-25）订阅注入——UF-4 召回 tab 分组行跳转复用同门（Hard Rule：跨视图
// 不直引，跳转经工作台桥——本件只认 entryId 进出）。
// 无项目锚（projectId null = 未注册/未就绪）= 引导空态（P1 浏览范围 = 项目级——
// UF-6 工具栏「范围显示 P1 项目级」）；面板互换/右栏联动机制归官方面板径
// （layout.selectPanel + ShellHost 右栏联动，fix-25）。
import type { ReactNode } from 'react'
import { EmptyState } from '../../components/index.js'
import type { RpcClientFactory } from '../../rpc/index.js'
import { EntryDrawer } from './EntryDrawer.js'
import { KnowledgeBrowse } from './KnowledgeBrowse.js'
import './knowledge.css'

export interface KnowledgeViewProps {
  /** 当前项目 id（浏览范围——P1 项目级；null = 无项目锚 → 引导空态不拉取） */
  readonly projectId: string | null
  /** 视图激活态（缺省 true = 直载；fix-25 面板径下官方面板选中即挂载——生产面恒缺省，测试面注入翻转验证全量重拉刷热度，AC3 即时累积） */
  readonly active?: boolean
  /** 抽屉打开条目（null = 关闭；卡片点击与召回 tab 跳转两入口共用此态） */
  readonly openEntryId: number | null
  /** 抽屉打开态变更（卡片点击 → entryId；✕/Esc 关闭 → null——态归装配持有） */
  readonly onOpenEntryChange: (entryId: number | null) => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
  /** 卡片/元数据时间标签基准（缺省当次渲染时刻） */
  readonly now?: number
}

/**
 * 知识视图（浏览主体 + 详情抽屉装配；挂载位 = KnowledgePanel——官方 keyed 面板非选中即卸载）。
 * data-dswf-knowledge-view = 知识视图态在场断言锚（e2e/走查——接替 M0 占位锚）。
 */
export function KnowledgeView({
  projectId,
  active,
  openEntryId,
  onOpenEntryChange,
  makeClient,
  now,
}: KnowledgeViewProps): ReactNode {
  if (projectId === null) {
    return (
      <div className="dswf-kn-view" data-dswf-knowledge-view="" data-dswf-kn-anchor="none">
        <EmptyState
          title="尚未锚定项目"
          description="注册项目后，这里呈现该项目的知识卡片网格与详情抽屉。"
        />
      </div>
    )
  }
  return (
    <div className="dswf-kn-view" data-dswf-knowledge-view="" data-dswf-kn-anchor={projectId}>
      <KnowledgeBrowse
        projectId={projectId}
        active={active}
        makeClient={makeClient}
        now={now}
        onEntryOpen={(entryId) => {
          onOpenEntryChange(entryId)
        }}
      />
      <EntryDrawer
        projectId={projectId}
        entryId={openEntryId}
        makeClient={makeClient}
        now={now}
        onClose={() => {
          onOpenEntryChange(null)
        }}
      />
    </div>
  )
}
