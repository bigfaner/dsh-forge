// 知识浏览工具栏（定位：业务——UF-6 工具栏：关键词搜索 + 范围显示）。
// Hard Rule 官方件复用：输入 = 官方 Input（前导检索图标）、范围 = 官方 Pill、
// 清除钮 = 官方 Button——本文件零自绘输入控件。范围显示 P1 = 项目级（范围下钻菜单
// 归后续里程碑，PRD UF-6 Notes）。Esc 清空 = 原型交互（kb-clear）。
import type { ReactNode } from 'react'
import {
  Button,
  IconCloseFillRegular,
  IconSearchOutlineRegular,
  Input,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'
import './knowledge.css'

export interface KnowledgeToolbarProps {
  /** 关键词输入值（过滤态机单一来源——受控件） */
  readonly keyword: string
  /** 关键词变更（原样上抛——细分语义归服务端） */
  readonly onKeywordChange: (keyword: string) => void
  /** 项目名（范围显示——P1 项目级；空串 = 未就绪回退「当前项目」） */
  readonly projectName?: string
}

/** 范围显示文案（纯函数——P1 项目级；空名回退「当前项目」） */
export function scopeLabel(projectName: string | undefined): string {
  return `项目 · ${projectName === undefined || projectName === '' ? '当前项目' : projectName}`
}

/** Esc 清空判据（纯函数——原型 kb-clear 交互语义） */
export function isEscapeKey(key: string): boolean {
  return key === 'Escape'
}

/** 知识浏览工具栏（范围 Pill + 检索输入 + 条件性清除钮） */
export function KnowledgeToolbar({ keyword, onKeywordChange, projectName }: KnowledgeToolbarProps): ReactNode {
  return (
    <div className="dswf-kn-toolbar" data-dswf-kn-toolbar="">
      <Pill className="dswf-kn-scope" title="范围（P1 = 项目级知识）">
        {scopeLabel(projectName)}
      </Pill>
      <div className="dswf-kn-searchrow">
        <Input
          icon={<IconSearchOutlineRegular size={14} />}
          className="dswf-kn-search"
          type="text"
          placeholder="搜索关键词…"
          aria-label="知识关键词搜索"
          value={keyword}
          onChange={(event) => {
            onKeywordChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (isEscapeKey(event.key)) onKeywordChange('')
          }}
        />
        {keyword === '' ? null : (
          <Button
            variant="toolbar"
            size="sm"
            className="dswf-kn-searchclear"
            aria-label="清除搜索"
            title="清除（Esc）"
            onClick={() => {
              onKeywordChange('')
            }}
          >
            <IconCloseFillRegular size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}
