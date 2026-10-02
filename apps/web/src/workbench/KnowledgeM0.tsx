// 知识视图 M0 空态占位（定位：装配——UF-5 知识视图槽 M0 相位，纯渲染件）。
// 机制已立（视图互换/右栏联动由 zones 容器承载，2.5）；浏览最小面（UF-6：工具栏/域树/
// 卡片网格/详情抽屉）M1（3.6）填入。官方件复用：EmptyState（统一空态简版）。
import type { ReactNode } from 'react'
import { EmptyState } from '../components/index.js'
import './workbench.css'

/** 知识视图 M0 占位（data-dswf-knowledge-m0 = e2e/走查锚——知识视图态在场断言） */
export function KnowledgeM0(): ReactNode {
  return (
    <div className="dswf-knowledge-m0" data-dswf-knowledge-m0="">
      <EmptyState
        title="知识库"
        description="知识浏览最小面将于后续里程碑填入；届时在此呈现项目知识的卡片网格与详情抽屉。"
      />
    </div>
  )
}
