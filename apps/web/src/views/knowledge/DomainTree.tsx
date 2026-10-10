// 域目录树（定位：业务——UF-6 左轨域目录树：目录即域 ≤3 层，选择 = 前缀过滤条件）。
// Hard Rule 自绘领域组件（官方无域树行对应件）：行 = 自绘（令牌唯一 + 原型行刻度）；
// 数据 = forge:knowledge/browse 聚合（DomainNode，节点计数含子域——与域前缀过滤同口径）。
// P1 形态最简：常展开（≤3 层无收合——收合交互归后续里程碑）；「全部域」根行 = 无域过滤。
import type { CSSProperties, ReactNode } from 'react'
import type { DomainNode } from '@dsh-forge/contracts'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { domainRows } from './browse-model.js'
import './knowledge.css'

export interface DomainTreeProps {
  /** 域树聚合节点（core 契约序：depth 升序再路径升序——父先于子） */
  readonly nodes: readonly DomainNode[]
  /** 全部域计数（无过滤底表卡片数——含根域文件） */
  readonly total: number
  /** 选中域路径（undefined = 全部域根行激活） */
  readonly active?: string
  /** 域行选择（domainPath = '' 即全部域根行 → 上抛 undefined 清除域过滤） */
  readonly onSelect?: (domainPath: string | undefined) => void
}

/** 域目录树（role=tree——行级 aria-selected + data-dswf-domain 锚） */
export function DomainTree({ nodes, total, active, onSelect }: DomainTreeProps): ReactNode {
  const rows = domainRows(nodes, total)
  return (
    <div className="dswf-kn-dom" data-dswf-kn-tree="" role="tree" aria-label="域目录">
      <div className="dswf-kn-dom-head">目录（域）</div>
      {rows.map((row) => {
        const isActive = (row.domainPath === '' ? undefined : row.domainPath) === active
        return (
          // D30：原生 title 退役——官方 Tooltip（portal 逃逸知识面板域轨滚动容器）
          <Tooltip key={row.domainPath === '' ? '__all__' : row.domainPath} label={row.domainPath === '' ? '全部域' : row.domainPath} portal>
            <button
              type="button"
              className="dswf-kn-dom-row"
              data-dswf-domain={row.domainPath}
              data-active={isActive || undefined}
              role="treeitem"
              aria-selected={isActive}
              style={{ '--dswf-depth': String(row.depth) } as CSSProperties}
              onClick={
                onSelect === undefined
                  ? undefined
                  : () => {
                      onSelect(row.domainPath === '' ? undefined : row.domainPath)
                    }
              }
            >
              <span className="dswf-kn-dom-label">{row.label}</span>
              <span className="dswf-kn-dom-count">{row.entryCount}</span>
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
