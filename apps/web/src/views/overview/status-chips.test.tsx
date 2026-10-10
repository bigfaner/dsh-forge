// StatusChips 单测 —— AC5：七态 chips toggle + 0 计数 disabled（过滤接口三视图统一）。
// 计数/激活集/回调均受控注入——状态语义（切换清空）归 overview-model 单测。
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
  skipped: 0,
  rejected: 1,
}

const NONE = new Set<TaskStatus>()

describe('StatusChips（AC5 七态过滤 chips）', () => {
  it('七态全呈现（contracts TASK_STATUSES 行序）+ 中文标签 + 计数', () => {
    const markup = renderToStaticMarkup(<StatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />)
    const order = ['pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected'].map(
      (s) => markup.indexOf(`data-dswf-ov-stchip="${s}"`),
    )
    expect(order.every((p) => p >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(markup).toContain('待处理')
    expect(markup).toContain('进行中')
    expect(markup).toContain('已完成')
    expect(markup).toContain('>2</span>') // pending 计数
    expect(markup).toContain('>3</span>') // completed 计数
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
    expect(markup).not.toContain('title=') // D30：原生 title 退役——禁用态说明「无此状态任务」归官方 Tooltip label（结构 pin tests/structure/d30）
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
    expect(markup).toContain('✕ 清过滤')
  })

  it('零激活：全部 aria-pressed=false + 清过滤入口缺席', () => {
    const markup = renderToStaticMarkup(<StatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />)
    expect(markup).not.toContain('aria-pressed="true"')
    expect(markup).not.toContain('data-dswf-ov-stchip-clear')
  })

  it('状态点官方语义映射在场（七态封闭——每 chip 一枚官方 StateDot[data-state]）', () => {
    const markup = renderToStaticMarkup(<StatusChips counts={COUNTS} active={NONE} onToggle={() => {}} />)
    expect(markup.match(/data-state="/g)?.length).toBeGreaterThanOrEqual(7)
    // 语义映射抽点：completed→done / blocked→error / in_progress→ongoing
    expect(markup).toContain('data-state="done"')
    expect(markup).toContain('data-state="error"')
    expect(markup).toContain('data-state="ongoing"')
  })
})
