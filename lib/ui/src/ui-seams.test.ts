// host-integration-fixes 1.2 —— slot 键与 priority 约定具名常量值 pin。
// 依据：proposal host-integration-fixes 裁决 5（键名与 priority 值收敛为 lib 共享模块
// 具名常量，消除两插件字面量各自为政——400b3952 撞车的结构性根因）。
// 官方 slots 语义锚：keyed 同 key 异 priority 共存、升序排序、最低者渲染——
// project 0（拥有者）与 task-loop -10（单装兜底）为该语义下的约定值。
import { describe, expect, it } from 'vitest'
import {
  DSWF_OVERVIEW_TAB_KEY,
  PRIORITY_PROJECT_OVERVIEW_OWNER,
  PRIORITY_TASK_LOOP_FALLBACK,
  SIDEBAR_RIGHT_PANE_TAB_SLOT,
} from './ui-seams.js'

describe('slot/tab 键具名常量（单源字面值 pin）', () => {
  it('sidebar.right.pane.tab 槽名 = 官方 sidebar-right slots 声明键', () => {
    expect(SIDEBAR_RIGHT_PANE_TAB_SLOT).toBe('sidebar.right.pane.tab')
  })

  it('dswf-overview tab 键 = 双形态共用概览 tab kind', () => {
    expect(DSWF_OVERVIEW_TAB_KEY).toBe('dswf-overview')
  })
})

describe('双形态 priority 约定（keyed 升序最低者渲染语义下的分工值）', () => {
  it('project 拥有者 = 0', () => {
    expect(PRIORITY_PROJECT_OVERVIEW_OWNER).toBe(0)
  })

  it('task-loop 单装兜底 = -10', () => {
    expect(PRIORITY_TASK_LOOP_FALLBACK).toBe(-10)
  })

  it('兜底值遮蔽方向成立：-10 < 0（升序排序下单装 body 低于拥有者）', () => {
    expect(PRIORITY_TASK_LOOP_FALLBACK).toBeLessThan(PRIORITY_PROJECT_OVERVIEW_OWNER)
  })
})
