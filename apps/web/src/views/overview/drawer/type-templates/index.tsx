// 类型模板分发（定位：业务——AC3：templateFamilyOf 路由 → 族模板渲染；块一组装序归
// ../index.tsx：目标/结果对行 → 类型模板 → 覆盖率 → 备注[v14 置底]）。
// 任务无文档（v7 立场）：内容 = tasks 行结构化负载（vars 具体化）——抽屉只渲染结构化数据。
import type { ReactNode } from 'react'
import type { TaskDetail } from '@dsh-forge/contracts'
import { templateFamilyOf } from './routing.js'
import { CodingTemplate } from './coding.js'
import { FixTemplate } from './fix.js'
import { DocTemplate } from './doc.js'
import { GateTemplate } from './gate.js'
import { TestTemplate } from './testing.js'
import { EvalTemplate } from './eval.js'
import { GenericTemplate } from './generic.js'

export { TASK_TYPE_FAMILY, templateFamilyOf, typeCategoryClassOf } from './routing.js'
export type { TemplateFamily, TypeCategoryClass } from './routing.js'

/** 类型模板 props（detail 全量——coding 族改动范围双列吃 actualFiles/records） */
export interface TypeTemplateProps {
  readonly detail: TaskDetail
  /** 参考文档 chip 点击（resolved refs → dock 开 tab——抽屉保持） */
  readonly onOpenDoc: (docRel: string) => void
}

/** 类型模板体（族路由分发——未注册类型走通用键值回退） */
export function TypeTemplateBody({ detail, onOpenDoc }: TypeTemplateProps): ReactNode {
  const vars: Readonly<Record<string, string>> = detail.vars ?? {}
  switch (templateFamilyOf(detail.taskType)) {
    case 'coding':
      return <CodingTemplate detail={detail} vars={vars} onOpenDoc={onOpenDoc} />
    case 'fix':
      return <FixTemplate vars={vars} />
    case 'doc':
      return <DocTemplate vars={vars} />
    case 'gate':
      return <GateTemplate detail={detail} vars={vars} />
    case 'test':
      return <TestTemplate vars={vars} />
    case 'eval':
      return <EvalTemplate detail={detail} vars={vars} />
    case 'generic':
      return <GenericTemplate vars={vars} />
  }
}
