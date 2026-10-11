// StatusChips 单测 —— AC5：状态 chips toggle + 0 计数 disabled（过滤接口三视图统一）。
// 计数/激活集/回调均受控注入——状态语义（切换清空）归 overview-model 单测。
// S3（run-tasks-host-command）：词汇七态 → 八态（+interrupted——chips 行序/标签/StateDot
// 表驱动覆盖新态）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TaskStatus } from '@dsh-forge/contracts'
import { StatusChips } from './status-chips.js'

const COUNTS: Record<TaskStatus, number> = {
  pending: 2,
  in_progress: 1,
  completed: 3,
  blocked: 1,
  suspended: 0,
  interrupted: 0,
  skipped: 0,
  rejected: 1,
}

const NONE = new Set<TaskStatus>()

describe('StatusChips（AC5 状态过滤 chips——S3 八态）', () => {
  it('八态全呈现（contracts TASK_STATUSES 行序）+ 中文标签 + 计数', () => {
    const markup = renderToStaticMarkup(<StatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />)
    const order = [
      'pending',
      'in_progress',
      'completed',
      'blocked',
      'suspended',
      'interrupted',
      'skipped',
      'rejected',
    ].map((s) => markup.indexOf(`data-dswf-ov-stchip="${s}"`))
    expect(order.every((p) => p >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(markup).toContain('待处理')
    expect(markup).toContain('进行中')
    expect(markup).toContain('已完成')
    expect(markup).toContain('已中断') // S3 新态中文标签
    expect(markup).toContain('>2</span>') // pending 计数
    expect(markup).toContain('>3</span>') // completed 计数
  })

  it('S3 interrupted chip：非零计数可点 + StateDot warning 语义（与 suspended 同族——暂停等待恢复）', () => {
    const markup = renderToStaticMarkup(
      <StatusChips counts={{ ...COUNTS, interrupted: 2 }} active={NONE} onToggle={() => {}} />,
    )
    const at = markup.indexOf('data-dswf-ov-stchip="interrupted"')
    const chip = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    expect(chip).not.toContain('disabled')
    expect(chip).toContain('data-state="warning"')
  })

  it('0 计数 chip disabled（不可点出空态）+ 淡化类', () => {
    const markup = renderToStaticMarkup(<StatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />)
    // chip 切片（button 开标签起点——属性序无关断言）
    const chipOf = (status: string): string => {
      const at = markup.indexOf(`data-dswf-ov-stchip="${status}"`)
      expect(at).toBeGreaterThanOrEqual(0)
      return markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    }
    expect(chipOf('suspended')).toContain('disabled')
    expect(chipOf('suspended')).toContain('is-zero')
    expect(chipOf('skipped')).toContain('disabled')
    expect(markup).not.toContain('title=') // D30 原生 title 反断言保留
    expect(markup).not.toContain('无此状态任务') // D37：状态筛选 chips 控件自释零 Tooltip——禁用态说明由 0 计数淡化自释（退役锚 tests/structure/d30 TOOLTIP_RETIRED_FILES）
    expect(chipOf('pending')).not.toContain('disabled')
  })

  it('激活态：aria-pressed + is-on 类；清过滤入口在场（任一激活时）', () => {
    const active = new Set<TaskStatus>(['blocked'])
    const markup = renderToStaticMarkup(
      <StatusChips counts={COUNTS} active={active} onToggle={() => {}} onClear={() => {}} />,
    )
    const at = markup.indexOf('data-dswf-ov-stchip="blocked"')
    const blockedChip = markup.slice(markup.lastIndexOf('<button', at), markup.indexOf('</button>', at))
    expect(blockedChip).toContain('aria-pressed="true"')
    expect(blockedChip).toContain('is-on')
    expect(blockedChip).toContain('已阻塞')
    expect(markup).toContain('data-dswf-ov-stchip-clear')
    expect(markup).toContain('✕ 重置') // D38 清过滤钮改词：裸词「重置」+ ✕ 前缀保留
    expect(markup).not.toContain('清过滤') // D38 UI 字符串层旧词渲染面清零
  })

  it('零激活：全部 aria-pressed=false + 清过滤入口缺席', () => {
    const markup = renderToStaticMarkup(<StatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />)
    expect(markup).not.toContain('aria-pressed="true"')
    expect(markup).not.toContain('data-dswf-ov-stchip-clear')
  })

  it('状态点官方语义映射在场（八态封闭——每 chip 一枚官方 StateDot[data-state]）', () => {
    const markup = renderToStaticMarkup(<StatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />)
    expect(markup.match(/data-state="/g)?.length).toBeGreaterThanOrEqual(8)
    // 语义映射抽点：completed→done / blocked→error / in_progress→ongoing / interrupted→warning（S3）
    expect(markup).toContain('data-state="done"')
    expect(markup).toContain('data-state="error"')
    expect(markup).toContain('data-state="ongoing"')
    expect(markup).toContain('data-state="warning"')
  })
})
