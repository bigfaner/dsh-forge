// ForgeSidebarSlot 流程宿主接线单测（1.8 D 类——添加项目流程入口重接线·矩阵行 28/29）：
// AddProjectFlow 随槽位件常驻挂载——mount 期发布 __DSH_FORGE_ADD_PROJECT_FLOW__ 页内缝，
// 空态 CTA / hero CTA 的 openAddProjectFlow() 直达流程（宿主缺席 fail-soft no-op 口径退役）。
// real DOM 链路（effect 发布）——文件级 happy-dom；SSR 渲染面归 ForgeSidebarSlot.test。
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { publishAddProjectFlow, openAddProjectFlow } from '../add-project/flow-open.js'
import { ForgeSidebarSlot } from './ForgeSidebarSlot.js'
import type { LedgerSessionsSnapshot, LedgerWorkspacesSnapshot, SnapshotSource } from './sidebar-model.js'

function fakeSource<T>(snap: T): SnapshotSource<T> {
  return { getSnapshot: () => snap, subscribe: () => () => {} }
}

const workspacesSnap: LedgerWorkspacesSnapshot = { items: [] }
const sessionsSnap: LedgerSessionsSnapshot = { ids: [], byId: {}, phase: 'ready' }

async function mountSlot(): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <ForgeSidebarSlot
        wide={true}
        expandSidebar={() => {}}
        sessions={fakeSource(sessionsSnap)}
        workspaces={fakeSource(workspacesSnap)}
        openSession={() => {}}
        startSession={() => {}}
      />,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()
  })
  return host
}

describe('ForgeSidebarSlot 流程宿主接线（1.8 D 类）', () => {
  afterEach(() => {
    publishAddProjectFlow(undefined)
    document.body.replaceChildren()
  })

  it('mount 期发布页内缝——openAddProjectFlow() 直达（宿主在场）', async () => {
    publishAddProjectFlow(undefined)
    expect(openAddProjectFlow(), 'mount 前缝缺席 = no-op').toBe(false)
    await mountSlot()
    expect(openAddProjectFlow(), 'mount 后缝在场 = 直达').toBe(true)
  })

  it('直达后流程模态呈现（面板入口/hero CTA 同一缝收口）', async () => {
    await mountSlot()
    expect(openAddProjectFlow()).toBe(true)
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    expect(document.querySelector('[data-dswf-ap]'), '流程模态呈现').not.toBeNull()
  })
})
